import { config } from '../lib/config.mjs'
import { connection, todoistGet } from '../lib/todoist.mjs'
import { addItems, cursor, now, setCursor } from '../lib/db.mjs'
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
      labels: Array.isArray(task.labels) ? task.labels.filter((l) => typeof l === 'string').slice(0, 10) : [],
      url: typeof task.url === 'string' ? task.url.slice(0, 500) : null } }
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
  setCursor(db, 'todoist:last', at)
  return added
}
