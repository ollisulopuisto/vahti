import { config } from '../lib/config.mjs'
import { connection, fetchFeed, parseFeed } from '../lib/todoist.mjs'
import { addItems, cursor, now, setCursor, redactValue } from '../lib/db.mjs'
import { remove, forgotten, forgetKey } from '../lib/privacy.mjs'
export const source = 'todoist'

// The offset between a UTC instant and its wall time in tz (positive east of Greenwich).
const tzOffset = (ts, tz) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ts))
  const got = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]))
  return ts - Date.UTC(got.year, got.month - 1, got.day, got.hour % 24, got.minute, got.second)
}

// A wall-clock time in the owner's timezone, as a UTC instant. The offset is resolved at the
// candidate instant and iterated until the wall time matches, so daylight transitions don't drift
// the result; a nonexistent or duplicated wall time lands on the nearest consistent instant.
const wallToUtc = (y, mo, d, h, mi, tz) => {
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  try {
    let candidate = wall + tzOffset(wall, tz)
    for (let i = 0; i < 4; i++) {
      const next = wall + tzOffset(candidate, tz)
      if (next === candidate) break
      candidate = next
    }
    return Math.floor(candidate / 1000)
  } catch { return Math.floor(wall / 1000) }
}

// Date and HH:MM of a UTC instant, in the owner's timezone.
const zonedParts = (ts, tz) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ts * 1000))
  const got = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]))
  return { date: `${got.year}-${got.month}-${got.day}`, time: `${got.hour}:${got.minute}` }
}

const stamp = (value, tz = config.timezone) => {
  // iCal DTSTART: 20261110 (all-day, noon local) or 20261110T153000Z / 20261110T153000 (timed).
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{0,2}(Z)?)?/.exec(value || '')
  if (!match) return null
  const [y, mo, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (!match[4]) return wallToUtc(y, mo, d, 12, 0, tz)
  const [h, mi] = [Number(match[4]), Number(match[5])]
  if (match[6]) return Math.floor(Date.UTC(y, mo - 1, d, h, mi) / 1000)
  return wallToUtc(y, mo, d, h, mi, tz)
}
const unescapeText = (value) => typeof value === 'string' ? value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1') : null

// Feed UIDs carry the due date (<owner>-<task>-<YYYYMMDD>@todoist.com); the stable task identity
// is everything before the date, so a rescheduled task updates its card instead of cloning it, and
// forgetting a task sticks across reschedules.
const stableId = (uid) => { const m = /^(.+)-\d{8}@todoist\.com$/.exec(uid); return m ? m[1] : uid }

export function eventItem(event, at = now(), tz = config.timezone) {
  const summary = unescapeText(event?.SUMMARY)
  if (!event || typeof event.UID !== 'string' || !event.UID.trim() || !summary?.trim()) return null
  // An active task's moment is its due date; the feed carries one all-day event per due date.
  const ts = stamp(event.DTSTART, tz) ?? stamp(event.CREATED, tz)
  if (!ts || ts > at + 366 * 86400) return null
  const description = unescapeText(event.DESCRIPTION)
  const text = [summary.trim(), description?.trim()].filter(Boolean).join('\n\n').slice(0, 16000)
  // Date-only events keep their literal calendar date; a UTC instant is shown in the owner's timezone.
  const zoned = /Z$/.test(event.DTSTART || '') && ts ? zonedParts(ts, tz) : null
  const due = zoned ? zoned.date : stamp(event.DTSTART, tz) ? `${event.DTSTART.slice(0, 4)}-${event.DTSTART.slice(4, 6)}-${event.DTSTART.slice(6, 8)}` : null
  const floating = /^\d{8}T(\d{2})(\d{2})(?!.*Z$)/.exec(event.DTSTART || '')
  return { id: `todoist:${stableId(event.UID).slice(0, 120)}`, source, thread: 'todoist:Feed', sender: config.me, fromMe: true, ts, text,
    meta: { due, time: zoned ? zoned.time : floating ? `${floating[1]}:${floating[2]}` : null } }
}

// addItems only inserts: an edited Todoist task would otherwise stay as it first arrived. This pass carries the
// feed's current state into already-kept rows with the same redaction, and refreshes the task tag straight from
// the feed: the due date is Todoist's own calendar date, not words a model found in the text, so a deadline
// reaches the brief without model tagging or the two-day backfill ever being involved. Owner decisions survive:
// a renamed card keeps its summary (only the due date moves), and task_state is never touched. A task that
// vanished from the feed is left alone: completed and deleted look the same, so closing it here would guess.
// Forget records predate the stable task id: an old record may key on the per-date UID or the old
// numeric API task id. All three forms are checked so a forgotten task never comes back.
const forgottenForms = (gone, event, id) => {
  const apiId = /^\d+-(\d+)$/.exec(stableId(event.UID || ''))?.[1]
  return gone.has(forgetKey('item', id)) || gone.has(forgetKey('item', `todoist:${event.UID}`)) || (apiId && gone.has(forgetKey('item', `todoist:${apiId}`)))
}

export function syncItems(db, items) {
  const existing = db.prepare('select text, thread, ts, meta from items where id = ?')
  const update = db.prepare('update items set text = ?, thread = ?, ts = ?, meta = ? where id = ?')
  const tagRow = db.prepare('select summary from tags where item_id = ?')
  const tag = db.prepare(`insert into tags (item_id, is_task, due, when_words, summary, card, model, tagged_at) values (?, 1, ?, ?, ?, 'todo', 'todoist', ?)
    on conflict(item_id) do update set due = excluded.due, when_words = excluded.when_words, summary = excluded.summary`)
  const retagDue = db.prepare('update tags set due = ?, when_words = ? where item_id = ?')
  const dropVector = db.prepare('delete from vectors where item_id = ?')
  let synced = 0
  for (const item of items) {
    const row = existing.get(item.id)
    if (!row) continue // forgotten or refused: stays gone
    const text = redactValue(item.text), thread = redactValue(item.thread)
    const redactedMeta = redactValue(item.meta)
    const meta = redactedMeta ? JSON.stringify(redactedMeta) : null
    const due = redactedMeta?.due ?? null, time = redactedMeta?.time ?? null
    const current = tagRow.get(item.id)
    const summary = String(text ?? '').slice(0, 200)
    const renamed = current && current.summary !== String(row.text ?? '').slice(0, 200)
    if (row.text !== text || row.thread !== thread || row.ts !== item.ts || row.meta !== meta) {
      update.run(text, thread, item.ts, meta, item.id)
      dropVector.run(item.id) // re-embedded on the next meaning pass
      // The feed has no recurrence flag: a completed card whose date advances is treated as the
      // next occurrence and opens again. Limit: manually rescheduling a completed task reads the
      // same, and also reopens - acceptable, since completing a task normally ends its dates.
      if (row.ts !== item.ts) db.prepare("delete from task_state where item_id = ? and status = 'done'").run(item.id)
      if (renamed) retagDue.run(due, time, item.id)
      else tag.run(item.id, due, time, summary, now())
      synced++
    } else if (!current) {
      tag.run(item.id, due, time, summary, now())
    }
  }
  return synced
}

export async function collect(db, { get = fetchFeed, at = now(), force = false } = {}) {
  const selected = connection()
  if (!selected) return 0
  if (!force && at - Number(cursor(db, 'todoist:last', 0)) < 300) return 0
  const ics = await get(selected)
  // Revoking the source while a request is in flight prevents storage of its result.
  if (connection() === null) return 0
  const gone = forgotten(db)
  const items = []
  for (const event of parseFeed(ics)) {
    const item = eventItem(event, at)
    if (item && !forgottenForms(gone, event, item.id)) items.push(item)
  }
  // Completed tasks vanish from the feed: a future card that no longer appears is done and clears.
  // Past ones stay as history, and forgotten ids never come back (addItems checks forget records).
  const keep = new Set(items.map((i) => i.id))
  for (const row of db.prepare("select id from items where source = 'todoist' and ts > ?").all(at - 3600)) {
    if (!keep.has(row.id)) remove(db, 'id = ?', [row.id])
  }
  const added = addItems(db, items)
  if (connection() === null) return added
  const synced = syncItems(db, items)
  setCursor(db, 'todoist:last', at)
  return added + synced
}
