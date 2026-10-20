import { collectPageSnapshot } from '../lib/observe/page.mjs'
import { captureSnapshotToNotes } from '../lib/notes/capture.mjs'

export function registerPageSnapshot(ctx, { output, toLossless, session, registry, notes }) {
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
    async execute(args = {}, exec = {}) {
      try {
        const snapshot = await collectPageSnapshot(session, registry)
        const captured = await captureSnapshotToNotes(notes, exec, snapshot)
        const note = captured ? { note_id: captured.note_id || null, revision: captured.revision || null, note_file: captured.file ? String(captured.file).replace(/\\/g, '/').split('/.notes/').pop() : null, error: captured.error || null } : null
        return toLossless({
          ok: true,
          tool: 'page_snapshot',
          ...snapshot,
          note,
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
