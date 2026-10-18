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
assert.equal(registered.length, 1, '脚手架阶段只注册健康检查工具')
assert.equal(registered[0].name, 'xuexi_health')

const out = await registered[0].execute({}, { agent: { id: 'test' } })
assert.equal(out.ok, true)
assert.equal(out.mode, 'xuexi-next')
assert.equal(out.phase, 'scaffold')
assert.ok(registered[0].output.render({}, out)[0].text.includes('xuexi-next'))

const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
assert.match(patch, /id: xuexi-next/)
assert.match(patch, /dsh-xuexi-next/)
assert.match(patch, /command-compact/)
assert.match(patch, /compaction-basic/)
assert.match(patch, /tool-result-pruner/)
assert.match(patch, /isolate:/)

console.log('✓ xuexi-next 冒烟测试通过')
