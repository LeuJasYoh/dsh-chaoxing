/**
 * 真实浏览器只读联调（不参与 npm test）。
 *
 * 前置：
 *   Edge 以 --remote-debugging-port=9222 启动，并打开学习通测验/作业页面。
 * 运行：
 *   npm run test:live
 *   XUEXI_TARGET_URL_INCLUDES=chapterId=1231182857 npm run test:live
 */
import { CdpSession } from '../lib/cdp/session.mjs'
import { collectQuestions } from '../lib/extract/questions.mjs'

const session = new CdpSession({
  endpoint: process.env.XUEXI_CDP_URL,
  targetUrlIncludes: process.env.XUEXI_TARGET_URL_INCLUDES,
})

try {
  await session.ensure()
  const page = await session.pageInfo()
  console.log('page:', page.title, '|', page.url)
  console.log('visibility:', page.visibility, '| generation:', session.generation)

  const result = await collectQuestions(session, {})
  console.log('frame:', result.frame.frame_id, '|', result.frame.url)
  console.log('work:', JSON.stringify(result.work))
  console.log('text_decode:', JSON.stringify(result.text_decode))
  for (const question of result.questions) {
    console.log('\nQ' + (question.number || '?'), question.qid, question.type, question.type_label || '')
    console.log('  stem:', question.stem)
    for (const option of question.options) {
      console.log('   ', option.label, option.text, option.element_id, option.selected ? '[selected]' : '')
    }
  }
  if (!result.questions.length) throw new Error('no questions found')
  if (result.text_decode.status === 'failed' || result.text_decode.status === 'unsupported') throw new Error('text decode is ' + result.text_decode.status)
} catch (error) {
  console.error('live test failed:', error.code || error.name, error.message)
  if (error.observed) console.error(JSON.stringify(error.observed, null, 2).slice(0, 4000))
  process.exitCode = 1
} finally {
  session.close()
}
