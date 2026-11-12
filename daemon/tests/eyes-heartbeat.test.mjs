import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
process.env.VAHTI_DATA_DIR = mkdtempSync(join(tmpdir(), 'vahti-heartbeat-'))
after(() => rmSync(process.env.VAHTI_DATA_DIR, { recursive: true, force: true }))
const { open, now } = await import('../lib/db.mjs')
const { ingest, eyes } = await import('../lib/server.mjs')

// The app's capture rhythm can be 30 or 60 s, so between checks it sends status-only requests; the daemon marks
// clipboard and app monitoring inactive after 30 s without one (setup.mjs steps: eyes.at > now() - 30).
test('a status-only ingest with no items refreshes the eyes heartbeat and status', () => {
  const db = open(join(process.env.VAHTI_DATA_DIR, 'vahti.db'))
  eyes.at = now() - 300
  ingest(db, { status: { accessibility: true, front: 'com.apple.finder' }, items: [] })
  assert.ok(eyes.at >= now() - 2)
  assert.equal(eyes.accessibility, true)
  assert.equal(eyes.front, 'com.apple.finder')
  db.close()
})
