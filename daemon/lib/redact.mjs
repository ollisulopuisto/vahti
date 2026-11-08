// Runs before anything is saved: secrets never reach the vault, so no client can ever read them back.

const luhn = (digits) => {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2
    sum += d
  }
  return sum % 10 === 0
}

// BEGIN and END must carry the same label, and another BEGIN ends the candidate, so a truncated
// block cannot swallow unrelated text or the block after it.
const PEM = /-----BEGIN(?: ([A-Z0-9_-]+))? PRIVATE KEY-----(?:(?!-----BEGIN)[\s\S])*?-----END(?: \1)? PRIVATE KEY-----/g

const RULES = [
  // Private key blocks and common provider tokens: mask so credentials never enter the vault. BEGIN and
  // END must carry the same label, and another BEGIN ends the candidate, so a truncated block cannot
  // swallow unrelated text or the block after it.
  ['secret', PEM, () => '[PRIVATE KEY]'],
  ['secret', /\b(?:sk-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{16,}|gh[opurs]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:AKIA|ASIA)[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})\b/g],
  ['iban', /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g],
  ['oib', /\b(OIB|JMBG)(\s*[:#]?\s*)\d{11,13}\b/gi, (m, label, sep) => `${label}${sep}[OIB]`],
  ['password', /\b(password|passwd|lozinka|šifra|sifra|passwort|contraseña|contrasena|mot de passe|wachtwoord|senha|pass|pwd)(\s*[:=]\s*)\S+/gi, (m, label, sep) => `${label}${sep}[PASSWORD]`],
  // "kod" alone also means "at" in Croatian, so it only counts as "kod:", "kod je" or "kod za"; money is never a code.
  ['code', /\b(code|PIN|OTP|TAN|verification|verifikacijski|jednokratni|sigurnosni|bestätigungscode|código|codigo|codice|kod(?=\s*(?::|je\b|za\b)))([^\d\n]{0,30})(\d{4,8})\b(?!\s?(?:€|eur|kn|\$|usd|%))/gi, (m, label, mid) => `${label}${mid}[CODE]`],
  // Not after @, / or =: WhatsApp mentions and tweet or video ids are long numbers too.
  ['card', /(?<![@/=#\w])(?:\d[ -]?){12,18}\d(?![\w/])/g, (m) => (luhn(m.replace(/\D/g, '')) ? '[CARD]' : m)],
]

// A capture's message lines are kept one per element, which can split a PEM block so no element shows
// both markers. Redact each element on its own, and collapse only the elements a cross-element block
// covers: element boundaries elsewhere, including newlines inside an element, are preserved.
export function redactLines(lines) {
  const joined = lines.join('\n')
  const starts = []
  let off = 0
  for (const l of lines) { starts.push(off); off += l.length + 1 }
  const out = []
  let i = 0
  for (const m of joined.matchAll(PEM)) {
    const a = m.index, b = a + m[0].length
    while (i < lines.length && starts[i] + lines[i].length <= a) { out.push(redact(lines[i]).text); i++ }
    const pre = i < lines.length && starts[i] < a ? joined.slice(starts[i], a) : ''
    while (i < lines.length && starts[i] < b) i++
    const end = starts[i - 1] + lines[i - 1].length
    const post = end > b ? joined.slice(b, end) : ''
    out.push(redact(pre).text + '[PRIVATE KEY]' + redact(post).text)
  }
  while (i < lines.length) { out.push(redact(lines[i]).text); i++ }
  return out
}

export function redact(text) {
  if (!text) return { text, found: [] }
  const found = []
  let out = text
  for (const [kind, re, fn] of RULES) {
    out = out.replace(re, (...args) => {
      const replaced = fn ? fn(...args) : `[${kind.toUpperCase()}]`
      if (replaced !== args[0]) found.push(kind)
      return replaced
    })
  }
  return { text: out, found }
}
