import assert from 'node:assert/strict'
import { waitFor } from '../lib/scroll/readiness.mjs'
import { computeScrollTop, isAtBottom } from '../lib/scroll/domain.mjs'
import { isRectVisible } from '../lib/scroll/target.mjs'
import { clampPacing, nextStepDelta } from '../lib/scroll/document.mjs'
import { resolveDomainInput } from '../lib/scroll/domain-handle.mjs'

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

// Composite domain handle resolution.
const fakeScrollSession = { generation: 3, frameEpoch: (id) => id === 'frame-b' ? 2 : 1 }
const legacy = resolveDomainInput({ frame_id: 'frame-a' }, fakeScrollSession)
assert.deepEqual(legacy, { frame_id: 'frame-a', domain: null, source: 'frame_id' })

const domain = { domain_id: 'd0', frame_id: 'frame-a', frame_epoch: 1, generation: 3, kind: 'document' }
const resolved = resolveDomainInput({ domain }, fakeScrollSession)
assert.equal(resolved.source, 'domain')
assert.equal(resolved.frame_id, 'frame-a')
assert.equal(resolved.domain.domain_id, 'd0')

assert.throws(
  () => resolveDomainInput({ frame_id: 'frame-a', domain }, fakeScrollSession),
  (error) => error.code === 'INVALID_ARGUMENT'
)
assert.throws(
  () => resolveDomainInput({ domain: { ...domain, generation: 2 } }, fakeScrollSession),
  (error) => error.code === 'STALE_HANDLE' && error.observed.reason === 'generation'
)
assert.throws(
  () => resolveDomainInput({ domain: { ...domain, frame_epoch: 1 } }, { ...fakeScrollSession, frameEpoch: () => 2 }),
  (error) => error.code === 'STALE_HANDLE' && error.observed.reason === 'frame_epoch'
)
assert.throws(
  () => resolveDomainInput({ domain: { ...domain, kind: 'element' } }, fakeScrollSession),
  (error) => error.code === 'UNSUPPORTED_DOMAIN'
)

console.log('✓ 滚动域组合句柄测试通过')
