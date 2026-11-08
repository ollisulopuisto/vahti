import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, symlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const dir = mkdtempSync(join(tmpdir(), 'vahti-todoist-'))
process.env.VAHTI_DATA_DIR = dir
writeFileSync(join(dir, 'config.json'), JSON.stringify({ me: 'Sam', fullName: 'Sam', languages: ['English'], workRoots: [] }))
after(() => rmSync(dir, { recursive: true, force: true }))
const { open, now } = await import('../lib/db.mjs')
const { save, setSource, SOURCES: SETUP_SOURCES } = await import('../lib/settings.mjs')
const { collect, taskItem } = await import('../collectors/todoist.mjs')
const { readerToken, connectTodoist, disconnectTodoist, todoistGet, todoistConnected, tokenPath } = await import('../lib/todoist.mjs')
const { authorization, readScope } = await import('../lib/authorization.mjs')
const { forget } = await import('../lib/privacy.mjs')
const { ownerAuthored } = await import('../lib/evidence-trust.mjs')
const { SOURCES } = await import('../lib/meaning.mjs')

const at = now()
const token = 'a'.repeat(40)
const project = { id: 'p1', name: 'Home' }
const task = { id: 't1', project_id: 'p1', content: 'Fix the fence', description: 'Buy screws first', priority: 3, labels: ['yard'], url: 'https://todoist.com/showTask?id=t1', due: { date: '2026-11-10' }, added_at: new Date((at - 3600) * 1000).toISOString() }

test('token is validated, stored owner-only, never in config.json', () => {
  for (const bad of ['', 'not-a-token', 'A'.repeat(40), 'a'.repeat(39), 'a'.repeat(41)]) assert.throws(() => connectTodoist({ token: bad }), /TODOIST_TOKEN_INVALID/)
  connectTodoist({ token })
  assert.equal(readerToken(), token)
  assert.equal(existsSync(tokenPath), true)
  assert.equal(readFileSync(join(dir, 'config.json'), 'utf8').includes(token), false)
  chmodSync(tokenPath, 0o644); assert.throws(() => readerToken()); chmodSync(tokenPath, 0o600)
  symlinkSync(tokenPath, join(dir, 'link')); assert.throws(() => readerToken(join(dir, 'link')))
  disconnectTodoist()
  assert.equal(todoistConnected(), false)
  assert.equal(existsSync(tokenPath), false)
})

test('task normalization keeps due date, project, labels and owner authorship', () => {
  const item = taskItem(task, 'Home', at)
  assert.equal(item.id, 'todoist:t1')
  assert.equal(item.source, 'todoist')
  assert.equal(item.thread, 'todoist:Home')
  assert.equal(item.ts, Date.parse('2026-11-10') / 1000)
  assert.equal(item.text, 'Fix the fence\n\nBuy screws first')
  assert.equal(item.meta.priority, 3)
  assert.deepEqual(item.meta.labels, ['yard'])
  assert.equal(ownerAuthored(item), true)
  const noDue = taskItem({ ...task, id: 't2', due: null }, null, at)
  assert.equal(noDue.thread, 'todoist:Inbox')
  assert.equal(noDue.ts, Math.floor(Date.parse(task.added_at) / 1000))
  for (const patch of [{ id: undefined }, { content: '' }, { content: 42 }, { added_at: 'bad', due: null }, { due: { date: 'bad' }, added_at: 'bad' }]) assert.equal(taskItem({ ...task, ...patch }, 'Home', at), null)
})

test('only the tasks and projects routes are allowed, responses are capped arrays', async () => {
  for (const path of ['/rest/v2/tasks/1', '/rest/v2/comments', '/api/v1/tasks', '/rest/v2/tasks?x=1', 'https://evil.test/rest/v2/tasks']) await assert.rejects(() => todoistGet({ tokenFile: tokenPath }, path), /TODOIST_ROUTE_REFUSED/)
  connectTodoist({ token })
  const ok = await todoistGet({ tokenFile: tokenPath }, '/rest/v2/tasks', { fetcher: async (url, init) => {
    assert.equal(url, 'https://api.todoist.com/rest/v2/tasks')
    assert.equal(init.headers.Authorization, `Bearer ${token}`)
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error')
    return new Response(JSON.stringify([task]), { status: 200, headers: { 'content-type': 'application/json' } })
  } })
  assert.equal(ok.length, 1)
  await assert.rejects(() => todoistGet({ tokenFile: tokenPath }, '/rest/v2/tasks', { fetcher: async () => new Response('no', { status: 403 }) }), /TODOIST_TOKEN_REFUSED/)
  await assert.rejects(() => todoistGet({ tokenFile: tokenPath }, '/rest/v2/tasks', { fetcher: async () => new Response('{"a":1}', { status: 200 }) }), /TODOIST_RESPONSE_INVALID/)
})

test('opt-in collector reads tasks once, deduplicates, obeys off-switch and forget', async t => {
  const db = open(':memory:'); t.after(() => db.close())
  save({ todoist: null }); let calls = 0
  assert.equal(await collect(db, { get: () => { calls++ } }), 0); assert.equal(calls, 0)
  connectTodoist({ token })
  const get = async (_, path) => { calls++; return path === '/rest/v2/projects' ? [project] : [task] }
  assert.equal(await collect(db, { get, at, force: true }), 1)
  assert.equal(await collect(db, { get, at, force: true }), 0)
  assert.equal(readScope(db, authorization(['mail'])).prepare('select * from items').all().length, 0)
  assert.equal(readScope(db, authorization(['todoist'])).prepare('select * from items').all().length, 1)
  assert.equal(SOURCES.includes('todoist'), true)
  assert.equal(SETUP_SOURCES.some((s) => s.id === 'todoist'), true)
  setSource('todoist', false)
  assert.equal(readScope(db, authorization(null)).prepare('select * from items').all().length, 0)
  const before = calls; assert.equal(await collect(db, { get, at, force: true }), 0); assert.equal(calls, before)
  setSource('todoist', true)
  // Already stored, so a re-enabled collect adds nothing new.
  assert.equal(await collect(db, { get, at, force: true }), 0)
  forget(db, { id: 'todoist:t1' })
  assert.equal(await collect(db, { get, at: at + 400, force: true }), 0)
})
