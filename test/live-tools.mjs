/**
 * 真实浏览器只读联调：插件工具组装测试。
 *
 * 通过 mock ctx 加载插件，拿到 scroll_to / scroll_domain 两个工具，
 * 再用真实页面调用它们。只滚动，不点击、不提交、不改变进度。
 */
import assert from 'node:assert/strict'
import { CdpSession } from '../lib/cdp/session.mjs'
import { listTaskPoints } from '../lib/scroll/target.mjs'
import { listPdfTargets } from '../lib/scroll/document.mjs'

const registered = []
const ctx = {
  tools: { register: (tool) => registered.push(tool) },
  get: (name) => name === 'systemPrompt' ? { section: () => {} } : undefined,
  effect: (fn) => fn(),
}
const plugin = await import('../index.js')
plugin.apply(ctx, {})
const scrollTo = registered.find((tool) => tool.name === 'scroll_to')
const scrollDomain = registered.find((tool) => tool.name === 'scroll_domain')
assert.ok(scrollTo && scrollDomain, 'scroll tools should be registered')

const discovery = new CdpSession({
  endpoint: process.env.XUEXI_CDP_URL,
  targetUrlIncludes: process.env.XUEXI_TARGET_URL_INCLUDES,
})

try {
  await discovery.ensure()
  const page = await discovery.pageInfo()
  console.log('page:', page.title, '| visibility:', page.visibility)
  const listed = await listTaskPoints(discovery)
  console.log('task points:', listed.points.length)
  assert.ok(listed.points.length > 0, 'at least one task point is required')

  for (const point of listed.points) {
    const out = await scrollTo.execute({ job_id: point.jobId, align: 'center' }, { agent: { id: 'live-tools' } })
    console.log('scroll_to', point.jobId, '->', out.ok, out.data && out.data.visible, '| scroll', out.data && out.data.after && out.data.after.scroll_top)
    if (!out.ok) console.log('scroll_to error:', JSON.stringify(out.error, null, 1).slice(0, 6000))
    assert.equal(out.ok, true)
    assert.equal(out.data.visible, true)
  }

  const pdfs = (await listPdfTargets(discovery)).filter((pdf) => !pdf.error)
  console.log('pdf targets:', pdfs.length)
  assert.ok(pdfs.length > 0, 'at least one PDF is required')
  for (const pdf of pdfs) {
    const out = await scrollDomain.execute({
      frame_id: pdf.pan_frame_id,
      to: 'bottom',
      dispatch_scroll: true,
      settle_ms: 200,
    }, { agent: { id: 'live-tools' } })
    console.log('scroll_domain', pdf.job_id, '->', out.ok, out.data && out.data.at_bottom, '| gap', out.data && out.data.bottom_gap)
    assert.equal(out.ok, true)
    assert.equal(out.data.at_bottom, true)
    await scrollDomain.execute({ frame_id: pdf.pan_frame_id, to: 'top', settle_ms: 100 }, { agent: { id: 'live-tools' } })
  }

  const badTarget = await scrollTo.execute({ job_id: 'does-not-exist', timeout_ms: 150 }, { agent: { id: 'live-tools' } })
  console.log('bad target:', badTarget.ok, badTarget.error && badTarget.error.code)
  assert.equal(badTarget.ok, false)
  assert.equal(badTarget.error.code, 'TARGET_NOT_READY')

  const badDomain = await scrollDomain.execute({ frame_id: 'missing-frame', to: 'bottom' }, { agent: { id: 'live-tools' } })
  console.log('bad domain:', badDomain.ok, badDomain.error && badDomain.error.code)
  assert.equal(badDomain.ok, false)

  const invalid = await scrollDomain.execute({ frame_id: 'x', to: 'top', delta_y: 10 }, { agent: { id: 'live-tools' } })
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error.code, 'INVALID_ARGUMENT')

  const frames = await discovery.frames()
  await discovery.evaluateInFrame(frames[0].frame.id, 'document.scrollingElement.scrollTop = 0')
  console.log('tool assembly test passed')
} catch (error) {
  console.error('tool assembly test failed:', error.code || error.name, error.message)
  if (error.observed) console.error(JSON.stringify(error.observed, null, 2).slice(0, 4000))
  process.exitCode = 1
} finally {
  discovery.close()
  setTimeout(() => process.exit(process.exitCode || 0), 100)
}
