/**
 * 工具注册入口。
 *
 * 当前实现：
 *   - page_questions：只读读取当前学习通测验/作业页面的题目、选项与文字解密状态
 *   - page_snapshot：只读观察当前页面、标签、frame 与滚动域
 *   - task_points：只读观察当前内容标签的任务点、状态与 PDF 映射
 *   - scroll_to：把指定任务点滚入视口（通用页面滚动）
 *   - scroll_domain：原子滚动一个 frame 文档
 *   - xuexi_health：用于确认插件已注册进 xuexi-next 预设
 *
 * page_outline / element_click / page_navigate / media_* 仍留在设计文档里。
 */
import { CdpSession } from '../lib/cdp/session.mjs'
import { ObservationRegistry } from '../lib/observe/registry.mjs'
import { NoteStore } from '../lib/notes/store.mjs'
import { registerPageQuestions } from './page-questions.mjs'
import { registerPageSnapshot } from './page-snapshot.mjs'
import { registerPageNotes } from './page-notes.mjs'
import { registerTaskPoints } from './task-points.mjs'
import { registerTaskPointCheck } from './task-point-check.mjs'
import { registerScrollTo } from './scroll-to.mjs'
import { registerScrollDomain } from './scroll-domain.mjs'

export function registerTools(ctx, { version = '0.0.0', config = {}, output, toLossless } = {}) {
  const session = new CdpSession({
    endpoint: config.cdpEndpoint || process.env.XUEXI_CDP_URL,
    targetUrlIncludes: config.targetUrlIncludes,
  })
  // P5 observation handles are shared by all observation tools and survive
  // within the same plugin session; generation/frame epochs invalidate them.
  const registry = new ObservationRegistry()
  const notes = new NoteStore(ctx)

  const registerAll = () => {
    registerPageQuestions(ctx, { output, toLossless, session })
    registerPageSnapshot(ctx, { output, toLossless, session, registry, notes })
    registerPageNotes(ctx, { output, toLossless, session, notes })
    registerTaskPoints(ctx, { output, toLossless, session, registry, notes })
    registerTaskPointCheck(ctx, { output, toLossless, session, registry, notes })
    registerScrollTo(ctx, { output, toLossless, session })
    registerScrollDomain(ctx, { output, toLossless, session })

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
        phase: 'v0.3-notes',
        implemented_tools: ['page_questions', 'page_snapshot', 'page_notes', 'task_points', 'task_point_check', 'scroll_to', 'scroll_domain'],
        note: '当前实现题目读取、页面/标签/frame/任务点观察、工作区页面笔记、页面滚动到任务点、原子滚动域；目录/点击/媒体工具尚未接入。',
        cdp_endpoint: session.endpoint,
      })
    },
    })
  }

  // DSH convention: register resources inside ctx.effect and return cleanup.
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => {
      registerAll()
      return () => session.close()
    })
  } else {
    registerAll()
  }
}
