// Todoist tasks, read with the owner's own API token. The token lives in a private file in Vahti's
// data directory (itself 0700), written by the app from Setup - never in config.json, logs or chat.
import { constants, openSync, fstatSync, readFileSync, closeSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { config, configPath, dataDir } from './config.mjs'
import { save } from './settings.mjs'

export const tokenPath = resolve(dataDir, 'todoist-token')
// Todoist API tokens are 40 lowercase hex characters.
const TOKEN = /^[a-f0-9]{40}$/

export function connection() {
  const saved = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : config
  if (!saved.todoist?.enabled || saved.off?.includes('todoist')) return null
  return { tokenFile: tokenPath }
}
export const todoistConnected = () => connection() !== null

export function readerToken(path = tokenPath) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > 4096) throw Error('TODOIST_PRIVATE_TOKEN_REQUIRED')
    const token = readFileSync(fd, 'utf8').trim()
    if (!TOKEN.test(token)) throw Error('TODOIST_TOKEN_INVALID')
    return token
  } finally { closeSync(fd) }
}

// Connect from the app's Setup with the token the owner pasted there. Validated locally, written
// owner-only, never echoed back or printed.
export function connectTodoist({ token }) {
  token = String(token || '').trim()
  if (!TOKEN.test(token)) throw Error('TODOIST_TOKEN_INVALID')
  writeFileSync(tokenPath, `${token}\n`, { mode: 0o600 })
  save({ todoist: { enabled: true } })
}
export function disconnectTodoist() {
  rmSync(tokenPath, { force: true })
  save({ todoist: { enabled: false } })
}

export async function todoistGet(selected, path, { fetcher = fetch } = {}) {
  // Callers cannot supply arbitrary routes, requests, or bearer destinations.
  if (!/^\/rest\/v2\/(tasks|projects)$/.test(path)) throw Error('TODOIST_ROUTE_REFUSED')
  const response = await fetcher(`https://api.todoist.com${path}`, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${readerToken(selected.tokenFile)}`, Accept: 'application/json' },
  })
  if (!response.ok) { await response.body?.cancel(); throw Error(response.status === 401 || response.status === 403 ? 'TODOIST_TOKEN_REFUSED' : 'TODOIST_READ_FAILED') }
  const reader = response.body.getReader(); const chunks = []; let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break
      bytes += value.byteLength
      if (bytes > 4 * 1024 * 1024) throw Error('TODOIST_RESPONSE_TOO_LARGE')
      chunks.push(value)
    }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!Array.isArray(result) || result.length > 2000) throw Error('TODOIST_RESPONSE_INVALID')
    return result
  } finally { await reader.cancel() }
}
