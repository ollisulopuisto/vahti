import AppKit
import SwiftUI

@MainActor @Observable final class Fixture {
  var brief = false
  var loaded = false
  var inspector = false
}
struct LayoutFixture: View {
  var state: Fixture
  var body: some View {
    @Bindable var state = state
    NavigationSplitView {
      Text("Sidebar").navigationSplitViewColumnWidth(min: 200, ideal: 240, max: 320)
    } detail: {
      Group {
        if state.brief {
          if state.loaded {
            ScrollView { VStack { ForEach(0..<40) { n in Text("Synthetic card \(n)").padding(18) } } }
          } else { ProgressView() }
        } else { Text("Other page").frame(maxWidth: .infinity, maxHeight: .infinity) }
      }
      .inspector(isPresented: $state.inspector) { Text("Context").inspectorColumnWidth(min: 300, ideal: 360, max: 480) }
    }
    .navigationTitle(state.brief ? "Brief" : "Timeline")
    .toolbar { ToolbarItem { Button("Refresh") {} } }
  }
}
@main struct WindowLayoutRegression {
  @MainActor static func main() {
    _ = NSApplication.shared
    let state = Fixture()
    let host = makeWindowHost(LayoutFixture(state: state))
    assert(host.sizingOptions.isEmpty)
    host.sceneBridgingOptions = [.toolbars, .title]
    let window = NSWindow(contentViewController: host)
    window.styleMask = [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView]
    window.minSize = NSSize(width: 640, height: 480)
    window.setContentSize(NSSize(width: 980, height: 720))
    window.isReleasedWhenClosed = false
    window.orderBack(nil)
    for n in 0..<60 {
      // Exercise page, loading, inspector and resize changes on separate display cycles.
      state.brief = n % 2 == 0
      state.loaded = n % 3 != 0
      state.inspector = n % 4 == 0
      window.setContentSize(NSSize(width: 980 + (n % 3) * 40, height: 720))
      RunLoop.main.run(until: Date().addingTimeInterval(0.02))
      window.updateConstraintsIfNeeded()
      window.contentView?.layoutSubtreeIfNeeded()
      window.displayIfNeeded()
      assert(host.sizingOptions.isEmpty)
      // AppKit/NavigationSplitView may recompute minSize after adding the
      // inspector. Its exact value is not the contract under test: the host
      // must not crash/re-enter layout or produce unusable window geometry.
      assert(window.frame.width.isFinite && window.frame.height.isFinite)
      assert(window.frame.width >= 640 && window.frame.height >= 480)
    }
    window.orderOut(nil)
  }
}
