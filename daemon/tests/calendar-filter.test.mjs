import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const root = mkdtempSync(join(tmpdir(), 'vahti-calfilter-'))
process.env.VAHTI_DATA_DIR = join(root, 'vault')
mkdirSync(process.env.VAHTI_DATA_DIR, { recursive: true })
after(() => rmSync(root, { recursive: true, force: true }))

const { excludedCalendars, setCalendarIncluded } = await import('../lib/settings.mjs')
const { readable } = await import('../collectors/calendar.mjs')
const { configPath } = await import('../lib/config.mjs')
const { open, addItems, now } = await import('../lib/db.mjs')
const { remove: removeItems } = await import('../lib/privacy.mjs')
const { collect } = await import('../collectors/calendar.mjs')

// A minimal stand-in for the Mac's Calendar database, at the path the collector reads.
const calendarDir = resolve(homedir(), 'Library/Group Containers/group.com.apple.calendar')
const calendarPath = resolve(calendarDir, 'Calendar.sqlitedb')
const fixturePreexisted = existsSync(calendarPath)
if (!fixturePreexisted) {
  mkdirSync(calendarDir, { recursive: true })
  const cal = new DatabaseSync(calendarPath)
  cal.exec(`create table Calendar (ROWID integer primary key, title text);
    create table Location (ROWID integer primary key, title text);
    create table CalendarItem (ROWID integer primary key, summary text, all_day integer, hidden integer, status integer, completion_date real, start_date real, calendar_id integer, location_id integer);
    create table OccurrenceCache (event_id integer, occurrence_start_date real, occurrence_date real);
    insert into Calendar values (1, 'Work'), (2, 'Kids');
    insert into CalendarItem values (10, 'Standup', 0, 0, 0, null, 0, 1, null), (11, 'School play', 0, 0, 0, null, 0, 2, null);
    insert into OccurrenceCache values (10, null, ${now() - 978_307_200 + 3600}), (11, null, ${now() - 978_307_200 + 3600});`)
  cal.close()
  after(() => rmSync(calendarPath, { force: true }))
}

// A collect started before a switch-off can reinsert the calendar's events after the switch's own
// delete, and events kept before the feature existed survive the per-run future delete. Every run
// must remove what a switched-off calendar left behind.
test('collect drops a switched-off calendar and removes what it kept', () => {
  if (fixturePreexisted) return // never touch a real Calendar database
  assert.equal(setCalendarIncluded('Kids', false), true)
  const db = open()
  addItems(db, [{ id: `calendar:seed:${now()}`, source: 'calendar', thread: 'Kids', sender: 'Kids', fromMe: true, ts: now() - 86400, text: 'School play', meta: {} }])
  collect(db)
  const threads = db.prepare("select thread from items where source = 'calendar'").all().map((r) => r.thread)
  assert(!threads.includes('Kids'), `Kids events should be gone, kept: ${threads}`)
  assert(threads.includes('Work'), `Work events should be read, kept: ${threads}`)
  db.close()
  assert.equal(setCalendarIncluded('Kids', true), true)
})

test('every calendar is read until one is switched off', () => {
  assert.deepEqual(excludedCalendars(), [])
})

test('switching a calendar off is kept in config.json and back on removes it', () => {
  assert.equal(setCalendarIncluded("Kids' calendar", false), true)
  assert.deepEqual(excludedCalendars(), ["Kids' calendar"])
  const saved = JSON.parse(readFileSync(configPath, 'utf8'))
  assert.deepEqual(saved.calendars.exclude, ["Kids' calendar"])
  assert.equal(setCalendarIncluded("Kids' calendar", true), true)
  assert.deepEqual(excludedCalendars(), [])
  assert.deepEqual(JSON.parse(readFileSync(configPath, 'utf8')).calendars.exclude, [])
})

test('excluding twice keeps one entry, and other settings survive the save', () => {
  writeFileSync(configPath, JSON.stringify({ online: true, calendars: { exclude: ['Family'] } }, null, 2), { mode: 0o600 })
  assert.equal(setCalendarIncluded('Family', false), true)
  const saved = JSON.parse(readFileSync(configPath, 'utf8'))
  assert.deepEqual(saved.calendars.exclude, ['Family'])
  assert.equal(saved.online, true)
  assert.equal(setCalendarIncluded('Family', true), true)
})

test('an empty or missing title changes nothing', () => {
  for (const bad of ['', null, undefined, 42]) assert.equal(setCalendarIncluded(bad, false), false)
  assert.deepEqual(excludedCalendars(), [])
})

// Exact title identity: a switch names a calendar the way the Calendar database spells it, so
// whitespace and length are preserved. Anything else would silently switch a different calendar.
test('titles with whitespace or over 200 characters switch exactly the calendar they name', () => {
  for (const [title, lookalike] of [[' Private calendar ', 'Private calendar'], [`Grandparents${' very'.repeat(50)} long`, `Grandparents${' very'.repeat(50)} long`.slice(0, 200)]]) {
    assert.equal(setCalendarIncluded(title, false), true)
    assert.deepEqual(excludedCalendars(), [title])
    const rows = [{ cal: title, summary: 'Tea' }, { cal: lookalike, summary: 'Lookalike' }]
    assert.deepEqual(readable(rows, new Set(excludedCalendars())), [rows[1]])
    // The deletion predicate matches the same exact title, so the vault copy goes too.
    const db = open()
    addItems(db, [{ id: `calendar:99:${now()}`, source: 'calendar', thread: title, sender: title, fromMe: true, ts: now(), text: 'Tea', meta: {} }])
    assert.equal(removeItems(db, "source = 'calendar' and coalesce(thread, '') = ?", [title]), 1)
    db.close()
    assert.equal(setCalendarIncluded(title, true), true)
    assert.deepEqual(excludedCalendars(), [])
  }
})

test('the collector drops rows from switched-off calendars only', () => {
  const rows = [
    { cal: 'Work', summary: 'Standup' },
    { cal: "Kids' calendar", summary: 'School play' },
    { cal: null, summary: 'No calendar title' },
  ]
  assert.deepEqual(readable(rows, new Set()), rows)
  assert.deepEqual(readable(rows, new Set(["Kids' calendar"])), [rows[0], rows[2]])
})
