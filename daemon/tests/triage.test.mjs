import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.VAHTI_DATA_DIR = mkdtempSync(join(tmpdir(), 'vahti-triage-'))
after(() => rmSync(process.env.VAHTI_DATA_DIR, { recursive: true, force: true }))
const { open, addItems, now } = await import('../lib/db.mjs')
const { markTask, tasks } = await import('../lib/tasks.mjs')

for (const status of ['dismissed', 'done']) {
  test(`${status} closes only the selected card, without learning or a Todoist send`, t => {
    const db = open(':memory:'); t.after(() => db.close())
    for (const id of ['chosen', 'same-thread', 'other-thread']) {
      addItems(db, [{ id, source: 'whatsapp', thread: id === 'other-thread' ? 'Other' : 'Nika', sender: 'Nika', fromMe: false, ts: now(), text: 'Please review the notes' }])
      db.prepare("insert into tags(item_id,is_task,summary,model,tagged_at,card,confirmed) values (?,1,?,'test',?,'todo',1)").run(id, `Review ${id}`, now())
    }
    const before = db.prepare('select * from tags order by item_id').all()
    markTask(db, 'chosen', status)
    assert.deepEqual(db.prepare('select * from tags order by item_id').all(), before)
    assert.deepEqual(db.prepare('select item_id,status,completion_origin from task_state').all().map(r => ({...r})), [{item_id:'chosen',status,completion_origin:'owner'}])
    assert.equal(tasks(db).find(c => c.id === 'chosen').state, status)
    assert.equal(tasks(db).find(c => c.id === 'same-thread').state, 'open')
    assert.equal(tasks(db).find(c => c.id === 'other-thread').state, 'open')
    assert.notEqual(db.prepare('select reason from task_state where item_id = ?').get('chosen').reason, 'Sent to Todoist')
    markTask(db, 'chosen', 'open')
    assert.equal(tasks(db).find(c => c.id === 'chosen').state, 'open')
  })
}
