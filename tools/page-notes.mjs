import { applyPatches, summarizeNote } from '../lib/notes/model.mjs'
import { captureSnapshotToNotes, captureTasksToNotes } from '../lib/notes/capture.mjs'

function relativeFile(file) {
  const normalized = String(file || '').replace(/\\/g, '/')
  const marker = '/.notes/'
  const index = normalized.lastIndexOf(marker)
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

function noteError(error) {
  return {
    code: error && error.code ? error.code : 'NOTE_ERROR',
    message: error && error.message ? error.message : String(error),
  }
}

export function registerPageNotes(ctx, { output, toLossless, session, notes }) {
  ctx.tools.register({
    name: 'page_notes',
    description: [
      'Read and edit the structured page work-notes stored under the session workspace .notes directory.',
      'Notes are a compact work memory, not the page truth: observation always wins.',
      'Actions: get (read the current note, or note_id), list, capture (save the latest observation), patch (apply targeted edits with expected_revision).',
      'Only observation or a later task_point_check may update task state; the model can write plan, tab notes, task annotations, intent and needs_recheck.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['get', 'list', 'capture', 'patch'], description: 'Operation to perform.' },
        note_id: { type: 'string', description: 'Note id. For get/patch, omitted means the current note captured in this session.' },
        expected_revision: { type: 'integer', description: 'Patch precondition. If set, must equal the current note revision.' },
        patches: {
          type: 'array',
          description: 'Patch operations: set_plan, append_plan, set_tab_note, set_task_annotation, set_task_intent, mark_task_needs_recheck.',
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              op: { type: 'string' },
              value: { type: 'string' },
              tab_index: { type: 'integer' },
              job_id: { type: 'string' },
            },
            required: ['op'],
          },
        },
      },
      required: ['action'],
    },
    output,
    async execute(args = {}, exec = {}) {
      try {
        const action = String(args.action || '')
        if (action === 'list') {
          const ids = await notes.list(exec)
          return toLossless({ ok: true, tool: 'page_notes', action, note_ids: ids, count: ids.length, error: null })
        }

        if (action === 'capture') {
          const snapshot = notes.lastSnapshot(exec)
          const tasks = notes.lastTasks(exec)
          if (!snapshot && !tasks) {
            return toLossless({ ok: false, tool: 'page_notes', action, error: { code: 'NOTE_NO_OBSERVATION', message: 'no recent observation in this session' } })
          }
          const capturedSnapshot = snapshot ? await captureSnapshotToNotes(notes, exec, snapshot) : null
          const capturedTasks = tasks ? await captureTasksToNotes(notes, exec, tasks) : null
          const captured = capturedTasks || capturedSnapshot
          if (!captured || captured.error) {
            return toLossless({ ok: false, tool: 'page_notes', action, error: captured && captured.error ? captured.error : { code: 'NOTE_CAPTURE_FAILED', message: 'capture failed' } })
          }
          return toLossless({ ok: true, tool: 'page_notes', action, note_id: captured.note_id, revision: captured.revision, note_file: relativeFile(captured.file), data: captured.summary, error: null })
        }

        const noteId = args.note_id ? String(args.note_id) : notes.current(exec)
        if (!noteId) {
          return toLossless({ ok: false, tool: 'page_notes', action, error: { code: 'NOTE_NOT_FOUND', message: 'no current note; run page_snapshot or task_points first' } })
        }
        const { note, file } = await notes.read(exec, noteId)
        if (!note) {
          return toLossless({ ok: false, tool: 'page_notes', action, error: { code: 'NOTE_NOT_FOUND', message: 'note does not exist: ' + noteId } })
        }
        if (action === 'get') {
          return toLossless({ ok: true, tool: 'page_notes', action, note_id: noteId, note_file: relativeFile(file), data: summarizeNote(note), error: null })
        }
        if (action === 'patch') {
          const patches = Array.isArray(args.patches) ? args.patches : []
          try {
            const updated = applyPatches(note, args.expected_revision, patches)
            const written = await notes.write(exec, updated)
            notes.setCurrent(exec, noteId)
            return toLossless({ ok: true, tool: 'page_notes', action, note_id: noteId, revision: updated.revision, note_file: relativeFile(written.file), data: summarizeNote(updated), error: null })
          } catch (error) {
            return toLossless({ ok: false, tool: 'page_notes', action, note_id: noteId, error: noteError(error) })
          }
        }
        return toLossless({ ok: false, tool: 'page_notes', action, error: { code: 'INVALID_ARGUMENT', message: 'unknown action: ' + action } })
      } catch (error) {
        return toLossless({ ok: false, tool: 'page_notes', action: args.action || null, error: noteError(error) })
      }
    },
  })
}
