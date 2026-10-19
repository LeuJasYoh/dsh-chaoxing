import { scrollTaskPointIntoView } from '../lib/scroll/target.mjs'
import { waitFor } from '../lib/scroll/readiness.mjs'

/**
 * Generic target scroll tool.
 *
 * It scrolls the page so a task point (identified by its stable job_id) is
 * visible. It does not resolve PDFs, scroll inside documents, or judge
 * completion.
 */
export function registerScrollTo(ctx, { output, toLossless, session }) {
  ctx.tools.register({
    name: 'scroll_to',
    description: [
      'Scroll the current page so a task point is visible.',
      'The task point is identified by its stable job_id, not by text or DOM id.',
      'This is a physical page-scroll action only: it does not scroll inside a PDF, does not click, and does not decide whether the task is complete.',
      'Use align=center by default; use align=start when the top edge of a tall task point should be aligned.',
      'Returns the outer scroll position before/after and whether the target is actually visible. If the page is still loading, waits briefly and returns facts rather than claiming success.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        job_id: { type: 'string', description: 'Stable task point job_id from a task point scan.' },
        align: { type: 'string', enum: ['center', 'start'], description: 'Alignment inside the viewport. Defaults to center.' },
        timeout_ms: { type: 'integer', minimum: 0, maximum: 30000, description: 'How long to wait for the target to appear. Defaults to 5000.' },
      },
      required: ['job_id'],
    },
    output,
    async execute(args = {}) {
      const jobId = String(args.job_id == null ? '' : args.job_id).trim()
      if (!jobId) {
        return toLossless({
          ok: false,
          tool: 'scroll_to',
          generation: session.generation || 0,
          page: null,
          data: null,
          error: { code: 'INVALID_ARGUMENT', message: 'job_id is required', observed: {} },
        })
      }
      const align = args.align === 'start' ? 'start' : 'center'
      try {
        await session.ensure()
      } catch (error) {
        return toLossless({
          ok: false,
          tool: 'scroll_to',
          generation: session.generation || 0,
          page: null,
          data: null,
          error: error && error.code ? {
            code: error.code,
            message: error && error.message ? error.message : String(error),
            observed: error.observed || {},
          } : { code: 'TARGET_NOT_FOUND', message: error && error.message ? error.message : String(error), observed: {} },
        })
      }
      const timeoutMs = Number.isInteger(args.timeout_ms) ? Math.max(0, Math.min(30000, args.timeout_ms)) : 5000
      let last = null
      const waited = await waitFor(async () => {
        const result = await scrollTaskPointIntoView(session, jobId, { align, settleMs: 220 })
        last = result
        return result.found && result.visible ? { ready: true, ...result } : { ready: false, ...result }
      }, { timeoutMs, intervalMs: 250 })

      const page = await session.pageInfo().catch(() => null)
      if (!waited.ok) {
        return toLossless({
          ok: false,
          tool: 'scroll_to',
          generation: session.generation || 0,
          page: page ? { url: page.url, title: page.title, visibility: page.visibility } : null,
          data: null,
          error: {
            code: 'TARGET_NOT_READY',
            message: 'task point was not found or did not become visible within timeout',
            hint: 'Check that the chapter is loaded, or retry with a larger timeout_ms.',
            observed: {
              job_id: jobId,
              wait: { attempts: waited.attempts, elapsed_ms: waited.elapsedMs },
              last: last ? {
                target: last.target,
                before: last.before,
                after: last.after,
                target_viewport_rect: last.target_viewport_rect,
                visible: last.visible,
              } : null,
              error: waited.error,
            },
          },
        })
      }

      return toLossless({
        ok: true,
        tool: 'scroll_to',
        generation: session.generation || 0,
        page: page ? { url: page.url, title: page.title, visibility: page.visibility } : null,
        data: {
          target: waited.value.target,
          align,
          before: waited.value.before,
          after: waited.value.after,
          target_viewport_rect: waited.value.target_viewport_rect,
          viewport: waited.value.viewport,
          visible: waited.value.visible,
          top_scroll_changed: waited.value.top_scroll_changed,
          wait: { attempts: waited.attempts, elapsed_ms: waited.elapsedMs },
        },
        error: null,
      })
    },
  })
}
