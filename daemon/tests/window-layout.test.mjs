import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

test('main window uses explicit AppKit sizing before content is attached', () => {
  const window = readFileSync('../app/Window.swift', 'utf8')
  const host = readFileSync('../app/WindowHosting.swift', 'utf8')
  assert.match(window, /let host = makeWindowHost\(ContentView\(\)/)
  assert.doesNotMatch(window, /NSHostingController\(rootView:/)
  assert.match(host, /host\.sizingOptions = \[\]/)
  assert.ok(host.indexOf('host.sizingOptions = []') < host.indexOf('return host'))
  assert.match(window, /w\.setContentSize\(NSSize\(width: 980, height: 720\)\)/)
  assert.match(window, /w\.minSize = NSSize\(width: 640, height: 480\)/)
  assert.match(window, /w\.setFrameAutosaveName\("Vahti"\)/)
})
test('all floating panels and hosting views disable content-derived sizingOptions', () => {
  const orb = readFileSync('../app/Orb.swift', 'utf8')

  // Island view host disables sizingOptions in IslandHost.init:
  // let host = NSHostingView(...)
  // ...
  // host.sizingOptions = []
  const islandInit = orb.slice(orb.indexOf('final class IslandHost'), orb.indexOf('var shown: NSRect'))
  assert.match(islandInit, /let host = NSHostingView\(rootView: IslandView/)
  assert.match(islandInit, /host\.sizingOptions = \[\]/)

  // Find panel host disables sizingOptions immediately in toggleFind
  const findMethod = orb.slice(orb.indexOf('func toggleFind()'), orb.indexOf('func closeFind()'))
  assert.match(findMethod, /let host = NSHostingView\(rootView: view\.environment\(\\\.openURL, LinkPolicy\.action\)\)\r?\n\s*host\.sizingOptions = \[\]/)

  // Companion chat panel host disables sizingOptions immediately in toggleChat
  const chatMethod = orb.slice(orb.indexOf('func toggleChat()'), orb.indexOf('func grow('))
  assert.match(chatMethod, /let host = NSHostingView\(rootView: CompanionView\(close: [^\r\n]+\r?\n\s*host\.sizingOptions = \[\]/)

  // Toast / nudge presenter reads fittingSize FIRST, then disables sizingOptions before panel display
  const presentFunc = orb.slice(orb.indexOf('func present<V: View>'), orb.indexOf('func hideToast'))
  assert.ok(presentFunc.length > 0)
  assert.match(presentFunc, /let size = NSSize\(width: ceil\(host\.fittingSize\.width\), height: ceil\(host\.fittingSize\.height\)\)\r?\n\s*host\.sizingOptions = \[\]/)

  // FirstClickHost must NOT clear sizingOptions in its initializer, so host.fittingSize can measure content in present
  const firstClickHostClass = orb.slice(orb.indexOf('final class FirstClickHost'), orb.indexOf('final class ToastModel'))
  assert.ok(firstClickHostClass.length > 0)
  assert.doesNotMatch(firstClickHostClass, /sizingOptions/)
})
test('native host survives page switches, loading, inspector changes and window resizing', { skip: process.platform !== 'darwin' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'vahti-window-layout-'))
  try {
    const binary = join(dir, 'layout')
    execFileSync('swiftc', ['../app/WindowHosting.swift', 'tests/window-layout.swift', '-o', binary], { timeout: 60000, stdio: 'pipe' })
    execFileSync(binary, [], { timeout: 30000, stdio: 'pipe' })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
test('page switches are instant, never animated', () => {
  const views = readFileSync('../app/Views.swift', 'utf8')
  // Animated page swaps kept the display-link async renderer busy across AppKit's constraint pass
  // and crashed the window (0.7.9 Vault, 0.7.11 Timeline).
  assert.doesNotMatch(views, /\.animation\([^\n]*value: store\.page/)
  assert.match(views, /private func go\(_ change: \(\) -> Void\) \{ change\(\) \}/)
  // The page stack itself carries no animation modifier and no blur.
  assert.doesNotMatch(views, /\.blur\(/)
})
test('sidebar rows never animate press or hover', () => {
  const views = readFileSync('../app/Views.swift', 'utf8')
  // A click selects the row in the same gesture that ends the press, so an animated press/hover is
  // still running when the page swap replaces the toolbar, title and inspector: display-link async
  // rendering in flight across AppKit's constraint pass (the 0.7.12/manual.64 Vault crash).
  const row = views.slice(views.indexOf('private struct SidebarRow'), views.indexOf('// MARK: Brief'))
  assert.doesNotMatch(row, /\.animation\(/)
  assert.doesNotMatch(row, /withAnimation\(/)
})
