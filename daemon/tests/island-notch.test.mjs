import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const orb = readFileSync('../app/Orb.swift', 'utf8')
const island = readFileSync('../app/Island.swift', 'utf8')
const metal = readFileSync('../app/orb.metal', 'utf8')
const views = readFileSync('../app/Views.swift', 'utf8')
const glow = readFileSync('../app/Glow.swift', 'utf8')
const store = readFileSync('../app/Store.swift', 'utf8')

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

test('the physical housing launches; the wide top-edge strip only retains an open orb', () => {
  // The hover region reaches past the window's painted sliver - the pointer is read globally,
  // so a cursor slammed inside the housing launches; the old margin is retention-only.
  assert.match(orb, /let margin: CGFloat = 48/)
  assert.match(orb, /let strip = CGRect\(x: bounds\.midX - geometry\.width \/ 2 - margin, y: bounds\.maxY - geometry\.height - 8,/)
  assert.match(orb, /expanded: !model\.tucked, strip: strip, orbZone: zone/)
})

test('hover covers the revealed orb too: a static zone, so the wake path has no gap', () => {
  // The orb's zone keys off the fixed reveal depth, never the animated geometry: while the island
  // answers, every point between the strip and the orb stays hover.
  assert.match(orb, /let depth = OrbModel\.notchOrbDepth\(inset: model\.notchInset\)/)
  assert.match(orb, /let zone = CGRect\(x: bounds\.midX - 36 - margin, y: bounds\.maxY - depth - 36 - 24,/)
  assert.match(orb, /width: \(36 \+ margin\) \* 2, height: depth \+ 36 \+ 24\)/)
  // And a short hysteresis bridges the hand-off and ignores grazing corners. It is gated to the
  // notch: the right-edge island's hover and exit timers keep their own timing.
  assert.match(orb, /private var hoverLeftAt: CFTimeInterval\?/)
  assert.match(orb, /if now - hoverLeftAt! < 0\.15 \{ hover = true \} else \{ hoverLeftAt = nil \}/)
  assert.match(orb, /\} else if model\.hover \{\s*\/\/ The hysteresis is a notch affair[^\n]*\n\s*if model\.notch \{/)
})

test('the non-Metal fallback slides too: a masked canvas, the orb always drawn, gliding on tucked', () => {
  // Devin: the fallback used to draw only when untucked - instant appear/disappear, no slide.
  const fallback = orb.slice(orb.indexOf('struct IslandFallback'), orb.indexOf('struct IslandFallback') + 2600)
  assert.match(fallback, /let canvas = depth \+ 40/)
  // The orb's 58pt frame is top-aligned in the canvas, so its centre sits 29 in: the offset puts the centre
  // on the target (reveal depth open, inset - 40 tucked), not canvas / 2 - that centred the orb wrong.
  assert.match(fallback, /\.offset\(y: \(model\.tucked \? model\.notchInset - 40 : depth\) - 29\)/)
  assert.doesNotMatch(fallback, /canvas \/ 2/)
  assert.match(fallback, /\.mask\(VStack\(spacing: 0\) \{ Color\.clear\.frame\(height: model\.notchInset\); Color\.black \}\)/)
  // The tall canvas must be masked BEFORE it is pinned to the pill's height, and the pin keeps the canvas
  // top-anchored inside IslandView's fixed pill-height frame - otherwise the frame recentres the canvas
  // and the painted orb misses the click target at the reveal depth.
  assert.match(fallback, /\.fixedSize\(\)(\s*\/\/[^\n]*)*\s*\.frame\(width: model\.size\.width, height: model\.size\.height, alignment: \.top\)/)
  assert.ok(fallback.indexOf('.mask(') < fallback.indexOf('.fixedSize()'), 'mask must wrap the tall canvas, not the pinned frame')
  const notchBranch = fallback.slice(fallback.indexOf('if model.notch {'), fallback.indexOf('} else {'))
  assert.doesNotMatch(notchBranch, /if !model\.tucked/)
})

test('the fallback paints the orb exactly where containsIsland clicks it (geometry simulation)', () => {
  // Devin: the fallback canvas centred inside the pill-height view and the offset subtracted half the
  // canvas, so the visible orb sat ~70pt above its click circle. Mirror the fixed layout: the canvas is
  // top-anchored at the view's top (the pin makes the view exactly the pill's height, so IslandView's
  // frame cannot recenter it), and the orb's centre lands on the target in both states.
  const inset = 38, depth = inset + 4 + 39, pillH = inset + 4, orbR = 36, frame58 = 29
  const canvas = depth + 40
  // View-local y, 0 at the view's top (window top). containsIsland: orb circle at bounds.maxY - depth.
  const clickCentre = depth
  const painted = (tucked) => {
    const target = tucked ? inset - 40 : depth
    const centreInCanvas = frame58 + (target - frame58) // top-aligned frame + offset
    const canvasTopInView = 0 // pinned: view height == frame height == pillH, no recentering shift
    return canvasTopInView + centreInCanvas
  }
  assert.equal(painted(false), clickCentre, 'open orb centre must equal the click circle centre')
  assert.equal(painted(true), inset - 40, 'tucked orb hides at the Metal slide\'s depth')
  // Tucked, the whole orb is masked out (nothing shows above the housing line); open, it is fully below it.
  assert.ok(painted(true) + frame58 <= inset, 'tucked orb fully hidden above the housing line')
  assert.ok(painted(false) - frame58 >= inset, 'open orb fully below the housing line')
  // The click circle (radius 36) contains the painted orb; the canvas holds the orb plus the hover grow.
  assert.ok(Math.abs(painted(false) - clickCentre) <= orbR - frame58, 'painted orb inside its click circle')
  assert.ok(painted(false) + frame58 * 1.08 <= canvas, 'hover-grown orb still on the canvas')
})

test('the wake path from the notch strip onto the orb is gapless (geometry simulation)', () => {
  // Mirror the Swift rect math with the repo's constants (margin 48, orb radius 36, zone margin 24,
  // strip slack 8, inset 38 for the 14/16-inch housing, so depth = 81 and the slim pill is 42 tall)
  // and walk the throws Olli described: slam to the top edge, then straight or diagonally onto the orb.
  const inset = 38, depth = inset + 4 + 39, pillH = inset + 4, margin = 48, orbR = 36, zoneSlack = 24
  const pillW = 200 // housing width fallback; the real one is wider, never narrower
  const strip = { x0: -pillW / 2 - margin, x1: pillW / 2 + margin, y0: 0, y1: pillH + 8 }
  const zone = { x0: -orbR - margin, x1: orbR + margin, y0: 0, y1: depth + orbR + zoneSlack }
  const covered = (x, y) =>
    (x >= strip.x0 && x <= strip.x1 && y >= strip.y0 && y <= strip.y1) ||
    (x >= zone.x0 && x <= zone.x1 && y >= zone.y0 && y <= zone.y1)
  const paths = [
    { from: [0, 0], to: [0, depth] },        // slammed centre, straight down onto the orb
    { from: [120, 6], to: [0, depth] },      // from beside the housing diagonally onto the orb
    { from: [-120, 20], to: [30, depth + 30] }, // from the margin onto the orb's lower half
    { from: [148, 0], to: [-30, depth] },    // across the whole strip, then down
  ]
  for (const { from, to } of paths) {
    for (let s = 0; s <= 60; s++) {
      const x = from[0] + (to[0] - from[0]) * (s / 60)
      const y = from[1] + (to[1] - from[1]) * (s / 60)
      assert.ok(covered(x, y), `gap at (${x.toFixed(1)}, ${y.toFixed(1)}) on ${JSON.stringify({ from, to })}`)
    }
  }
  // The worst legitimate throw - the strip's far corner to the orb's far rim - must be gapless too.
  for (const worst of [{ from: [-148, 20], to: [60, depth + 30] }, { from: [148, 20], to: [-60, depth + 30] }]) {
    for (let s = 0; s <= 120; s++) {
      const x = worst.from[0] + (worst.to[0] - worst.from[0]) * (s / 120)
      const y = worst.from[1] + (worst.to[1] - worst.from[1]) * (s / 120)
      assert.ok(covered(x, y), `gap at (${x.toFixed(1)}, ${y.toFixed(1)}) on ${JSON.stringify(worst)}`)
    }
  }
  // The orb itself is fully inside its zone, with room for the breathing bob and the hover grow.
  for (let a = 0; a < 16; a++) {
    assert.ok(covered(Math.cos(a) * orbR, depth + Math.sin(a) * orbR), `orb rim ${a} uncovered`)
  }
})

test('the top-edge margin is hover-only: clicks beside the housing stay with the menu bar', () => {
  // The generous region lives in hoverContains; hitTest and ignoresMouseEvents use containsIsland,
  // whose notch branch is the painted pill and orb alone. A menu extra in the margin keeps its clicks.
  assert.match(orb, /private func hoverContains\(_ point: NSPoint\) -> Bool \{\s*if model\.notch \{\s*let geometry = hitGeometry\s*let margin: CGFloat = 48/)
  assert.match(orb, /override func hitTest\(_ point: NSPoint\) -> NSView\? \{\s*containsIsland\(convert\(point, from: superview\)\) \? self : nil/)
  assert.match(orb, /let click = window\.isVisible && containsIsland\(point\)/)
  assert.match(orb, /var hover = window\.isVisible && hoverContains\(point\)/)
  assert.match(orb, /let ignore = !click && start == nil/)
  const contains = orb.slice(orb.indexOf('func containsIsland'), orb.indexOf('private func hoverContains'))
  assert.match(contains, /let pill = CGRect\(x: bounds\.midX - geometry\.width \/ 2, y: bounds\.maxY - geometry\.height/)
  assert.doesNotMatch(contains, /let margin/)
})

test('the waiting pulse reaches the shader: u.glow breathes a halo round the outline', () => {
  // The renderer has always fed the glow slot; the shader now reads it, so the notch (and the
  // right-edge island) visibly breathe while a nudge waits - an effect, not a backdrop.
  assert.match(metal, /if \(u\.glow > 0\.0\) \{\s*float halo = exp\(-sq\(d \/ 4\.0\)\) \* u\.glow;/)
  // The render loop hands the maths to Glow.swift: breathing only while a nudge waits, scaled by
  // Setup's brightness, off when the glow is switched off.
  assert.match(island, /let glow = g\.glowOn \? IslandGlow\.value\(at: t, pulseAge: pulseAge, breathing: g\.tucked && g\.nudging, notch: g\.notch, level: g\.glowLevel\) : 0/)
  // Full strength is the old 0.14, the default sits under it, and the alert pulse is one cycle, never a repeat.
  assert.match(glow, /static let peak: Float = 0\.14/)
  assert.match(glow, /pulseAge >= 0 && pulseAge < cycle/)
})

test('the glow tracks an actual wait: reminders breathe, and nothing waiting stays dark', () => {
  // No leftover distinction: a reminder nudge arms the same breath as news that came in.
  assert.doesNotMatch(orb, /alerting/)
  assert.doesNotMatch(island, /alerting/)
  const nudge = orb.slice(orb.indexOf('private func nudge(_ card: Card, overdue: Bool)'))
  assert.match(nudge, /island\.model\.nudging = true/)
  // Every card that discards the waiting slot (what's new, own-model offer, brief, done, update)
  // also stops the breath - a glow pointing at nothing was the "glow when idle" he saw.
  const clears = orb.match(/waiting = nil\n(\s+)if island\.model\.nudging \{ withAnimation\(islandSpring\) \{ island\.model\.nudging = false \}; reshaped\(\) \}/g) || []
  assert.ok(clears.length >= 5, `expected at least 5 waiting-slot clears that stop the breath, found ${clears.length}`)
  // And once the waiting card leaves the list (done or snoozed in the panel or off-device),
  // the periodic check ends the wait and the glow with it.
  // The wait remembers coming from an owed reply: b.owed only covers the last 20 minutes
  // (daemon OWED_MINUTES), so list membership cannot retire an unseen owed toast. It survives
  // until viewed, or until the task itself is handled; anything else ends when it leaves the panel.
  assert.match(orb, /private var waiting: \(card: Card, overdue: Bool, owed: Bool\)\?/)
  assert.match(orb, /showToast\(o\.card, overdue: false, linger: nil, line: line, owed: true\)/)
  assert.match(orb, /self\.waiting = \(c\.card, c\.overdue, owed: self\.toastIsOwed\)/)
  // The owed wait is reconciled against the card's own state (the brief's done preview is bounded
  // to six entries and three days): it survives while the task is open and ends when the task is
  // done, snoozed, dismissed, handled - or gone entirely. Panel cards still end off-list.
  // The daemon decides: a terminal state or a confirmed 404 ends the wait; a failed lookup
  // (daemon down, undecodable answer) decides nothing and never steals an unseen reply's glow.
  assert.match(store, /enum CardLookup \{ case card\(Card\), missing, failed \}/)
  assert.match(store, /http\.statusCode == 404 \{ return \.missing \}/)
  assert.match(orb, /switch await store\.lookupCard\(w\.card\.id\)/)
  assert.match(orb, /case \.missing: over = true/)
  assert.match(orb, /case \.failed: over = false/)
  assert.match(orb, /\["done", "handled", "snoozed", "dismissed"\]\.contains\(card\.state \?\? "open"\)/)
  assert.match(orb, /\} else if !cards\.contains\(where: \{ \$0\.id == w\.card\.id \}\) \{/)
})

test('the glow wraps the notch: the window leaves the halo room beside the pill', () => {
  // The halo reaches about 12pt past the outline; a 224pt window clipped it beside a 216pt pill.
  assert.match(orb, /static let window = CGSize\(width: 252, height: 136\)/)
  assert.match(glow, /static let reach: CGFloat = 12/)
  // The pill's cap keeps the reach free even for a housing wider than the window.
  assert.match(orb, /min\(max\(housing > 0 \? housing : 200, 120\), OrbModel\.window\.width - 2 \* IslandGlow\.reach\)/)
})

test('alerts glow once instead of sounding while the glow is on', () => {
  assert.match(orb, /private var notchGlow: Bool \{ defaults\.object\(forKey: "vahtiNotchGlow"\) as\? Bool \?\? true \}/)
  // The non-Metal fallback paints no halo, so there the sound stays or the alert would be silent.
  assert.match(orb, /if notchGlow, island\.model\.renderStatus == \.metal \{ island\.model\.glowPulse = Date\(\) \} else \{ makeSound\(\) \}/)
  assert.match(views, /@AppStorage\("vahtiNotchGlow"\)/)
  assert.match(views, /@AppStorage\("vahtiGlowLevel"\)/)
})

test('the notch answers faster: shorter spring response, quicker pulse', () => {
  assert.match(island, /let springResponse = g\.notch \? 0\.26 : 0\.42/)
  assert.match(glow, /sin\(t \* \(notch \? 3\.6 : 2\.4\)/)
  assert.match(metal, /fmod\(u\.time \* \(u\.notch > 0\.5 \? 0\.5 : 0\.35\), 2\.2\)/)
})

test('hover in the notch still opens the glance card beside the pill', () => {
  const hovered = orb.slice(orb.indexOf('private func hovered'), orb.indexOf('private func tuckSoon'))
  assert.match(hovered, /if inside \{(\s*\n\s*\/\/[^\n]*)+\s*\n\s*glanceTimer = Timer\.scheduledTimer/)
  assert.doesNotMatch(hovered, /if inside, !inNotch/)
})

test('the orb slides behind the housing to sleep: movement, not size', () => {
  // Position animation driven by open, no reveal scaling in the notch, and the model's size is the
  // slim pill in every state.
  assert.match(island, /let reveal = g\.notch \? 1 : 0\.35 \+ 0\.65 \* open\.value/)
  assert.match(island, /let orbY = g\.notch\s*\? midY - \(1 - open\.value\) \* \(midY - CGFloat\(g\.notchInset\) \+ 40\) \+ open\.value \* bob/)
  assert.match(island, /let orbScale = \(g\.notch \? 1 : reveal\) \* grow\.value \* rest\.value/)
  assert.match(island, /Float\(g\.notch \? 1 : min\(1, max\(0, open\.value\)\)\)/)
  assert.match(orb, /notch \? OrbModel\.notchSize\(tucked: true, width: notchWidth, inset: notchInset\)/)
  // The shader paints the notch's orb only below the housing, so the climb reads as passing behind it,
  // and the completion rings ride the same clip instead of being cut by the slim pill's outline.
  assert.match(metal, /float hide = clamp\(\(p\.y - u\.inset\) \* u\.scale, 0\.0, 1\.0\);/)
  assert.match(metal, /o \*= hide;/)
  assert.match(metal, /\* k \* 0\.85 \* u\.orbAlpha \* hide;/)
  // The housing's depth travels in the uniform that was unused before.
  assert.match(island, /g\.notch \? 1 : 0, g\.notchInset, 0,/)
})

test('the pill cannot be dragged off the notch', () => {
  assert.match(orb, /private func drag\(_ dy: CGFloat\) \{\s*if inNotch \{ return \}/)
})

test('the renderer sizes, centres and flags the notch pill', () => {
  assert.match(island, /var notch = false/)
  assert.match(island, /var notchWidth: Float = 200/)
  // The pill never resizes: the renderer always uses the slim size and slides the orb instead.
  assert.match(island, /OrbModel\.notchSize\(tucked: true, width: CGFloat\(g\.notchWidth\), inset: CGFloat\(g\.notchInset\)\)/)
  assert.match(island, /let midX = g\.notch \? window\.width \/ 2 : window\.width - width\.value \/ 2/)
  assert.match(island, /let midY = g\.notch \? OrbModel\.notchOrbDepth/)
  assert.match(island, /g\.notch \? 1 : 0/)
})

test('the shader turns the outline upright in the notch, flare off the top edge', () => {
  assert.match(metal, /float press, notch, inset, unused2;/)
  assert.match(metal, /if \(u\.notch > 0\.5\) \{/)
  // Transposed axes: depth from the top becomes the outline's x, so the flare runs off the screen's top.
  assert.match(metal, /q = float2\(u\.islandHeight - p\.y, p\.x - \(u\.width - u\.islandWidth\) \* 0\.5\)/)
  assert.match(metal, /d = island_sdf\(q, u\.islandHeight, u\.islandWidth, u\.fillet, u\.radius\)/)
})

test('input follows the pill: top-centred footprint, orb below the housing, and the pulse reuses tucked state', () => {
  assert.match(orb, /if model\.notch \{ return NSRect\(x: bounds\.midX - s\.width \/ 2, y: bounds\.maxY - s\.height/)
  // The wider strip remains for retention only, never a tucked launch target.
  assert.match(orb, /let strip = CGRect\(x: bounds\.midX - geometry\.width \/ 2 - margin, y: bounds\.maxY - geometry\.height - 8/)
  assert.match(orb, /let orb = CGPoint\(x: bounds\.midX, y: bounds\.maxY - OrbModel\.notchOrbDepth\(inset: model\.notchInset\)\)/)
  // Nudging and the edge light key off tucked, which the notch's sleeping pill is.
  assert.match(island, /g\.tucked && g\.nudging/)
  assert.match(island, /g\.tucked && \(g\.attention > 0 \|\| g\.working\)/)
})

const notchHover = readFileSync('../app/NotchHover.swift', 'utf8')
test('tucked launch uses exact screen housing, never the capped painted width or future orb', () => {
  assert.match(orb, /island\.notchLaunchArea = NotchHover\.launchArea\(screen: f, inset: ns\.safeAreaInsets\.top,/)
  assert.match(orb, /left: ns\.auxiliaryTopLeftArea, right: ns\.auxiliaryTopRightArea/)
  assert.match(orb, /let screenPoint = window\.convertPoint\(toScreen: convert\(point, to: nil\)\)/)
  assert.match(orb, /launch: notchLaunchArea, expanded: false/)
  assert.match(orb, /return NotchHover\.contains\(point, launch: \.zero, expanded: !model\.tucked/)
  assert.match(notchHover, /width: right\.minX - left\.maxX, height: inset/)
  assert.match(notchHover, /return expanded && \(strip\.contains\(point\) \|\| orbZone\.contains\(point\)\)/)
  const hover = orb.slice(orb.indexOf('private func hoverContains'), orb.indexOf('override func hitTest'))
  assert.match(hover, /return NotchHover/)
  assert.doesNotMatch(hover, /if .*return true.*containsIsland/)
})
