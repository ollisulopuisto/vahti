import { config } from '../lib/config.mjs'
import { connection, todoistGet } from '../lib/todoist.mjs'
import { addItems, cursor, now, setCursor, redactValue } from '../lib/db.mjs'
export const source = 'todoist'

const stamp = (value) => {
  const ts = Date.parse(value || '') / 1000
  return Number.isFinite(ts) ? Math.floor(ts) : null
}

export function taskItem(task, projectName, at = now()) {
  if (!task || (typeof task.id !== 'string' && typeof task.id !== 'number') || typeof task.content !== 'string' || !task.content.trim()) return null
  // An active task's moment is its due date when it has one, else when it was added.
  const ts = stamp(task.due?.datetime || task.due?.date) ?? stamp(task.added_at)
  if (!ts || ts > at + 366 * 86400) return null
  const text = [task.content.trim(), typeof task.description === 'string' && task.description.trim()].filter(Boolean).join('\n\n').slice(0, 16000)
  const thread = `todoist:${(projectName || 'Inbox').slice(0, 200)}`
  return { id: `todoist:${String(task.id).slice(0, 100)}`, source, thread, sender: config.me, fromMe: true, ts, text,
    meta: { project: (projectName || 'Inbox').slice(0, 200), priority: Number(task.priority) || 1,
      due: typeof task.due?.date === 'string' ? task.due.date.slice(0, 40) : null,
      time: typeof task.due?.datetime === 'string' ? task.due.datetime.slice(11, 16) : null,
      labels: Array.isArray(task.labels) ? task.labels.filter((l) => typeof l === 'string').slice(0, 10) : [],
      url: typeof task.url === 'string' ? task.url.slice(0, 500) : null } }
}

// addItems only inserts: an edited Todoist task would otherwise stay as it first arrived. This pass carries the
// API's current state into already-kept rows with the same redaction, and refreshes the task tag straight from
// the API: the due date is Todoist's own calendar date, not words a model found in the text, so a deadline
// reaches the brief without model tagging or the two-day backfill ever being involved. Owner decisions survive:
// a renamed card keeps its summary (only the due date moves), and task_state is never touched. A task that
// vanished from the API is left alone: completed and deleted look the same, so closing it here would guess.
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

export async function collect(db, { get = todoistGet, at = now(), force = false } = {}) {
  const selected = connection()
  if (!selected) return 0
  if (!force && at - Number(cursor(db, 'todoist:last', 0)) < 300) return 0
  const projects = await get(selected, '/rest/v2/projects')
  const names = new Map(projects.filter((p) => p && p.id != null).map((p) => [String(p.id), typeof p.name === 'string' ? p.name : '']))
  // Revoking the source while a request is in flight prevents storage of its result.
  if (connection() === null) return 0
  const tasks = await get(selected, '/rest/v2/tasks')
  if (connection() === null) return 0
  const items = []
  for (const task of tasks) {
    const item = taskItem(task, names.get(String(task?.project_id ?? '')), at)
    if (item) items.push(item)
  }
  const added = addItems(db, items)
  if (connection() === null) return added
  const synced = syncItems(db, items)
  setCursor(db, 'todoist:last', at)
  return added + synced
}
