import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, symlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const dir = mkdtempSync(join(tmpdir(), 'vahti-todoist-'))
process.env.VAHTI_DATA_DIR = dir
writeFileSync(join(dir, 'config.json'), JSON.stringify({ me: 'Sam', fullName: 'Sam', languages: ['English'], workRoots: [] }))
after(() => rmSync(dir, { recursive: true, force: true }))
const { open } = await import('../lib/db.mjs')
const { parseFeed, connectTodoist, disconnectTodoist, fetchFeed, todoistConnected, readerFeed, feedPath } = await import('../lib/todoist.mjs')
const { eventItem, collect, syncItems } = await import('../collectors/todoist.mjs')
const { authorization, readScope } = await import('../lib/authorization.mjs')
const { forget } = await import('../lib/privacy.mjs')
const { ownerAuthored } = await import('../lib/evidence-trust.mjs')
const { SOURCES } = await import('../lib/meaning.mjs')
const { save, setSource, SOURCES: SETUP_SOURCES } = await import('../lib/settings.mjs')

const at = now2()
function now2() { return Math.floor(Date.parse('2026-11-09T12:00:00Z') / 1000) }
const feedUrl = 'https://todoist.com/API/icalendar?feed=fake-fixture-not-real'
const vevent = (uid, summary, dtstart, description) =>
  ['BEGIN:VEVENT', `UID:${uid}`, `SUMMARY:${summary}`, `DTSTART;VALUE=DATE:${dtstart}`, ...(description ? [`DESCRIPTION:${description}`] : []), 'END:VEVENT']
const ICS = ['BEGIN:VCALENDAR', 'VERSION:2.0', ...vevent('user-t1-20261110@todoist.com', 'Fix the fence', '20261110', 'Buy screws first'), 'END:VCALENDAR'].join('\r\n')
const event = { UID: 'user-t1-20261110@todoist.com', SUMMARY: 'Fix the fence', DTSTART: '20261110', DESCRIPTION: 'Buy screws first' }
// The connect verification read: one bounded fetch of the pasted feed URL.
const verifying = (url, init) => {
  assert.equal(url, feedUrl)
  assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error')
  return Promise.resolve(new Response(ICS, { status: 200, headers: { 'content-type': 'text/calendar' } }))
}
const connect = () => connectTodoist({ url: feedUrl, fetcher: verifying })

test('feed URL is validated, verified with a bounded read, stored owner-only, never in config.json', async () => {
  for (const bad of ['', 'not-a-url', 'http://todoist.com/feed', 'ftp://todoist.com/x']) await assert.rejects(() => connectTodoist({ url: bad, fetcher: verifying }), /TODOIST_FEED_INVALID/)
  await connect()
  assert.equal(readerFeed(), feedUrl)
  assert.equal(existsSync(feedPath), true)
  assert.equal(readFileSync(join(dir, 'config.json'), 'utf8').includes(feedUrl), false)
  chmodSync(feedPath, 0o644); assert.throws(() => readerFeed()); chmodSync(feedPath, 0o600)
  symlinkSync(feedPath, join(dir, 'link')); assert.throws(() => readerFeed(join(dir, 'link')))
  disconnectTodoist()
  assert.equal(todoistConnected(), false)
  assert.equal(existsSync(feedPath), false)
})

test('a feed that refuses, is unreachable, or is not a calendar is never saved', async () => {
  await assert.rejects(() => connectTodoist({ url: feedUrl, fetcher: () => Promise.resolve(new Response('no', { status: 401 })) }), /TODOIST_FEED_INVALID/)
  await assert.rejects(() => connectTodoist({ url: feedUrl, fetcher: () => Promise.resolve(new Response('no', { status: 403 })) }), /TODOIST_FEED_INVALID/)
  await assert.rejects(() => connectTodoist({ url: feedUrl, fetcher: () => Promise.reject(Error('down')) }), /TODOIST_FEED_UNREACHABLE/)
  await assert.rejects(() => connectTodoist({ url: feedUrl, fetcher: () => Promise.resolve(new Response('no', { status: 500 })) }), /TODOIST_FEED_UNREACHABLE/)
  await assert.rejects(() => connectTodoist({ url: feedUrl, fetcher: () => Promise.resolve(new Response('<html>nope</html>', { status: 200 })) }), /TODOIST_FEED_INVALID/)
  assert.equal(todoistConnected(), false)
  assert.equal(existsSync(feedPath), false)
})

test('parseFeed unfolds lines and reads VEVENT fields; garbage is refused', () => {
  const folded = ICS.replace('Buy screws first', 'Buy screws\r\n  first')
  const events = parseFeed(folded)
  assert.equal(events.length, 1)
  assert.equal(events[0].UID, 'user-t1-20261110@todoist.com')
  assert.equal(events[0].SUMMARY, 'Fix the fence')
  assert.equal(events[0].DTSTART, '20261110')
  assert.equal(events[0].DESCRIPTION, 'Buy screws first')
  assert.throws(() => parseFeed('<html>no</html>'), /TODOIST_FEED_INVALID/)
  assert.throws(() => parseFeed(42), /TODOIST_FEED_INVALID/)
})

test('event normalization keeps due date and owner authorship; no times or projects from a feed', () => {
  const item = eventItem(event, at)
  assert.equal(item.id, 'todoist:user-t1-20261110@todoist.com')
  assert.equal(item.source, 'todoist')
  assert.equal(item.thread, 'todoist:Feed')
  assert.equal(item.ts, Date.parse('2026-11-10T00:00:00Z') / 1000)
  assert.equal(item.text, 'Fix the fence\n\nBuy screws first')
  assert.equal(item.meta.due, '2026-11-10')
  assert.equal(item.meta.time, null)
  assert.equal(ownerAuthored(item), true)
  const escaped = eventItem({ UID: 'u2', SUMMARY: 'Pay rent\\, then rest', DTSTART: '20261110', DESCRIPTION: 'line one\\nline two' }, at)
  assert.equal(escaped.text, 'Pay rent, then rest\n\nline one\nline two')
  for (const patch of [{ UID: '' }, { SUMMARY: '  ' }, { SUMMARY: undefined }, { DTSTART: 'bad', CREATED: 'bad' }]) assert.equal(eventItem({ ...event, ...patch }, at), null)
})

test('fetchFeed reads the stored URL and refuses non-calendar answers', async () => {
  await connect()
  const ok = await fetchFeed({ feedFile: feedPath }, { fetcher: async (url, init) => {
    assert.equal(url, feedUrl)
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error')
    return new Response(ICS, { status: 200, headers: { 'content-type': 'text/calendar' } })
  } })
  assert.equal(ok, ICS)
  await assert.rejects(() => fetchFeed({ feedFile: feedPath }, { fetcher: async () => new Response('no', { status: 403 }) }), /TODOIST_FEED_INVALID/)
  await assert.rejects(() => fetchFeed({ feedFile: feedPath }, { fetcher: async () => Promise.reject(Error('down')) }), /TODOIST_FEED_UNREACHABLE/)
})

test('opt-in collector reads the feed once, deduplicates, obeys off-switch and forget', async t => {
  const db = open(':memory:'); t.after(() => db.close())
  save({ todoist: null }); let calls = 0
  assert.equal(await collect(db, { get: () => { calls++ } }), 0); assert.equal(calls, 0)
  await connect()
  const get = async () => { calls++; return ICS }
  assert.equal(await collect(db, { get, at, force: true }), 1)
  assert.equal(await collect(db, { get, at, force: true }), 0)
  assert.equal(readScope(db, authorization(['mail'])).prepare('select * from items').all().length, 0)
  assert.equal(readScope(db, authorization(['todoist'])).prepare('select * from items').all().length, 1)
  assert.equal(SOURCES.includes('todoist'), true)
  assert.equal(SETUP_SOURCES.some((s) => s.id === 'todoist'), true)
  setSource('todoist', false)
  const before = calls
  assert.equal(await collect(db, { get, at, force: true }), 0); assert.equal(calls, before)
  setSource('todoist', true)
  // Already stored, so a re-enabled collect adds nothing new.
  assert.equal(await collect(db, { get, at, force: true }), 0)
  forget(db, { id: 'todoist:user-t1-20261110@todoist.com' })
  assert.equal(await collect(db, { get, at: at + 400, force: true }), 0)
  assert.equal(db.prepare('select * from items where id = ?').all('todoist:user-t1-20261110@todoist.com').length, 0)
  assert.equal(db.prepare('select * from tags where item_id = ?').all('todoist:user-t1-20261110@todoist.com').length, 0)
})

test('collected tasks carry their feed due date straight into the task tag for the brief', async t => {
  const db = open(':memory:'); t.after(() => db.close())
  await connect()
  await collect(db, { get: async () => ICS, at, force: true })
  const tag = db.prepare('select * from tags where item_id = ?').get('todoist:user-t1-20261110@todoist.com')
  assert.equal(tag.is_task, 1)
  assert.equal(tag.due, '2026-11-10')
  assert.equal(tag.when_words, null)
  assert.equal(tag.card, 'todo')
  assert.equal(tag.model, 'todoist')
  assert.equal(tag.summary, 'Fix the fence\n\nBuy screws first')
})

test('edits sync: a text edit keeps its UID and updates in place; owner decisions stay', async t => {
  const db = open(':memory:'); t.after(() => db.close())
  await connect()
  const get = async () => ICS
  await collect(db, { get, at, force: true })
  db.prepare('insert into vectors (item_id, v) values (?, ?)').run('todoist:user-t1-20261110@todoist.com', Buffer.from([1, 2, 3]))
  db.prepare("insert into task_state (item_id, status, changed_at, reason, completion_origin) values (?, 'done', ?, 'ticked', 'owner')").run('todoist:user-t1-20261110@todoist.com', at)
  // The feed UID carries the due date, so an edit with the date unchanged keeps the UID.
  const edited = ['BEGIN:VCALENDAR', ...vevent('user-t1-20261110@todoist.com', 'Fix the gate', '20261110'), 'END:VCALENDAR'].join('\r\n')
  assert.equal(await collect(db, { get: async () => edited, at: at + 400, force: true }), 1)
  const row = db.prepare('select * from items where id = ?').get('todoist:user-t1-20261110@todoist.com')
  assert.equal(row.text, 'Fix the gate')
  assert.equal(row.ts, Date.parse('2026-11-10T00:00:00Z') / 1000)
  const tag = db.prepare('select * from tags where item_id = ?').get('todoist:user-t1-20261110@todoist.com')
  assert.equal(tag.due, '2026-11-10')
  assert.equal(tag.summary, 'Fix the gate')
  assert.equal(db.prepare('select * from vectors where item_id = ?').all('todoist:user-t1-20261110@todoist.com').length, 0)
  const state = db.prepare('select * from task_state where item_id = ?').get('todoist:user-t1-20261110@todoist.com')
  assert.equal(state.status, 'done')
  assert.equal(state.completion_origin, 'owner')
})

test('a due-date move arrives as a new UID; the old card is left alone, completed and deleted look the same', async t => {
  const db = open(':memory:'); t.after(() => db.close())
  await connect()
  await collect(db, { get: async () => ICS, at, force: true })
  const moved = ['BEGIN:VCALENDAR', ...vevent('user-t1-20261112@todoist.com', 'Fix the fence', '20261112'), 'END:VCALENDAR'].join('\r\n')
  assert.equal(await collect(db, { get: async () => moved, at: at + 400, force: true }), 1)
  assert.equal(db.prepare('select * from items where id = ?').all('todoist:user-t1-20261112@todoist.com').length, 1)
  // The old event vanished from the feed: its card stays as it was.
  assert.equal(db.prepare('select * from items where id = ?').all('todoist:user-t1-20261110@todoist.com').length, 1)
})

test('an owner rename survives a feed edit', async t => {
  const db = open(':memory:'); t.after(() => db.close())
  await connect()
  await collect(db, { get: async () => ICS, at, force: true })
  db.prepare('update tags set summary = ? where item_id = ?').run('Garden work', 'todoist:user-t1-20261110@todoist.com')
  const edited = ['BEGIN:VCALENDAR', ...vevent('user-t1-20261110@todoist.com', 'Fix the gate', '20261110'), 'END:VCALENDAR'].join('\r\n')
  await collect(db, { get: async () => edited, at: at + 400, force: true })
  const tag = db.prepare('select * from tags where item_id = ?').get('todoist:user-t1-20261110@todoist.com')
  assert.equal(tag.summary, 'Garden work')
  assert.equal(tag.due, '2026-11-10')
})

test('a forgotten task is not resurrected by the edit sync', async t => {
  const db = open(':memory:'); t.after(() => db.close())
  await connect()
  await collect(db, { get: async () => ICS, at, force: true })
  const item = eventItem(event, at)
  forget(db, { id: item.id })
  assert.equal(syncItems(db, [item]), 0)
  assert.equal(db.prepare('select * from items where id = ?').all(item.id).length, 0)
  assert.equal(db.prepare('select * from tags where item_id = ?').all(item.id).length, 0)
})
