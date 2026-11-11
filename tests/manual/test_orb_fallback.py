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
                            str(ROOT / 'app/IslandArtwork.swift'), str(out / 'Palette.swift'), str(out / 'OrbFixture.swift'),
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


if __name__ == '__main__':
    unittest.main()
