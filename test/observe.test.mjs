import assert from 'node:assert/strict'
import { ObservationRegistry } from '../lib/observe/registry.mjs'
import { collectContentTabs } from '../lib/observe/page.mjs'
import { collectTaskPoints } from '../lib/observe/tasks.mjs'

function fakeSession() {
  const epochs = new Map()
  return {
    generation: 1,
    epochs,
    frameEpoch(frameId) { return epochs.get(frameId) || 1 },
  }
}

const session = fakeSession()
const registry = new ObservationRegistry()

const a1 = registry.elementRef(session, 'frame-a', 'job:1')
const a2 = registry.elementRef(session, 'frame-a', 'job:1')
assert.deepEqual(a1, a2, '同一 frame 内同一身份应复用 element_id')
assert.equal(a1.element_id, 'e0')
assert.equal(a1.frame_id, 'frame-a')
assert.equal(a1.frame_epoch, 1)

const b1 = registry.elementRef(session, 'frame-b', 'job:1')
assert.equal(b1.element_id, 'e0', '不同 frame 的局部编号互不影响')
assert.equal(b1.frame_id, 'frame-b')

const d1 = registry.domainRef(session, 'frame-a', 'document', 'document')
const d2 = registry.domainRef(session, 'frame-a', 'document', 'document')
assert.deepEqual(d1, d2, '同一 frame 内同一滚动域应复用 domain_id')
assert.equal(d1.domain_id, 'd0')
assert.equal(d1.kind, 'document')

session.epochs.set('frame-a', 2)
const a3 = registry.elementRef(session, 'frame-a', 'job:1')
assert.equal(a3.frame_epoch, 2, 'frame 导航后应生成新 epoch 的句柄')
assert.notDeepEqual(a3, a1, 'frame 导航后组合句柄应带上新 epoch')
assert.equal(registry.staleReason(session, a1), 'frame_epoch')
assert.equal(registry.staleReason(session, b1), null, '其他 frame 的句柄不应受牵连')

const beforeGeneration = registry.generation
session.generation = 2
registry.sync(session)
assert.notEqual(registry.generation, beforeGeneration, 'generation 变化应触发注册表同步')
assert.equal(registry.staleReason(session, a3), 'generation')
assert.equal(registry.frames.size, 0, 'generation 变化应清空所有 frame 注册表')

console.log('✓ 观察注册表与组合句柄测试通过')

const noTabSession = {
  topFrameId: 'top',
  async evaluateInFrame() {
    return { present: false, items: [], active_index: null, unresolved: false }
  },
}
const noTabs = await collectContentTabs(noTabSession)
assert.deepEqual(noTabs.items, [])
assert.equal(noTabs.active_index, null)
assert.equal(noTabs.coverage, 'complete')

const ambiguousSession = {
  topFrameId: 'top',
  async evaluateInFrame() {
    return {
      present: true,
      items: [{ index: 1, title: '视频', num: '1', active: false }, { index: 2, title: '章节测验', num: '2', active: false }],
      active_index: null,
      unresolved: true,
    }
  },
}
const ambiguous = await collectContentTabs(ambiguousSession)
assert.equal(ambiguous.unresolved, true)
assert.equal(ambiguous.active_index, null)
assert.equal(ambiguous.coverage, 'partial')

console.log('✓ 内容标签解析边界测试通过')

const ambiguousTaskSession = {
  generation: 1,
  topFrameId: 'top',
  async ensure() {},
  frameEpoch() { return 1 },
  async pageInfo() { return { url: 'https://example.test', title: 'test', visibility: 'hidden', readyState: 'complete', target_id: 't' } },
  async evaluateInFrame() {
    return {
      present: true,
      items: [{ index: 1, title: '视频', num: '1', active: false }, { index: 2, title: '章节测验', num: '2', active: false }],
      active_index: null,
      unresolved: true,
    }
  },
}
await assert.rejects(
  () => collectTaskPoints(ambiguousTaskSession, new ObservationRegistry()),
  (error) => error && error.code === 'TAB_UNRESOLVED',
  'task_points 应在当前标签无法判定时返回 TAB_UNRESOLVED'
)

console.log('✓ TAB_UNRESOLVED 边界测试通过')
