import assert from 'node:assert/strict'
import { analyzeTaskPointCount } from '../lib/tasks/count.mjs'
import { analyzeTaskPointCompletion } from '../lib/tasks/completion.mjs'

function fact(jobId, options = {}) {
  return {
    key: 'job:' + jobId,
    jobId,
    kind: options.kind || 'video',
    title: options.title || null,
    frameId: 'frame-1',
    wrapperFinished: options.finished === true,
    iconAria: options.aria === undefined ? null : options.aria,
    hasJobIcon: true,
    iframeLoaded: options.iframeLoaded !== false,
    visible: true,
    order: options.order || 0,
  }
}

function scan(points, chapter, coverage = 'complete') {
  return {
    points,
    chapter: chapter || null,
    coverage,
    frame: { frame_id: 'frame-1', url: 'https://example.test/knowledge/cards' },
    ignored_containers: 0,
    active_tab: null,
  }
}

const chapter = (unfinishCount, completed) => ({ chapterId: '425590906', title: '商函', unfinishCount, completed })

// 1. All modules loaded; 7 completed task points with stale aria on some videos.
const full = scan([
  fact('pdf-1', { kind: 'pdf', finished: true, aria: null }),
  fact('video-1', { kind: 'video', finished: true, aria: '任务点已完成' }),
  fact('video-2', { kind: 'video', finished: true, aria: '任务点未完成' }),
  fact('video-3', { kind: 'video', finished: true, aria: '任务点未完成' }),
  fact('video-4', { kind: 'video', finished: true, aria: '任务点未完成' }),
  fact('video-5', { kind: 'video', finished: true, aria: '任务点未完成' }),
  fact('pdf-2', { kind: 'pdf', finished: true, aria: null }),
], chapter(0, true))

const fullCount = analyzeTaskPointCount(full)
assert.equal(fullCount.total, 7)
assert.equal(fullCount.coverage, 'complete')
assert.equal(fullCount.duplicateCount, 0)

const fullCompletion = analyzeTaskPointCompletion(full, { inventory: fullCount })
assert.equal(fullCompletion.summary.completed, 7)
assert.equal(fullCompletion.summary.incomplete, 0)
assert.equal(fullCompletion.summary.unknown, 0)
assert.equal(fullCompletion.summary.conflicts, 4)
assert.equal(fullCompletion.chapter.unfinishCount, 0)
assert.equal(fullCompletion.chapter.state, 'completed')
assert.equal(fullCompletion.chapter.consistent, true)
assert.equal(fullCompletion.coverage, 'complete')
assert.equal(fullCompletion.unobservedIncomplete, 0)

// 2. Lazy page: only the completed quiz module is loaded; chapter says one unfinished task remains.
const lazy = scan([
  fact('work-quiz', { kind: 'work', finished: true, aria: '任务点已完成', title: '4.4 章节测验' }),
], chapter(1, false))
const lazyCount = analyzeTaskPointCount(lazy)
assert.equal(lazyCount.total, 1)
const lazyCompletion = analyzeTaskPointCompletion(lazy, { inventory: lazyCount })
assert.equal(lazyCompletion.summary.completed, 1)
assert.equal(lazyCompletion.summary.incomplete, 0)
assert.equal(lazyCompletion.chapter.state, 'incomplete')
assert.equal(lazyCompletion.chapter.consistent, null)
assert.equal(lazyCompletion.coverage, 'partial')
assert.equal(lazyCompletion.unobservedIncomplete, 1)

// 3. Unsubmitted quiz: no finished class, aria says unfinished.
const pending = scan([
  fact('work-pending', { kind: 'work', finished: false, aria: '任务点未完成' }),
], chapter(1, false))
const pendingCompletion = analyzeTaskPointCompletion(pending, { inventory: analyzeTaskPointCount(pending) })
assert.equal(pendingCompletion.summary.incomplete, 1)
assert.equal(pendingCompletion.chapter.state, 'incomplete')
assert.equal(pendingCompletion.chapter.consistent, true)
assert.equal(pendingCompletion.coverage, 'complete')
assert.equal(pendingCompletion.unobservedIncomplete, 0)

// 4. Unknown state: iframe exists but no completion signal at all.
const unknown = scan([fact('unknown-1', { finished: false, aria: null })], chapter(0, true))
const unknownCompletion = analyzeTaskPointCompletion(unknown, { inventory: analyzeTaskPointCount(unknown) })
assert.equal(unknownCompletion.summary.unknown, 1)
assert.equal(unknownCompletion.chapter.consistent, null)

// 5. Duplicate jobId / duplicate DOM clones are counted once.
const duplicate = scan([
  fact('same-job', { finished: true }),
  fact('same-job', { finished: true }),
], chapter(0, true))
const duplicateCount = analyzeTaskPointCount(duplicate)
assert.equal(duplicateCount.total, 1)
assert.equal(duplicateCount.duplicateCount, 1)

// 6. Pending/empty scan is not reported as a false complete.
const empty = scan([], null, 'pending')
const emptyCount = analyzeTaskPointCount(empty)
const emptyCompletion = analyzeTaskPointCompletion(empty, { inventory: emptyCount })
assert.equal(emptyCount.total, 0)
assert.equal(emptyCount.coverage, 'pending')
assert.equal(emptyCompletion.coverage, 'pending')
assert.equal(emptyCompletion.chapter.state, 'unknown')
assert.equal(emptyCompletion.chapter.consistent, null)
assert.equal(emptyCompletion.unobservedIncomplete, null)

// 6b. Nothing loaded yet, but chapter says unfinished -> stays pending, not partial.
const emptyButUnfinished = scan([], chapter(2, false), 'pending')
const emptyButUnfinishedCompletion = analyzeTaskPointCompletion(emptyButUnfinished, { inventory: analyzeTaskPointCount(emptyButUnfinished) })
assert.equal(emptyButUnfinishedCompletion.coverage, 'pending')
assert.equal(emptyButUnfinishedCompletion.chapter.state, 'incomplete')
assert.equal(emptyButUnfinishedCompletion.unobservedIncomplete, 2)

// 7. A completed chapter that still has an observed incomplete task is a conflict.
const conflictChapter = scan([
  fact('work-1', { finished: false, aria: '任务点未完成' }),
], chapter(0, true))
const conflictCompletion = analyzeTaskPointCompletion(conflictChapter, { inventory: analyzeTaskPointCount(conflictChapter) })
assert.equal(conflictCompletion.chapter.consistent, false)
assert.equal(conflictCompletion.chapter.state, 'completed')

// 8. Chapter count larger than observed incomplete -> partial, not complete.
const moreUnfinished = scan([
  fact('work-1', { finished: false, aria: '任务点未完成' }),
], chapter(2, false))
const moreCompletion = analyzeTaskPointCompletion(moreUnfinished, { inventory: analyzeTaskPointCount(moreUnfinished) })
assert.equal(moreCompletion.summary.incomplete, 1)
assert.equal(moreCompletion.unobservedIncomplete, 1)
assert.equal(moreCompletion.coverage, 'partial')
assert.equal(moreCompletion.chapter.state, 'incomplete')

console.log('✓ 任务点内部小部件测试通过')
