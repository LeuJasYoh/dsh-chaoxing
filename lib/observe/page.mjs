import { CdpError } from '../cdp/session.mjs'
import { readDocumentMetrics } from '../scroll/domain.mjs'

const FRAME_LIMIT = 80
const DOMAIN_LIMIT = 80
const ELEMENT_LIMIT = 20

export function classifyFrameUrl(url = '') {
  if (!url) return 'empty'
  if (url === 'about:blank') return 'blank'
  if (url.startsWith('javascript:')) return 'script'
  if (url.includes('/knowledge/cards')) return 'knowledge'
  if (url.includes('/ananas/modules/pdf/')) return 'pdf-module'
  if (url.includes('/ananas/modules/video/')) return 'video-module'
  if (url.includes('/ananas/modules/work/')) return 'work-module'
  if (url.includes('pan-yz.chaoxing.com/screen/v2')) return 'panview'
  return 'other'
}

export function isMeaningfulFrame(frame) {
  const kind = classifyFrameUrl(frame && frame.url)
  return kind !== 'blank' && kind !== 'script' && kind !== 'empty'
}

function frameKindLabel(kind) {
  return kind
}

function originOf(url) {
  try { return new URL(url).origin } catch { return null }
}

function quadRect(model) {
  const quad = model && model.model ? (model.model.border || model.model.content) : null
  if (!Array.isArray(quad) || quad.length < 8) return null
  const xs = [quad[0], quad[2], quad[4], quad[6]]
  const ys = [quad[1], quad[3], quad[5], quad[7]]
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

function parseOwnerAttrs(attributes) {
  const attrs = {}
  for (let i = 0; Array.isArray(attributes) && i + 1 < attributes.length; i += 2) attrs[attributes[i]] = attributes[i + 1]
  let data = null
  try { data = attrs.data ? JSON.parse(attrs.data) : null } catch { data = null }
  let objectid = attrs.objectid || (data && data.objectid) || null
  if (!objectid && attrs.src) {
    try { objectid = new URL(attrs.src, 'https://mooc1.chaoxing.com').searchParams.get('objectid') || null } catch { objectid = null }
  }
  return {
    iframe_id: attrs.id || null,
    class: attrs.class || null,
    src: attrs.src || null,
    jobid: attrs.jobid || (data && (data.jobid || data._jobid)) || null,
    objectid,
    data,
  }
}

async function readFrameOwner(session, frameId) {
  try {
    const owner = await session.send('DOM.getFrameOwner', { frameId })
    const node = await session.send('DOM.describeNode', { backendNodeId: owner.backendNodeId, depth: 0 })
    const described = node && node.node ? node.node : node
    const attrs = parseOwnerAttrs(described && described.attributes)
    let rect = null
    try {
      const model = await session.send('DOM.getBoxModel', { backendNodeId: owner.backendNodeId })
      rect = quadRect(model)
    } catch { rect = null }
    return { backend_node_id: owner.backendNodeId, ...attrs, rect }
  } catch {
    return null
  }
}

export async function collectFrameFacts(session) {
  const flat = await session.frames()
  const top = flat[0] ? flat[0].frame : null
  const topOrigin = top ? originOf(top.url) : null
  const meaningful = flat.filter((item) => isMeaningfulFrame(item.frame))
  const hiddenFrameCount = flat.length - meaningful.length
  const frames = []
  const ownersByJobId = new Map()
  const ownersByObjectId = new Map()

  let domEnabled = false
  try { await session.send('DOM.enable'); domEnabled = true } catch { domEnabled = false }

  for (const item of meaningful) {
    const frame = item.frame
    const kind = classifyFrameUrl(frame.url)
    const owner = domEnabled && frame.parentId ? await readFrameOwner(session, frame.id) : null
    const fact = {
      frame_id: frame.id,
      parent_id: frame.parentId || null,
      frame_epoch: session.frameEpoch(frame.id),
      depth: item.depth,
      name: frame.name || '',
      url: frame.url,
      kind: frameKindLabel(kind),
      cross_origin: Boolean(topOrigin && originOf(frame.url) && originOf(frame.url) !== topOrigin),
      evaluable: true,
      rect: owner ? owner.rect : null,
      iframe: owner ? {
        id: owner.iframe_id,
        class: owner.class,
        jobid: owner.jobid,
        objectid: owner.objectid,
        src: owner.src,
      } : null,
    }
    if (owner && owner.jobid) ownersByJobId.set(String(owner.jobid), fact)
    if (owner && owner.objectid) ownersByObjectId.set(String(owner.objectid), fact)
    frames.push(fact)
  }

  return {
    frames: frames.slice(0, FRAME_LIMIT),
    truncated: meaningful.length > FRAME_LIMIT,
    hidden_frame_count: hiddenFrameCount,
    ownerMap: { byJobId: ownersByJobId, byObjectId: ownersByObjectId },
    top: frames[0] || null,
  }
}

function collectTabsInPage() {
  const container = document.querySelector('#prev_tab')
  if (!container) return { present: false, items: [], active_index: null, unresolved: false }
  const items = Array.from(container.querySelectorAll('.prev_ul > li')).map((li, index) => {
    const title = li.getAttribute('title') || (li.querySelector('.spanText') ? li.querySelector('.spanText').textContent : '') || ''
    const num = li.querySelector('.num') ? li.querySelector('.num').textContent : ''
    return {
      index: index + 1,
      title: (title || '').replace(/\s+/g, ' ').trim(),
      num: (num || '').replace(/\s+/g, ' ').trim() || null,
      active: li.classList.contains('active'),
    }
  })
  const active = items.filter((item) => item.active)
  return {
    present: items.length > 0,
    items,
    active_index: active.length === 1 ? active[0].index : null,
    unresolved: items.length > 0 && active.length !== 1,
  }
}

export async function collectContentTabs(session) {
  const result = await session.evaluateInFrame(session.topFrameId, '(' + collectTabsInPage.toString() + ')()')
  if (!result || result.present !== true) {
    return { items: [], active_index: null, coverage: 'complete', unresolved: false }
  }
  return {
    items: result.items.map((item) => ({ ...item, loaded: item.active ? true : false })),
    active_index: result.active_index,
    coverage: result.unresolved ? 'partial' : 'complete',
    unresolved: Boolean(result.unresolved),
  }
}

function collectScrollablesInPage() {
  const se = document.scrollingElement || document.documentElement
  const all = Array.from(document.querySelectorAll('*'))
  const rows = []
  let ordinal = 0
  for (const el of all) {
    if (!el || el === se || el === document.documentElement || el === document.body) continue
    const style = getComputedStyle(el)
    if (!['auto', 'scroll', 'overlay'].includes(style.overflowY)) continue
    const gap = el.scrollHeight - el.clientHeight
    if (gap <= 2) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 20 || rect.height < 20) continue
    const tag = el.tagName.toLowerCase()
    const id = el.id || ''
    const cls = typeof el.className === 'string' ? el.className : ''
    const key = id ? 'id:' + id : 'tag:' + tag + ':class:' + cls + ':' + ordinal
    ordinal += 1
    const label = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    rows.push({
      key,
      tag,
      id: id || null,
      class: cls || null,
      label,
      scroll_top: el.scrollTop,
      scroll_height: el.scrollHeight,
      client_height: el.clientHeight,
      max_scroll: Math.max(0, gap),
      overflow_y: style.overflowY,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    })
    if (rows.length >= 20) break
  }
  return rows
}

async function collectScrollDomains(session, registry, frameFacts) {
  const domains = []
  let truncated = false
  let partial = false

  for (const frame of frameFacts) {
    if (domains.length >= DOMAIN_LIMIT) { truncated = true; break }
    if (frame.kind === 'panview' || frame.kind === 'knowledge' || frame.depth === 0) {
      let metrics = null
      try { metrics = await readDocumentMetrics(session, frame.frame_id) } catch { partial = true }
      if (metrics && (metrics.max_scroll > 2 || frame.depth === 0)) {
        const domain = registry.domainRef(session, frame.frame_id, 'document', 'document')
        domains.push({
          domain,
          frame_kind: frame.kind,
          label: frame.kind === 'panview' ? 'PDF document' : frame.depth === 0 ? 'page document' : 'document',
          related_job_id: frame.iframe && frame.iframe.jobid ? frame.iframe.jobid : null,
          scroll_top: metrics.scroll_top,
          scroll_height: metrics.scroll_height,
          client_height: metrics.client_height,
          max_scroll: metrics.max_scroll,
          at_top: metrics.at_top,
          at_bottom: metrics.at_bottom,
        })
      }
    }

    if (frame.kind === 'panview') continue
    let elements = []
    try { elements = await session.evaluateInFrame(frame.frame_id, '(' + collectScrollablesInPage.toString() + ')()') } catch { partial = true; continue }
    if (!Array.isArray(elements)) continue
    if (elements.length > ELEMENT_LIMIT) { elements = elements.slice(0, ELEMENT_LIMIT); truncated = true }
    for (const element of elements) {
      if (domains.length >= DOMAIN_LIMIT) { truncated = true; break }
      const domain = registry.domainRef(session, frame.frame_id, element.key, 'element')
      const elementRef = registry.elementRef(session, frame.frame_id, element.key)
      domains.push({
        domain,
        frame_kind: frame.kind,
        element: elementRef,
        label: element.id ? '#' + element.id : (element.class ? '.' + String(element.class).split(/\s+/)[0] : element.tag),
        related_job_id: frame.iframe && frame.iframe.jobid ? frame.iframe.jobid : null,
        scroll_top: element.scroll_top,
        scroll_height: element.scroll_height,
        client_height: element.client_height,
        max_scroll: element.max_scroll,
        at_top: element.scroll_top <= 1,
        at_bottom: element.scroll_top >= element.max_scroll - 2,
        rect: element.rect,
      })
    }
  }

  return { domains, truncated, partial }
}

export async function collectPageSnapshot(session, registry) {
  await session.ensure()
  registry.sync(session)
  const page = await session.pageInfo()
  const frameFacts = await collectFrameFacts(session)
  const tabs = await collectContentTabs(session)
  const scroll = await collectScrollDomains(session, registry, frameFacts.frames)
  const coverage = scroll.partial || tabs.unresolved ? 'partial' : 'complete'
  return {
    page: {
      url: page.url,
      title: page.title,
      visibility: page.visibility,
      ready_state: page.readyState,
      target_id: page.target_id,
      generation: session.generation,
    },
    generation: session.generation,
    tabs: { ...tabs, items: tabs.items },
    frames: frameFacts.frames,
    hidden_frame_count: frameFacts.hidden_frame_count,
    scroll_domains: scroll.domains,
    coverage,
    truncated: frameFacts.truncated || scroll.truncated,
    limits: { frames: FRAME_LIMIT, scroll_domains: DOMAIN_LIMIT, elements_per_frame: ELEMENT_LIMIT },
  }
}
