import assert from 'node:assert/strict'
import { waitFor } from '../lib/scroll/readiness.mjs'
import { computeScrollTop, isAtBottom } from '../lib/scroll/domain.mjs'
import { isRectVisible } from '../lib/scroll/target.mjs'
import { clampPacing, nextStepDelta } from '../lib/scroll/document.mjs'

// waitFor succeeds after a few attempts.
let checks = 0
const success = await waitFor(() => { checks += 1; return checks >= 3 }, { timeoutMs: 1000, intervalMs: 10 })
assert.equal(success.ok, true)
assert.equal(success.attempts, 3)

// waitFor times out and returns facts, not an exception.
const timeout = await waitFor(() => false, { timeoutMs: 35, intervalMs: 10 })
assert.equal(timeout.ok, false)
assert.equal(timeout.timeout, true)

// waitFor retries when the check throws.
let throws = 0
const recover = await waitFor(() => { throws += 1; if (throws < 2) throw new Error('not ready'); return true }, { timeoutMs: 500, intervalMs: 10 })
assert.equal(recover.ok, true)

// Scroll target calculations.
const before = { scroll_top: 100, max_scroll: 500 }
assert.equal(computeScrollTop(before, { to: 'top' }), 0)
assert.equal(computeScrollTop(before, { to: 'bottom' }), 500)
assert.equal(computeScrollTop(before, { delta_y: 200 }), 300)
assert.equal(computeScrollTop(before, { delta_y: 1000 }), 500)
assert.equal(computeScrollTop(before, { delta_y: -1000 }), 0)

assert.equal(isAtBottom({ bottom_gap: 1 }), true)
assert.equal(isAtBottom({ bottom_gap: 10 }), false)

// Pacing helpers.
assert.deepEqual(clampPacing({ stepPx: 10, dwellMs: -1, maxSeconds: 0 }), { stepPx: 50, dwellMs: 0, maxSeconds: 1 })
assert.equal(nextStepDelta({ max_scroll: 1000, scroll_top: 900 }, 300), 100)
assert.equal(nextStepDelta({ max_scroll: 1000, scroll_top: 1000 }, 300), 0)

// Visibility helper.
assert.equal(isRectVisible({ left: 10, top: 10, width: 100, height: 100 }, { width: 800, height: 600 }), true)
assert.equal(isRectVisible({ left: 900, top: 10, width: 100, height: 100 }, { width: 800, height: 600 }), false)
assert.equal(isRectVisible({ left: 10, top: -200, width: 100, height: 100 }, { width: 800, height: 600 }), false)

console.log('✓ 滚动内部部件单元测试通过')
