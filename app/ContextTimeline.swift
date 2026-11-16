import SwiftUI

// Display values only. The original source text stays behind each disclosure; activity is not completion proof.
struct ContextTimelineEntry: Identifiable {
  let id: String
  let title: String
  let subtitle: String
  let timestamp: Int?
  let text: String
  let url: URL?
}

struct ContextTimeline: View {
  let entries: [ContextTimelineEntry]
  @Binding var expanded: Set<String>

  private var ordered: [ContextTimelineEntry] {
    entries.enumerated().sorted {
      let a = $0.element.timestamp ?? Int.max, b = $1.element.timestamp ?? Int.max
      return a == b ? $0.offset < $1.offset : a < b
    }.map(\.element)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Context").font(.headline)
      Text("Original request and later activity").font(.caption).foregroundStyle(.secondary)
      VStack(spacing: 0) {
        ForEach(ordered) { entry in
          HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 0) {
              Circle().fill(Color.secondary).frame(width: 6, height: 6).padding(.top, 6)
              Rectangle().fill(Color.secondary.opacity(0.22)).frame(width: 1).frame(maxHeight: .infinity)
            }.frame(width: 8)
            VStack(alignment: .leading, spacing: 7) {
              Button {
                if !expanded.insert(entry.id).inserted { expanded.remove(entry.id) }
              } label: {
                HStack(alignment: .top, spacing: 8) {
                  VStack(alignment: .leading, spacing: 3) {
                    Text(entry.title).font(.callout.weight(.medium)).foregroundStyle(.primary)
                    Text(entry.subtitle).font(.caption).foregroundStyle(.secondary)
                  }.frame(maxWidth: .infinity, alignment: .leading)
                  if let ts = entry.timestamp {
                    Text(Date(timeIntervalSince1970: Double(ts)), format: .dateTime.day().month().hour().minute())
                      .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.trailing)
                      .frame(maxWidth: 108, alignment: .trailing)
                  }
                  Image(systemName: expanded.contains(entry.id) ? "chevron.down" : "chevron.right")
                    .font(.caption2).foregroundStyle(.tertiary).padding(.top, 3)
                }.contentShape(Rectangle())
              }.buttonStyle(.plain).accessibilityLabel("\(entry.title), \(entry.subtitle)")
              if expanded.contains(entry.id) {
                Text(entry.text).font(.callout).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                if let url = entry.url {
                  Link("Open source", destination: url).font(.caption)
                }
              }
            }.padding(.bottom, 18)
          }.fixedSize(horizontal: false, vertical: true)
        }
      }
      Text("Activity is context, not proof of completion.").font(.caption2).foregroundStyle(.tertiary)
    }.frame(maxWidth: .infinity, alignment: .leading)
  }
}

// Kept independent of Store so the exact production footer is rendered in native smoke tests.
struct DetailIntentButtons: View {
  let busy: Bool
  let canOpen: Bool
  let didIt: () -> Void
  let tomorrow: () -> Void
  let openAndDone: () -> Void
  let moreInfo: () -> Void

  var body: some View {
    Grid(horizontalSpacing: 8, verticalSpacing: 8) {
      GridRow {
        action("I did it", prominent: true, didIt)
        action("Tomorrow", tomorrow)
      }
      GridRow {
        action(busy ? "Working…" : "Open & done", openAndDone).disabled(!canOpen)
          .help(canOpen ? "Open the source, then mark this card done. This does not send a reply." : "No source link or installed source app is available.")
        action("Give me more info", moreInfo)
      }
    }.disabled(busy)
  }

  private func action(_ title: String, prominent: Bool = false, _ run: @escaping () -> Void) -> some View {
    Button(action: run) {
      Text(title).font(.callout.weight(.medium)).multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, minHeight: 29).padding(.horizontal, 6).padding(.vertical, 3)
        .foregroundStyle(prominent ? Color.black : Color.primary)
        .background(prominent ? Color.white.opacity(0.88) : Color.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 7))
        .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(Color.white.opacity(0.08), lineWidth: 0.5))
        .contentShape(RoundedRectangle(cornerRadius: 7))
    }.buttonStyle(.plain)
  }
}
