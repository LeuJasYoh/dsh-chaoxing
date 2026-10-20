import { noteIdFromPage } from './store.mjs'
import { captureSnapshot, captureTasks, summarizeNote } from './model.mjs'

function errorInfo(error) {
  return {
    code: error && error.code ? error.code : 'NOTE_ERROR',
    message: error && error.message ? error.message : String(error),
  }
}

async function readOrCreate(notes, exec, page) {
  const noteId = noteIdFromPage(page)
  const { note } = await notes.read(exec, noteId)
  return { noteId, note }
}

export async function captureSnapshotToNotes(notes, exec, snapshot) {
  if (!notes || !snapshot) return null
  try {
    const { noteId, note } = await readOrCreate(notes, exec, snapshot.page || {})
    const next = captureSnapshot(note, snapshot, noteId)
    const { file } = await notes.write(exec, next)
    notes.setCurrent(exec, noteId)
    notes.rememberSnapshot(exec, snapshot)
    return { note_id: noteId, revision: next.revision, file: file.replace(/\\/g, '/'), summary: summarizeNote(next) }
  } catch (error) {
    return { error: errorInfo(error) }
  }
}

export async function captureTasksToNotes(notes, exec, tasks) {
  if (!notes || !tasks) return null
  try {
    const page = tasks.page || {}
    const { noteId, note } = await readOrCreate(notes, exec, page)
    const next = captureTasks(note, tasks, noteId)
    const { file } = await notes.write(exec, next)
    notes.setCurrent(exec, noteId)
    notes.rememberTasks(exec, tasks)
    return { note_id: noteId, revision: next.revision, file: file.replace(/\\/g, '/'), summary: summarizeNote(next) }
  } catch (error) {
    return { error: errorInfo(error) }
  }
}
