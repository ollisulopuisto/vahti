import { test } from 'node:test'
import assert from 'node:assert/strict'
import { redact, redactLines } from '../lib/redact.mjs'

test('IBAN and OIB are masked', () => {
  const { text, found } = redact('IBAN računa: HR' + '0'.repeat(19) + ' OIB: ' + '8'.repeat(11))
  assert.equal(text, 'IBAN računa: [IBAN] OIB: [OIB]')
  assert.deepEqual(found.sort(), ['iban', 'oib'])
})

test('login codes are masked', () => {
  assert.equal(redact('Your verification code is 482913').text, 'Your verification code is [CODE]')
  assert.equal(redact('Vaš jednokratni kod: 5521').text, 'Vaš jednokratni kod: [CODE]')
  assert.equal(redact('Kod za prijavu je 123456').text, 'Kod za prijavu je [CODE]')
})

test('"kod" meaning "at" and money amounts stay', () => {
  const s = 'Filip je kod Jonasa kupio stalak za 85€'
  assert.equal(redact(s).text, s)
})

test('only card numbers that pass Luhn are masked', () => {
  assert.equal(redact('kartica ' + ['4111', '1111', '1111', '1111'].join(' ')).text, 'kartica [CARD]')
  assert.equal(redact('ticket 888888888888888888888888').text, 'ticket 888888888888888888888888')
})

test('mentions and links with long ids are not cards', () => {
  for (const s of ['@' + '8'.repeat(14) + ' primjer', 'https://example.com/status/' + '8'.repeat(19), 'watch/?v=' + '8'.repeat(16)]) {
    assert.equal(redact(s).text, s)
  }
})

test('keys and passwords', () => {
  assert.equal(redact('key ' + ['sk', 'ant', 'api03', 'a'.repeat(24)].join('-')).text, 'key [SECRET]')
  assert.equal(redact('lozinka: Tajna123!').text, 'lozinka: [PASSWORD]')
  assert.equal(redact('github token gho_' + 'b'.repeat(30)).text, 'github token [SECRET]')
  assert.equal(redact('aws session ASIA' + 'C'.repeat(16)).text, 'aws session [SECRET]')
  assert.equal(redact('user token ghu_' + 'u'.repeat(22)).text, 'user token [SECRET]')
  assert.equal(redact('server token ghs_' + 's'.repeat(22)).text, 'server token [SECRET]')
  assert.equal(redact('refresh token ghr_' + 'r'.repeat(22)).text, 'refresh token [SECRET]')
  assert.equal(redact('pat github_pat_' + 'p'.repeat(20)).text, 'pat [SECRET]')
})

test('PEM private key blocks are masked', () => {
  const pk = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0\n-----END RSA PRIVATE KEY-----'
  const res = redact('Here is my key:\n' + pk + '\nPlease keep safe.')
  assert.equal(res.text, 'Here is my key:\n[PRIVATE KEY]\nPlease keep safe.')
  assert.deepEqual(res.found, ['secret'])
  const ec = '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEI\n-----END EC PRIVATE KEY-----'
  assert.equal(redact(ec).text, '[PRIVATE KEY]')
})

test('line arrays keep their element boundaries', () => {
  const lines = ['first\nsecond', 'sk-' + 'a'.repeat(24)]
  assert.deepEqual(redactLines(lines), ['first\nsecond', '[SECRET]'])
  const multiInline = ['a -----BEGIN RSA PRIVATE KEY----- key -----END RSA PRIVATE KEY----- b -----BEGIN EC PRIVATE KEY----- key2 -----END EC PRIVATE KEY----- c']
  assert.deepEqual(redactLines(multiInline), ['a [PRIVATE KEY] b [PRIVATE KEY] c'])
  const pem = ['look at this', '-----BEGIN RSA PRIVATE KEY-----', 'MIIEowIBAAKCAQEA0', '-----END RSA PRIVATE KEY-----', 'keep it safe']
  assert.deepEqual(redactLines(pem), ['look at this', '[PRIVATE KEY]', 'keep it safe'])
  assert.deepEqual(redactLines(['hello', 'world']), ['hello', 'world'])
})

test('a truncated key block swallows neither text nor the next block', () => {
  const s = '-----BEGIN RSA PRIVATE KEY-----\nMeeting at 3\n-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEI\n-----END EC PRIVATE KEY-----'
  assert.equal(redact(s).text, '-----BEGIN RSA PRIVATE KEY-----\nMeeting at 3\n[PRIVATE KEY]')
  const mismatched = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0\n-----END EC PRIVATE KEY-----'
  assert.equal(redact(mismatched).text, mismatched)
})

test('ordinary text is untouched', () => {
  const s = 'Ponesi 28€ za glinu u srijedu'
  assert.deepEqual(redact(s), { text: s, found: [] })
})
