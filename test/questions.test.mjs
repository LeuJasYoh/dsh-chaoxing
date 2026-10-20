import assert from 'node:assert/strict'
import { selectedLabels, normalizeType } from '../lib/extract/questions.mjs'

const letters = [
  { label: 'A', data: 'A' },
  { label: 'B', data: 'B' },
  { label: 'C', data: 'C' },
]
const judge = [
  { label: 'A', data: 'true' },
  { label: 'B', data: 'false' },
]

assert.deepEqual(selectedLabels('A', letters), ['A'])
assert.deepEqual(selectedLabels('A,B', letters), ['A', 'B'])
assert.deepEqual(selectedLabels('ABC', letters), ['A', 'B', 'C'])
assert.deepEqual(selectedLabels('true', judge), ['A'])
assert.deepEqual(selectedLabels('false', judge), ['B'])
assert.deepEqual(selectedLabels('', letters), [])
assert.deepEqual(selectedLabels('Z', letters), [])

assert.equal(normalizeType('0'), 'single')
assert.equal(normalizeType('1'), 'multiple')
assert.equal(normalizeType('3'), 'judge')
assert.equal(normalizeType('9'), 'unknown')

console.log('✓ 题目解析辅助逻辑测试通过')
