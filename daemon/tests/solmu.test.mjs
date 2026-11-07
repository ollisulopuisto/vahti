import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, chmodSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
const dir = mkdtempSync(join(tmpdir(), 'vahti-solmu-'))
process.env.VAHTI_DATA_DIR = dir
writeFileSync(join(dir, 'config.json'), JSON.stringify({ me: 'Sam', fullName: 'Sam', languages: ['English'], workRoots: [] }))
after(() => rmSync(dir, { recursive: true, force: true }))
const { open, now } = await import('../lib/db.mjs')
const { save, setSource } = await import('../lib/settings.mjs')
const { collect, messageItem } = await import('../collectors/solmu.mjs')
const { readerURL, readerGet, readerToken, connectSolmu } = await import('../lib/solmu.mjs')
const { authorization, readScope } = await import('../lib/authorization.mjs')
const { forget } = await import('../lib/privacy.mjs')
const { ownerAuthored, evidenceLine } = await import('../lib/evidence-trust.mjs')
const { contextForTag, burstOf } = await import('../lib/tagger.mjs')
const { SOURCES } = await import('../lib/meaning.mjs')
const { PLAN_SOURCES } = await import('../lib/plans.mjs')
const tokenFile = join(dir, 'reader-token')
writeFileSync(tokenFile, 'zfr_' + 'a'.repeat(64), { mode: 0o600 })
const at = now(), chat = { id: 'chat/a', accountID: 'work', title: 'Garden', type: 'single', network: 'Signal' }
const incoming = { id: 'm1', chatID: chat.id, accountID: 'work', senderName: 'Sam', senderID: 'other', isSender: false, timestamp: new Date((at - 60) * 1000).toISOString(), text: 'Can you bring the sketch?', type: 'TEXT' }
const outgoing = { ...incoming, id: 'm2', isSender: true, timestamp: new Date((at - 50) * 1000).toISOString(), text: 'Yes, I will bring it.' }

test('loopback destination and dedicated private token are enforced', () => {
  for (const url of ['https://127.0.0.1:23377', 'http://localhost:23377', 'http://192.168.1.1', 'http://evil.test', 'http://a:b@127.0.0.1', 'http://127.0.0.1/path', 'http://127.0.0.1/#x']) assert.throws(() => readerURL(url))
  assert.equal(readerURL(), 'http://127.0.0.1:23377')
  chmodSync(tokenFile, 0o644); assert.throws(() => readerToken(tokenFile)); chmodSync(tokenFile, 0o600)
  symlinkSync(tokenFile, join(dir, 'link')); assert.throws(() => readerToken(join(dir, 'link')))
  const wrong = join(dir, 'beeper-token'); writeFileSync(wrong, 'not-a-dedicated-reader-token'.repeat(3), { mode: 0o600 }); assert.throws(() => readerToken(wrong))
})
test('normalization keeps authorship, account isolation, timestamps and group provenance', () => {
  const item = messageItem(chat, incoming, 'http://127.0.0.1:23377', at)
  assert.equal(ownerAuthored(item), false); assert.equal(item.sender, 'Sam')
  assert.match(evidenceLine(item), /authorship=other/)
  assert.equal(item.meta.group, false)
  assert.equal(ownerAuthored(messageItem(chat, outgoing, 'local', at)), true)
  assert.notEqual(item.id, messageItem({ ...chat, accountID: 'personal' }, { ...incoming, accountID: 'personal' }, 'http://127.0.0.1:23377', at).id)
  for (const patch of [{ isSender: undefined }, { chatID: 'foreign' }, { accountID: 'foreign' }, { isDeleted: true }, { isHidden: true }, { type: 'REACTION' }, { timestamp: 'bad' }, { timestamp: new Date((at + 10000) * 1000).toISOString() }]) assert.equal(messageItem(chat, { ...incoming, ...patch }, 'local', at), null)
  assert.equal(messageItem({ ...chat, type: 'group' }, incoming, 'local', at).meta.group, true)
})
test('opt-in collector reads only allowed GETs, deduplicates, obeys privacy, forget and AI scopes', async t => {
  const db = open(':memory:'); t.after(() => db.close())
  save({ solmu: null }); let calls = 0
  assert.equal(await collect(db, { get: () => { calls++; } }), 0); assert.equal(calls, 0)
  connectSolmu({ tokenFile })
  const get = async (_, path) => { calls++; return { items: path === '/v1/chats?limit=100' ? [chat] : [incoming, outgoing] } }
  assert.equal(await collect(db, { get, at, force: true }), 2)
  assert.equal(await collect(db, { get, at, force: true }), 0)
  assert.equal(readScope(db, authorization(['mail'])).prepare('select * from items').all().length, 0)
  assert.equal(readScope(db, authorization(['solmu'])).prepare('select * from items').all().length, 2)
  const rows = db.prepare('select * from items order by ts').all()
  assert.equal(rows[0].from_me, 0); assert.equal(rows[1].from_me, 1)
  assert.equal(burstOf(db, rows[1]).start.source, 'solmu')
  assert.equal(SOURCES.includes('solmu'), true); assert.equal(PLAN_SOURCES.includes('solmu'), true)
  setSource('solmu', false)
  assert.equal(readScope(db, authorization(null)).prepare('select * from items').all().length, 0)
  const before = calls; assert.equal(await collect(db, { get, at, force: true }), 0); assert.equal(calls, before)
  setSource('solmu', true)
  forget(db, { source: 'solmu', thread: rows[0].thread })
  assert.equal(await collect(db, { get, at, force: true }), 0)
})
test('revocation in flight or a failed request stores no partial messages', async t => {
  const db = open(':memory:'); t.after(() => db.close()); connectSolmu({ tokenFile }); setSource('solmu', true)
  const get = async (_, path) => { if (path === '/v1/chats?limit=100') return { items: [chat] }; setSource('solmu', false); return { items: [incoming] } }
  assert.equal(await collect(db, { get, force: true, at }), 0)
  assert.equal(db.prepare('select count(*) n from items').get().n, 0)
  setSource('solmu', true)
  await assert.rejects(collect(db, { get: async () => { throw Error('failed') }, force: true, at }))
  assert.equal(db.prepare('select count(*) n from items').get().n, 0)
})
test('real synthetic HTTP transport refuses redirects, arbitrary routes and oversized replies', async t => {
  let mode = 'ok', calls = 0
  const server = createServer((req, res) => {
    calls++; assert.equal(req.method, 'GET'); assert.equal(req.headers.authorization, 'Bearer zfr_' + 'a'.repeat(64))
    if (mode === 'redirect') { res.writeHead(302, { location: '/leak' }); res.end(); return }
    res.end(mode === 'large' ? 'x'.repeat(4 * 1024 * 1024 + 1) : mode === 'bad' ? '{"items":null}' : JSON.stringify({ items: [chat] }))
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => server.close())
  const selected = { tokenFile, url: `http://127.0.0.1:${server.address().port}` }
  assert.equal((await readerGet(selected, '/v1/chats?limit=100')).items.length, 1)
  for (const path of ['/v1/send', '/v1/chats?limit=100&focus=true', '//evil.test/v1/chats']) await assert.rejects(readerGet(selected, path))
  mode = 'redirect'; const before = calls; await assert.rejects(readerGet(selected, '/v1/chats?limit=100')); assert.equal(calls, before + 1)
  mode = 'large'; await assert.rejects(readerGet(selected, '/v1/chats?limit=100'))
  mode = 'bad'; await assert.rejects(readerGet(selected, '/v1/chats?limit=100'))
})
