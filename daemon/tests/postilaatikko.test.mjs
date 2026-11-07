import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
const dir = mkdtempSync(join(tmpdir(), 'vahti-posti-'))
process.env.VAHTI_DATA_DIR = dir
writeFileSync(join(dir, 'config.json'), JSON.stringify({ me: 'Sam', fullName: 'Sam', languages: ['English'], workRoots: [] }))
after(() => rmSync(dir, { recursive: true, force: true }))
const { open, now } = await import('../lib/db.mjs')
const { save, setSource } = await import('../lib/settings.mjs')
const { collect, storePath } = await import('../collectors/postilaatikko.mjs')
const { readScope, authorization } = await import('../lib/authorization.mjs')
const { authoredText, ownerCompletion } = await import('../lib/completion-evidence.mjs')
const { forget } = await import('../lib/privacy.mjs')
const path = join(dir, 'aerion.db'), cache = new DatabaseSync(path), at = now()
cache.exec(`create table accounts(id text, email text, enabled integer);
create table folders(id text, account_id text, folder_type text);
create table messages(id text,account_id text,folder_id text,message_id text,subject text,from_name text,from_email text,to_list text,cc_list text,date text,body_text text,body_fetched integer,snippet text,is_draft integer,is_deleted integer);
create table credentials(secret text); insert into credentials values('NEVER_COPY_SECRET');
insert into accounts values('work','sam@example.test',1),('off','disabled@example.test',0);
insert into folders values('in','work','inbox'),('sent','work','sent'),('draft','work','drafts'),('off-in','off','inbox');`)
const insert = cache.prepare('insert into messages values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
const date = new Date((at - 60) * 1000).toISOString()
const row = (id, folder, account = 'work', draft = 0, body = 'Can you send the sketch?', fetched = 1) => insert.run(id, account, folder, `<${id}@example.test>`, 'Sketch', 'Sam', 'sam@example.test', '[{"name":"Nika","email":"nika@example.test"}]', '[]', date, body, fetched, 'I sent the sketch to Nika.', draft, 0)
row('incoming','in');row('sent','sent','work',0,'I sent the sketch to Nika.');row('draft','draft','work',1);row('disabled','off-in','off');row('preview','sent','work',0,'',0)
cache.close()

test('cache path matches Postilaatikko upstream compatibility path', () => assert.equal(storePath('/fixture'), '/fixture/Library/Application Support/Aerion/aerion.db'))
test('opt-in read-only bounded cache import preserves owner, body and privacy provenance', t => {
  const db = open(':memory:'); t.after(() => db.close())
  assert.equal(collect(db, { path, at }), 0)
  save({ postilaatikkoCache: true })
  const original = new DatabaseSync(path, { readOnly: true }); const before = original.prepare('pragma data_version').get(); original.close()
  assert.equal(collect(db, { path, at }), 3)
  assert.equal(collect(db, { path, at }), 0)
  const rows = db.prepare('select * from items').all()
  assert.equal(rows.length, 3)
  assert.equal(rows.every(r => !JSON.stringify(r).includes('NEVER_COPY_SECRET')), true)
  const incoming = rows.find(r => JSON.parse(r.meta).messageId.includes('incoming'))
  const sent = rows.find(r => JSON.parse(r.meta).messageId === '<sent@example.test>')
  const preview = rows.find(r => JSON.parse(r.meta).messageId.includes('preview'))
  assert.equal(incoming.from_me, 0); assert.equal(sent.from_me, 1)
  assert.equal(authoredText(preview), '')
  assert.equal(ownerCompletion(sent, { summary: 'Send sketch to Nika' }), true)
  assert.equal(ownerCompletion(preview, { summary: 'Send sketch to Nika' }), false)
  assert.equal(readScope(db, authorization(['solmu'])).prepare('select * from items').all().length, 0)
  assert.equal(readScope(db, authorization(['mail'])).prepare('select * from items').all().length, 3)
  setSource('postilaatikko', false)
  assert.equal(collect(db, { path, at }), 0)
  assert.equal(readScope(db, authorization(null)).prepare('select * from items').all().length, 0)
  setSource('postilaatikko', true);setSource('mail', false)
  assert.equal(collect(db, { path, at }), 0)
  setSource('mail', true)
  forget(db, { id: sent.id })
  assert.equal(collect(db, { path, at }), 0)
  const check = new DatabaseSync(path, { readOnly: true }); assert.equal(check.prepare('select count(*) n from messages').get().n, 5);assert.deepEqual(check.prepare('pragma data_version').get(), before);check.close()
})
test('unsupported schema fails closed, missing store is quiet, pages stay bounded', t => {
  const db = open(':memory:'); t.after(() => db.close())
  assert.equal(collect(db, { path: join(dir,'absent'), at }), 0)
  const wrong = join(dir,'wrong.db'), c = new DatabaseSync(wrong);c.exec('create table messages(id)');c.close()
  assert.throws(() => collect(db, { path: wrong, at }), /POSTILAATIKKO_CACHE_UNAVAILABLE/)
  assert.equal(collect(db, { path, at, limit: 1 }), 1)
})
