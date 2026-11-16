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
import { markTask, tasks } from './tasks.mjs'

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

// The task one click creates: the card's title, a short note on where it came from, and the due
// date Vahti inferred for it (a clock time rides along when the card carries one). Nothing else:
// no project, no label, no priority, no reminder - Inbox triage keeps Todoist as the backend.
export function payloadFor(card, tz = config.timezone) {
  const content = String(card.summary || card.text || '').replace(/\s+/g, ' ').trim().slice(0, 500)
  if (!content) throw Error('TODOIST_EMPTY_CARD')
  const origin = [card.from_me ? 'you' : card.sender, card.thread && card.thread !== card.sender ? `in ${card.thread}` : null, card.source ? `via ${card.source}` : null]
    .filter(Boolean).join(' ')
  const body = { content, description: [`Vahti card from ${origin || 'your vault'}.`, typeof card.url === 'string' && card.url.startsWith('https://') ? card.url : null].filter(Boolean).join('\n').slice(0, 2000) }
  const due = /^\d{4}-\d{2}-\d{2}$/.test(card.due || '') ? card.due : null
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(card.when_words || '') ? card.when_words : null
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

// Send one card. Refuses cards that came from Todoist (already there) and cards already sent
// (the card closes on success, so a second click would clone the task). Nothing is scheduled.
export async function sendCard(db, id, { acknowledge = false, fetcher = fetch, getToken = tokenFromVault } = {}) {
  if (!sendWarned()) {
    if (!acknowledge) return { needsWarning: true }
    acknowledgeSend()
  }
  const card = tasks(db, { days: 365 }).find((x) => x.id === id)
  if (!card) throw Error('TODOIST_NO_CARD')
  if (card.source === 'todoist') throw Error('TODOIST_OWN_CARD')
  if (card.state === 'done' && card.reason === 'Sent to Todoist') throw Error('TODOIST_ALREADY_SENT')
  const token = await getToken()
  if (!token) throw Error('TODOIST_NO_TOKEN')
  await createTask(token, payloadFor(card), { fetcher })
  markTask(db, id, 'done', { reason: 'Sent to Todoist' })
  return { ok: true }
}
