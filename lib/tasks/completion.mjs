/**
 * Internal widget: analyse completion state of task points in the current tab/page.
 *
 * Input is a scan produced by collectTaskPointScan(), optionally plus an inventory
 * produced by analyzeTaskPointCount().
 *
 * Facts only. It never clicks, submits, switches tabs or treats an action as success.
 */
import { analyzeTaskPointCount } from './count.mjs'

const ARIA_COMPLETED = '任务点已完成'
const ARIA_INCOMPLETE = '任务点未完成'

function sameCount(value) {
  return Number.isInteger(value) ? value : null
}

function chapterSummary(chapter, observedIncomplete, observedUnknown, scanCoverage) {
  const unfinishCount = chapter ? sameCount(chapter.unfinishCount) : null
  let state = 'unknown'
  if (chapter) {
    if (chapter.completed === true) state = 'completed'
    else if (unfinishCount !== null && unfinishCount > 0) state = 'incomplete'
  }

  let consistent = null
  let unobservedIncomplete = null
  if (chapter) {
    if (unfinishCount !== null) {
      if (chapter.completed === true && observedIncomplete > 0) {
        consistent = false
        unobservedIncomplete = 0
      } else if (unfinishCount === observedIncomplete) {
        consistent = true
        unobservedIncomplete = 0
      } else if (unfinishCount > observedIncomplete) {
        consistent = null
        unobservedIncomplete = unfinishCount - observedIncomplete
      } else {
        consistent = false
        unobservedIncomplete = 0
      }
    } else if (chapter.completed === true) {
      consistent = observedIncomplete === 0 ? true : false
      unobservedIncomplete = 0
    }
  }

  if (observedUnknown > 0 && consistent === true) consistent = null

  let coverage = scanCoverage || 'complete'
  if (unobservedIncomplete !== null && unobservedIncomplete > 0 && coverage !== 'pending') coverage = 'partial'

  return {
    chapter: {
      unfinishCount,
      state,
      consistent,
    },
    coverage,
    unobservedIncomplete,
  }
}

function judgePoint(fact) {
  const signals = []
  let state = 'unknown'
  let conflict = false

  if (fact.wrapperFinished) {
    state = 'completed'
    signals.push('ans-job-finished')
    if (fact.iconAria === ARIA_COMPLETED) signals.push('aria:任务点已完成')
    if (fact.iconAria === ARIA_INCOMPLETE) {
      conflict = true
      signals.push('aria:任务点未完成')
    }
  } else if (fact.iconAria === ARIA_INCOMPLETE) {
    state = 'incomplete'
    signals.push('aria:任务点未完成', 'no_ans_job_finished')
  } else if (!fact.hasJobIcon) {
    signals.push('no_job_icon')
  } else if (!fact.iframeLoaded) {
    signals.push('iframe_unloaded')
  } else {
    signals.push('no_completion_signal')
  }

  return { state, signals, conflict }
}

export function analyzeTaskPointCompletion(scan, options = {}) {
  const inventory = options.inventory || analyzeTaskPointCount(scan)
  const facts = scan && Array.isArray(scan.points) ? scan.points : []
  const factsByKey = new Map()
  for (const fact of facts) {
    const key = fact && fact.jobId ? 'job:' + fact.jobId : fact && fact.key ? fact.key : null
    if (key && !factsByKey.has(key)) factsByKey.set(key, fact)
  }

  const points = []
  const summary = { completed: 0, incomplete: 0, unknown: 0, conflicts: 0 }
  for (const point of inventory.points) {
    const fact = factsByKey.get(point.key) || { hasJobIcon: true, iframeLoaded: true, wrapperFinished: false, iconAria: null }
    const judged = judgePoint(fact)
    if (judged.state === 'completed') summary.completed += 1
    else if (judged.state === 'incomplete') summary.incomplete += 1
    else summary.unknown += 1
    if (judged.conflict) summary.conflicts += 1
    points.push({
      key: point.key,
      jobId: point.jobId,
      kind: point.kind,
      title: point.title,
      state: judged.state,
      signals: judged.signals,
      conflict: judged.conflict,
    })
  }

  const chapterInfo = chapterSummary(scan && scan.chapter ? scan.chapter : null, summary.incomplete, summary.unknown, scan && scan.coverage)
  return {
    points,
    summary,
    chapter: chapterInfo.chapter,
    coverage: chapterInfo.coverage,
    unobservedIncomplete: chapterInfo.unobservedIncomplete,
    inventory: { total: inventory.total, coverage: inventory.coverage },
  }
}
