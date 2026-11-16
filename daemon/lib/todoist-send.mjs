// Send to Todoist: the one outbound write Vahti makes for a card. Opt-in end to end - the owner
// saves an API token in Setup (it lives in the Keychain, reached only over the daemon's inherited
// pipe), is warned once before the first send, and every send after that is one click. Tasks land
// in the Todoist Inbox with no project or label; the due date is the one Vahti already inferred
// for the card, never a second guess. Todoist owns the task and its reminders from there: Vahti
// closes the card with the reason and schedules nothing.
import { config } from './config.mjs'
import { now } from './db.mjs'
import { vaultCall } from './native-vault.mjs'
import { save } from './settings.mjs'
import { clockOf, markTask, tasks } from './tasks.mjs'

// The only host Send to Todoist may talk to: Todoist's current API (REST v2 and Sync v9 are retired).
export const TASKS_URL = 'https://api.todoist.com/api/v1/tasks'

// The offset between a UTC instant and its wall time in tz (positive east of Greenwich).
const tzOffset = (ts, tz) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ts))
  const got = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]))
  return ts - Date.UTC(got.year, got.month - 1, got.day, got.hour % 24, got.minute, got.second)
}

// A wall-clock due date and time in the owner's timezone, as an RFC 3339 UTC instant for the API.
// The offset is resolved at the candidate instant and iterated, so daylight transitions don't drift it.
const dueUtc = (date, time, tz) => {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  try {
    let candidate = wall + tzOffset(wall, tz)
    for (let i = 0; i < 4; i++) {
      const next = wall + tzOffset(candidate, tz)
      if (next === candidate) break
      candidate = next
    }
    return new Date(candidate).toISOString().replace(/\.\d{3}Z$/, 'Z')
  } catch { return new Date(wall).toISOString().replace(/\.\d{3}Z$/, 'Z') }
}

// The task one click creates: exactly what the first-send warning discloses - the card's title,
// its due date as Vahti inferred it (a clock time rides along when the card carries one), and its
// link when it has one. The quoted message, sender, thread and source stay in the vault. Nothing
// else: no project, no label, no priority, no reminder - Inbox triage keeps Todoist as the backend.
export function payloadFor(card, tz = config.timezone) {
  const content = String(card.summary || '').replace(/\s+/g, ' ').trim().slice(0, 500)
  if (!content) throw Error('TODOIST_EMPTY_CARD')
  const body = { content }
  if (typeof card.url === 'string' && card.url.startsWith('https://')) body.description = card.url.slice(0, 2000)
  const due = /^\d{4}-\d{2}-\d{2}$/.test(card.due || '') ? card.due : null
  // The clock is read the way the rest of Vahti reads it, so 'at 14:00' and 'u 9.30' keep their
  // time while a dotted date stays a date.
  const time = clockOf(card)
  if (due && time) body.due_datetime = dueUtc(due, time, tz)
  else if (due) body.due_date = due
  return body
}

// One bounded POST. The token goes in the Authorization header only - never into the URL, a log
// line or an error message. The response body is not read back to the owner, so it is dropped.
export async function createTask(token, body, { fetcher = fetch } = {}) {
  let response
  try {
    response = await fetcher(TASKS_URL, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch { throw Error('TODOIST_UNREACHABLE') }
  await response.body?.cancel().catch(() => {})
  if (response.ok) return true
  if (response.status === 401 || response.status === 403) throw Error('TODOIST_TOKEN_REFUSED')
  if (response.status === 400) throw Error('TODOIST_REFUSED')
  throw Error('TODOIST_UNREACHABLE')
}

// The first send to Todoist's API is announced once, per the owner's standing rule for any API;
// the app's confirm carries acknowledge: true and no send ever asks again. Recorded in config.json
// so a reinstalled app still knows, and a wiped config simply warns again.
export const sendWarned = () => config.todoist?.writeWarned === true
export const acknowledgeSend = () => save({ todoist: { ...(config.todoist || {}), writeWarned: true } })

const tokenFromVault = async () => (await vaultCall('todoist-token'))?.token

// A send in flight claims its card: a double click or a retried tap meets TODOIST_IN_FLIGHT instead
// of creating a twin task, and the card closes only after Todoist has answered with success. (An
// answer lost on the wire can still leave a task without its card closing - the card stays open
// and shows the failure, so the owner decides instead of a silent duplicate.)
const inFlight = new Set()

// Send one card. Refuses cards that came from Todoist (already there) and cards already sent
// (the card closes on success, so a second click would clone the task). Nothing is scheduled.
export async function sendCard(db, id, { acknowledge = false, fetcher = fetch, getToken = tokenFromVault } = {}) {
  if (!sendWarned()) {
    if (!acknowledge) return { needsWarning: true }
    acknowledgeSend()
  }
  if (inFlight.has(id)) throw Error('TODOIST_IN_FLIGHT')
  inFlight.add(id)
  try {
    const card = tasks(db, { days: 365 }).find((x) => x.id === id)
    if (!card) throw Error('TODOIST_NO_CARD')
    if (card.source === 'todoist') throw Error('TODOIST_OWN_CARD')
    // The scoped card list masks completion reasons whenever any source is switched off, so the
    // transfer marker is checked against the persisted state itself - an off source can't clone a task.
    const persisted = db.prepare('select status, reason from task_state where item_id = ?').get(id)
    if (persisted?.status === 'done' && persisted?.reason === 'Sent to Todoist') throw Error('TODOIST_ALREADY_SENT')
    const token = await getToken()
    if (!token) throw Error('TODOIST_NO_TOKEN')
    await createTask(token, payloadFor(card), { fetcher })
    markTask(db, id, 'done', { reason: 'Sent to Todoist' })
    return { ok: true }
  } finally { inFlight.delete(id) }
}
