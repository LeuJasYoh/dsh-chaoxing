/**
 * 新插件冒烟测试：不启动 DSH、不启动浏览器。
 * 只验证 index.js 的 DSH 插件契约、模式提示词注入、工具注册链路和压缩配置。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const registered = []
const sections = []
const effects = []
const cleanups = []
const ctx = {
  tools: { register: (def) => registered.push(def) },
  get: (name) => {
    if (name === 'systemPrompt') return { section: (s) => { sections.push(s) } }
    return undefined
  },
  effect: (fn) => { effects.push(fn); const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup) },
}

const plugin = await import(pathToFileURL(join(root, 'index.js')).href)
assert.equal(plugin.name, 'dsh-xuexi-next')
assert.deepEqual(plugin.inject, ['tools', 'workingDirectory'])
assert.equal(typeof plugin.apply, 'function')
assert.equal(plugin.default, undefined, '不要 export default（会丢掉 inject）')

const result = plugin.apply(ctx, {})
assert.equal(result.name, 'dsh-xuexi-next')
assert.equal(sections.length, 1, '应注入一次模式提示词')
assert.equal(effects.length, 2, '提示词与工具注册都应放在 ctx.effect 中')
assert.ok(cleanups.length >= 1, '工具注册应返回会话清理函数')
assert.match(sections[0].text, /学习模式/)
assert.match(sections[0].text, /page_questions/)
assert.match(sections[0].text, /scroll_to/)
assert.match(sections[0].text, /scroll_domain/)

assert.equal(registered.length, 8, '当前阶段应注册题目、观察、笔记、任务点复核、滚动与健康检查工具')
const questions = registered.find((tool) => tool.name === 'page_questions')
const pageSnapshot = registered.find((tool) => tool.name === 'page_snapshot')
const taskPoints = registered.find((tool) => tool.name === 'task_points')
const pageNotes = registered.find((tool) => tool.name === 'page_notes')
const taskPointCheck = registered.find((tool) => tool.name === 'task_point_check')
const scrollTo = registered.find((tool) => tool.name === 'scroll_to')
const scrollDomain = registered.find((tool) => tool.name === 'scroll_domain')
const health = registered.find((tool) => tool.name === 'xuexi_health')
assert.ok(questions, '应注册 page_questions')
assert.ok(pageSnapshot, '应注册 page_snapshot')
assert.ok(taskPoints, '应注册 task_points')
assert.ok(pageNotes, '应注册 page_notes')
assert.ok(taskPointCheck, '应注册 task_point_check')
assert.ok(scrollTo, '应注册 scroll_to')
assert.ok(scrollDomain, '应注册 scroll_domain')
assert.ok(health, '应注册 xuexi_health')

assert.equal(typeof questions.description, 'string')
assert.match(questions.description, /read-only/i)
assert.equal(questions.parameters.properties.limit.type, 'integer')
assert.equal(questions.output.schema.type, 'object')
const fake = { ok: true, tool: 'page_questions', data: { page_kind: 'chaoxing_quiz', questions: [] } }
assert.ok(questions.output.render({}, fake)[0].text.includes('page_questions'))
assert.equal(typeof questions.execute, 'function')

assert.equal(pageSnapshot.parameters.type, 'object')
assert.equal(typeof pageSnapshot.execute, 'function')
assert.equal(taskPoints.parameters.type, 'object')
assert.equal(typeof taskPoints.execute, 'function')
assert.match(taskPoints.description, /TAB_UNRESOLVED/)
assert.match(pageNotes.parameters.properties.action.enum.join(','), /patch/)
assert.match(taskPointCheck.description, /3000 ms/)
assert.equal(scrollTo.parameters.properties.job_id.type, 'string')
assert.equal(scrollTo.parameters.properties.align.enum.includes('start'), true)
assert.ok(scrollTo.output.render({}, { ok: true, tool: 'scroll_to', data: { visible: true } })[0].text.includes('scroll_to'))
assert.equal(scrollDomain.parameters.properties.frame_id.type, 'string')
assert.equal(scrollDomain.parameters.properties.domain.type, 'object')
assert.equal(scrollDomain.parameters.properties.to.enum.includes('bottom'), true)
assert.ok(scrollDomain.output.render({}, { ok: true, tool: 'scroll_domain', data: { at_bottom: true } })[0].text.includes('scroll_domain'))

const out = await health.execute({}, { agent: { id: 'test' } })
assert.equal(out.ok, true)
assert.equal(out.mode, 'xuexi-next')
assert.equal(out.phase, 'v0.3-notes')
assert.deepEqual(out.implemented_tools, ['page_questions', 'page_snapshot', 'page_notes', 'task_points', 'task_point_check', 'scroll_to', 'scroll_domain'])
assert.ok(health.output.render({}, out)[0].text.includes('xuexi-next'))

const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
assert.match(patch, /id: xuexi-next/)
assert.match(patch, /dsh-xuexi-next/)
assert.match(patch, /command-compact/)
assert.match(patch, /compaction-basic/)
assert.match(patch, /tool-result-pruner/)
assert.match(patch, /isolate:/)

// Bundle display metadata required by current DSH bundle docs.
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
assert.ok(pkg.exports['./locale/*.json'])
assert.ok(pkg.exports['./icon'])
assert.ok(pkg.files.includes('locale/*.json'))
assert.ok(pkg.files.includes('icon.svg'))
for (const locale of ['en', 'zh']) {
  const meta = JSON.parse(readFileSync(join(root, 'locale', locale + '.json'), 'utf8')).meta
  assert.equal(typeof meta.title, 'string')
  assert.equal(typeof meta.description, 'string')
}
assert.ok(readFileSync(join(root, 'icon.svg'), 'utf8').includes('<svg'))

// Every registered tool must satisfy the DSH tool definition shape.
for (const tool of registered) {
  assert.equal(typeof tool.name, 'string')
  assert.ok(tool.name.length > 0)
  assert.equal(typeof tool.description, 'string')
  assert.equal(tool.parameters.type, 'object')
  assert.equal(tool.output.schema.type, 'object')
  assert.equal(typeof tool.output.render, 'function')
  assert.equal(typeof tool.execute, 'function')
}

// Dispose the tool effect; this should close the plugin session scope cleanly.
for (const cleanup of cleanups) cleanup()

console.log('✓ xuexi-next 冒烟测试通过')
