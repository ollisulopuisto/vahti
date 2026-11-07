// A dedicated, revocable solmu-reader credential, never Solmu's Beeper write token.
import { constants, openSync, fstatSync, readFileSync, closeSync, existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { config, configPath } from './config.mjs'
import { save } from './settings.mjs'

export function readerURL(value = 'http://127.0.0.1:23377') {
  const url = new URL(value)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('SOLMU_LOCAL_URL_REQUIRED')
  return url.origin
}
export function connection() {
  const saved = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : config
  if (!saved.solmu?.enabled || saved.off?.includes('solmu')) return null
  if (!isAbsolute(saved.solmu.tokenFile || '')) throw Error('SOLMU_TOKEN_FILE_REQUIRED')
  return { url: readerURL(saved.solmu.url), tokenFile: saved.solmu.tokenFile }
}
export function readerToken(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > 4096) throw Error('SOLMU_PRIVATE_TOKEN_REQUIRED')
    const token = readFileSync(fd, 'utf8').trim()
    if (!/^zfr_[a-f0-9]{64}$/.test(token)) throw Error('SOLMU_TOKEN_INVALID')
    return token
  } finally { closeSync(fd) }
}
export function connectSolmu({ url, tokenFile }) {
  url = readerURL(url)
  if (!isAbsolute(tokenFile || '')) throw Error('SOLMU_TOKEN_FILE_REQUIRED')
  readerToken(tokenFile) // Validate locally; no request or credential printed.
  save({ solmu: { enabled: true, url, tokenFile } })
}
export async function readerGet(selected, path, { fetcher = fetch } = {}) {
  // Callers cannot supply arbitrary routes, requests, or bearer destinations.
  if (path.includes('/../') || path.includes('/./') || !/^\/v1\/chats(?:\?limit=100|\/[^/]+\/messages\?limit=100)$/.test(path)) throw Error('SOLMU_ROUTE_REFUSED')
  const response = await fetcher(readerURL(selected.url) + path, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { Authorization: `Bearer ${readerToken(selected.tokenFile)}`, Accept: 'application/json' },
  })
  if (!response.ok) { await response.body?.cancel(); throw Error('SOLMU_READ_FAILED') }
  const reader = response.body.getReader(); const chunks = []; let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break
      bytes += value.byteLength
      if (bytes > 4 * 1024 * 1024) throw Error('SOLMU_RESPONSE_TOO_LARGE')
      chunks.push(value)
    }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!Array.isArray(result.items) || result.items.length > 100) throw Error('SOLMU_RESPONSE_INVALID')
    return result
  } finally { await reader.cancel() }
}
