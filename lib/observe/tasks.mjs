import { CdpError } from '../cdp/session.mjs'
import { collectTaskPointScan } from '../tasks/collect.mjs'
import { analyzeTaskPointCount } from '../tasks/count.mjs'
import { analyzeTaskPointCompletion } from '../tasks/completion.mjs'
import { resolvePdfTarget } from '../scroll/document.mjs'
import { readDocumentMetrics } from '../scroll/domain.mjs'
import { collectContentTabs, collectFrameFacts } from './page.mjs'

function compactTabs(tabs) {
  return {
    items: tabs.items.map((item) => ({
      index: item.index,
      title: item.title,
      active: item.active,
      loaded: item.loaded,
    })),
    active_index: tabs.active_index,
    coverage: tabs.coverage,
  }
}

async function collectDocuments(session, registry, points, partialState) {
  const documents = []
  for (const point of points) {
    if (point.kind !== 'pdf') continue
    try {
      const resolved = await resolvePdfTarget(session, point.job_id)
      let metrics = null
      try { metrics = await readDocumentMetrics(session, resolved.pan_frame_id) } catch { partialState.partial = true }
      documents.push({
        job_id: point.job_id,
        objectid: point.objectid,
        module_frame_id: resolved.module_frame_id,
        pan_frame_id: resolved.pan_frame_id,
        loaded: true,
        scroll_domain: metrics ? registry.domainRef(session, resolved.pan_frame_id, 'document', 'document') : null,
        scroll_top: metrics ? metrics.scroll_top : null,
        max_scroll: metrics ? metrics.max_scroll : null,
        at_top: metrics ? metrics.at_top : null,
        at_bottom: metrics ? metrics.at_bottom : null,
        error: null,
      })
    } catch (error) {
      partialState.partial = true
      documents.push({
        job_id: point.job_id,
        objectid: point.objectid,
        module_frame_id: null,
        pan_frame_id: null,
        loaded: false,
        scroll_domain: null,
        error: {
          code: error && error.code ? error.code : 'DOCUMENT_NOT_FOUND',
          message: error && error.message ? error.message : String(error),
        },
      })
    }
  }
  return documents
}

export async function collectTaskPoints(session, registry) {
  await session.ensure()
  registry.sync(session)
  const page = await session.pageInfo()
  const tabs = await collectContentTabs(session)
  if (tabs.unresolved) {
    throw new CdpError('TAB_UNRESOLVED', 'multiple content tabs exist but the active tab could not be determined', {
      tabs: tabs.items,
      active_index: tabs.active_index,
    })
  }

  const frames = await collectFrameFacts(session)
  const scan = await collectTaskPointScan(session, { settle: false, activeTab: tabs.active_index })
  const inventory = analyzeTaskPointCount(scan)
  const completion = analyzeTaskPointCompletion(scan, { inventory })
  const completionByKey = new Map(completion.points.map((point) => [point.key, point]))
  const knowledgeFrame = frames.frames.find((frame) => frame.kind === 'knowledge')
  const wrapperFrameId = (scan.frame && scan.frame.frame_id) || (knowledgeFrame && knowledgeFrame.frame_id) || null
  const wrapperFrameEpoch = wrapperFrameId ? session.frameEpoch(wrapperFrameId) : null

  const taskPoints = inventory.points.map((point) => {
    const state = completionByKey.get(point.key) || { state: 'unknown', signals: ['no_completion_signal'], conflict: false }
    const moduleFrame = frames.ownerMap.byJobId.get(String(point.jobId)) || null
    const moduleFrameId = moduleFrame ? moduleFrame.frame_id : point.frameId
    return {
      job_id: point.jobId,
      objectid: null,
      kind: point.kind,
      title: point.title,
      order: point.order,
      frame_id: moduleFrameId,
      frame_epoch: moduleFrameId ? session.frameEpoch(moduleFrameId) : null,
      wrapper_element: wrapperFrameId ? registry.elementRef(session, wrapperFrameId, 'job:' + point.jobId) : null,
      wrapper_frame_id: wrapperFrameId,
      wrapper_frame_epoch: wrapperFrameEpoch,
      iframe_loaded: true,
      state: state.state,
      signals: state.signals,
      conflict: state.conflict,
    }
  })

  const factsByJob = new Map()
  for (const fact of scan.points || []) {
    if (fact.jobId && !factsByJob.has(String(fact.jobId))) factsByJob.set(String(fact.jobId), fact)
  }
  for (const point of taskPoints) {
    const fact = factsByJob.get(String(point.job_id))
    if (!fact) continue
    point.objectid = fact.objectid || null
    point.iframe_loaded = fact.iframeLoaded !== false
    point.wrapper_finished = fact.wrapperFinished === true
  }

  const partialState = { partial: false }
  const documents = await collectDocuments(session, registry, taskPoints, partialState)

  let coverage = completion.coverage
  if (tabs.items.length > 0 && taskPoints.length === 0) coverage = 'complete'
  if (partialState.partial && coverage !== 'pending') coverage = 'partial'

  return {
    page: {
      url: page.url,
      title: page.title,
      visibility: page.visibility,
      ready_state: page.readyState,
      target_id: page.target_id,
      generation: session.generation,
    },
    tab: tabs.items.length > 0 && tabs.active_index ? {
      index: tabs.active_index,
      title: (tabs.items.find((item) => item.index === tabs.active_index) || {}).title || null,
      active: true,
    } : null,
    content_tabs: compactTabs(tabs),
    generation: session.generation,
    chapter: scan.chapter ? {
      chapter_id: scan.chapter.chapterId || null,
      title: scan.chapter.title || null,
      unfinished_count: scan.chapter.unfinishCount,
      state: completion.chapter.state,
      consistent: completion.chapter.consistent,
      signals: scan.chapter.signals || null,
    } : null,
    task_points: taskPoints,
    documents,
    ignored_containers: inventory.ignoredContainers || 0,
    coverage,
    unobserved_incomplete: completion.unobservedIncomplete,
    truncated: false,
  }
}
