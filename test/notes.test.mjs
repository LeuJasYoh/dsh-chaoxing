import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NoteStore, noteIdFromPage, notePath } from '../lib/notes/store.mjs'
import { applyPatches, captureSnapshot, captureTasks, createNote, summarizeNote } from '../lib/notes/model.mjs'

const workspace = await mkdtemp(join(tmpdir(), 'dsh-notes-test-'))
const ctx = { workingDirectory: { async ensure() { return workspace } } }
const store = new NoteStore(ctx)
const exec = { agent: { session: { id: 'test-session' } }, signal: new AbortController().signal }
const page = {
  url: 'https://mooc1.chaoxing.com/mycourse/studentstudy?courseId=217785077&chapterId=425590906&enc=secret',
  title: '学生学习页面',
  generation: 1,
}
const noteId = noteIdFromPage(page)
assert.equal(noteId, 'course-217785077-chapter-425590906')
const file = notePath(workspace, noteId)
assert.ok(file.includes('.notes'))
assert.ok(!file.includes('dsh-xuexi-next'))
assert.ok(!file.includes('secret'))

let note = createNote(noteId, page)
note = captureSnapshot(note, {
  page: { title: page.title, visibility: 'hidden', ready_state: 'complete' },
  generation: 1,
  tabs: { items: [
    { index: 1, title: '视频', active: true, loaded: true },
    { index: 2, title: '章节测验', active: false, loaded: false },
  ] },
}, noteId)
note = captureTasks(note, {
  page: { title: page.title, visibility: 'hidden', ready_state: 'complete' },
  generation: 1,
  tab: { index: 1, title: '视频', active: true },
  chapter: { title: '商函' },
  task_points: [
    { job_id: 'job-a', kind: 'video', title: '视频 A', state: 'completed', signals: ['ans-job-finished'], conflict: false, frame_id: 'frame-a' },
  ],
}, noteId)
assert.equal(note.tabs[1].observed, false)
assert.equal(note.tabs[1].task_points, null)
assert.equal(note.tabs[0].task_points.length, 1)
assert.equal(note.tabs[0].task_points[0].annotation, null)

const revision = note.revision
note = applyPatches(note, revision, [
  { op: 'set_plan', value: ['处理视频 A', '再切章节测验'] },
  { op: 'set_task_annotation', job_id: 'job-a', value: '已完成，但需要复核' },
  { op: 'mark_task_needs_recheck', job_id: 'job-a' },
])
assert.equal(note.tabs[0].task_points[0].annotation, '已完成，但需要复核')
assert.equal(note.tabs[0].task_points[0].needs_recheck, true)
assert.equal(note.plan.length, 2)

await store.write(exec, note)
const read = await store.read(exec, noteId)
assert.equal(read.note.revision, note.revision)
const disk = JSON.parse(await readFile(file, 'utf8'))
assert.equal(disk.tabs[0].task_points[0].annotation, '已完成，但需要复核')
assert.equal(disk.scope.course_id, '217785077')
assert.equal(disk.scope.chapter_id, '425590906')
assert.ok(!JSON.stringify(disk).includes('enc='))

const afterRevision = note.revision
assert.throws(
  () => applyPatches(note, afterRevision, [{ op: 'set_task_state', job_id: 'job-a', value: 'completed' }]),
  /observation-owned/
)
assert.throws(
  () => applyPatches(note, afterRevision - 1, [{ op: 'set_plan', value: ['x'] }]),
  /revision mismatch/
)
const summary = summarizeNote(note)
assert.equal(summary.tabs[0].task_points[0].needs_recheck, true)
assert.equal(summary.tabs[1].task_points, null)

await rm(workspace, { recursive: true, force: true })
console.log('✓ 工作区笔记存储与增量编辑测试通过')
