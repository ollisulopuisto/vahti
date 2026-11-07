#!/usr/bin/env node
// Owner-run setup only. Read the credential from an existing private file, never argv/stdin.
import { connectSolmu } from '../lib/solmu.mjs'
const args = process.argv.slice(2)
const options = {}
for (let i = 0; i < args.length; i += 2) {
  if (!['--url', '--token-file'].includes(args[i]) || !args[i + 1]) throw Error('Usage: connect-solmu.mjs --token-file /absolute/private/file [--url http://127.0.0.1:23377]')
  options[args[i] === '--url' ? 'url' : 'tokenFile'] = args[i + 1]
}
try { connectSolmu(options); console.log('Solmu source enabled. Only the local reader will be contacted on the next collection. Disable Solmu in What Vahti reads to stop and hide its messages.') }
catch { console.error('Solmu setup failed. Use a loopback reader URL and an owner-only regular token file with mode 0600.'); process.exitCode = 1 }
