/**
 * 真实浏览器只读联调：任务点数量与完成情况（不点答案、不提交、不切标签）。
 *
 * 前置：Edge 9222，打开学习通章节页面。
 * 运行：npm run test:live:tasks
 */
import { CdpSession } from '../lib/cdp/session.mjs'
import { collectTaskPointScan } from '../lib/tasks/collect.mjs'
import { analyzeTaskPointCount } from '../lib/tasks/count.mjs'
import { analyzeTaskPointCompletion } from '../lib/tasks/completion.mjs'

const session = new CdpSession({
  endpoint: process.env.XUEXI_CDP_URL,
  targetUrlIncludes: process.env.XUEXI_TARGET_URL_INCLUDES,
})

try {
  await session.ensure()
  const page = await session.pageInfo()
  console.log('page:', page.title, '|', page.url.slice(0, 180))
  const scan = await collectTaskPointScan(session)
  console.log('frame:', scan.frame && scan.frame.frame_id, '| coverage:', scan.coverage)
  console.log('chapter:', JSON.stringify(scan.chapter))
  const inventory = analyzeTaskPointCount(scan)
  console.log('count:', inventory.total, '| duplicates:', inventory.duplicateCount, '| ignored containers:', inventory.ignoredContainers)
  for (const point of inventory.points) {
    console.log('  -', point.kind, point.jobId, '|', point.title || '(no title)')
  }
  const completion = analyzeTaskPointCompletion(scan, { inventory })
  console.log('summary:', JSON.stringify(completion.summary))
  console.log('chapter result:', JSON.stringify(completion.chapter), '| consistency:', completion.chapter.consistent)
  console.log('coverage:', completion.coverage, '| unobservedIncomplete:', completion.unobservedIncomplete)
  for (const point of completion.points) {
    console.log('  -', point.jobId, point.state, point.conflict ? '[conflict]' : '', point.signals.join(','))
  }
  if (!inventory.total) throw new Error('no task points found')
} catch (error) {
  console.error('live tasks test failed:', error.code || error.name, error.message)
  if (error.observed) console.error(JSON.stringify(error.observed, null, 2).slice(0, 4000))
  process.exitCode = 1
} finally {
  session.close()
  setTimeout(() => process.exit(process.exitCode || 0), 100)
}
