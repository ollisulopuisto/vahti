import SwiftUI

// The app owns this resizable window's initial and minimum sizes (Viewer.open).
// Do not feed the active page's ideal/min/max sizes back into AppKit during its
// constraint pass. Brief replaces a spinner with a scrolling card stack, and
// page changes also replace the toolbar and inspector; content-derived sizing
// can invalidate NSHostingView constraints while AppKit is updating them.
@MainActor
func makeWindowHost<Content: View>(_ content: Content) -> NSHostingController<Content> {
  let host = NSHostingController(rootView: content)
  host.sizingOptions = []
  return host
}
