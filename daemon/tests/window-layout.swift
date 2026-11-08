import AppKit
import SwiftUI

@MainActor @Observable final class Fixture {
  var page = "timeline"
  var loaded = false
  var inspector = false
  var visited: Set<String> = []
}
struct LayoutFixture: View {
  var state: Fixture

  private var briefPage: some View {
    Group {
      if state.loaded {
        ScrollView { VStack { ForEach(0..<40) { n in Text("Synthetic card \(n)").padding(18) } } }
      } else { ProgressView() }
    }
  }

  // Timeline-like page: a long lazy list with per-row rounded backgrounds and a monospaced
  // hour gutter, retained in the stack once visited.
  private var timelinePage: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 0) {
        ForEach(0..<400, id: \.self) { n in
          HStack(alignment: .top, spacing: 14) {
            Text(n % 12 == 0 ? "12:00" : "").font(.system(size: 11).monospacedDigit())
              .frame(width: 44, alignment: .trailing)
            Text("Synthetic timeline row \(n)").padding(11)
          }
          .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
              .fill(Color.white.opacity(0.045)))
        }
      }
      .padding(32)
    }
  }

  // Vault-like page: the heaviest one Vahti has, so the widest collision window for the
  // async-renderer/constraint-pass crash family (0.7.9 Vault, 0.7.11 Timeline, 0.7.12/manual.64
  // Vault). A masonry of source tiles with wrapping chips, copied in spirit from VaultView's
  // Masonry/Flow layouts, built on first visit like ContentView builds the real page.
  private var vaultPage: some View {
    Group {
      if state.loaded {
        ScrollView {
          VStack(alignment: .leading, spacing: 16) {
            MasonryFixture {
              ForEach(0..<12, id: \.self) { tile in
                VStack(alignment: .leading, spacing: 12) {
                  Text("Source \(tile)").font(.headline)
                  FlowFixture(spacing: 6) {
                    ForEach(0..<8, id: \.self) { chip in
                      HStack(spacing: 5) {
                        Text("chat \(tile)-\(chip)").lineLimit(1)
                        Text("\(chip * 7)").foregroundStyle(.secondary).monospacedDigit()
                      }
                      .font(.system(size: 12))
                      .padding(.leading, 10).padding(.trailing, 7).padding(.vertical, 4)
                      .background(Capsule().fill(Color.white.opacity(0.07)))
                    }
                  }
                }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .topLeading)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white.opacity(0.045)))
              }
            }
            ForEach(0..<3, id: \.self) { panel in
              VStack(alignment: .leading, spacing: 0) {
                ForEach(0..<6, id: \.self) { row in
                  HStack(spacing: 14) {
                    Image(systemName: "key").frame(width: 28, height: 28)
                    Text("Panel \(panel) row \(row)").foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                  }
                  .padding(.vertical, 9)
                }
              }
              .padding(.horizontal, 18).padding(.vertical, 6)
              .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white.opacity(0.045)))
            }
          }
          .padding(32)
        }
      } else { ProgressView() }
    }
  }

  var body: some View {
    @Bindable var state = state
    NavigationSplitView {
      Text("Sidebar").navigationSplitViewColumnWidth(min: 200, ideal: 240, max: 320)
    } detail: {
      // Mirrors ContentView's real page lifecycle: a page is first BUILT during the swap that
      // opens it (visited gate, like `visited.contains(p) || store.page == p`), then stays built
      // in the stack; switching only flips opacity and hit-testing, instantly - never an
      // animation or a blur (the 0.7.9 Vault / 0.7.11 Timeline / 0.7.12 Vault crashes).
      ZStack {
        ForEach(["timeline", "brief", "vault"], id: \.self) { p in
          if state.visited.contains(p) || state.page == p {
            page(p)
              .frame(maxWidth: .infinity, maxHeight: .infinity)
              .opacity(state.page == p ? 1 : 0)
              .allowsHitTesting(state.page == p)
              .accessibilityHidden(state.page != p)
          }
        }
      }
      .onChange(of: state.page, initial: true) { _, now in state.visited.insert(now) }
      .inspector(isPresented: $state.inspector) { Text("Context").inspectorColumnWidth(min: 300, ideal: 360, max: 480) }
    }
    .navigationTitle(state.page.capitalized)
    .toolbar { ToolbarItem { Button("Refresh") {} } }
  }

  @ViewBuilder private func page(_ p: String) -> some View {
    switch p {
    case "brief": briefPage
    case "vault": vaultPage
    default: timelinePage
    }
  }
}

// The next two layouts mirror app/Design.swift's Masonry and app/Views.swift's Flow, so the fixture
// measures and places chips the way the real Vault page does.
struct MasonryFixture: Layout {
  var minWidth: CGFloat = 270
  var spacing: CGFloat = 16

  private func columns(_ width: CGFloat) -> (count: Int, width: CGFloat) {
    let n = max(1, Int((width + spacing) / (minWidth + spacing)))
    return (n, (width - spacing * CGFloat(n - 1)) / CGFloat(n))
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? minWidth * 3 + spacing * 2
    let (n, w) = columns(width)
    var heights = Array(repeating: CGFloat(0), count: n)
    for tile in subviews {
      let c = heights.indices.min { heights[$0] < heights[$1] } ?? 0
      heights[c] += tile.sizeThatFits(ProposedViewSize(width: w, height: nil)).height + spacing
    }
    return CGSize(width: width, height: max(0, (heights.max() ?? 0) - spacing))
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    let (n, w) = columns(bounds.width)
    var heights = Array(repeating: CGFloat(0), count: n)
    for tile in subviews {
      let c = heights.indices.min { heights[$0] < heights[$1] } ?? 0
      tile.place(at: CGPoint(x: bounds.minX + CGFloat(c) * (w + spacing), y: bounds.minY + heights[c]),
                 proposal: ProposedViewSize(width: w, height: nil))
      heights[c] += tile.sizeThatFits(ProposedViewSize(width: w, height: nil)).height + spacing
    }
  }
}

struct FlowFixture: Layout {
  var spacing: CGFloat = 6

  func makeCache(subviews: Subviews) -> [CGSize] { subviews.map { $0.sizeThatFits(.unspecified) } }
  func updateCache(_ cache: inout [CGSize], subviews: Subviews) { cache = makeCache(subviews: subviews) }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout [CGSize]) -> CGSize {
    let rows = arrange(width: proposal.width ?? .infinity, cache)
    return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0, height: rows.last.map { $0.y + $0.height } ?? 0)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout [CGSize]) {
    for row in arrange(width: bounds.width, cache) {
      for (index, x) in row.items { subviews[index].place(at: CGPoint(x: bounds.minX + x, y: bounds.minY + row.y), proposal: .unspecified) }
    }
  }

  private func arrange(width: CGFloat, _ sizes: [CGSize]) -> [(items: [(Int, CGFloat)], y: CGFloat, width: CGFloat, height: CGFloat)] {
    var rows: [(items: [(Int, CGFloat)], y: CGFloat, width: CGFloat, height: CGFloat)] = []
    var x: CGFloat = 0, y: CGFloat = 0, height: CGFloat = 0, items: [(Int, CGFloat)] = []
    for (i, size) in sizes.enumerated() {
      if x > 0 && x + size.width > width {
        rows.append((items, y, x - spacing, height))
        y += height + spacing
        x = 0; height = 0; items = []
      }
      items.append((i, x))
      x += size.width + spacing
      height = max(height, size.height)
    }
    if !items.isEmpty { rows.append((items, y, x - spacing, height)) }
    return rows
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
    let pages = ["timeline", "brief", "vault"]
    for n in 0..<60 {
      // Exercise page, loading, inspector and resize changes on separate display cycles, so each
      // heavy page is built during the swap that opens it, like ContentView's first visit.
      state.page = pages[n % pages.count]
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
