import { collectTaskPoints } from '../lib/observe/tasks.mjs'

export function registerTaskPoints(ctx, { output, toLossless, session, registry }) {
  ctx.tools.register({
    name: 'task_points',
    description: [
      'Read task points in the current Chaoxing content tab without changing it.',
      'Returns job_id, kind, title, completion state, module frame, wrapper element handle, PDF documents and coverage.',
      'Callable independently; no prior page_snapshot is required.',
      'Only the current content tab is observed. It never switches tabs, clicks, plays media or submits.',
      'If multiple content tabs exist but the active tab cannot be determined, returns error code TAB_UNRESOLVED.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    output,
    async execute() {
      try {
        const result = await collectTaskPoints(session, registry)
        return toLossless({
          ok: true,
          tool: 'task_points',
          ...result,
          error: null,
        })
      } catch (error) {
        const observed = error && error.observed ? error.observed : {}
        return toLossless({
          ok: false,
          tool: 'task_points',
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
