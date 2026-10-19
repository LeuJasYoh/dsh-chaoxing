/**
 * Internal generic target scrolling helpers.
 *
 * A task point is identified by the stable iframe jobid, not by DOM id or text.
 * These helpers do not know about PDFs or completion rules.
 */
import { CdpError } from '../cdp/session.mjs'
import { sleep } from './readiness.mjs'
import { readDocumentMetrics } from './domain.mjs'

function listTaskPointsInPage() {
  return Array.from(document.querySelectorAll('div.ans-attach-ct')).map((wrapper, index) => {
    const icon = wrapper.querySelector('.ans-job-icon')
    const iframe = wrapper.querySelector('iframe')
    if (!icon || !iframe) return null
    let data = null
    try { data = JSON.parse(iframe.getAttribute('data') || '') } catch (error) { data = null }
    const src = iframe.getAttribute('src') || iframe.getAttribute('_src') || ''
    let kind = 'unknown'
    if (src.includes('/modules/pdf/')) kind = 'pdf'
    else if (src.includes('/modules/video/')) kind = 'video'
    else if (src.includes('/modules/work/')) kind = 'work'
    return {
      index,
      jobId: iframe.getAttribute('jobid') || null,
      objectid: data ? (data.objectid || null) : null,
      kind,
      title: data ? (data.name || data.title || null) : null,
      className: wrapper.className || '',
      aria: icon.getAttribute('aria-label'),
      svgClass: icon.className || '',
    }
  }).filter(Boolean)
}

function scrollAndMeasureInPage(jobId, align) {
  const wrapper = Array.from(document.querySelectorAll('div.ans-attach-ct')).find((candidate) => {
    const iframe = candidate.querySelector('iframe')
    return iframe && iframe.getAttribute('jobid') === jobId
  })
  if (!wrapper) return { found: false }

  wrapper.scrollIntoView({
    block: align === 'start' ? 'start' : 'center',
    inline: 'nearest',
  })

  let rect = wrapper.getBoundingClientRect()
  const localRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  let win = window
  while (win !== win.top) {
    let owner = null
    try { owner = win.frameElement } catch (error) { owner = null }
    if (!owner) break
    const frameRect = owner.getBoundingClientRect()
    rect = {
      left: frameRect.left + rect.left,
      top: frameRect.top + rect.top,
      width: rect.width,
      height: rect.height,
    }
    try { win = win.parent } catch (error) { break }
  }
  let viewportWidth = 0
  let viewportHeight = 0
  try {
    viewportWidth = win.top.innerWidth || window.innerWidth || 0
    viewportHeight = win.top.innerHeight || window.innerHeight || 0
  } catch (error) {
    viewportWidth = window.innerWidth || 0
    viewportHeight = window.innerHeight || 0
  }
  const viewportRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  const visible = viewportRect.top < viewportHeight && viewportRect.top + viewportRect.height > 0 &&
    viewportRect.left < viewportWidth && viewportRect.left + viewportRect.width > 0
  return {
    found: true,
    localRect,
    viewportRect,
    viewportWidth,
    viewportHeight,
    visible,
    topScrollY: window.top === window ? window.scrollY : null,
  }
}

export function isRectVisible(rect, viewport) {
  if (!rect || !viewport) return false
  return rect.left < viewport.width && rect.left + rect.width > 0 &&
    rect.top < viewport.height && rect.top + rect.height > 0
}

export async function listTaskPoints(session) {
  const frames = await session.frames()
  let best = null
  for (const item of frames) {
    const frame = item.frame
    if (!frame.url || frame.url === 'about:blank' || frame.url.startsWith('javascript:')) continue
    let points
    try {
      points = await session.evaluateInFrame(frame.id, '(' + listTaskPointsInPage.toString() + ')()')
    } catch (error) {
      continue
    }
    if (!Array.isArray(points) || !points.length) continue
    if (!best || points.length > best.points.length) best = { frame, points }
  }
  if (!best) return { frame: null, points: [] }
  return {
    frame: { frame_id: best.frame.id, url: best.frame.url, name: best.frame.name || '' },
    points: best.points.map((point) => ({ ...point, frameId: best.frame.id })),
  }
}

export async function findTaskPoint(session, jobId) {
  const id = String(jobId == null ? '' : jobId)
  const listed = await listTaskPoints(session)
  const point = listed.points.find((candidate) => String(candidate.jobId) === id)
  if (!point) {
    throw new CdpError('TARGET_NOT_FOUND', 'no task point with job_id ' + id, {
      job_id: id,
      frame: listed.frame,
      visible_task_points: listed.points.map((candidate) => ({
        job_id: candidate.jobId,
        kind: candidate.kind,
        title: candidate.title,
      })),
    })
  }
  return { ...point, frame: listed.frame }
}

export async function scrollTaskPointIntoView(session, jobId, options = {}) {
  const align = options.align === 'start' ? 'start' : 'center'
  const settleMs = Number.isFinite(Number(options.settleMs)) ? Math.max(0, Number(options.settleMs)) : 250
  const point = await findTaskPoint(session, jobId)
  const frames = await session.frames()
  if (!frames.length) throw new CdpError('FRAME_NOT_FOUND', 'no frames to scroll')
  const top = frames[0].frame
  const before = await readDocumentMetrics(session, top.id)
  const expression = '(' + scrollAndMeasureInPage.toString() + ')(' + JSON.stringify(String(jobId)) + ',' + JSON.stringify(align) + ')'
  const measured = await session.evaluateInFrame(point.frameId, expression)
  if (settleMs > 0) await sleep(settleMs)
  const after = await readDocumentMetrics(session, top.id)
  return {
    target: {
      job_id: point.jobId,
      kind: point.kind,
      title: point.title,
      objectid: point.objectid,
      frame_id: point.frameId,
      aria: point.aria,
      class_name: point.className,
    },
    align,
    found: Boolean(measured && measured.found),
    before,
    after,
    target_viewport_rect: measured ? measured.viewportRect : null,
    target_local_rect: measured ? measured.localRect : null,
    viewport: measured ? { width: measured.viewportWidth, height: measured.viewportHeight } : null,
    visible: Boolean(measured && measured.visible),
    top_scroll_changed: Math.abs(after.scroll_top - before.scroll_top) > 0.5,
  }
}
