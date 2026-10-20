import assert from 'node:assert/strict'
import { CdpSession } from '../lib/cdp/session.mjs'

const endpoint = process.env.STATIC_CDP_ENDPOINT || 'http://127.0.0.1:9333'
const fixtureRoot = new URL('./fixtures/', import.meta.url)
const tabsUrl = new URL('static-observe-tabs.html', fixtureRoot).href
const ambiguousUrl = new URL('static-observe-ambiguous.html', fixtureRoot).href

const registered = []
const cleanups = []
const ctx = {
  tools: { register: (tool) => registered.push(tool) },
  get: () => undefined,
  effect: (fn) => { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup) },
}

const plugin = await import('../index.js')
plugin.apply(ctx, { cdpEndpoint: endpoint, targetUrlIncludes: 'static-observe-tabs' })
const pageSnapshot = registered.find((tool) => tool.name === 'page_snapshot')
const taskPoints = registered.find((tool) => tool.name === 'task_points')
assert.ok(pageSnapshot && taskPoints)

const nav = new CdpSession({ endpoint, targetUrlIncludes: 'static-observe-tabs' })
try {
  await nav.ensure()
  await nav.send('Page.navigate', { url: tabsUrl })
  await new Promise((resolve) => setTimeout(resolve, 1500))

  const snapshot = await pageSnapshot.execute({}, { agent: { id: 'static' } })
  assert.equal(snapshot.ok, true, JSON.stringify(snapshot.error))
  assert.equal(snapshot.page.url, tabsUrl)
  assert.equal(snapshot.tabs.items.length, 2)
  assert.equal(snapshot.tabs.active_index, 1)
  assert.equal(snapshot.tabs.items[0].title, '视频')
  assert.ok(snapshot.frames.length >= 2, 'should see top + knowledge frame')
  assert.ok(snapshot.hidden_frame_count >= 1, 'should count blank utility frame')
  assert.ok(snapshot.scroll_domains.some((domain) => domain.label === '#scrollbox'), 'element scroll domain should be found')

  const tasks = await taskPoints.execute({}, { agent: { id: 'static' } })
  assert.equal(tasks.ok, true, JSON.stringify(tasks.error))
  assert.equal(tasks.task_points.length, 2)
  assert.deepEqual(tasks.task_points.map((point) => point.job_id), ['job-a', 'job-b'])
  assert.deepEqual(tasks.task_points.map((point) => point.wrapper_element.element_id), ['e0', 'e1'])
  assert.equal(tasks.ignored_containers, 1, 'ordinary attachment should be ignored')

  await nav.send('Page.navigate', { url: ambiguousUrl })
  await new Promise((resolve) => setTimeout(resolve, 800))
  const ambiguousSnapshot = await pageSnapshot.execute({}, { agent: { id: 'static' } })
  assert.equal(ambiguousSnapshot.ok, true)
  assert.equal(ambiguousSnapshot.tabs.coverage, 'partial')
  assert.equal(ambiguousSnapshot.tabs.active_index, null)

  const ambiguousTasks = await taskPoints.execute({}, { agent: { id: 'static' } })
  assert.equal(ambiguousTasks.ok, false)
  assert.equal(ambiguousTasks.error.code, 'TAB_UNRESOLVED')
  console.log('✓ 静态页面观察测试通过')
} finally {
  for (const cleanup of cleanups) cleanup()
  try { await nav.send('Browser.close') } catch {}
  nav.close()
}
