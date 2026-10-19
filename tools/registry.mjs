/**
 * 工具注册入口。
 *
 * 当前实现：
 *   - page_questions：只读读取当前学习通测验/作业页面的题目、选项与文字解密状态
 *   - scroll_to：把指定任务点滚入视口（通用页面滚动）
 *   - scroll_domain：原子滚动一个 frame 文档
 *   - xuexi_health：用于确认插件已注册进 xuexi-next 预设
 *
 * 其余工具（page_snapshot / page_outline / element_click / page_navigate / media_*）
 * 仍留在设计文档里，等部件验证通过后再接入。
 */
import { CdpSession } from '../lib/cdp/session.mjs'
import { registerPageQuestions } from './page-questions.mjs'
import { registerScrollTo } from './scroll-to.mjs'
import { registerScrollDomain } from './scroll-domain.mjs'

export function registerTools(ctx, { version = '0.0.0', config = {}, output, toLossless } = {}) {
  const session = new CdpSession({
    endpoint: config.cdpEndpoint || process.env.XUEXI_CDP_URL,
    targetUrlIncludes: config.targetUrlIncludes,
  })

  registerPageQuestions(ctx, { output, toLossless, session })
  registerScrollTo(ctx, { output, toLossless, session })
  registerScrollDomain(ctx, { output, toLossless, session })

  // Close the CDP websocket when the preset scope is disposed.
  if (typeof ctx.effect === 'function') ctx.effect(() => () => { session.close() })

  ctx.tools.register({
    name: 'xuexi_health',
    description: '诊断工具：确认 xuexi-next 预设与工具注册链路正常；同时报告当前实现阶段。',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    output,
    async execute() {
      return toLossless({
        ok: true,
        plugin: 'dsh-xuexi-next',
        version,
        mode: 'xuexi-next',
        phase: 'v0.1-scroll',
        implemented_tools: ['page_questions', 'scroll_to', 'scroll_domain'],
        note: '当前实现题目读取、页面滚动到任务点、原子滚动域；页面快照/目录/点击/媒体工具尚未接入。',
        cdp_endpoint: session.endpoint,
      })
    },
  })
}
