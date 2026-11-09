import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync('../app/main.swift', 'utf8')
const bar = main.slice(main.indexOf('final class Bar'), main.indexOf('private func entry('))

test('the status item has a stable identity without forcing a position', () => {
  assert.match(bar, /item\.autosaveName = "VahtiStatusItem"/)
  assert.doesNotMatch(bar, /preferredPosition/)
})

test('icon only is an opt-in that suppresses the count text', () => {
  assert.match(bar, /defaults\.bool\(forKey: "vahtiBarIconOnly"\)/)
  assert.match(bar, /toggleIconOnly/)
  assert.ok(bar.includes('item.button?.title = iconOnly || tasks.isEmpty ? "" : " \\(tasks.count)"'), 'count comes from the cached list, so offline toggles are not blank')
  // The menu offers switching both ways.
  assert.match(bar, /iconOnly \? "Menu bar: icon and count" : "Menu bar: icon only"/)
})

test('a hidden item is detected by geometry on every system, never isVisible', () => {
  // Apple's isVisible (15.4+) stays true when macOS hides the item for lack of menu bar space,
  // so the check must be geometric everywhere: the button window against unobscured menu bar
  // regions (beside the notch, or the plain top strip).
  assert.doesNotMatch(bar, /item\.isVisible/)
  assert.match(bar, /screen\.auxiliaryTopRightArea/)
  assert.match(bar, /screen\.safeAreaInsets\.top/)
  assert.match(bar, /screen\.visibleFrame/)
})

test('a hidden item is reported, never silent, and the fallbacks are named', () => {
  assert.match(bar, /NSLog\("Vahti: menu bar item hidden by macOS/)
  // The warning names the currently bound open shortcut, never a hardcoded one.
  assert.ok(bar.includes('let open = Shortcut.saved("open", or: .open).symbols'))
  assert.ok(bar.includes('try icon only below, or press \\(open)'))
})
