import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const island = readFileSync('../app/Island.swift', 'utf8')
const orb = readFileSync('../app/Orb.swift', 'utf8')
const main = readFileSync('../app/main.swift', 'utf8')

test('an unavailable renderer leaves a non-Metal orb, including missing artwork', () => {
  assert.match(orb, /if model\.renderStatus != \.metal\s*\{\s*IslandFallback/)
  const fallback = orb.slice(orb.indexOf('struct IslandFallback:'), orb.indexOf('// The island\'s window content:'))
  assert.match(fallback, /if let artwork = Self\.artwork/)
  assert.match(fallback, /Circle\(\)\.fill/)
  assert.doesNotMatch(fallback, /MTLCreateSystemDefaultDevice|IslandRenderer\(/)
  assert.match(island, /arguments\.contains\("--orb-fallback"\)/)
  assert.match(orb, /model\.renderStatus == \.metal \? model\.renderer\?\.hitGeometry : nil/)
})

test('initialization and GPU failures are surfaced, readiness requires a completed frame', () => {
  for (const reason of ['Metal device unavailable', 'Metal command queue unavailable', 'orb shader missing', 'orb shader compilation failed', 'orb shader functions missing', 'orb artwork missing', 'orb artwork could not load', 'orb Metal pipeline failed', 'Metal frame failed', 'Metal frame encoder unavailable']) {
    assert.ok(island.includes(reason), reason)
  }
  assert.match(island, /buffer\.status == \.completed[\s\S]*?self\.report\(\.metal\)/)
  assert.match(island, /func checkHealth\(\)/)
  assert.match(island, /category: "Orb"/)
  assert.match(main, /CFBundleShortVersionString/)
  assert.match(main, /CFBundleVersion/)
  assert.match(main, /companion\?\.orbDiagnostic/)
})

test('display link starts only on attachment and Show/display changes recheck position', () => {
  const init = island.slice(island.indexOf('init?(size:'), island.indexOf('func startRendering()'))
  assert.doesNotMatch(init, /thread\.start\(\)/)
  assert.match(island, /guard let w = window else \{ return \}\s*renderer\.startRendering\(\)/)
  assert.match(orb, /didChangeScreenParametersNotification[\s\S]*?self\?\.place\(\)/)
  assert.match(orb, /place\(\)\s*islandPanel\.orderFrontRegardless\(\)/)
})

test('both packaging routes always retain shader source', () => {
  for (const file of ['build-app.sh', 'package-app.sh']) {
    const script = readFileSync(`../scripts/${file}`, 'utf8')
    assert.match(script, /fi\n[^\n]*\ncp app\/orb\.metal/)
  }
})

test('placement and dragging move every visible companion panel with the orb', () => {
  const place = orb.slice(orb.indexOf('private func place()'), orb.indexOf('// The island grew'))
  assert.match(place, /setFrame[\s\S]*?movedIsland\(\)/)
  assert.match(place, /if let p = chatPanel, p\.isVisible \{ beside\(p, size: p\.frame\.size\) \}/)
  assert.match(place, /if let b = bubble, b\.isVisible \{ beside\(b, size: b\.frame\.size\) \}/)
  const drag = orb.slice(orb.indexOf('private func drag('), orb.indexOf('private func menu()'))
  assert.match(drag, /movedIsland\(\)/)
})
