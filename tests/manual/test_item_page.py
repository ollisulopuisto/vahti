#!/usr/bin/env python3
"""Render the real ItemPage at the companion's fixed size, using inert data/services."""
import pathlib
import subprocess
import sys
import tempfile
import unittest
ROOT = pathlib.Path(__file__).resolve().parents[2]

@unittest.skipUnless(sys.platform == 'darwin', 'AppKit needs macOS')
class ItemPageTest(unittest.TestCase):
    def test_real_panel_long_title_expanded_context_and_confirmation(self):
        with tempfile.TemporaryDirectory(prefix='vahti-item-page-') as directory:
            out = pathlib.Path(directory)
            orb = (ROOT / 'app/Orb.swift').read_text()
            store = (ROOT / 'app/Store.swift').read_text()
            views = (ROOT / 'app/Views.swift').read_text()
            # Seed only private view state. The ItemPage layout/body and InputBar are production code.
            page = orb[orb.index('struct ItemPage: View'):orb.index('\nstruct ChatPage: View')]
            page = page.replace('@State private var expandedContext: Set<String> = []', '@State private var expandedContext: Set<String> = ["original"]')
            input_bar = orb[orb.index('struct InputBar: View'):orb.index('// A compact chat bubble')]
            models = store[store.index('struct Flag:'):store.index('\nstruct Event:')]
            models += store[store.index('struct Context:'):store.index('\nstruct Item:')]
            models += store[store.index('struct Handoff:'):store.index('// One of your conversations')]
            labels = views[:views.index('// Each kind of task')]
            auxiliary = views[views.index('struct TodoistSendButton:'):views.index('struct CardRow:')]
            design = (ROOT / 'app/Design.swift').read_text()
            styles = design[design.index('struct PillButton:'):design.index('// \"Show\" and \"Hide\"')]
            (out / 'Production.swift').write_text('import AppKit\nimport SwiftUI\nimport Observation\n' + models + labels + styles + auxiliary + page + input_bar)
            (out / 'Stubs.swift').write_text(r'''
import AppKit
import SwiftUI
import Observation
func sourceName(_ s: String) -> String { s.capitalized }
func howDone(_ s: String?) -> String? { s }
let isoDay: DateFormatter = { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f }()
enum Deliver { static let claude = "com.anthropic.claudefordesktop" }
enum Glass { static let hairline = Color.white.opacity(0.12); static let rim = Color.white.opacity(0.3) }
struct StubViewer { func show(_ path: String) {} }
let viewer = StubViewer()
@MainActor @Observable final class Store {
  var context: Context?
  var contextLoading = false
  var todoistWrite = true
  enum TodoistSend { case sent, needsWarning, failed(String) }
  func sendToTodoist(_ c: Card, acknowledge: Bool) async -> TodoistSend { .needsWarning }
  func addToCalendar(_ c: Card) async -> Bool { false }
  var chats: [String: [String]] = [:]
  var asking: Set<String> = []
  var partial: [String: String] = [:]
  var handoffs: [String: Handoff] = [:]
  func select(_ c: Card?) {}
  func loadChat(_ id: String) async {}
  func loadHandoff(_ id: String) async {}
  func rename(_ c: Card, to: String) {}
  func markCard(_ c: Card, _ status: String) async -> Bool { true }
  func openSource(_ c: Card) async -> String? { nil }
  func ask(_ q: String, agent: String, key: String, item: String) {}
  func startSession(_ id: String, agent: String, branch: Bool = false) {}
  func copy(_ s: String) {}
  func copyFullBrief(_ id: String) async -> Bool { true }
  func openSession(_ id: String, _ s: Handoff.Session, done: @escaping @MainActor (String?) -> Void) { done(nil) }
}
struct ChatThread: View {
  let key: String; let empty: String
  var body: some View { Text(empty).font(.callout).foregroundStyle(.secondary) }
}
''')
            (out / 'main.swift').write_text(r'''
import AppKit
import SwiftUI
MainActor.assumeIsolated {
  NSApplication.shared.setActivationPolicy(.accessory)
  let json = #"{"id":"fixture","source":"todoist","thread":"Inbox","sender":"Olli","ts":1794650400,"summary":"Prepare a conversion utility that preserves headings and tables while converting Markdown documents to DOCX and back","url":"https://example.com/task","card":"todo","state":"open"}"#
  let contextJSON = #"{"item":{"id":"fixture","source":"todoist","thread":"Inbox","sender":"Olli","ts":1794650400,"text":"Project: Inbox\nComplete this task: https://example.com/task"},"messages":[{"id":"message","sender":"Olli","from_me":true,"ts":1794650400,"picked":true,"text":"Create a Markdown to DOCX converter.\nKeep headings, links and lists intact.\nThis is a long original source that expands inside the scroll container, not outside the panel.\nMore source text to make sure the footer never disappears."}],"since":[{"line":"[pull request page, 15 Nov] Parser conversion update","url":"https://example.com/pr","ts":1794696540,"kind":"browser"},{"line":"[AI session, 16 Nov] Worked with Codex","ts":1794821340,"kind":"ai"}]}"#
  for mode in ["expanded", "confirmation", "export"] {
    let store = Store()
    store.context = try! JSONDecoder().decode(Context.self, from: Data(contextJSON.utf8))
    var value = try! JSONSerialization.jsonObject(with: Data(json.utf8)) as! [String: Any]
    if mode == "confirmation" { value["state"] = "looks_done"; value["reason"] = "The assistant suggested completion after a related pull request. Please check whether it really covers this task." }
    if mode == "export" { value["source"] = "whatsapp"; value["card"] = "appointment" }
    let card = try! JSONDecoder().decode(Card.self, from: JSONSerialization.data(withJSONObject: value))
    let root = ItemPage(card: card, agent: .constant("vahti"), back: {})
      .environment(store).frame(width: 400, height: 580)
      .background(Color(white: 0.055)).environment(\.colorScheme, .dark)
    let host = NSHostingView(rootView: root)
    host.sizingOptions = []
    host.frame = NSRect(x: 0, y: 0, width: 400, height: 580)
    let window = NSWindow(contentRect: host.frame, styleMask: [.borderless], backing: .buffered, defer: false)
    window.appearance = NSAppearance(named: .darkAqua)
    window.contentView = host
    window.orderFrontRegardless()
    RunLoop.main.run(until: Date().addingTimeInterval(0.5))
    host.layoutSubtreeIfNeeded()
    precondition(host.bounds.width == 400 && host.bounds.height == 580, "capture escaped the real panel")
    let bitmap = host.bitmapImageRepForCachingDisplay(in: host.bounds)!
    host.cacheDisplay(in: host.bounds, to: bitmap)
    print("ITEMPAGE_CAPTURE_\(mode)=\(bitmap.representation(using: .png, properties: [:])!.base64EncodedString())")
    window.orderOut(nil)
  }
}
''')
            exe = out / 'item-page'
            subprocess.run(['xcrun', 'swiftc', str(ROOT / 'app/ContextTimeline.swift'), str(ROOT / 'app/DetailActionState.swift'), str(ROOT / 'app/LinkPolicy.swift'), str(out / 'Production.swift'), str(out / 'Stubs.swift'), str(out / 'main.swift'), '-o', str(exe)], check=True)
            subprocess.run([str(exe)], check=True, timeout=30)

if __name__ == '__main__':
    unittest.main()
