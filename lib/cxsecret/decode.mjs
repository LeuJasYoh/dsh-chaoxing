import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Typr } from '../vendor/typr-bundle.mjs'

const TABLE = JSON.parse(readFileSync(new URL('./table.json', import.meta.url), 'utf8'))
const FONT_CACHE = new Map()

/** Hash one embedded font so repeated pages with the same font reuse the glyph map. */
export function fontSha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Parse one embedded font and build:
 *   encoded - codepoints the font actually claims to render (the fake chars)
 *   map     - encoded codepoint -> real Unicode codepoint
 *   unknown - encoded codepoints with no matching table entry
 * The table key is the 25th..32nd hex chars of MD5(JSON.stringify(glyphToPath)).
 */
export function analyzeFont(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const sha256 = fontSha256(buf)
  const cached = FONT_CACHE.get(sha256)
  if (cached) return cached

  const font = Typr.parse(buf)[0]
  const encoded = new Set()
  const map = new Map()
  const unknown = []
  for (let cp = 19968; cp < 40870; cp += 1) {
    const gid = Typr.U.codeToGlyph(font, cp)
    if (!gid) continue
    encoded.add(cp)
    const path = JSON.stringify(Typr.U.glyphToPath(font, gid))
    const key = createHash('md5').update(path, 'utf8').digest('hex').slice(24)
    const real = TABLE[key]
    if (Number.isInteger(real)) map.set(cp, real)
    else unknown.push(cp)
  }

  const info = Object.freeze({
    sha256,
    bytes: buf.length,
    encoded,
    map,
    unknown,
    mapped: map.size,
    unknownCount: unknown.length,
  })
  FONT_CACHE.set(sha256, info)
  return info
}

/**
 * Replace only the characters that the embedded font claims to encode.
 * Characters outside the font (punctuation, Latin, normal CJK) are preserved.
 */
export function decodeText(text, info) {
  if (typeof text !== 'string' || !text) return { text: text ?? '', unknown: [] }
  if (!info) return { text, unknown: [] }
  let out = ''
  const unknown = []
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (info.map.has(cp)) out += String.fromCodePoint(info.map.get(cp))
    else if (info.encoded.has(cp)) { out += '\uFFFD'; unknown.push(ch) }
    else out += ch
  }
  return { text: out, unknown }
}

/** Count how many characters in the text belong to the encrypted alphabet. */
export function countEncodedChars(text, info) {
  if (!text || !info) return 0
  let n = 0
  for (const ch of text) if (info.encoded.has(ch.codePointAt(0))) n += 1
  return n
}

/** Decode a whole question/option and report which characters were unknown. */
export function decodeField(text, info) {
  return decodeText(text, info)
}

export const tableInfo = Object.freeze({ entries: Object.keys(TABLE).length })
