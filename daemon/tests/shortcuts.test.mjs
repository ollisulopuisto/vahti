import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('search default avoids Spotlight and registration failures reach Settings', () => {
  const orb = readFileSync('../app/Orb.swift', 'utf8')
  const views = readFileSync('../app/Views.swift', 'utf8')
  assert.match(orb, /static let find = Shortcut\(key: kVK_ANSI_K, modifiers: cmdKey \| optionKey \| shiftKey, label: "K"\)/)
  assert.match(orb, /store\.shortcutErrors\["find"\] = findKey\?\.registrationError/)
  assert.match(orb, /store\.shortcutErrors\["open"\] = hotKey\?\.registrationError/)
  assert.match(views, /store\.shortcutErrors\[name\]/)
  assert.match(views, /Text\(error\)/)
})

test('native shortcut defaults, saved overrides, reset and registration status', { skip: process.platform !== 'darwin' }, () => {
  const source = readFileSync('../app/Orb.swift', 'utf8')
  const start = source.indexOf('struct Shortcut:')
  const end = source.indexOf('@MainActor\nfinal class Companion:')
  assert.ok(start >= 0 && end > start)
  const dir = mkdtempSync(join(tmpdir(), 'vahti-shortcuts-'))
  try {
    const swift = join(dir, 'main.swift')
    writeFileSync(swift, 'import AppKit\nimport Carbon\n' + source.slice(start, end) + readFileSync('tests/shortcuts.swift', 'utf8'))
    execFileSync('swiftc', [swift, '-o', join(dir, 'test')], { timeout: 60000 })
    execFileSync(join(dir, 'test'), [], { timeout: 10000 })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
