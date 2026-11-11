// Todoist tasks, read from the owner's own iCal export feed (Todoist Settings, Integrations,
// Calendar feed). The feed URL carries its own secret token: it lives in a private file in Vahti's
// data directory (itself 0700), written by the app from Setup - never in config.json, logs or chat.
import { constants, openSync, fstatSync, readFileSync, closeSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { config, configPath, dataDir } from './config.mjs'
import { save } from './settings.mjs'

export const feedPath = resolve(dataDir, 'todoist-feed')
// The feed is fetched over https only; the URL itself is the credential.
const FEED_URL = /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/\S*)?$/i

export function connection() {
  const saved = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : config
  if (!saved.todoist?.enabled || saved.off?.includes('todoist')) return null
  return { feedFile: feedPath }
}
export const todoistConnected = () => connection() !== null

export function readerFeed(path = feedPath) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > 4096) throw Error('TODOIST_PRIVATE_FEED_REQUIRED')
    const url = readFileSync(fd, 'utf8').trim()
    if (!FEED_URL.test(url)) throw Error('TODOIST_FEED_INVALID')
    return url
  } finally { closeSync(fd) }
}

// The feed, read loosely: VEVENT blocks, folded lines joined, fields Vahti uses unescaped by the caller.
export function parseFeed(ics) {
  if (typeof ics !== 'string' || ics.length > 10_000_000 || !ics.includes('BEGIN:VCALENDAR')) throw Error('TODOIST_FEED_INVALID')
  const events = []
  let inside = false, fields = null, last = null
  for (const line of ics.split(/\r\n|\r|\n/)) {
    if (line.startsWith(' ') || line.startsWith('\t')) { if (last) fields[last] += line.slice(1); continue }
    if (line === 'BEGIN:VEVENT') { inside = true; fields = {}; last = null; continue }
    if (line === 'END:VEVENT') { if (inside) events.push(fields); inside = false; last = null; continue }
    if (!inside) continue
    const match = /^([A-Z0-9-]+)(;[^:]*)?:(.*)$/.exec(line)
    if (!match) { last = null; continue }
    fields[match[1]] = match[3]
    last = match[1]
  }
  return events
}

// Connect from the app's Setup with the feed URL the owner pasted there. The shape is validated
// locally, then one bounded fetch proves the feed answers with a calendar before anything is saved:
// a URL that only looks right must never show as connected. Written owner-only, never echoed or printed.
export async function connectTodoist({ url, fetcher = fetch }) {
  url = String(url || '').trim()
  if (!FEED_URL.test(url)) throw Error('TODOIST_FEED_INVALID')
  let response
  try {
    response = await fetcher(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Accept: 'text/calendar' } })
  } catch { throw Error('TODOIST_FEED_UNREACHABLE') }
  if (!response.ok) { await response.body?.cancel(); throw Error(response.status === 401 || response.status === 403 ? 'TODOIST_FEED_INVALID' : 'TODOIST_FEED_UNREACHABLE') }
  const ics = await response.text()
  if (parseFeed(ics).length === 0) throw Error('TODOIST_FEED_INVALID')
  writeFileSync(feedPath, `${url}\n`, { mode: 0o600 })
  save({ todoist: { enabled: true } })
}
export function disconnectTodoist() {
  rmSync(feedPath, { force: true })
  save({ todoist: { enabled: false } })
}

// The current feed contents, one bounded read. The URL comes only from the owner's private file.
export async function fetchFeed(selected, { fetcher = fetch } = {}) {
  let response
  try {
    response = await fetcher(readerFeed(selected.feedFile), {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'text/calendar' },
    })
  } catch { throw Error('TODOIST_FEED_UNREACHABLE') }
  if (!response.ok) { await response.body?.cancel(); throw Error(response.status === 401 || response.status === 403 ? 'TODOIST_FEED_INVALID' : 'TODOIST_FEED_UNREACHABLE') }
  return response.text()
}
