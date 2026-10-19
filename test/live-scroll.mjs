/**
 * 真实浏览器只读联调：通用滚动部件。
 *
 * 前置：Edge 9222，打开一个学习通章节页面。
 * 运行：npm run test:live:scroll
 *
 * 只做滚动，不点答案、不播放、不提交、不改变任务完成状态。
 */
import { CdpSession } from '../lib/cdp/session.mjs'
import { listTaskPoints, scrollTaskPointIntoView } from '../lib/scroll/target.mjs'
import { listPdfTargets, readDocument, resolvePdfTarget } from '../lib/scroll/document.mjs'
import { readDocumentMetrics, scrollDocument } from '../lib/scroll/domain.mjs'

const session = new CdpSession({
  endpoint: process.env.XUEXI_CDP_URL,
  targetUrlIncludes: process.env.XUEXI_TARGET_URL_INCLUDES,
})

try {
  await session.ensure()
  const page = await session.pageInfo()
  console.log('page:', page.title, '| visibility:', page.visibility)
  const frames = await session.frames()
  const top = frames[0].frame
  const listed = await listTaskPoints(session)
  console.log('task point frame:', listed.frame && listed.frame.frame_id, '| count:', listed.points.length)
  for (const point of listed.points) {
    console.log('  -', point.jobId, point.kind, point.title)
  }

  const scrollTargets = []
  for (const point of listed.points) {
    const result = await scrollTaskPointIntoView(session, point.jobId, { align: 'center', settleMs: 160 })
    scrollTargets.push({
      job_id: point.jobId,
      kind: point.kind,
      title: point.title,
      found: result.found,
      visible: result.visible,
      before: result.before.scroll_top,
      after: result.after.scroll_top,
      viewport: result.target_viewport_rect,
    })
  }
  console.log('scroll targets:', JSON.stringify(scrollTargets, null, 1))

  const pdfs = await listPdfTargets(session)
  console.log('pdf targets:', JSON.stringify(pdfs, null, 1))
  for (const pdf of pdfs) {
    if (pdf.error) continue
    const resolved = await resolvePdfTarget(session, pdf.job_id)
    const before = await readDocumentMetrics(session, resolved.pan_frame_id)
    const jumped = await scrollDocument(session, resolved.pan_frame_id, { to: 'bottom', dispatch_scroll: true, settleMs: 250 })
    console.log('pdf jump:', JSON.stringify({
      job_id: resolved.job_id,
      title: resolved.title,
      pan_frame_id: resolved.pan_frame_id,
      before: { scroll_top: before.scroll_top, max: before.max_scroll },
      after: { scroll_top: jumped.after.scroll_top, max: jumped.after.max_scroll, bottom_gap: jumped.bottom_gap, at_bottom: jumped.at_bottom },
      dispatch_scroll: jumped.dispatch_scroll,
    }))
    if (resolved.job_id === pdfs[pdfs.length - 1].job_id) {
      const slow = await readDocument(session, resolved.pan_frame_id, { stepPx: 600, dwellMs: 30, maxSeconds: 20, dispatch_scroll: true })
      console.log('pdf slow read:', JSON.stringify(slow))
    }
    await scrollDocument(session, resolved.pan_frame_id, { to: 'top', dispatch_scroll: false, settleMs: 120 })
  }

  await new Promise((resolve) => setTimeout(resolve, 200))
  await session.evaluateInFrame(top.id, 'document.scrollingElement.scrollTop = 0')
  console.log('done; outer scroll restored')
} catch (error) {
  console.error('live scroll test failed:', error.code || error.name, error.message)
  if (error.observed) console.error(JSON.stringify(error.observed, null, 2).slice(0, 4000))
  process.exitCode = 1
} finally {
  session.close()
  setTimeout(() => process.exit(process.exitCode || 0), 100)
}
