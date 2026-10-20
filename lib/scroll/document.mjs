/**
 * Internal document/PDF resolution and slow-reading composite.
 *
 * This module is not exposed as an Agent tool. It is the place where the
 * Chaoxing PDF frame structure is understood, while the tool layer only sees
 * physical scroll actions.
 */
import { CdpError } from '../cdp/session.mjs'
import { findTaskPoint, listTaskPoints } from './target.mjs'
import { scrollDocument, waitForDocumentStable } from './domain.mjs'
import { sleep } from './readiness.mjs'

export function clampPacing(options = {}) {
  const stepPx = Math.max(50, Math.min(1200, Number.isFinite(Number(options.stepPx)) ? Number(options.stepPx) : 300))
  const dwellMs = Math.max(0, Math.min(5000, Number.isFinite(Number(options.dwellMs)) ? Number(options.dwellMs) : 1000))
  const maxSeconds = Math.max(1, Math.min(600, Number.isFinite(Number(options.maxSeconds)) ? Number(options.maxSeconds) : 300))
  return { stepPx, dwellMs, maxSeconds }
}

export function nextStepDelta(metrics, stepPx) {
  const remaining = Math.max(0, Number(metrics && metrics.max_scroll) - Number(metrics && metrics.scroll_top))
  return Math.min(Math.max(50, Number(stepPx) || 300), remaining)
}

export async function resolvePdfTarget(session, jobId) {
  const point = await findTaskPoint(session, jobId)
  if (point.kind !== 'pdf') {
    throw new CdpError('INVALID_ARGUMENT', 'task point is not a PDF: ' + point.kind, {
      job_id: point.jobId,
      kind: point.kind,
    })
  }
  if (!point.objectid) {
    throw new CdpError('DOCUMENT_NOT_FOUND', 'PDF task point has no objectid', {
      job_id: point.jobId,
      title: point.title,
    })
  }

  const frames = await session.frames()
  const matches = frames.filter((item) => {
    const url = item.frame.url || ''
    return url.includes('pan-yz.chaoxing.com/screen/v2') && url.includes('file_' + point.objectid)
  })
  const pan = matches.find((item) => {
    const parent = frames.find((candidate) => candidate.frame.id === item.frame.parentId)
    return parent && (parent.frame.url || '').includes('/ananas/modules/pdf/')
  }) || matches[0]
  if (!pan) {
    throw new CdpError('DOCUMENT_NOT_FOUND', 'PDF panView frame is not loaded yet', {
      job_id: point.jobId,
      objectid: point.objectid,
      title: point.title,
      frame_count: frames.length,
    })
  }

  const parent = frames.find((candidate) => candidate.frame.id === pan.frame.parentId) || null
  return {
    job_id: point.jobId,
    title: point.title,
    objectid: point.objectid,
    module_frame_id: parent ? parent.frame.id : null,
    module_frame_url: parent ? parent.frame.url : null,
    pan_frame_id: pan.frame.id,
    pan_frame_url: pan.frame.url,
    task_point: point,
  }
}

export async function listPdfTargets(session) {
  const listed = await listTaskPoints(session)
  const pdfs = listed.points.filter((point) => point.kind === 'pdf')
  const targets = []
  for (const point of pdfs) {
    try {
      targets.push(await resolvePdfTarget(session, point.jobId))
    } catch (error) {
      targets.push({
        job_id: point.jobId,
        title: point.title,
        objectid: point.objectid,
        error: error && error.code ? error.code : 'DOCUMENT_NOT_FOUND',
        message: error && error.message ? error.message : String(error),
      })
    }
  }
  return targets
}

export async function readDocument(session, frameId, options = {}) {
  const { stepPx, dwellMs, maxSeconds } = clampPacing(options)
  const dispatchScroll = options.dispatch_scroll !== false
  const settleMs = Number.isFinite(Number(options.settleMs)) ? Math.max(0, Number(options.settleMs)) : 80
  const started = Date.now()
  const deadline = started + maxSeconds * 1000

  const stable = await waitForDocumentStable(session, frameId, {
    samples: 2,
    intervalMs: 120,
    timeoutMs: Math.min(5000, maxSeconds * 1000),
  })

  const top = await scrollDocument(session, frameId, { to: 'top', dispatch_scroll: false, settleMs })
  let metrics = top.after
  let steps = 0
  let last = top
  let stopReason = 'bottom'

  while (Date.now() < deadline) {
    if (metrics.at_bottom) { stopReason = 'bottom'; break }
    const delta = nextStepDelta(metrics, stepPx)
    if (delta <= 0) { stopReason = 'no_movement'; break }
    last = await scrollDocument(session, frameId, {
      delta_y: delta,
      dispatch_scroll: dispatchScroll,
      settleMs,
    })
    steps += 1
    metrics = last.after
    if (!last.moved) { stopReason = 'no_movement'; break }
    if (dwellMs > 0) await sleep(dwellMs)
  }

  if (Date.now() >= deadline) stopReason = 'timeout'
  return {
    frame_id: frameId,
    step_px: stepPx,
    dwell_ms: dwellMs,
    max_seconds: maxSeconds,
    dispatch_scroll: dispatchScroll,
    content_stable: stable.ok,
    steps,
    at_bottom: metrics.at_bottom,
    bottom_gap: metrics.bottom_gap,
    scroll_top: metrics.scroll_top,
    scroll_height: metrics.scroll_height,
    client_height: metrics.client_height,
    max_scroll: metrics.max_scroll,
    elapsed_ms: Date.now() - started,
    stop_reason: stopReason,
    last_moved: Boolean(last && last.moved),
  }
}
