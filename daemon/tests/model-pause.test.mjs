import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const dir = mkdtempSync(join(tmpdir(), 'vahti-pause-'))
process.env.VAHTI_DATA_DIR = dir
mkdirSync(join(dir, 'llm/bin'), { recursive: true })
writeFileSync(join(dir, 'config.json'), JSON.stringify({ runtime: 'mlx', modelPaused: true }))
// Synthetic worker: no model packages, weights, network or user data.
writeFileSync(join(dir, 'llm/bin/python'), `#!/bin/sh\necho started >> '${dir}/starts'\nexec /bin/sleep 100\n`, { mode: 0o700 })
const { config } = await import('../lib/config.mjs')
const { modelSettings, saveModelSettings } = await import('../lib/model-settings.mjs')
const { startRuntime } = await import('../lib/runtime.mjs')
const { modelFetch } = await import('../lib/model-provider.mjs')
after(() => rmSync(dir, { recursive: true, force: true }))
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

test('persisted pause prevents startup and request reload; resume and supervised pause do not bounce', async () => {
  startRuntime()
  assert.equal(modelSettings().paused, true)
  assert.throws(() => modelFetch('/api/chat'), /paused/)
  assert.deepEqual(await saveModelSettings({ action: 'resume' }), { ok: true, paused: false, restarting: false })
  await wait(300)
  assert.equal(readFileSync(join(dir, 'starts'), 'utf8').trim().split('\n').length, 1)
  assert.deepEqual(await saveModelSettings({ action: 'pause' }), { ok: true, paused: true, restarting: false })
  assert.equal(JSON.parse(readFileSync(join(dir, 'config.json'))).modelPaused, true)
  await wait(5300)
  assert.equal(readFileSync(join(dir, 'starts'), 'utf8').trim().split('\n').length, 1, 'supervisor must not respawn a paused model')
  assert.throws(() => modelFetch('/api/chat'), /paused/)
})
test('pause control never affects an external model provider', async () => {
  config.runtime = 'external'
  await assert.rejects(saveModelSettings({ action: 'pause' }), /own local model/)
  config.runtime = 'mlx'
})
