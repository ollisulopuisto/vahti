import { config } from '../lib/config.mjs'
import { connection, fetchFeed, parseFeed } from '../lib/todoist.mjs'
import { addItems, cursor, now, setCursor, redactValue } from '../lib/db.mjs'
export const source = 'todoist'

const stamp = (value) => {
  // iCal DTSTART: 20261110 (all-day) or 20261110T153000Z (timed). Tasks due at noon float to noon UTC.
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(value || '')
  if (!match) return null
  const ts = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4] ?? '00'}:${match[5] ?? '00'}:00Z`) / 1000
  return Number.isFinite(ts) ? Math.floor(ts) : null
}
const unescapeText = (value) => typeof value === 'string' ? value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1') : null

export function eventItem(event, at = now()) {
  const summary = unescapeText(event?.SUMMARY)
  if (!event || typeof event.UID !== 'string' || !event.UID.trim() || !summary?.trim()) return null
  // An active task's moment is its due date; the feed carries one all-day event per due date.
  const ts = stamp(event.DTSTART) ?? stamp(event.CREATED)
  if (!ts || ts > at + 366 * 86400) return null
  const description = unescapeText(event.DESCRIPTION)
  const text = [summary.trim(), description?.trim()].filter(Boolean).join('\n\n').slice(0, 16000)
  const due = stamp(event.DTSTART) ? `${event.DTSTART.slice(0, 4)}-${event.DTSTART.slice(4, 6)}-${event.DTSTART.slice(6, 8)}` : null
  return { id: `todoist:${event.UID.slice(0, 120)}`, source, thread: 'todoist:Feed', sender: config.me, fromMe: true, ts, text,
    meta: { due, time: null } }
}

// addItems only inserts: an edited Todoist task would otherwise stay as it first arrived. This pass carries the
// feed's current state into already-kept rows with the same redaction, and refreshes the task tag straight from
// the feed: the due date is Todoist's own calendar date, not words a model found in the text, so a deadline
// reaches the brief without model tagging or the two-day backfill ever being involved. Owner decisions survive:
// a renamed card keeps its summary (only the due date moves), and task_state is never touched. A task that
// vanished from the feed is left alone: completed and deleted look the same, so closing it here would guess.
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
  const items = []
  for (const event of parseFeed(ics)) {
    const item = eventItem(event, at)
    if (item) items.push(item)
  }
  const added = addItems(db, items)
  if (connection() === null) return added
  const synced = syncItems(db, items)
  setCursor(db, 'todoist:last', at)
  return added + synced
}
