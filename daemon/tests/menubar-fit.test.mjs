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
  assert.match(bar, /item\.button\?\.title = "" /)
  assert.ok(bar.includes('list.isEmpty || self?.iconOnly == true ? "" : " \\(list.count)"'), 'count title suppressed in icon-only mode')
  // The menu offers switching both ways.
  assert.match(bar, /iconOnly \? "Menu bar: icon and count" : "Menu bar: icon only"/)
})

test('a hidden item is detected with isVisible where available, geometry elsewhere', () => {
  // Apple's isVisible exists only on macOS 15.4+ and can lag transitions, so it must be guarded
  // and older systems need the geometry fallback against unobscured menu bar regions.
  assert.match(bar, /#available\(macOS 15\.4, \*\)\s*\{\s*hidden = !item\.isVisible/)
  assert.match(bar, /screen\.auxiliaryTopRightArea/)
  assert.match(bar, /screen\.safeAreaInsets\.top/)
  assert.match(bar, /screen\.visibleFrame/)
})

test('a hidden item is reported, never silent, and the fallbacks are named', () => {
  assert.match(bar, /NSLog\("Vahti: menu bar item hidden by macOS/)
  assert.match(bar, /Menu bar item hidden by macOS: try icon only below, or press ⌘⌥K/)
})
