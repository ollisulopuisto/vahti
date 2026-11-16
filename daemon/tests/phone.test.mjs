import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.VAHTI_DATA_DIR = mkdtempSync(join(tmpdir(), 'vahti-phone-'))
const { clockOf } = await import('../lib/tasks.mjs')

test('a time in the task\'s words is its reminder time; a date with dots is not a time', () => {
  const at = (w) => clockOf({ when_words: w })
  assert.equal(at('u 9.30'), '09:30')
  assert.equal(at('at 14:00'), '14:00')
  assert.equal(at('u 17.45h'), '17:45')
  // A dotted day and month is a date, not an alert time - with or without the trailing dot.
  assert.equal(at('9.11.'), null)
  assert.equal(at('do 15.11.'), null)
  assert.equal(at('9.11.2026'), null)
  assert.equal(at('by 1.12'), null)
  assert.equal(at('u 9.05'), null)
  assert.equal(at('sutra u 10'), null)
  // An explicit clock marker rescues month-shaped minutes.
  assert.equal(at('u 17.10h'), '17:10')
  assert.equal(at('at 9.05 am'), '09:05')
  assert.equal(at('at 9.05 pm'), '21:05')
  // am/pm moves the hour; noon and midnight land right.
  assert.equal(at('at 2:30 PM'), '14:30')
  assert.equal(at('at 2:30 am'), '02:30')
  assert.equal(at('12:30 PM'), '12:30')
  assert.equal(at('12:30 am'), '00:30')
})
