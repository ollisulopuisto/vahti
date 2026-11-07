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
test('native host survives page switches, loading, inspector changes and window resizing', { skip: process.platform !== 'darwin' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'vahti-window-layout-'))
  try {
    const binary = join(dir, 'layout')
    execFileSync('swiftc', ['../app/WindowHosting.swift', 'tests/window-layout.swift', '-o', binary], { timeout: 60000, stdio: 'pipe' })
    execFileSync(binary, [], { timeout: 30000, stdio: 'pipe' })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
