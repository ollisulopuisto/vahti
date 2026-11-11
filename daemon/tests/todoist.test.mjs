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
  for (const bad of ['', 'not-a-url', 'http://todoist.com/feed', 'ftp://todoist.com/x', 'https://evil.test/feed', 'https://todoist.com.evil.test/x', 'https://todoist.com:8443/x', 'https://user@todoist.com/x', 'https://192.168.1.1/x']) await assert.rejects(() => connectTodoist({ url: bad, fetcher: verifying }), /TODOIST_FEED_INVALID/)
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

test('a legacy API-token connection shows as not connected and the old credential is removed', async () => {
  const { save: saveSettings } = await import('../lib/settings.mjs')
  writeFileSync(join(dir, 'todoist-token'), `${'a'.repeat(40)}\n`, { mode: 0o600 })
  saveSettings({ todoist: { enabled: true } })
  assert.equal(todoistConnected(), false) // no feed URL: never claim connected
  assert.equal(existsSync(join(dir, 'todoist-token')), false) // legacy credential removed
  saveSettings({ todoist: null })
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

test('daylight transitions do not drift wall times; UTC instants display in the owner timezone', () => {
  // Spring forward in Los Angeles (2026-03-08 02:00 -> 03:00): 03:30 PDT is 10:30 UTC.
  const spring = eventItem({ UID: 'u-t9-20260308@todoist.com', SUMMARY: 'x', DTSTART: '20260308T033000' }, at, 'America/Los_Angeles')
  assert.equal(spring.ts, Date.parse('2026-03-08T10:30:00Z') / 1000)
  assert.equal(spring.meta.time, '03:30')
  // A UTC instant is shown in the owner timezone: 23:30 UTC is 01:30 the next day in Helsinki.
  const late = eventItem({ UID: 'u-t9-20261110@todoist.com', SUMMARY: 'x', DTSTART: '20261110T233000Z' }, at, 'Europe/Helsinki')
  assert.equal(late.meta.due, '2026-11-11')
  assert.equal(late.meta.time, '01:30')
  const allDay = eventItem({ UID: 'u-t9-20261110@todoist.com', SUMMARY: 'x', DTSTART: '20261110' }, at, 'Europe/Helsinki')
  assert.equal(allDay.meta.due, '2026-11-10')
  assert.equal(allDay.meta.time, null)
})

test('forget records under the old per-date and numeric API ids still suppress the task', async t => {
  const db = open(':memory:'); t.after(() => db.close())
  await connect()
  const numericFeed = ['BEGIN:VCALENDAR', ...vevent('123-456-20261110@todoist.com', 'Old task', '20261110'), 'END:VCALENDAR'].join('\r\n')
  forget(db, { id: 'todoist:123-456-20261110@todoist.com' }) // forgotten under the per-date id
  forget(db, { id: 'todoist:456' }) // and the old numeric API id of another task
  assert.equal(await collect(db, { get: async () => numericFeed, at, force: true }), 0)
  assert.equal(db.prepare('select * from items').all().length, 0)
})

test('a completed recurring task opens again when its date advances', async t => {
  const db = open(':memory:'); t.after(() => db.close())
  await connect()
  await collect(db, { get: async () => ICS, at, force: true })
  db.prepare("insert into task_state (item_id, status, changed_at, reason, completion_origin) values (?, 'done', ?, 'ticked', 'owner')").run('todoist:user-t1', at)
  const advanced = ['BEGIN:VCALENDAR', ...vevent('user-t1-20261117@todoist.com', 'Fix the fence', '20261117'), 'END:VCALENDAR'].join('\r\n')
  assert.equal(await collect(db, { get: async () => advanced, at: at + 400, force: true }), 1)
  assert.equal(db.prepare('select * from task_state where item_id = ?').all('todoist:user-t1').length, 0) // next occurrence is open
  assert.equal(db.prepare('select * from tags where item_id = ?').get('todoist:user-t1').due, '2026-11-17')
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

test('event normalization keys on the stable task id; all-day dates land on local noon', () => {
  const item = eventItem(event, at, 'UTC')
  assert.equal(item.id, 'todoist:user-t1') // per-date UID collapses to the stable task id
  assert.equal(item.source, 'todoist')
  assert.equal(item.thread, 'todoist:Feed')
  assert.equal(item.ts, Date.parse('2026-11-10T12:00:00Z') / 1000) // date-only = local noon, not UTC midnight
  assert.equal(item.text, 'Fix the fence\n\nBuy screws first')
  assert.equal(item.meta.due, '2026-11-10')
  assert.equal(item.meta.time, null)
  assert.equal(ownerAuthored(item), true)
  const west = eventItem(event, at, 'America/Los_Angeles')
  assert.equal(west.ts, Date.parse('2026-11-10T20:00:00Z') / 1000) // noon PST is 20:00 UTC, still the 10th locally
  const timed = eventItem({ UID: 'u-t2-20261110@todoist.com', SUMMARY: 'Call Sam', DTSTART: '20261110T153000Z' }, at, 'UTC')
  assert.equal(timed.ts, Date.parse('2026-11-10T15:30:00Z') / 1000)
  assert.equal(timed.meta.time, '15:30')
  const escaped = eventItem({ UID: 'u2', SUMMARY: 'Pay rent\\, then rest', DTSTART: '20261110', DESCRIPTION: 'line one\\nline two' }, at, 'UTC')
  assert.equal(escaped.id, 'todoist:u2')
  assert.equal(escaped.text, 'Pay rent, then rest\n\nline one\nline two')
  for (const patch of [{ UID: '' }, { SUMMARY: '  ' }, { SUMMARY: undefined }, { DTSTART: 'bad', CREATED: 'bad' }]) assert.equal(eventItem({ ...event, ...patch }, at, 'UTC'), null)
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
  forget(db, { id: 'todoist:user-t1' })
  assert.equal(await collect(db, { get, at: at + 400, force: true }), 0)
  const rescheduled = ['BEGIN:VCALENDAR', ...vevent('user-t1-20261120@todoist.com', 'Fix the fence', '20261120'), 'END:VCALENDAR'].join('\r\n')
  assert.equal(await collect(db, { get: async () => rescheduled, at: at + 800, force: true }), 0) // a new per-date UID does not resurrect it
  assert.equal(db.prepare('select * from items where id = ?').all('todoist:user-t1').length, 0)
  assert.equal(db.prepare('select * from tags where item_id = ?').all('todoist:user-t1').length, 0)
})

test('collected tasks carry their feed due date straight into the task tag for the brief', async t => {
  const db = open(':memory:'); t.after(() => db.close())
  await connect()
  await collect(db, { get: async () => ICS, at, force: true })
  const tag = db.prepare('select * from tags where item_id = ?').get('todoist:user-t1')
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
  db.prepare('insert into vectors (item_id, v) values (?, ?)').run('todoist:user-t1', Buffer.from([1, 2, 3]))
  db.prepare("insert into task_state (item_id, status, changed_at, reason, completion_origin) values (?, 'done', ?, 'ticked', 'owner')").run('todoist:user-t1', at)
  // The feed UID carries the due date, so an edit with the date unchanged keeps the UID.
  const edited = ['BEGIN:VCALENDAR', ...vevent('user-t1-20261110@todoist.com', 'Fix the gate', '20261110'), 'END:VCALENDAR'].join('\r\n')
  assert.equal(await collect(db, { get: async () => edited, at: at + 400, force: true }), 1)
  const row = db.prepare('select * from items where id = ?').get('todoist:user-t1')
  assert.equal(row.text, 'Fix the gate')
  assert.equal(JSON.parse(row.meta).due, '2026-11-10') // moment math itself is covered with explicit timezones above
  const tag = db.prepare('select * from tags where item_id = ?').get('todoist:user-t1')
  assert.equal(tag.due, '2026-11-10')
  assert.equal(tag.summary, 'Fix the gate')
  assert.equal(db.prepare('select * from vectors where item_id = ?').all('todoist:user-t1').length, 0)
  const state = db.prepare('select * from task_state where item_id = ?').get('todoist:user-t1')
  assert.equal(state.status, 'done')
  assert.equal(state.completion_origin, 'owner')
})

test('a due-date move updates the same card in place (stable task id), and a vanished future card clears', async t => {
  const db = open(':memory:'); t.after(() => db.close())
  await connect()
  await collect(db, { get: async () => ICS, at, force: true })
  const moved = ['BEGIN:VCALENDAR', ...vevent('user-t1-20261112@todoist.com', 'Fix the fence', '20261112'), 'END:VCALENDAR'].join('\r\n')
  assert.equal(await collect(db, { get: async () => moved, at: at + 400, force: true }), 1)
  const rows = db.prepare('select * from items where id = ?').all('todoist:user-t1')
  assert.equal(rows.length, 1) // same stable card, not a clone
  assert.equal(JSON.parse(rows[0].meta).due, '2026-11-12')
  assert.equal(db.prepare('select * from tags where item_id = ?').get('todoist:user-t1').due, '2026-11-12')
  // Completed or deleted in Todoist: the event vanishes from the feed and the future card clears.
  const empty = ['BEGIN:VCALENDAR', 'END:VCALENDAR'].join('\r\n')
  assert.equal(await collect(db, { get: async () => empty, at: at + 800, force: true }), 0)
  assert.equal(db.prepare('select * from items where id = ?').all('todoist:user-t1').length, 0)
})

test('an owner rename survives a feed edit', async t => {
  const db = open(':memory:'); t.after(() => db.close())
  await connect()
  await collect(db, { get: async () => ICS, at, force: true })
  db.prepare('update tags set summary = ? where item_id = ?').run('Garden work', 'todoist:user-t1')
  const edited = ['BEGIN:VCALENDAR', ...vevent('user-t1-20261110@todoist.com', 'Fix the gate', '20261110'), 'END:VCALENDAR'].join('\r\n')
  await collect(db, { get: async () => edited, at: at + 400, force: true })
  const tag = db.prepare('select * from tags where item_id = ?').get('todoist:user-t1')
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
