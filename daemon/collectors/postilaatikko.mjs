// Read only the existing local cache. No provider calls, body fetch, read markers,
// attachments, credential tables, drafts, database copies or migrations.
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { config, home } from '../lib/config.mjs'
import { addItems, cursor, setCursor, now } from '../lib/db.mjs'
import { isOff } from '../lib/settings.mjs'
import { addresses, conversation } from './mail.mjs'
import { newlyWritten } from '../lib/completion-evidence.mjs'
export const source = 'postilaatikko'
export const storePath = (base = home) => resolve(base, 'Library/Application Support/Aerion/aerion.db')
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export function collect(db, { path = storePath(), at = now(), limit = 200 } = {}) {
  if (!config.postilaatikkoCache || isOff(source) || isOff('mail') || !existsSync(path)) return 0
  limit = Math.max(1, Math.min(200, Math.trunc(limit) || 200))
  const key = `postilaatikko:${hash(path)}`
  let cache
  try {
    cache = new DatabaseSync(path, { readOnly: true })
    cache.exec('pragma query_only = on; pragma busy_timeout = 1000')
    // Bounded keyset sweep. Restart after reaching the end so previously-unfetched
    // cached bodies get a chance later. Immutable copies preserve existing evidence.
    const before = Number(cursor(db, key, 0)) || Number.MAX_SAFE_INTEGER
    const rows = cache.prepare(`select m.rowid pk, m.id, m.account_id, m.message_id,
      substr(m.subject,1,500) subject, substr(m.from_name,1,320) from_name,
      substr(m.from_email,1,320) from_email, substr(m.to_list,1,16000) to_list,
      substr(m.cc_list,1,16000) cc_list, m.date,
      case when m.body_fetched = 1 then substr(m.body_text,1,16000) else '' end body_text,
      m.body_fetched, substr(m.snippet,1,2000) snippet, f.folder_type,
      substr(a.email,1,320) account_email
      from messages m join folders f on f.id=m.folder_id and f.account_id=m.account_id
      join accounts a on a.id=m.account_id
      where m.rowid < ? and m.is_draft=0 and m.is_deleted=0 and a.enabled=1
      and f.folder_type not in ('drafts','trash','spam','junk')
      and unixepoch(m.date) >= ? and unixepoch(m.date) <= ?
      order by m.rowid desc limit ?`).all(before, at - config.backfillDays * 86400, at + 300, limit)
    const items = []
    for (const row of rows) {
      const fromMe = row.folder_type === 'sent'
      const from = addresses([{ email: row.from_email, name: row.from_name }])
      const to = addresses(row.to_list), cc = addresses(row.cc_list)
      if (!from[0]?.email) continue
      // Automated mail and receipts are not personal obligation evidence.
      if (!fromMe && /(?:no[._-]?reply|do[._-]?not[._-]?reply|mailer[._-]?daemon|newsletter|notifications?)[._@-]|unsubscribe|newsletter/i.test(`${row.from_email} ${row.subject} ${row.snippet}`)) continue
      const other = fromMe ? to.find(p => p.email !== row.account_email?.toLowerCase()) : from[0]
      if (!other) continue
      const thread = conversation(row.subject, other.name || other.email)
      if (config.blockedChats.includes(thread)) continue
      const body = row.body_fetched === 1 && row.body_text ? newlyWritten(row.body_text).slice(0, 2000) : ''
      const preview = body || newlyWritten(row.snippet || '').slice(0, 2000)
      // Headers alone are discoverable, but previews must not authorize completion.
      items.push({ id: `mail:${hash([path, row.account_id, row.id])}`, source: 'mail', thread,
        sender: fromMe ? config.me : from[0].name || from[0].email, fromMe,
        ts: Math.floor(Date.parse(row.date.endsWith('Z') || /[+-]\d\d:\d\d$/.test(row.date) ? row.date : row.date.replace(' ', 'T') + 'Z') / 1000),
        text: [row.subject, preview].filter(Boolean).join('\n'),
        meta: { client: source, app: 'com.wails.postilaatikko', account: row.account_id, copyKey: `${row.account_id}:${row.id}:${body ? 'body' : 'preview'}`,
          messageId: row.message_id, subject: row.subject, body: preview, bodyKind: body ? 'plain' : 'preview',
          contentComplete: !!body, ownerSent: fromMe, from, to, cc, group: to.length + cc.length > 1 } })
    }
    const added = addItems(db, items)
    setCursor(db, key, rows.length === limit ? rows.at(-1).pk : 0)
    return added
  } catch { throw Error('POSTILAATIKKO_CACHE_UNAVAILABLE') }
  finally { cache?.close() }
}
