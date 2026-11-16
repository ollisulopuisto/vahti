import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
const { waitForOpen } = await import('../lib/handoff.mjs')

test('a session open is not reported successful before Launch Services accepts it', async () => {
  const child = new EventEmitter()
  let settled = false
  const result = waitForOpen(child).then(value => { settled = true; return value })
  await Promise.resolve()
  assert.equal(settled, false)
  child.emit('error', new Error('private launch diagnostic'))
  assert.deepEqual(await result, { error: 'Could not open the session in Terminal.' })
})

test('session launch fails closed on nonzero exit and succeeds only on zero', async () => {
  for (const code of [1, null, 0]) {
    const child = new EventEmitter()
    const result = waitForOpen(child)
    child.emit('exit', code)
    assert.deepEqual(await result, code === 0 ? { ok: true } : { error: 'Could not open the session in Terminal.' })
  }
})
