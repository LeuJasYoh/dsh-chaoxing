import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'
import { analyzeFont, countEncodedChars, decodeText, tableInfo } from '../lib/cxsecret/decode.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, 'fixtures', 'cxsecret-ceramic.ttf')
const bytes = readFileSync(fixture)

const info = analyzeFont(bytes)
assert.equal(info.bytes, 11404)
assert.equal(info.mapped, 31)
assert.equal(info.unknownCount, 0)
assert.ok(info.sha256.startsWith('955b9eacd5915c41'))
assert.ok(tableInfo.entries > 20000)

const fake = '【单选题】中国硅酸玢协吪编著吥82版《中国陶瓷史》唚吢，瓷妑出现吤（）时期。'
const expected = '【单选题】中国硅酸盐协会编著的82版《中国陶瓷史》认为，瓷器出现于（）时期。'
assert.equal(countEncodedChars(fake, info), 7)
const decoded = decodeText(fake, info)
assert.equal(decoded.text, expected)
assert.deepEqual(decoded.unknown, [])

// A plain string and a null font must pass through untouched.
assert.equal(decodeText('plain English text', null).text, 'plain English text')
assert.equal(decodeText('plain English text', info).text, 'plain English text')

// Re-analyzing the same font must use the cache and stay stable.
assert.equal(analyzeFont(bytes).sha256, info.sha256)

console.log('✓ cxsecret 字体解密测试通过')
