/**
 * 真实浏览器只读联调：验证“有 font-cxsecret 标记但没有真正加密字体”的页面
 * 不会被误解密，原始文字和当前选择都能正常返回。
 *
 * 运行：npm run test:live:plain
 */
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CdpSession } from '../lib/cdp/session.mjs'
import { collectQuestions } from '../lib/extract/questions.mjs'

const endpoint = process.env.XUEXI_CDP_URL || 'http://127.0.0.1:9222'
const fixture = pathToFileURL(fileURLToPath(new URL('./fixtures/plain-quiz.html', import.meta.url))).href
const created = await (await fetch(endpoint + '/json/new?' + encodeURIComponent(fixture), { method: 'PUT' })).json()
await new Promise((resolve) => setTimeout(resolve, 2000))
const session = new CdpSession({ endpoint, targetUrlIncludes: 'plain-quiz.html' })
try {
  const result = await collectQuestions(session, {})
  console.log('status:', result.text_decode.status, '| source:', result.text_decode.source)
  for (const question of result.questions) {
    console.log('Q' + question.number, question.stem, '| selected:', question.selected.join(',') || '(none)')
  }
  if (result.text_decode.status !== 'plain') throw new Error('expected plain text status')
  if (!result.questions.some((q) => q.stem.includes('What is 2 + 2?'))) throw new Error('English question was not returned as-is')
  if (!result.questions.some((q) => q.stem.includes('这是未加密的中文题目'))) throw new Error('plain Chinese question was not returned as-is')
  if (result.questions[0].selected.join(',') !== 'A') throw new Error('current selection was not read')
} catch (error) {
  console.error('plain live test failed:', error.code || error.name, error.message)
  process.exitCode = 1
} finally {
  session.close()
  try { await fetch(endpoint + '/json/close/' + created.id) } catch {}
  setTimeout(() => process.exit(process.exitCode || 0), 100)
}
