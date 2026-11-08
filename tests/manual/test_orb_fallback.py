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
  precondition(painted > (tucked ? 100 : 1000), "fallback is blank")
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


if __name__ == '__main__':
    unittest.main()
