import { readFileSync } from 'node:fs'
import { registerTools } from './tools/registry.mjs'

export const name = 'dsh-xuexi-next'

// 只声明会以属性访问方式使用的服务。
// systemPrompt / sessions / attachments 等一律用 ctx.get?.() 可选获取。
export const inject = ['tools']

const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
  } catch {
    return '0.0.0'
  }
})()

const PROMPT_TEXT = (() => {
  try {
    return readFileSync(new URL('./prompts/xuexi-mode.md', import.meta.url), 'utf8')
  } catch (e) {
    return `# 网课模式（重写）\n\n（提示词读取失败：${String(e?.message ?? e)}）\n`
  }
})()

/** DSH 要求工具返回值能无损转 JSON。 */
function toLossless(v, seen = new Set()) {
  if (v === null || v === undefined) return null
  const t = typeof v
  if (t === 'string' || t === 'boolean') return v
  if (t === 'number') return Number.isFinite(v) ? v : null
  if (t === 'bigint') return v.toString()
  if (t === 'function' || t === 'symbol') return null
  if (v instanceof Date) return v.toISOString()
  if (t === 'object') {
    if (seen.has(v)) return '[循环引用]'
    seen.add(v)
    try {
      if (Array.isArray(v)) return v.map((x) => toLossless(x, seen))
      const out = {}
      for (const [k, x] of Object.entries(v)) out[k] = toLossless(x, seen)
      return out
    } finally {
      seen.delete(v)
    }
  }
  return String(v)
}

/**
 * 通用输出渲染：纯文本 JSON。
 * 后续截图/图片工具再扩展 ContentBlock。
 */
const output = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{
    type: 'text',
    text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
  }],
}

/**
 * 注册预设作用域里的所有工具。
 * 当前实现 lib/cdp + cxsecret + page_questions 题目读取，以及通用滚动部件和
 * scroll_to / scroll_domain 两个工具；其余手眼工具等后续再接入。
 */
export function apply(ctx, config = {}) {
  const systemPrompt = ctx.get?.('systemPrompt')
  if (systemPrompt?.section) {
    ctx.effect(() => systemPrompt.section({
      name: 'xuexi-next:mode-prompt',
      order: 120,
      text: PROMPT_TEXT,
    }))
  }

  registerTools(ctx, { version: VERSION, config, output, toLossless })
  return { name }
}

// 不要再加 export default。
// DSH 的插件对象取「模块的 default ?? 模块本身」；有 default 时，
// 具名 inject 会被忽略，导致 "cannot get property tools without inject"。
