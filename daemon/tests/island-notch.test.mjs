import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const orb = readFileSync('../app/Orb.swift', 'utf8')
const island = readFileSync('../app/Island.swift', 'utf8')
const metal = readFileSync('../app/orb.metal', 'utf8')
const views = readFileSync('../app/Views.swift', 'utf8')

test('"In the notch" is a real island mode, pickable in Setup and the orb menu', () => {
  assert.match(orb, /case always, hover, notch, hidden/)
  assert.match(orb, /"notch": "In the notch"/)
  // Setup's picker and the orb's menu both iterate every mode, so the case is enough there.
  assert.match(views, /ForEach\(IslandMode\.allCases/)
  assert.match(orb, /for option in IslandMode\.allCases/)
})

test('the pill hangs from the camera notch: width from the housing, depth from the safe area', () => {
  // A camera housing shows up as a top safe-area inset; no inset means no notch.
  assert.match(orb, /NSScreen\.screens\.first \{ \$0\.safeAreaInsets\.top > 0 \}/)
  // Sized from the housing (auxiliaryTop areas), with spotifast's 200pt cap as the fallback.
  assert.match(orb, /auxiliaryTopLeftArea/)
  assert.match(orb, /auxiliaryTopRightArea/)
  assert.match(orb, /housing > 0 \? housing : 200/)
  assert.match(orb, /notchInset = ns\.safeAreaInsets\.top/)
  // The window hangs from the screen's top, centred on it.
  assert.match(orb, /NSRect\(x: f\.midX - size\.width \/ 2, y: f\.maxY - size\.height/)
  // In the menu bar's strip it needs the status window level and pins across Spaces.
  assert.match(orb, /islandPanel\.level = inNotch \? \.statusBar : \.floating/)
  assert.match(orb, /\.canJoinAllSpaces, \.fullScreenAuxiliary, \.stationary, \.ignoresCycle/)
})

test('without a notch screen the mode falls back to the right edge, behaving like "Tucked away"', () => {
  assert.match(orb, /private var inNotch: Bool \{ mode == \.notch && notchScreen != nil \}/)
  assert.match(orb, /private var tucks: Bool \{ mode == \.hover \|\| mode == \.notch \}/)
  // The geometry branches key off inNotch, so a notch-less Mac never sees the pill.
  assert.match(orb, /island\.model\.notch = inNotch/)
  assert.match(orb, /if inNotch, let ns = notchScreen \{/)
})

test('hover wakes the pill instantly and lingers 400ms on the way out', () => {
  // No dwell: Fitts's law says the throw is the aiming, so the wake timer is gone entirely.
  assert.doesNotMatch(orb, /wakeTimer/)
  assert.match(orb, /tuckSoon\(after: inNotch \? 0\.4 : 1\.2\)/)
})

test('the pill steps aside while Vahti is frontmost', () => {
  assert.match(orb, /NSApplication\.didBecomeActiveNotification/)
  assert.match(orb, /NSApplication\.didResignActiveNotification/)
  assert.match(orb, /if self\?\.inNotch == true \{ self\?\.islandPanel\.orderOut\(nil\) \}/)
  assert.match(orb, /if self\?\.inNotch == true \{ self\?\.islandPanel\.orderFrontRegardless\(\) \}/)
  // Picking the mode in the already-open Setup window must not drop the pill over it: an island
  // already out in another mode is put away, not just left where place() moved it.
  assert.match(orb, /if inNotch && NSApp\.isActive \{\s*islandPanel\.orderOut\(nil\)\s*return\s*\}/)
  // With the panel out while Vahti is frontmost, the menu bar's Show/Hide must follow the mode:
  // offering "Show the orb" for a hidden panel would hide the notch mode for good when clicked.
  assert.match(orb, /var orbHidden: Bool \{ mode == \.hidden \}/)
  const menu = readFileSync('../app/main.swift', 'utf8')
  assert.match(menu, /companion\?\.orbHidden \?\? false \} \? "Show the orb" : "Hide the orb"/)
})

test('no pill backdrop: only the orb and its effects show, in the shader and the fallback', () => {
  // The 0.7.17 removal applied to the notch too: the island is transparent and only the orb is drawn.
  assert.doesNotMatch(metal, /c = float4\(float3\(0\.02, 0\.02, 0\.03\) \* 0\.85, 0\.85\) \* inside/)
  assert.doesNotMatch(orb, /if model\.notch \{ Color\(white: 0\.02\)\.opacity\(0\.85\) \}/)
})

test('the top edge is the target: a thrown cursor wakes the island (Fitts)', () => {
  // The hit region reaches past the window's painted sliver - the pointer is read globally,
  // so a cursor slammed to the screen's top edge within the housing's span plus margin lands here.
  assert.match(orb, /let margin: CGFloat = 48/)
  assert.match(orb, /let edge = CGRect\(x: bounds\.midX - geometry\.width \/ 2 - margin, y: bounds\.maxY - geometry\.height - 8,/)
  assert.match(orb, /if edge\.contains\(point\) \{ return true \}/)
})

test('the notch answers faster: shorter spring response, quicker pulse', () => {
  assert.match(island, /let springResponse = g\.notch \? 0\.26 : 0\.42/)
  assert.match(island, /sin\(t \* \(g\.notch \? 3\.6 : 2\.4\)\)/)
  assert.match(metal, /fmod\(u\.time \* \(u\.notch > 0\.5 \? 0\.5 : 0\.35\), 2\.2\)/)
})

test('hover in the notch still opens the glance card beside the pill', () => {
  const hovered = orb.slice(orb.indexOf('private func hovered'), orb.indexOf('private func tuckSoon'))
  assert.match(hovered, /if inside \{(\s*\n\s*\/\/[^\n]*)+\s*\n\s*glanceTimer = Timer\.scheduledTimer/)
  assert.doesNotMatch(hovered, /if inside, !inNotch/)
})

test('the pill cannot be dragged off the notch', () => {
  assert.match(orb, /private func drag\(_ dy: CGFloat\) \{\s*if inNotch \{ return \}/)
})

test('the renderer sizes, centres and flags the notch pill', () => {
  assert.match(island, /var notch = false/)
  assert.match(island, /var notchWidth: Float = 200/)
  assert.match(island, /OrbModel\.notchSize\(tucked: g\.tucked, width: CGFloat\(g\.notchWidth\), inset: CGFloat\(g\.notchInset\)\)/)
  assert.match(island, /let midX = g\.notch \? window\.width \/ 2 : window\.width - width\.value \/ 2/)
  assert.match(island, /let midY = g\.notch \? OrbModel\.notchOrbDepth/)
  assert.match(island, /g\.notch \? 1 : 0/)
})

test('the shader turns the outline upright in the notch, flare off the top edge', () => {
  assert.match(metal, /float press, notch, unused1, unused2;/)
  assert.match(metal, /if \(u\.notch > 0\.5\) \{/)
  // Transposed axes: depth from the top becomes the outline's x, so the flare runs off the screen's top.
  assert.match(metal, /q = float2\(u\.islandHeight - p\.y, p\.x - \(u\.width - u\.islandWidth\) \* 0\.5\)/)
  assert.match(metal, /d = island_sdf\(q, u\.islandHeight, u\.islandWidth, u\.fillet, u\.radius\)/)
})

test('input follows the pill: top-centred footprint, orb below the housing, and the pulse reuses tucked state', () => {
  assert.match(orb, /if model\.notch \{ return NSRect\(x: bounds\.midX - s\.width \/ 2, y: bounds\.maxY - s\.height/)
  // The painted footprint is the top-edge region (housing span plus margin, to the screen's top).
  assert.match(orb, /let edge = CGRect\(x: bounds\.midX - geometry\.width \/ 2 - margin, y: bounds\.maxY - geometry\.height - 8/)
  assert.match(orb, /let orb = CGPoint\(x: bounds\.midX, y: bounds\.maxY - OrbModel\.notchOrbDepth\(inset: model\.notchInset\)\)/)
  // Nudging and the edge light key off tucked, which the notch's sleeping pill is.
  assert.match(island, /g\.tucked && g\.nudging/)
  assert.match(island, /g\.tucked && \(g\.attention > 0 \|\| g\.working\)/)
})
