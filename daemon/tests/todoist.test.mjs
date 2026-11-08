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
const { collect, taskItem, syncItems } = await import('../collectors/todoist.mjs')
const { readerToken, connectTodoist, disconnectTodoist, todoistGet, todoistConnected, tokenPath } = await import('../lib/todoist.mjs')
const { authorization, readScope } = await import('../lib/authorization.mjs')
const { forget } = await import('../lib/privacy.mjs')
const { ownerAuthored } = await import('../lib/evidence-trust.mjs')
const { SOURCES } = await import('../lib/meaning.mjs')

const at = now()
const token = 'a'.repeat(40)
const project = { id: 'p1', name: 'Home' }
const task = { id: 't1', project_id: 'p1', content: 'Fix the fence', description: 'Buy screws first', priority: 3, labels: ['yard'], url: 'https://todoist.com/showTask?id=t1', due: { date: '2026-11-10' }, added_at: new Date((at - 3600) * 1000).toISOString() }
// The connect verification read: one bounded projects call with the pasted token.
const verifying = (url, init) => {
  assert.equal(url, 'https://api.todoist.com/rest/v2/projects')
  assert.equal(init.headers.Authorization, `Bearer ${token}`)
  return Promise.resolve(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }))
}
const connect = () => connectTodoist({ token, fetcher: verifying })

test('token is validated, verified with a bounded read, stored owner-only, never in config.json', async () => {
  for (const bad of ['', 'not-a-token', 'A'.repeat(40), 'a'.repeat(39), 'a'.repeat(41)]) await assert.rejects(() => connectTodoist({ token: bad, fetcher: verifying }), /TODOIST_TOKEN_INVALID/)
  await connect()
  assert.equal(readerToken(), token)
  assert.equal(existsSync(tokenPath), true)
  assert.equal(readFileSync(join(dir, 'config.json'), 'utf8').includes(token), false)
  chmodSync(tokenPath, 0o644); assert.throws(() => readerToken()); chmodSync(tokenPath, 0o600)
  symlinkSync(tokenPath, join(dir, 'link')); assert.throws(() => readerToken(join(dir, 'link')))
  disconnectTodoist()
  assert.equal(todoistConnected(), false)
  assert.equal(existsSync(tokenPath), false)
})

test('a token that Todoist refuses, or a Todoist that cannot be reached, is never saved', async () => {
  await assert.rejects(() => connectTodoist({ token, fetcher: () => Promise.resolve(new Response('no', { status: 401 })) }), /TODOIST_TOKEN_REFUSED/)
  await assert.rejects(() => connectTodoist({ token, fetcher: () => Promise.resolve(new Response('no', { status: 403 })) }), /TODOIST_TOKEN_REFUSED/)
  await assert.rejects(() => connectTodoist({ token, fetcher: () => Promise.reject(Error('down')) }), /TODOIST_VERIFY_FAILED/)
  await assert.rejects(() => connectTodoist({ token, fetcher: () => Promise.resolve(new Response('no', { status: 500 })) }), /TODOIST_VERIFY_FAILED/)
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
  assert.equal(item.meta.due, '2026-11-10')
  assert.equal(item.meta.time, null)
  assert.deepEqual(item.meta.labels, ['yard'])
  assert.equal(ownerAuthored(item), true)
  const timed = taskItem({ ...task, due: { date: '2026-11-10', datetime: '2026-11-10T15:30:00+02:00' } }, 'Home', at)
  assert.equal(timed.meta.time, '15:30')
  const noDue = taskItem({ ...task, id: 't2', due: null }, null, at)
  assert.equal(noDue.thread, 'todoist:Inbox')
  assert.equal(noDue.ts, Math.floor(Date.parse(task.added_at) / 1000))
  for (const patch of [{ id: undefined }, { content: '' }, { content: 42 }, { added_at: 'bad', due: null }, { due: { date: 'bad' }, added_at: 'bad' }]) assert.equal(taskItem({ ...task, ...patch }, 'Home', at), null)
})

test('only the tasks and projects routes are allowed, responses are capped arrays', async () => {
  for (const path of ['/rest/v2/tasks/1', '/rest/v2/comments', '/api/v1/tasks', '/rest/v2/tasks?x=1', 'https://evil.test/rest/v2/tasks']) await assert.rejects(() => todoistGet({ tokenFile: tokenPath }, path), /TODOIST_ROUTE_REFUSED/)
  await connect()
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
  await connect()
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
  assert.equal(db.prepare('select * from items where id = ?').all('todoist:t1').length, 0)
  assert.equal(db.prepare('select * from tags where item_id = ?').all('todoist:t1').length, 0)
})

test('collected tasks carry their API due date straight into the task tag for the brief', async t => {
  const db = open(':memory:'); t.after(() => db.close())
  await connect()
  const get = async (_, path) => path === '/rest/v2/projects' ? [project] : [task]
  await collect(db, { get, at, force: true })
  const tag = db.prepare('select * from tags where item_id = ?').get('todoist:t1')
  assert.equal(tag.is_task, 1)
  assert.equal(tag.due, '2026-11-10')
  assert.equal(tag.when_words, null)
  assert.equal(tag.card, 'todo')
  assert.equal(tag.model, 'todoist')
  assert.equal(tag.summary, 'Fix the fence\n\nBuy screws first')
})

test('edits sync: changed text, due and moment update, the vector is redone, owner decisions stay', async t => {
  const db = open(':memory:'); t.after(() => db.close())
  await connect()
  const get = async (_, path) => path === '/rest/v2/projects' ? [project] : [task]
  await collect(db, { get, at, force: true })
  db.prepare('insert into vectors (item_id, v) values (?, ?)').run('todoist:t1', Buffer.from([1, 2, 3]))
  db.prepare("insert into task_state (item_id, status, changed_at, reason, completion_origin) values (?, 'done', ?, 'ticked', 'owner')").run('todoist:t1', at)
  const edited = { ...task, content: 'Fix the gate', due: { date: '2026-11-12' } }
  assert.equal(await collect(db, { get: async (_, path) => path === '/rest/v2/projects' ? [project] : [edited], at: at + 400, force: true }), 1)
  const row = db.prepare('select * from items where id = ?').get('todoist:t1')
  assert.equal(row.text.startsWith('Fix the gate'), true)
  assert.equal(row.ts, Date.parse('2026-11-12') / 1000)
  const tag = db.prepare('select * from tags where item_id = ?').get('todoist:t1')
  assert.equal(tag.due, '2026-11-12')
  assert.equal(tag.summary.startsWith('Fix the gate'), true)
  assert.equal(db.prepare('select * from vectors where item_id = ?').all('todoist:t1').length, 0)
  const state = db.prepare('select * from task_state where item_id = ?').get('todoist:t1')
  assert.equal(state.status, 'done')
  assert.equal(state.completion_origin, 'owner')
})

test('an owner rename survives a Todoist edit; only the due date moves', async t => {
  const db = open(':memory:'); t.after(() => db.close())
  await connect()
  await collect(db, { get: async (_, path) => path === '/rest/v2/projects' ? [project] : [task], at, force: true })
  db.prepare('update tags set summary = ? where item_id = ?').run('Garden work', 'todoist:t1')
  const edited = { ...task, content: 'Fix the gate', due: { date: '2026-11-12' } }
  await collect(db, { get: async (_, path) => path === '/rest/v2/projects' ? [project] : [edited], at: at + 400, force: true })
  const tag = db.prepare('select * from tags where item_id = ?').get('todoist:t1')
  assert.equal(tag.summary, 'Garden work')
  assert.equal(tag.due, '2026-11-12')
})

test('a task the owner forgot is not resurrected by the sync pass', async t => {
  const db = open(':memory:'); t.after(() => db.close())
  await connect()
  await collect(db, { get: async (_, path) => path === '/rest/v2/projects' ? [project] : [task], at, force: true })
  const item = taskItem(task, 'Home', at)
  forget(db, { id: item.id })
  assert.equal(syncItems(db, [item]), 0)
  assert.equal(db.prepare('select * from items where id = ?').all(item.id).length, 0)
  assert.equal(db.prepare('select * from tags where item_id = ?').all(item.id).length, 0)
})
