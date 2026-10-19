/**
 * Internal widget: analyse the number of task points in the current tab/page.
 *
 * Input is a scan produced by collectTaskPointScan().
 * This module does not read the page, click anything, switch tabs or load media.
 */

function pointKey(fact) {
  if (fact && fact.jobId) return 'job:' + fact.jobId
  if (fact && fact.key) return fact.key
  return 'tp:' + (fact && Number.isInteger(fact.order) ? fact.order : 0)
}

export function analyzeTaskPointCount(scan) {
  const facts = scan && Array.isArray(scan.points) ? scan.points : []
  const seen = new Set()
  const points = []
  let duplicateCount = 0

  for (const fact of facts) {
    if (!fact || fact.hasJobIcon === false) continue
    const key = pointKey(fact)
    if (seen.has(key)) { duplicateCount += 1; continue }
    seen.add(key)
    points.push({
      key,
      jobId: fact.jobId || null,
      kind: fact.kind || 'unknown',
      title: fact.title || null,
      frameId: fact.frameId || (scan.frame && scan.frame.frame_id) || null,
      domId: fact.domId || null,
      order: Number.isInteger(fact.order) ? fact.order : null,
    })
  }

  return {
    total: points.length,
    points,
    coverage: scan && scan.coverage ? scan.coverage : points.length ? 'complete' : 'pending',
    pendingCount: 0,
    duplicateCount,
    ignoredContainers: scan && Number.isInteger(scan.ignored_containers) ? scan.ignored_containers : 0,
    source: 'module_containers',
    frameId: scan && scan.frame ? scan.frame.frame_id || null : null,
    activeTab: scan && scan.active_tab ? scan.active_tab : null,
  }
}
