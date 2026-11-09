import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'vahti-calfilter-'))
process.env.VAHTI_DATA_DIR = join(root, 'vault')
mkdirSync(process.env.VAHTI_DATA_DIR, { recursive: true })
after(() => rmSync(root, { recursive: true, force: true }))

const { excludedCalendars, setCalendarIncluded } = await import('../lib/settings.mjs')
const { readable } = await import('../collectors/calendar.mjs')
const { configPath } = await import('../lib/config.mjs')

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
  for (const bad of ['', '   ', null, undefined, 42]) assert.equal(setCalendarIncluded(bad, false), false)
  assert.deepEqual(excludedCalendars(), [])
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
