#!/usr/bin/env python3
"""Native production-view smoke, without app accounts, daemon, Metal or bundled artwork."""
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]


@unittest.skipUnless(sys.platform == 'darwin', 'AppKit needs macOS')
class OrbFallbackTest(unittest.TestCase):
    def test_production_fallback_paints_expanded_and_tucked(self):
        with tempfile.TemporaryDirectory(prefix='vahti-orb-') as directory:
            out = pathlib.Path(directory)
            source = (ROOT / 'app/Orb.swift').read_text()
            # Keep the production palette used by VahtiMark without the unrelated application views.
            design = (ROOT / 'app/Design.swift').read_text()
            palette = 'import SwiftUI\n' + design[design.index('enum Vahti {'):design.index('\nextension Font')]
            (out / 'Palette.swift').write_text(palette)
            (out / 'OrbFixture.swift').write_text(source.split("// The island's window content:")[0])
            (out / 'main.swift').write_text(r'''
import AppKit
import SwiftUI
MainActor.assumeIsolated {
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let model = OrbModel()
model.renderStatus = .fallback("test without Metal or artwork")
let window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 78, height: 136),
                      styleMask: [.borderless], backing: .buffered, defer: false)
window.isOpaque = false
window.backgroundColor = .clear
let host = NSHostingView(rootView: IslandView(model: model))
host.frame = NSRect(x: 0, y: 0, width: 78, height: 136)
window.contentView = host
window.orderFrontRegardless()
for tucked in [false, true] {
  model.tucked = tucked
  RunLoop.main.run(until: Date().addingTimeInterval(0.3))
  host.layoutSubtreeIfNeeded()
  guard let bitmap = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { fatalError("no bitmap") }
  host.cacheDisplay(in: host.bounds, to: bitmap)
  var painted = 0
  for y in 0..<bitmap.pixelsHigh {
    for x in 0..<bitmap.pixelsWide {
      if let c = bitmap.colorAt(x: x, y: y), c.alphaComponent > 0.5 { painted += 1 }
    }
  }
  // The island has no backdrop, so the expanded fallback must paint the orb. Tucked, the orb slides away and
  // nothing is drawn behind it, so there is nothing to require.
  if !tucked { precondition(painted > 1000, "fallback is blank") }
  print("Fallback painted, tucked=\(tucked), opaque pixels=\(painted)")
}
window.orderOut(nil)
}
''')
            executable = out / 'orb-smoke'
            subprocess.run(['xcrun', 'swiftc', str(ROOT / 'app/Island.swift'),
                            str(ROOT / 'app/IslandArtwork.swift'), str(ROOT / 'app/Glow.swift'),
                            str(out / 'Palette.swift'), str(out / 'OrbFixture.swift'),
                            str(out / 'main.swift'), '-o', str(executable)], check=True)
            subprocess.run([str(executable)], check=True, timeout=20)


@unittest.skipUnless(sys.platform == 'darwin', 'Swift compiler needs macOS')
class NotchHoverTest(unittest.TestCase):
    def test_production_launch_and_retention(self):
        with tempfile.TemporaryDirectory(prefix='vahti-notch-') as directory:
            out = pathlib.Path(directory)
            (out / 'main.swift').write_text(r"""
import Foundation
import CoreGraphics
for origin in [CGPoint.zero, CGPoint(x: -1700, y: -400), CGPoint(x: 1920, y: 900)] {
  let screen = CGRect(x: origin.x, y: origin.y, width: 1512, height: 982)
  let left = CGRect(x: screen.minX, y: screen.maxY - 38, width: 656, height: 38)
  let right = CGRect(x: screen.minX + 856, y: screen.maxY - 38, width: 656, height: 38)
  let launch = NotchHover.launchArea(screen: screen, inset: 38, left: left, right: right)
  let strip = launch.insetBy(dx: -48, dy: -12)
  let zone = CGRect(x: launch.midX - 84, y: screen.maxY - 141, width: 168, height: 141)
  func hit(_ x: CGFloat, _ depth: CGFloat, _ open: Bool = false) -> Bool {
    NotchHover.contains(CGPoint(x: launch.midX + x, y: screen.maxY - depth),
      launch: launch, expanded: open, strip: strip, orbZone: zone)
  }
  precondition(hit(0, 0) && hit(-100, 0) && hit(100, 38), "housing boundaries must launch")
  precondition(!hit(-100.01, 10) && !hit(100.01, 10), "no side margin while tucked")
  precondition(!hit(0, 38.01) && !hit(0, 81), "no launch below housing or at future orb")
  precondition(!hit(0, -0.01), "no launch above this screen")
  precondition(hit(120, 10, true), "open strip retains hover")
  for step in 0...120 {
    let t = CGFloat(step) / 120
    precondition(hit(100 * (1 - t), 38 + 43 * t, true), "housing-to-orb path must stay open")
  }
  precondition(hit(0, 81, true) && !hit(0, 81), "retention must not become next launch target")
  precondition(!hit(200, 81, true), "far outside must release")
}
let screen = CGRect(x: 0, y: 0, width: 1512, height: 982)
precondition(NotchHover.launchArea(screen: screen, inset: 38, left: nil, right: nil) == .zero)
precondition(!NotchHover.contains(.zero, launch: .zero, expanded: false, strip: screen, orbZone: screen))
print("Production notch geometry passed: housing boundaries, no early wake, open hand-off, offset displays, unavailable geometry")
""")
            executable = out / 'notch-hover'
            subprocess.run(['xcrun', 'swiftc', str(ROOT / 'app/NotchHover.swift'),
                            str(out / 'main.swift'), '-o', str(executable)], check=True)
            subprocess.run([str(executable)], check=True, timeout=20)


@unittest.skipUnless(sys.platform == 'darwin', 'Swift compiler needs macOS')
class NotchGlowTest(unittest.TestCase):
    def test_glow_cycle_breathing_and_window_room(self):
        with tempfile.TemporaryDirectory(prefix='vahti-glow-') as directory:
            out = pathlib.Path(directory)
            (out / 'main.swift').write_text(r'''
import Foundation
func near(_ a: Float, _ b: Float, _ tol: Float = 0.01) -> Bool { abs(a - b) <= tol }
// Breathing: bounded by the scaled peak, and silent when nothing waits.
let scaled = IslandGlow.peak * 0.6
for i in 0..<200 {
  let t = Double(i) * 0.05
  let b = IslandGlow.value(at: t, pulseAge: 100, breathing: true, notch: true, level: 0.6)
  precondition(b >= 0 && b <= scaled + 1e-6, "breathing out of range")
  precondition(IslandGlow.value(at: t, pulseAge: 100, breathing: false, notch: true, level: 0.6) == 0,
    "no glow without a nudge")
}
// One cycle: still before it, brightest halfway, done after exactly one cycle, and never repeated.
precondition(IslandGlow.value(at: 0, pulseAge: -0.1, breathing: false, notch: true, level: 1) == 0)
precondition(IslandGlow.value(at: 0, pulseAge: 0, breathing: false, notch: true, level: 1) == 0)
let mid = IslandGlow.value(at: 0, pulseAge: IslandGlow.cycle / 2, breathing: false, notch: true, level: 1)
precondition(near(mid, IslandGlow.peak, 0.005), "the pulse peaks halfway through its cycle")
precondition(IslandGlow.value(at: 0, pulseAge: IslandGlow.cycle, breathing: false, notch: true, level: 1) < 0.01)
precondition(IslandGlow.value(at: 0, pulseAge: IslandGlow.cycle * 3.5, breathing: false, notch: true, level: 1) == 0,
  "the alert pulse must not repeat")
// Softer by default: full brightness is the old strength, the default sits clearly under it.
let soft = IslandGlow.value(at: 0, pulseAge: IslandGlow.cycle / 2, breathing: false, notch: true, level: 0.6)
precondition(soft < mid * 0.7, "the default glow should be clearly softer than full brightness")
print("Glow passed: one cycle, no repeat, breathing bounded, default subdued")
''')
            executable = out / 'glow'
            subprocess.run(['xcrun', 'swiftc', str(ROOT / 'app/Glow.swift'),
                            str(out / 'main.swift'), '-o', str(executable)], check=True)
            subprocess.run([str(executable)], check=True, timeout=20)
        # The halo wraps the notch's sides only if the window leaves the halo's reach on both
        # sides of the widest allowed pill (the pill is capped at window.width - 2 * reach).
        import re
        orb = (ROOT / 'app/Orb.swift').read_text()
        glow = (ROOT / 'app/Glow.swift').read_text()
        width = float(re.search(r'static let window = CGSize\(width: ([\d.]+)', orb).group(1))
        reach = float(re.search(r'static let reach: CGFloat = ([\d.]+)', glow).group(1))
        self.assertIn('OrbModel.window.width - 2 * IslandGlow.reach', orb)
        self.assertGreaterEqual(width - 2 * reach, 200,
                                'even the fallback 200pt housing must keep the halo reach on each side')


class NotchGlowSourceTest(unittest.TestCase):
    # Source concordance for the glow's arming rules (runs on any platform; the mjs suite pins the same).
    def test_glow_tracks_an_actual_wait(self):
        import re
        orb = (ROOT / 'app/Orb.swift').read_text()
        island = (ROOT / 'app/Island.swift').read_text()
        # The render loop breathes while a nudge waits - reminders included - and never otherwise.
        self.assertIn('breathing: g.tucked && g.nudging', island)
        self.assertNotIn('alerting', orb)
        self.assertNotIn('alerting', island)
        nudge = orb[orb.index('private func nudge(_ card: Card, overdue: Bool)'):]
        self.assertIn('island.model.nudging = true', nudge)
        # Every card that discards the waiting slot also stops the breath.
        clears = re.findall(
            r'waiting = nil\n\s+if island\.model\.nudging \{ withAnimation\(islandSpring\) \{ island\.model\.nudging = false \}; reshaped\(\) \}',
            orb)
        self.assertGreaterEqual(len(clears), 5,
                                'whats-new/own-model/brief/done/update must each stop the breath when taking the slot')
        # A waiting card that leaves the list (handled in the panel or off-device) ends the glow.
        # The wait remembers an owed origin: b.owed only covers the last 20 minutes, so an unseen
        # owed toast survives until viewed or the task is handled; other waits end off-panel.
        self.assertIn('private var waiting: (card: Card, overdue: Bool, owed: Bool)?', orb)
        self.assertIn('showToast(o.card, overdue: false, linger: nil, line: line, owed: true)', orb)
        self.assertIn('self.waiting = (c.card, c.overdue, owed: self.toastIsOwed)', orb)
        # The owed wait reconciles against the card's own state, not the bounded done preview.
        self.assertIn('let state = await store.card(w.card.id)?.state', orb)
        self.assertIn('["done", "handled", "snoozed", "dismissed"].contains(state', orb)
        self.assertIn('} else if !cards.contains(where: { $0.id == w.card.id }) {', orb)


if __name__ == '__main__':
    unittest.main()
