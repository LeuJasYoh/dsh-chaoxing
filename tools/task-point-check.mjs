import { collectTaskPointScan } from '../lib/tasks/collect.mjs'
import { analyzeTaskPointCount } from '../lib/tasks/count.mjs'
import { analyzeTaskPointCompletion } from '../lib/tasks/completion.mjs'
import { collectTaskPoints } from '../lib/observe/tasks.mjs'
import { sleep } from '../lib/scroll/readiness.mjs'
import { captureTasksToNotes } from '../lib/notes/capture.mjs'

function pointView(scan, jobId) {
  const inventory = analyzeTaskPointCount(scan)
  const completion = analyzeTaskPointCompletion(scan, { inventory })
  const point = completion.points.find((item) => String(item.jobId) === String(jobId))
  if (!point) return null
  return {
    job_id: point.jobId,
    kind: point.kind,
    title: point.title,
    state: point.state,
    signals: point.signals,
    conflict: point.conflict,
    chapter: completion.chapter,
    coverage: completion.coverage,
  }
}

export function registerTaskPointCheck(ctx, { output, toLossless, session, registry, notes }) {
  ctx.tools.register({
    name: 'task_point_check',
    description: [
      'Re-observe one task point without refreshing the page and report its current completion evidence.',
      'Reuses the existing task-point widgets and CDP DOM reads. Defaults to waiting up to 3000 ms for a change.',
      'It is read-only: it never clicks, plays, refreshes or submits. It does not turn an action into success; it only reports observed state.',
      'If the task point is not in the current content tab, returns TASK_POINT_NOT_FOUND instead of pretending it is incomplete.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        job_id: { type: 'string', description: 'Task point job_id to re-observe.' },
        wait_ms: { type: 'integer', minimum: 0, maximum: 10000, description: 'Maximum observation window. Defaults to 3000 ms.' },
      },
      required: ['job_id'],
    },
    output,
    async execute(args = {}, exec = {}) {
      const jobId = String(args.job_id == null ? '' : args.job_id).trim()
      const waitMs = Number.isInteger(args.wait_ms) ? Math.max(0, Math.min(10000, args.wait_ms)) : 3000
      if (!jobId) {
        return toLossless({ ok: false, tool: 'task_point_check', error: { code: 'INVALID_ARGUMENT', message: 'job_id is required' } })
      }
      try {
        await session.ensure()
        const started = Date.now()
        let initial = null
        let latest = null
        let attempts = 0
        while (true) {
          const scan = await collectTaskPointScan(session, { settle: false })
          attempts += 1
          latest = pointView(scan, jobId)
          if (!latest) {
            return toLossless({ ok: false, tool: 'task_point_check', job_id: jobId, error: { code: 'TASK_POINT_NOT_FOUND', message: 'task point is not in the current content tab', observed: { attempts, chapter: scan.chapter } } })
          }
          if (!initial) initial = latest
          // Completed is already evidence; don't burn the full window.
          if (latest.state === 'completed') break
          if (Date.now() - started >= waitMs) break
          if (waitMs === 0) break
          await sleep(250)
        }
        const generation = session.generation
        const tasks = await collectTaskPoints(session, registry)
        const captured = await captureTasksToNotes(notes, exec, tasks)
        return toLossless({
          ok: true,
          tool: 'task_point_check',
          job_id: jobId,
          found: true,
          initial: initial ? initial.state : null,
          state: latest.state,
          signals: latest.signals,
          conflict: latest.conflict,
          changed: initial.state !== latest.state || JSON.stringify(initial.signals) !== JSON.stringify(latest.signals),
          waited_ms: Date.now() - started,
          attempts,
          generation,
          chapter: latest.chapter,
          coverage: latest.coverage,
          note: captured ? { note_id: captured.note_id || null, revision: captured.revision || null, error: captured.error || null } : null,
          error: null,
        })
      } catch (error) {
        return toLossless({
          ok: false,
          tool: 'task_point_check',
          job_id: jobId,
          error: { code: error && error.code ? error.code : 'INTERNAL_ERROR', message: error && error.message ? error.message : String(error), observed: error && error.observed ? error.observed : {} },
        })
      }
    },
  })
}
