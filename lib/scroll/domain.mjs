/**
 * Atomic scroll-domain helpers.
 *
 * A domain here is a frame document (document.scrollingElement). Element
 * domains can be added later without changing this module's contract.
 */
import { CdpError } from '../cdp/session.mjs'
import { sleep } from './readiness.mjs'

function readMetricsInPage() {
  const se = document.scrollingElement || document.documentElement
  const de = document.documentElement
  const body = document.body
  const scrollTop = Math.max(
    se && Number.isFinite(se.scrollTop) ? se.scrollTop : 0,
    window.scrollY || 0
  )
  const scrollHeight = Math.max(
    se ? se.scrollHeight : 0,
    de ? de.scrollHeight : 0,
    body ? body.scrollHeight : 0
  )
  const clientHeight = Math.max(
    se ? se.clientHeight : 0,
    window.innerHeight || 0
  )
  return {
    url: location.href,
    title: document.title,
    ready_state: document.readyState,
    scroll_top: scrollTop,
    scroll_height: scrollHeight,
    client_height: clientHeight,
    max_scroll: Math.max(0, scrollHeight - clientHeight),
  }
}

function setScrollInPage(to, deltaY, dispatchScroll) {
  const se = document.scrollingElement || document.documentElement
  const before = se ? se.scrollTop : 0
  if (to === 'bottom') se.scrollTop = se.scrollHeight
  else if (to === 'top') se.scrollTop = 0
  else if (Number.isFinite(deltaY)) se.scrollTop = Math.max(0, Math.min(se.scrollHeight, before + deltaY))
  if (dispatchScroll) {
    try { window.dispatchEvent(new Event('scroll')) } catch (error) {}
  }
  return { before, after: se ? se.scrollTop : 0 }
}

function normalizeMetrics(value, frameId) {
  const scrollTop = Number(value.scroll_top) || 0
  const scrollHeight = Number(value.scroll_height) || 0
  const clientHeight = Number(value.client_height) || 0
  const maxScroll = Math.max(0, Number(value.max_scroll) || scrollHeight - clientHeight)
  return {
    frame_id: frameId,
    url: value.url || '',
    title: value.title || '',
    ready_state: value.ready_state || 'unknown',
    scroll_top: scrollTop,
    scroll_height: scrollHeight,
    client_height: clientHeight,
    max_scroll: maxScroll,
    bottom_gap: Math.max(0, maxScroll - scrollTop),
    at_top: scrollTop <= 1,
    at_bottom: scrollTop >= maxScroll - 2,
  }
}

function validateMutation(options = {}) {
  const to = options.to == null ? null : String(options.to)
  const deltaY = options.delta_y == null ? null : Number(options.delta_y)
  if (to && !['top', 'bottom'].includes(to)) throw new CdpError('INVALID_ARGUMENT', 'to must be top or bottom')
  if (deltaY != null && !Number.isFinite(deltaY)) throw new CdpError('INVALID_ARGUMENT', 'delta_y must be a number')
  if ((to && deltaY != null) || (!to && deltaY == null)) {
    throw new CdpError('INVALID_ARGUMENT', 'provide exactly one of to or delta_y')
  }
  return { to, deltaY }
}

export function isAtBottom(metrics, tolerance = 2) {
  return Number(metrics && metrics.bottom_gap) <= tolerance
}

export function computeScrollTop(before, options = {}) {
  const scrollTop = Math.max(0, Number(before && before.scroll_top) || 0)
  const maxScroll = Math.max(0, Number(before && before.max_scroll) || 0)
  if (options.to === 'top') return 0
  if (options.to === 'bottom') return maxScroll
  const deltaY = Number(options.delta_y)
  if (!Number.isFinite(deltaY)) throw new CdpError('INVALID_ARGUMENT', 'delta_y must be a number')
  return Math.max(0, Math.min(maxScroll, scrollTop + deltaY))
}

export async function readDocumentMetrics(session, frameId) {
  const value = await session.evaluateInFrame(frameId, '(' + readMetricsInPage.toString() + ')()')
  return normalizeMetrics(value || {}, frameId)
}

export async function scrollDocument(session, frameId, options = {}) {
  const { to, deltaY } = validateMutation(options)
  const dispatchScroll = options.dispatch_scroll === true
  const settleMs = Number.isFinite(Number(options.settleMs)) ? Math.max(0, Number(options.settleMs)) : 120
  const before = await readDocumentMetrics(session, frameId)
  const expression = '(' + setScrollInPage.toString() + ')(' + JSON.stringify(to) + ',' + JSON.stringify(deltaY) + ',' + (dispatchScroll ? 'true' : 'false') + ')'
  await session.evaluateInFrame(frameId, expression)
  if (settleMs > 0) await sleep(settleMs)
  const after = await readDocumentMetrics(session, frameId)
  return {
    frame_id: frameId,
    url: after.url,
    title: after.title,
    to,
    delta_y: deltaY,
    dispatch_scroll: dispatchScroll,
    before,
    after,
    moved: Math.abs(after.scroll_top - before.scroll_top) > 0.5,
    at_top: after.at_top,
    at_bottom: after.at_bottom,
    bottom_gap: after.bottom_gap,
  }
}

export async function waitForDocumentStable(session, frameId, options = {}) {
  const samples = Math.max(1, Math.min(10, Number(options.samples) || 2))
  const intervalMs = Math.max(20, Math.min(2000, Number(options.intervalMs) || 150))
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(0, Number(options.timeoutMs)) : 5000
  const started = Date.now()
  let stable = 0
  let previous = null
  let attempts = 0
  let lastError = null

  while (Date.now() - started <= timeoutMs) {
    attempts += 1
    let metrics
    try {
      metrics = await readDocumentMetrics(session, frameId)
    } catch (error) {
      lastError = error
      await sleep(intervalMs)
      continue
    }
    lastError = null
    if (previous && metrics.scroll_height === previous.scroll_height && metrics.client_height === previous.client_height) {
      stable += 1
      if (stable >= samples) return { ok: true, ready: true, metrics, attempts, timeout: false, error: null }
    } else {
      stable = 0
    }
    previous = metrics
    await sleep(intervalMs)
  }

  return { ok: false, ready: false, metrics: previous, attempts, timeout: true, error: lastError ? String(lastError.message || lastError) : null }
}
