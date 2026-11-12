import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// A signed Vahti.app must stay sealed: Python run from the bundle's sidecar folder writes __pycache__ next to the
// scripts unless told not to, and the app's strict signature check (GmailVault.swift) then refuses to start the
// daemon. -I -E ignore PYTHONDONTWRITEBYTECODE, so the flag has to be -B on the command line.
test('every python that runs or imports the bundled sidecar passes -B', () => {
  for (const file of ['../lib/runtime.mjs', '../lib/second.mjs']) {
    const lines = readFileSync(new URL(file, import.meta.url), 'utf8').split('\n')
    // The packaged copy is run through a comment stripper that rewrites quotes, so accept both kinds.
    const hits = lines.filter((l) => /\.python,\s*\[/.test(l) && /(SCRIPT|SIDECAR)/.test(l))
    assert.ok(hits.length > 0, `${file}: no sidecar python launch found`)
    for (const l of hits) assert.match(l, /\[\s*["']-B["']\s*,\s*["']-I["']\s*,\s*["']-E["']/, `${file}: ${l.trim().slice(0, 80)}`)
  }
})
