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
const ctx = {
  tools: { register: (def) => registered.push(def) },
  get: (name) => {
    if (name === 'systemPrompt') return { section: (s) => { sections.push(s) } }
    return undefined
  },
  effect: (fn) => { effects.push(fn); fn() },
}

const plugin = await import(pathToFileURL(join(root, 'index.js')).href)
assert.equal(plugin.name, 'dsh-xuexi-next')
assert.deepEqual(plugin.inject, ['tools'])
assert.equal(typeof plugin.apply, 'function')
assert.equal(plugin.default, undefined, '不要 export default（会丢掉 inject）')

const result = plugin.apply(ctx, {})
assert.equal(result.name, 'dsh-xuexi-next')
assert.equal(sections.length, 1, '应注入一次模式提示词')
assert.match(sections[0].text, /网课模式/)
assert.match(sections[0].text, /page_questions/)
assert.match(sections[0].text, /scroll_to/)
assert.match(sections[0].text, /scroll_domain/)

assert.equal(registered.length, 4, '当前阶段应注册 page_questions、scroll_to、scroll_domain 与 xuexi_health')
const questions = registered.find((tool) => tool.name === 'page_questions')
const scrollTo = registered.find((tool) => tool.name === 'scroll_to')
const scrollDomain = registered.find((tool) => tool.name === 'scroll_domain')
const health = registered.find((tool) => tool.name === 'xuexi_health')
assert.ok(questions, '应注册 page_questions')
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

assert.equal(scrollTo.parameters.properties.job_id.type, 'string')
assert.equal(scrollTo.parameters.properties.align.enum.includes('start'), true)
assert.ok(scrollTo.output.render({}, { ok: true, tool: 'scroll_to', data: { visible: true } })[0].text.includes('scroll_to'))
assert.equal(scrollDomain.parameters.properties.frame_id.type, 'string')
assert.equal(scrollDomain.parameters.properties.to.enum.includes('bottom'), true)
assert.ok(scrollDomain.output.render({}, { ok: true, tool: 'scroll_domain', data: { at_bottom: true } })[0].text.includes('scroll_domain'))

const out = await health.execute({}, { agent: { id: 'test' } })
assert.equal(out.ok, true)
assert.equal(out.mode, 'xuexi-next')
assert.equal(out.phase, 'v0.1-scroll')
assert.deepEqual(out.implemented_tools, ['page_questions', 'scroll_to', 'scroll_domain'])
assert.ok(health.output.render({}, out)[0].text.includes('xuexi-next'))

const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
assert.match(patch, /id: xuexi-next/)
assert.match(patch, /dsh-xuexi-next/)
assert.match(patch, /command-compact/)
assert.match(patch, /compaction-basic/)
assert.match(patch, /tool-result-pruner/)
assert.match(patch, /isolate:/)

console.log('✓ xuexi-next 冒烟测试通过')
