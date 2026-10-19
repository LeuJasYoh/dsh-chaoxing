import { scrollDocument } from '../lib/scroll/domain.mjs'

/**
 * Atomic scroll-domain tool.
 *
 * It scrolls the document of a frame and reports physical facts only.
 * It deliberately does not resolve PDFs, dispatch page-specific completion
 * events by default, or judge task completion.
 */
export function registerScrollDomain(ctx, { output, toLossless, session }) {
  ctx.tools.register({
    name: 'scroll_domain',
    description: [
      'Atomically scroll one frame document and report before/after positions.',
      'This tool knows nothing about PDFs or task business logic; pass a stable frame_id for the document that should move.',
      'Use to=top or to=bottom, or delta_y for a relative move. dispatch_scroll optionally dispatches a synthetic scroll event after changing position, for pages whose own logic listens for scroll.',
      'It does not find a PDF viewer, does not click, and does not decide whether the task is complete.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        frame_id: { type: 'string', description: 'Stable frame id whose document should be scrolled.' },
        to: { type: 'string', enum: ['top', 'bottom'], description: 'Absolute destination. Provide exactly one of to or delta_y.' },
        delta_y: { type: 'integer', description: 'Relative scroll amount in CSS pixels; positive moves down. Provide exactly one of to or delta_y.' },
        dispatch_scroll: { type: 'boolean', description: 'Dispatch a synthetic scroll event after setting the position. Defaults to false.' },
        settle_ms: { type: 'integer', minimum: 0, maximum: 5000, description: 'Wait before reading the after metrics. Defaults to 120.' },
        execution: { type: 'string', enum: ['background'], description: 'Only background is implemented in this slice.' },
      },
      required: ['frame_id'],
    },
    output,
    async execute(args = {}) {
      const frameId = String(args.frame_id == null ? '' : args.frame_id).trim()
      const to = args.to == null ? null : String(args.to)
      const deltaY = args.delta_y == null ? null : Number(args.delta_y)
      const dispatchScroll = args.dispatch_scroll === true
      const settleMs = Number.isInteger(args.settle_ms) ? Math.max(0, Math.min(5000, args.settle_ms)) : 120

      if (!frameId) {
        return toLossless({
          ok: false,
          tool: 'scroll_domain',
          generation: session.generation || 0,
          page: null,
          data: null,
          error: { code: 'INVALID_ARGUMENT', message: 'frame_id is required', observed: {} },
        })
      }
      if (args.execution && args.execution !== 'background') {
        return toLossless({
          ok: false,
          tool: 'scroll_domain',
          generation: session.generation || 0,
          page: null,
          data: null,
          error: {
            code: 'FOREGROUND_UNAVAILABLE',
            message: 'foreground execution is not implemented in this slice',
            hint: 'Use execution=background.',
            observed: { execution: args.execution },
          },
        })
      }
      if ((to && deltaY != null) || (!to && deltaY == null)) {
        return toLossless({
          ok: false,
          tool: 'scroll_domain',
          generation: session.generation || 0,
          page: null,
          data: null,
          error: { code: 'INVALID_ARGUMENT', message: 'provide exactly one of to or delta_y', observed: { to, delta_y: args.delta_y } },
        })
      }
      if (to && !['top', 'bottom'].includes(to)) {
        return toLossless({
          ok: false,
          tool: 'scroll_domain',
          generation: session.generation || 0,
          page: null,
          data: null,
          error: { code: 'INVALID_ARGUMENT', message: 'to must be top or bottom', observed: { to } },
        })
      }

      try {
        await session.ensure()
        const result = await scrollDocument(session, frameId, {
          to,
          delta_y: deltaY,
          dispatch_scroll: dispatchScroll,
          settleMs,
        })
        const page = await session.pageInfo().catch(() => null)
        return toLossless({
          ok: true,
          tool: 'scroll_domain',
          generation: session.generation || 0,
          page: page ? { url: page.url, title: page.title, visibility: page.visibility } : null,
          data: {
            frame_id: frameId,
            url: result.url,
            title: result.title,
            execution: 'background',
            method: 'dom',
            trusted: false,
            fronted: false,
            to: result.to,
            delta_y: result.delta_y,
            dispatch_scroll: result.dispatch_scroll,
            before: result.before,
            after: result.after,
            moved: result.moved,
            at_top: result.at_top,
            at_bottom: result.at_bottom,
            bottom_gap: result.bottom_gap,
          },
          error: null,
        })
      } catch (error) {
        return toLossless({
          ok: false,
          tool: 'scroll_domain',
          generation: session.generation || 0,
          page: null,
          data: null,
          error: {
            code: error && error.code ? error.code : 'INTERNAL_ERROR',
            message: error && error.message ? error.message : String(error),
            observed: error && error.observed ? error.observed : {},
          },
        })
      }
    },
  })
}
