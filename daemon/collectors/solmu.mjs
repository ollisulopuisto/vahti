import { createHash } from 'node:crypto'
import { config } from '../lib/config.mjs'
import { connection, readerGet } from '../lib/solmu.mjs'
import { addItems, cursor, now, setCursor } from '../lib/db.mjs'
export const source = 'solmu'
const identity = (value) => typeof value === 'string' && value.length > 0 && value.length <= 4096 && !['.', '..'].includes(value)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
export function messageItem(chat, message, origin, at = now()) {
  if (!identity(chat.id) || !identity(chat.accountID) || !identity(message.id) ||
      message.chatID && message.chatID !== chat.id || message.accountID && message.accountID !== chat.accountID ||
      message.isHidden === true || message.isDeleted === true ||
      message.type && message.type !== 'TEXT' || typeof message.text !== 'string' || !message.text.trim()) return null
  const ts = Date.parse(message.timestamp) / 1000
  if (!Number.isFinite(ts) || ts > at + 300 || ts < at - config.backfillDays * 86400 || typeof message.isSender !== 'boolean') return null
  // Never infer owner authorship from a display name. Unidentified incoming senders are not attributed.
  const sender = message.isSender ? config.me : message.senderName || message.senderID
  if (!identity(sender)) return null
  const key = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex')
  return { id: `solmu:${key(origin, chat.accountID, chat.id, message.id)}`, source,
    thread: `solmu:${key(origin, chat.accountID, chat.id)}`, sender, fromMe: message.isSender,
    ts: Math.floor(ts), text: message.text.slice(0, 16000),
    meta: { app: 'me.paolino.fastsapp', chatTitle: String(chat.title || '').slice(0, 500), group: chat.type !== 'single',
      accountID: chat.accountID, chatID: chat.id, messageID: message.id, network: String(chat.network || '').slice(0, 100) } }
}
export async function collect(db, { get = readerGet, at = now(), force = false } = {}) {
  const selected = connection()
  if (!selected) return 0
  if (!force && at - Number(cursor(db, 'solmu:last', 0)) < 300) return 0
  const items = []
  // One newest page only: at most 101 requests per five minutes, below the
  // reader's 120/minute limit. Coverage limits are documented, never hidden.
  const chats = await get(selected, '/v1/chats?limit=100')
  for (const chat of chats.items) {
    if (!same(connection(), selected)) return 0
    if (!identity(chat.id) || !identity(chat.accountID) || config.blockedChats.includes(chat.title)) continue
    const messages = await get(selected, `/v1/chats/${encodeURIComponent(chat.id)}/messages?limit=100`)
    for (const message of messages.items) { const item = messageItem(chat, message, selected.url, at); if (item) items.push(item) }
  }
  // Revoking the source while a request is in flight prevents storage of its result.
  if (!same(connection(), selected)) return 0
  const added = addItems(db, items)
  setCursor(db, 'solmu:last', at)
  return added
}
