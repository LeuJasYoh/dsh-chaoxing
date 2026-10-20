import { collectPageSnapshot } from '../lib/observe/page.mjs'

export function registerPageSnapshot(ctx, { output, toLossless, session, registry }) {
  ctx.tools.register({
    name: 'page_snapshot',
    description: [
      'Read the current Chaoxing study page structure without changing it.',
      'Returns the page identity, content tabs, meaningful frames, scroll domains, generation and coverage.',
      'This tool is read-only and can be called independently; it never switches tabs, clicks, scrolls or submits.',
      'Content tabs here mean the task-content tabs (video/quiz/document), not the right sidebar catalog tabs.',
      'Use task_points to inspect the current tab task points and PDF mappings.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    output,
    async execute() {
      try {
        const snapshot = await collectPageSnapshot(session, registry)
        return toLossless({
          ok: true,
          tool: 'page_snapshot',
          ...snapshot,
          error: null,
        })
      } catch (error) {
        const observed = error && error.observed ? error.observed : {}
        return toLossless({
          ok: false,
          tool: 'page_snapshot',
          generation: session.generation || 0,
          page: null,
          data: null,
          error: {
            code: error && error.code ? error.code : 'INTERNAL_ERROR',
            message: error && error.message ? error.message : String(error),
            observed,
          },
        })
      }
    },
  })
}
