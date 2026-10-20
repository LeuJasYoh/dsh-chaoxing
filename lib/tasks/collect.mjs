import { CdpError } from '../cdp/session.mjs'

/**
 * Page-side: collect task point facts from the current document.
 * Only task point containers (div.ans-attach-ct with .ans-job-icon) are facts;
 * ordinary attachments are counted as ignored containers.
 */
function collectFactsInPage() {
  const containers = Array.from(document.querySelectorAll('div.ans-attach-ct'))
  const points = []
  let ignored = 0
  containers.forEach((wrapper, index) => {
    const icon = wrapper.querySelector('.ans-job-icon')
    if (!icon) { ignored += 1; return }
    const iframe = wrapper.querySelector('iframe')
    const rawData = iframe ? iframe.getAttribute('data') : null
    let data = null
    try { data = rawData ? JSON.parse(rawData) : null } catch { data = null }
    let jobId = iframe ? iframe.getAttribute('jobid') : null
    if (!jobId && data) jobId = data._jobid || data.jobid || null
    const src = iframe ? (iframe.getAttribute('src') || iframe.getAttribute('_src') || '') : ''
    let kind = 'unknown'
    if (/modules\/video\//i.test(src) || (icon.classList && icon.classList.contains('ans-job-video'))) kind = 'video'
    else if (/modules\/pdf\//i.test(src) || /document|pdf/i.test(src)) kind = 'pdf'
    else if (/modules\/work\//i.test(src)) kind = 'work'
    const title = data ? (data.name || data.title || null) : null
    const rect = wrapper.getBoundingClientRect()
    points.push({
      key: jobId ? 'job:' + jobId : 'tp:' + index,
      jobId: jobId || null,
      objectid: data ? (data.objectid || null) : null,
      kind,
      title: title || null,
      domId: wrapper.id || null,
      wrapperFinished: wrapper.classList.contains('ans-job-finished'),
      iconAria: icon.getAttribute('aria-label'),
      hasJobIcon: true,
      iframeLoaded: !!iframe,
      visible: rect.width > 0 && rect.height > 0,
      order: index,
    })
  })
  return { points, ignoredContainers: ignored }
}

/** Page-side: current chapter row from the top document. */
function collectChapterInPage() {
  const chapterId = new URL(location.href).searchParams.get('chapterId')
  let row = document.querySelector('#coursetree .posCatalog_select.posCatalog_active')
  if (!row && chapterId) row = document.querySelector('#coursetree .posCatalog_select#cur' + chapterId)
  if (!row) return null
  const name = row.querySelector('.posCatalog_name')
  const unfinishInput = row.querySelector('input.jobUnfinishCount')
  const orange = row.querySelector('.orangeNew')
  const completed = !!row.querySelector('.icon_Completed')
  let state = null
  try {
    const raw = document.querySelector('#_studystate')
    if (raw && raw.value) state = JSON.parse(raw.value)
  } catch { state = null }
  let unfinishCount = null
  if (unfinishInput && unfinishInput.value !== '' && Number.isFinite(Number(unfinishInput.value))) unfinishCount = Number(unfinishInput.value)
  else if (completed) unfinishCount = 0
  return {
    chapterId: chapterId || (row.id || '').replace(/^cur/, '') || null,
    title: name ? (name.getAttribute('title') || name.textContent || '').replace(/\s+/g, ' ').trim() : null,
    unfinishCount,
    completed,
    signals: {
      orangeNew: orange ? (orange.textContent || '').trim() : null,
      hasCompletedIcon: completed,
      hasUnfinishInput: !!unfinishInput,
    },
    studyState: state,
  }
}

async function scanOnce(session, frames) {
  let best = null
  for (const item of frames) {
    const frame = item.frame
    if (!frame.url || frame.url === 'about:blank' || frame.url.startsWith('javascript:')) continue
    let result
    try {
      result = await session.evaluateInFrame(frame.id, '(' + collectFactsInPage.toString() + ')()')
    } catch {
      continue
    }
    if (!result || !Array.isArray(result.points)) continue
    if (!best || result.points.length > best.points.length) best = { ...result, frame }
  }
  return best
}

/**
 * Collect the task-point skeleton for the currently loaded tab/page.
 * It never switches tabs and never waits for video/PDF media content.
 */
export async function collectTaskPointScan(session, options = {}) {
  await session.ensure()
  const page = await session.pageInfo()
  const frames = await session.frames()
  if (!frames.length) throw new CdpError('FRAME_NOT_FOUND', 'page target has no frames')

  let chapter = null
  try {
    chapter = await session.evaluateInFrame(frames[0].frame.id, '(' + collectChapterInPage.toString() + ')()')
  } catch { chapter = null }

  let first = await scanOnce(session, frames)
  if (!first) {
    return {
      page,
      frame: null,
      points: [],
      ignored_containers: 0,
      coverage: 'pending',
      chapter,
      active_tab: options.activeTab || null,
    }
  }

  let coverage = 'complete'
  if (options.settle !== false) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    const second = await scanOnce(session, frames)
    if (second) {
      const firstKeys = new Set(first.points.map((p) => p.key))
      const secondKeys = new Set(second.points.map((p) => p.key))
      const sameSet = firstKeys.size === secondKeys.size && [...firstKeys].every((k) => secondKeys.has(k))
      first = second
      if (!sameSet) coverage = 'partial'
    }
  }

  const frameId = first.frame.id
  return {
    page,
    frame: { frame_id: frameId, url: first.frame.url, name: first.frame.name || '' },
    points: first.points.map((point) => ({ ...point, frameId })),
    ignored_containers: first.ignoredContainers || 0,
    coverage: first.points.length ? coverage : 'pending',
    chapter,
    active_tab: options.activeTab || null,
  }
}
