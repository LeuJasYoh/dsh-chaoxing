import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NoteStore, noteIdFromPage, notePath } from '../lib/notes/store.mjs'
import { applyPatches, captureSnapshot, captureTasks, createNote, summarizeNote } from '../lib/notes/model.mjs'
import { captureTasksToNotes } from '../lib/notes/capture.mjs'

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

const baseline = applyPatches(structuredClone(note), note.revision, [
  { op: 'set_task_intent', job_id: 'job-a', value: '稍后复核' },
  { op: 'set_tab_note', tab_index: 1, value: '保留标签备注' },
])
const completeTasks = {
  page: { ...page, ready_state: 'complete' },
  generation: 2,
  tab: { index: 1, title: '视频', active: true },
  coverage: 'complete',
  truncated: false,
  task_points: [
    { job_id: 'job-a', kind: 'video', title: '视频 A', state: 'incomplete', signals: ['aria:任务点未完成'], frame_id: 'frame-new' },
  ],
}

for (const observation of [
  { coverage: 'pending' },
  { coverage: 'partial' },
  { coverage: 'complete', truncated: true },
  { coverage: 'complete', page: { ...page, ready_state: 'loading' } },
]) {
  const captured = captureTasks(structuredClone(baseline), { ...completeTasks, ...observation, task_points: [] }, noteId)
  const retained = captured.tabs[0].task_points[0]
  assert.equal(captured.tabs[0].task_points.length, 1, '不完整的空观察不能删除旧任务')
  assert.equal(retained.annotation, '已完成，但需要复核')
  assert.equal(retained.intent, '稍后复核')
  assert.equal(retained.needs_recheck, true)
  assert.equal(retained.state, 'completed')
  assert.equal(retained.observed_generation, 1, '未重新观察的任务应保留原观察代次')
  assert.equal(retained.stale, true, '保留的旧任务必须标记为待重新观察')
  assert.equal(summarizeNote(captured).tabs[0].task_points[0].stale, true)
  assert.equal(captured.tabs[0].note, '保留标签备注')
  assert.deepEqual(captured.plan, baseline.plan)
  assert.equal(captured.revision, baseline.revision + 1)

  captureSnapshot(captured, {
    page: completeTasks.page,
    generation: 2,
    tabs: { items: [{ index: 1, title: '视频', active: true, loaded: true }] },
  }, noteId)
  assert.equal(summarizeNote(captured).tabs[0].task_points[0].stale, true, '仅刷新页面快照不能把保留的任务伪装成新观察')

  const recovered = captureTasks(captured, completeTasks, noteId)
  const refreshed = recovered.tabs[0].task_points[0]
  assert.equal(refreshed.state, 'incomplete', '完整观察应更新实际任务状态')
  assert.equal(refreshed.frame_id, 'frame-new')
  assert.equal(refreshed.observed_generation, 2)
  assert.equal(refreshed.stale, false)
  assert.equal(refreshed.annotation, retained.annotation)
  assert.equal(refreshed.intent, retained.intent)
  assert.equal(refreshed.needs_recheck, true)
}

const withTwoTasks = captureTasks(structuredClone(baseline), {
  ...completeTasks,
  task_points: [...completeTasks.task_points, { job_id: 'job-b', kind: 'video', state: 'incomplete' }],
}, noteId)
applyPatches(withTwoTasks, withTwoTasks.revision, [
  { op: 'set_task_annotation', job_id: 'job-b', value: '保留 B 的备注' },
])
const partialTasks = {
  ...completeTasks,
  coverage: 'partial',
  task_points: [
    { job_id: 'job-b', kind: 'video', state: 'completed', signals: ['ans-job-finished'] },
    { job_id: 'job-c', kind: 'work', state: 'incomplete' },
  ],
}
for (const coverage of ['pending', 'partial']) {
  const merged = captureTasks(structuredClone(withTwoTasks), { ...partialTasks, coverage }, noteId)
  assert.deepEqual(merged.tabs[0].task_points.map((task) => task.job_id), ['job-a', 'job-b', 'job-c'])
  const [a, b, c] = merged.tabs[0].task_points
  assert.equal(a.annotation, '已完成，但需要复核')
  assert.equal(a.stale, true)
  assert.equal(b.state, 'completed')
  assert.equal(b.annotation, '保留 B 的备注')
  assert.equal(b.stale, false)
  assert.equal(c.state, 'incomplete')
  assert.equal(c.stale, false)
  assert.deepEqual(merged.tabs[1], withTwoTasks.tabs[1], '不应修改其他标签的笔记')
  const repeated = captureTasks(merged, { ...partialTasks, coverage }, noteId)
  assert.deepEqual(repeated.tabs[0].task_points.map((task) => task.job_id), ['job-a', 'job-b', 'job-c'], '重复部分观察不应累加重复任务')
}

const authoritative = captureTasks(structuredClone(withTwoTasks), {
  ...partialTasks,
  coverage: 'complete',
}, noteId)
assert.deepEqual(authoritative.tabs[0].task_points.map((task) => task.job_id), ['job-b', 'job-c'], '完整观察可以移除已不存在的任务')
const empty = captureTasks(authoritative, { ...completeTasks, task_points: [] }, noteId)
assert.deepEqual(empty.tabs[0].task_points, [], '完整空观察应正常清空任务清单')
assert.equal(empty.tabs[0].observed, true)
assert.equal(empty.tabs[0].note, '保留标签备注')

for (const coverage of ['pending', 'partial']) {
  const unseen = captureTasks(null, { ...completeTasks, coverage, task_points: [] }, noteId)
  assert.equal(unseen.tabs[0].observed, false, '首次不完整空观察不能伪装成已观察到空清单')
  assert.equal(unseen.tabs[0].task_points, null)
}

await store.write(exec, baseline)
const savedPending = await captureTasksToNotes(store, exec, { ...completeTasks, coverage: 'pending', task_points: [] })
assert.equal(savedPending.error, undefined)
assert.equal(savedPending.revision, baseline.revision + 1)
assert.equal(savedPending.summary.tabs[0].task_points[0].stale, true)
const pendingDisk = (await store.read(exec, noteId)).note
assert.equal(pendingDisk.tabs[0].task_points[0].annotation, '已完成，但需要复核')
assert.equal(pendingDisk.tabs[0].task_points[0].intent, '稍后复核')
assert.equal(pendingDisk.tabs[0].task_points[0].needs_recheck, true)
assert.equal(pendingDisk.tabs[0].task_points[0].stale, true)
const savedRecovery = await captureTasksToNotes(store, exec, completeTasks)
assert.equal(savedRecovery.error, undefined)
assert.equal(savedRecovery.revision, savedPending.revision + 1)
const recoveredDisk = (await store.read(exec, noteId)).note
assert.equal(recoveredDisk.tabs[0].task_points[0].annotation, '已完成，但需要复核')
assert.equal(recoveredDisk.tabs[0].task_points[0].state, 'incomplete')
assert.equal(recoveredDisk.tabs[0].task_points[0].stale, false)

await rm(workspace, { recursive: true, force: true })
console.log('✓ 工作区笔记存储与增量编辑测试通过')
