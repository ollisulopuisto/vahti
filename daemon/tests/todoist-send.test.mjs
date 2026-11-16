import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'vahti-todoist-send-'))
process.env.VAHTI_DATA_DIR = dir
after(() => rmSync(dir, { recursive: true, force: true }))
const { open, addItems, now } = await import('../lib/db.mjs')
const { payloadFor, createTask, sendCard, sendWarned, acknowledgeSend, TASKS_URL } = await import('../lib/todoist-send.mjs')
const { tasks } = await import('../lib/tasks.mjs')

const t0 = now()
function fixture(t) {
  const db = open(':memory:'); t.after(() => db.close())
  return db
}
// A plain open card, confirmed so the second-opinion filter keeps it on the list.
function card(db, id, { source = 'whatsapp', thread = 'Nika', sender = 'Nika', summary = `Finish ${id}`, due = '', time = null, url = null } = {}) {
  addItems(db, [{ id, source, thread, sender, fromMe: false, ts: t0 - 3600, text: summary, url }])
  db.prepare("insert into tags(item_id,is_task,due,when_words,summary,model,tagged_at,card,confirmed) values (?,1,?,?,?,'test',?,'todo',1)")
    .run(id, due, time, summary, t0)
}
const token = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
const okResponse = () => Promise.resolve(new Response('{"id":"123"}', { status: 200, headers: { 'content-type': 'application/json' } }))

test('the payload is the card title, its origin, and only the due Vahti inferred', () => {
  const base = { summary: 'Reply to Nika about the keys', text: 'can you bring the keys?', source: 'whatsapp', thread: 'Nika', sender: 'Nika', from_me: 0, url: null, due: '', when_words: '' }
  assert.deepEqual(payloadFor(base, 'Europe/Helsinki'), {
    content: 'Reply to Nika about the keys',
    description: 'Vahti card from Nika via whatsapp.',
  })
  assert.equal(payloadFor({ ...base, due: '2026-12-01' }, 'Europe/Helsinki').due_date, '2026-12-01')
  // A clock time rides along as an instant: Helsinki is two hours ahead of UTC in December.
  assert.equal(payloadFor({ ...base, due: '2026-12-01', when_words: '09:30' }, 'Europe/Helsinki').due_datetime, '2026-12-01T07:30:00Z')
  assert.equal(payloadFor({ ...base, due: '2026-07-01', when_words: '09:30' }, 'Europe/Helsinki').due_datetime, '2026-07-01T06:30:00Z')
  // Model words are not a time, a malformed date is no date: neither is invented.
  const words = payloadFor({ ...base, due: 'next Friday', when_words: 'tomorrow evening' }, 'Europe/Helsinki')
  assert.equal(words.due_date, undefined); assert.equal(words.due_datetime, undefined)
  // The quoted message never becomes the task; a bare summary is trimmed and capped.
  assert.equal(payloadFor({ ...base, summary: '', text: '  bring the keys  ' }, 'Europe/Helsinki').content, 'bring the keys')
  assert.equal(payloadFor({ ...base, summary: `  ${'x'.repeat(600)}  ` }, 'Europe/Helsinki').content.length, 500)
  assert.equal(payloadFor({ ...base, url: 'https://example.com/thread' }, 'Europe/Helsinki').description, 'Vahti card from Nika via whatsapp.\nhttps://example.com/thread')
  assert.equal(payloadFor({ ...base, url: 'javascript:alert(1)' }, 'Europe/Helsinki').description.includes('javascript'), false)
  assert.throws(() => payloadFor({ ...base, summary: ' ', text: '' }, 'Europe/Helsinki'), /TODOIST_EMPTY_CARD/)
})

test('one bounded POST to api.todoist.com, token only in the Authorization header', async () => {
  const seen = []
  const fetcher = (url, init) => { seen.push({ url, init }); return okResponse() }
  await createTask(token, { content: 'Fix the fence', due_date: '2026-12-01' }, { fetcher })
  assert.equal(seen.length, 1)
  assert.equal(seen[0].url, TASKS_URL)
  assert.equal(seen[0].url, 'https://api.todoist.com/api/v1/tasks')
  assert.equal(seen[0].init.method, 'POST')
  assert.equal(seen[0].init.redirect, 'error')
  assert.equal(seen[0].init.headers.Authorization, `Bearer ${token}`)
  assert.deepEqual(JSON.parse(seen[0].init.body), { content: 'Fix the fence', due_date: '2026-12-01' })
  assert.equal(seen[0].url.includes(token), false)
})

test('API answers map to stable errors and the token never leaks into them', async () => {
  const answer = (status) => () => Promise.resolve(new Response('no', { status }))
  await assert.rejects(() => createTask(token, { content: 'x' }, { fetcher: answer(401) }), /^Error: TODOIST_TOKEN_REFUSED$/)
  await assert.rejects(() => createTask(token, { content: 'x' }, { fetcher: answer(403) }), /^Error: TODOIST_TOKEN_REFUSED$/)
  await assert.rejects(() => createTask(token, { content: 'x' }, { fetcher: answer(400) }), /^Error: TODOIST_REFUSED$/)
  await assert.rejects(() => createTask(token, { content: 'x' }, { fetcher: answer(500) }), /^Error: TODOIST_UNREACHABLE$/)
  await assert.rejects(() => createTask(token, { content: 'x' }, { fetcher: () => Promise.reject(Error(`down with ${token}`)) }), /^Error: TODOIST_UNREACHABLE$/)
})

test('the first send warns once; acknowledging sends and never asks again', async t => {
  const db = fixture(t)
  card(db, 'first')
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ me: 'Sam', fullName: 'Sam', languages: ['English'], workRoots: [] }))
  let calls = 0
  const fetcher = () => { calls++; return okResponse() }
  const getToken = () => Promise.resolve(token)
  // No acknowledgement, not warned yet: nothing goes out.
  assert.deepEqual(await sendCard(db, 'first', { fetcher, getToken }), { needsWarning: true })
  assert.equal(calls, 0)
  assert.equal(sendWarned(), false)
  assert.equal(tasks(db, { days: 365 }).find((x) => x.id === 'first').state, 'open')
  // The app's confirm acknowledges: the task goes out and the card closes with the reason.
  assert.deepEqual(await sendCard(db, 'first', { acknowledge: true, fetcher, getToken }), { ok: true })
  assert.equal(calls, 1)
  assert.equal(sendWarned(), true)
  assert.equal(JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')).todoist.writeWarned, true)
  const closed = tasks(db, { days: 365 }).find((x) => x.id === 'first')
  assert.equal(closed.state, 'done')
  assert.equal(closed.reason, 'Sent to Todoist')
  assert.equal(closed.completion_origin, 'owner')
  // Warned is sticky: a later card sends without acknowledge.
  card(db, 'second')
  assert.deepEqual(await sendCard(db, 'second', { fetcher, getToken }), { ok: true })
  assert.equal(calls, 2)
  // A sent card is not sent twice.
  await assert.rejects(() => sendCard(db, 'first', { fetcher, getToken }), /TODOIST_ALREADY_SENT/)
  assert.equal(calls, 2)
})

test('what cannot be sent is refused before any network call', async t => {
  const db = fixture(t)
  acknowledgeSend()
  let calls = 0
  const fetcher = () => { calls++; return okResponse() }
  await assert.rejects(() => sendCard(db, 'missing', { fetcher, getToken: () => Promise.resolve(token) }), /TODOIST_NO_CARD/)
  card(db, 'own', { source: 'todoist', thread: 'todoist:Feed', sender: 'Sam' })
  await assert.rejects(() => sendCard(db, 'own', { fetcher, getToken: () => Promise.resolve(token) }), /TODOIST_OWN_CARD/)
  card(db, 'notoken')
  await assert.rejects(() => sendCard(db, 'notoken', { fetcher, getToken: () => Promise.resolve('') }), /TODOIST_NO_TOKEN/)
  await assert.rejects(() => sendCard(db, 'notoken', { fetcher, getToken: () => Promise.reject(Error('GMAIL_KEYCHAIN_UNAVAILABLE')) }), /GMAIL_KEYCHAIN_UNAVAILABLE/)
  assert.equal(calls, 0)
  assert.equal(tasks(db, { days: 365 }).find((x) => x.id === 'notoken').state, 'open')
})

test('send honors the due the card already carries', async t => {
  const db = fixture(t)
  acknowledgeSend()
  card(db, 'dated', { due: '2026-12-24', summary: 'Buy the presents' })
  const seen = []
  await sendCard(db, 'dated', { fetcher: (url, init) => { seen.push(init); return okResponse() }, getToken: () => Promise.resolve(token) })
  const body = JSON.parse(seen[0].body)
  assert.equal(body.content, 'Buy the presents')
  assert.equal(body.due_date, '2026-12-24')
  assert.equal(body.due_datetime, undefined)
  // No project, label, priority or reminder: Inbox only, Todoist owns reminders.
  for (const key of ['project_id', 'labels', 'priority', 'reminder']) assert.equal(body[key], undefined)
})

test('the native vault admits only the todoist-token read for the new path', async () => {
  const { nativeVault } = await import('../lib/native-vault.mjs')
  const { PassThrough, Writable } = await import('node:stream')
  const frames = []
  const input = new PassThrough()
  const output = new Writable({ write(chunk, _, done) { frames.push(JSON.parse(String(chunk).slice(11))); done() } })
  const call = nativeVault(input, output)
  const ask = call('todoist-token')
  input.write(JSON.stringify({ id: frames[0].id, ok: true, value: { token: 'fixture' } }) + '\n')
  assert.deepEqual(await ask, { token: 'fixture' })
  await assert.rejects(call('todoist-write'), /OPERATION_REFUSED/)
  await assert.rejects(call('todoist-get'), /OPERATION_REFUSED/)
})

test('source guards: Keychain-only token storage and one fixed API host', () => {
  const keychain = readFileSync('../app/TodoistKeychain.swift', 'utf8')
  assert.match(keychain, /SecAccessCreate\("Vahti Todoist" as CFString, \[app\] as CFArray/)
  assert.match(keychain, /kSecAttrAccess as String: access/)
  assert.match(keychain, /SecKeychainSetUserInteractionAllowed\(false\)/)
  assert.match(keychain, /to\.sulopuis\.vahti\.todoist\./)
  assert.doesNotMatch(keychain, /add-generic-password|\/usr\/bin\/security|writeFile|UserDefaults/)
  const send = readFileSync('lib/todoist-send.mjs', 'utf8')
  assert.deepEqual([...send.matchAll(/https:\/\/[a-z0-9.-]+/g)].map((m) => m[0]), ['https://api.todoist.com'])
  const vault = readFileSync('../app/GmailVault.swift', 'utf8')
  assert.match(vault, /"todoist-token"/)
  const server = readFileSync('lib/server.mjs', 'utf8')
  assert.match(server, /\/api\/todoist\/send/)
  // The daemon never receives the token over HTTP: no route body field carries it.
  assert.doesNotMatch(server, /input\.token/)
})
