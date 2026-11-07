import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const workflow = readFileSync(new URL('../../.github/workflows/build.yml', import.meta.url), 'utf8')
const verify = readFileSync(new URL('../../scripts/verify-notarized.sh', import.meta.url), 'utf8')
test('manual notarized builds fail closed and deliver to Releases without artifacts', () => {
  assert.match(workflow, /has_cert.*!=.*true.*\|\|.*has_notary/)
  assert.match(workflow, /Notarized builds require both/)
  assert.match(workflow, /tag_name: manual-vahti/)
  assert.match(workflow, /draft: true/)
  assert.match(workflow, /manual\.\$\{\{ github.run_number \}\}-macos-arm64\.dmg/)
  assert.match(workflow, /shasum -a 256/)
  assert.doesNotMatch(workflow, /uses: actions\/upload-artifact/)
})
test('release verification checks final DMG and mounted Vahti app', () => {
  for (const check of ['stapler validate "$DMG"', 'stapler validate "$APP"', 'hdiutil attach', 'TeamIdentifier=LWSR8T5392', 'to.sulopuis.vahti', 'lipo "$APP/Contents/MacOS/Vahti" -verify_arch arm64', 'lipo "$APP/Contents/Resources/runtime/node" -verify_arch arm64', 'spctl --assess --type execute']) assert.ok(verify.includes(check), check)
})

test('lipo input precedes variadic verify_arch option', () => {
  const lines = verify.split('\n').filter(line => line.startsWith('lipo '))
  assert.equal(lines.length, 2)
  for (const line of lines) {
    assert.match(line, /^lipo "[^"\n]+" -verify_arch arm64$/)
  }
})
