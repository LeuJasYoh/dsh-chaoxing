import { mkdir, readFile, rename, rm, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const NOTES_DIR = '.notes'

export function sanitizeSegment(value) {
  return String(value == null ? '' : value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120)
}

export function noteIdFromPage(page = {}) {
  const url = String(page.url || '')
  try {
    const parsed = new URL(url)
    const courseId = parsed.searchParams.get('courseId') || parsed.searchParams.get('courseid')
    const chapterId = parsed.searchParams.get('chapterId') || parsed.searchParams.get('chapterid')
    if (courseId && chapterId) return 'course-' + sanitizeSegment(courseId) + '-chapter-' + sanitizeSegment(chapterId)
    if (courseId) return 'course-' + sanitizeSegment(courseId)
  } catch {}
  const digest = createHash('sha1').update(url).digest('hex').slice(0, 12)
  return 'page-' + digest
}

export function notesRoot(workspaceRoot) {
  return join(workspaceRoot, NOTES_DIR)
}

export function notePath(workspaceRoot, noteId) {
  return join(notesRoot(workspaceRoot), sanitizeSegment(noteId) + '.json')
}

export async function resolveWorkspaceRoot(ctx, exec) {
  if (!ctx || !ctx.workingDirectory || typeof ctx.workingDirectory.ensure !== 'function') {
    throw new Error('workingDirectory service is unavailable')
  }
  if (!exec || !exec.agent) throw new Error('tool execution has no agent context')
  const root = await ctx.workingDirectory.ensure(exec.agent, exec.signal)
  if (!root) throw new Error('workingDirectory returned no path')
  return root
}

export class NoteStore {
  constructor(ctx) {
    this.ctx = ctx
    this.currentByAgent = new Map()
    this.lastSnapshotByAgent = new Map()
    this.lastTasksByAgent = new Map()
  }

  agentKey(exec) {
    const id = exec && exec.agent && exec.agent.session && exec.agent.session.id
    return id || 'default'
  }

  async root(exec) {
    return resolveWorkspaceRoot(this.ctx, exec)
  }

  async read(exec, noteId) {
    const workspaceRoot = await this.root(exec)
    const file = notePath(workspaceRoot, noteId)
    try {
      return { note: JSON.parse(await readFile(file, 'utf8')), file, workspaceRoot }
    } catch (error) {
      if (error && error.code === 'ENOENT') return { note: null, file, workspaceRoot }
      throw error
    }
  }

  async write(exec, note) {
    const workspaceRoot = await this.root(exec)
    const file = notePath(workspaceRoot, note.note_id)
    await mkdir(notesRoot(workspaceRoot), { recursive: true })
    const temp = file + '.tmp-' + process.pid + '-' + Date.now()
    await writeFile(temp, JSON.stringify(note, null, 2) + '\n', 'utf8')
    try {
      await rename(temp, file)
    } catch {
      await rm(file, { force: true })
      await rename(temp, file)
    }
    return { file, workspaceRoot }
  }

  async list(exec) {
    const workspaceRoot = await this.root(exec)
    const root = notesRoot(workspaceRoot)
    await mkdir(root, { recursive: true })
    const names = await readdir(root)
    return names.filter((name) => name.endsWith('.json')).map((name) => name.replace(/\.json$/, '')).sort()
  }

  current(exec) {
    return this.currentByAgent.get(this.agentKey(exec)) || null
  }

  setCurrent(exec, noteId) {
    this.currentByAgent.set(this.agentKey(exec), noteId)
  }

  rememberSnapshot(exec, snapshot) {
    this.lastSnapshotByAgent.set(this.agentKey(exec), snapshot)
  }

  rememberTasks(exec, tasks) {
    this.lastTasksByAgent.set(this.agentKey(exec), tasks)
  }

  lastSnapshot(exec) {
    return this.lastSnapshotByAgent.get(this.agentKey(exec)) || null
  }

  lastTasks(exec) {
    return this.lastTasksByAgent.get(this.agentKey(exec)) || null
  }
}
