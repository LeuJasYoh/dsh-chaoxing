const DEFAULT_ENDPOINT = 'http://127.0.0.1:9222'

export class CdpError extends Error {
  constructor(code, message, observed = {}) {
    super(message)
    this.name = 'CdpError'
    this.code = code
    this.observed = observed
  }
}

export function selectPageTarget(targets, options = {}) {
  const pages = (targets || []).filter((t) => t.type === 'page' && !String(t.url || '').startsWith('chrome-untrusted:') && !String(t.url || '').startsWith('devtools:'))
  const candidates = options.urlIncludes ? pages.filter((t) => String(t.url || '').includes(options.urlIncludes)) : pages
  if (candidates.length === 0) throw new CdpError('TARGET_NOT_FOUND', 'no CDP page target matched', { urlIncludes: options.urlIncludes || null, pages: pages.map((p) => ({ id: p.id, title: p.title, url: p.url })) })
  const score = (p) => {
    const url = String(p.url || '')
    let s = 0
    if (/studentstudy/.test(url)) s += 100
    if (/doHomeWorkNew/.test(url)) s += 90
    if (/mooc1\.chaoxing\.com|mooc2-ans\.chaoxing\.com/.test(url)) s += 40
    if (/chaoxing\.com/.test(url)) s += 10
    if (/i\.chaoxing\.com|passport2|i\.mooc\.chaoxing\.com/.test(url)) s -= 100
    return s
  }
  const ranked = candidates.map((p) => ({ p, score: score(p) })).sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (!best || (!options.urlIncludes && best.score <= 0)) throw new CdpError('TARGET_NOT_FOUND', 'no Chaoxing learning page target found', { candidates: ranked.map(({ p, score }) => ({ id: p.id, title: p.title, url: p.url, score })) })
  return best.p
}

export function flattenFrames(tree) {
  const out = []
  const walk = (node, depth) => {
    if (!node || !node.frame) return
    out.push({ frame: node.frame, depth })
    for (const child of node.childFrames || []) walk(child, depth + 1)
  }
  walk(tree.frameTree, 0)
  return out
}

export class CdpSession {
  constructor(options = {}) {
    this.endpoint = String(options.endpoint || process.env.XUEXI_CDP_URL || DEFAULT_ENDPOINT).replace(/\/$/, '')
    this.targetUrlIncludes = options.targetUrlIncludes || null
    this.ws = null
    this.nextId = 1
    this.pending = new Map()
    this.worlds = new Map()
    this.target = null
    this.generation = 0
    this.ready = false
    this.connectPromise = null
  }

  async ensure() {
    if (this.ws && this.ws.readyState === 1 && this.ready) return
    if (this.connectPromise) return this.connectPromise
    this.connectPromise = this.connect().finally(() => { this.connectPromise = null })
    return this.connectPromise
  }

  async listTargets() {
    let response
    try {
      response = await fetch(this.endpoint + '/json/list', { signal: AbortSignal.timeout(5000) })
    } catch (error) {
      throw new CdpError('TARGET_NOT_FOUND', 'cannot reach CDP at ' + this.endpoint + ' (is Edge running with --remote-debugging-port=9222?)', { endpoint: this.endpoint })
    }
    if (!response.ok) throw new CdpError('TARGET_NOT_FOUND', 'CDP /json/list returned HTTP ' + response.status, { endpoint: this.endpoint, status: response.status })
    return response.json()
  }

  async connect() {
    this.disconnect()
    const targets = await this.listTargets()
    const target = selectPageTarget(targets, { urlIncludes: this.targetUrlIncludes })
    this.target = target
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try { ws.close() } catch {}
        reject(new CdpError('TARGET_NOT_FOUND', 'timed out opening CDP websocket', { targetId: target.id }))
      }, 8000)
      ws.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
      ws.addEventListener('error', () => {
        clearTimeout(timer)
        try { ws.close() } catch {}
        reject(new CdpError('TARGET_NOT_FOUND', 'failed to open CDP websocket', { targetId: target.id }))
      }, { once: true })
    })
    this.ws = ws
    // Guard against a late close/error from a previous connection clobbering
    // the newly opened one.
    ws.addEventListener('message', (event) => { if (this.ws === ws) this.onMessage(event) })
    ws.addEventListener('close', () => { if (this.ws === ws) this.onClose() })
    ws.addEventListener('error', () => { if (this.ws === ws) this.onClose() })
    try {
      await this.send('Page.enable')
      await this.send('Runtime.enable')
    } catch (error) {
      try { ws.close() } catch {}
      if (this.ws === ws) { this.ws = null; this.target = null; this.ready = false }
      throw error
    }
    this.generation = 1
    this.ready = true
    this.worlds.clear()
  }

  onMessage(event) {
    let message
    try { message = JSON.parse(event.data) } catch { return }
    if (message.id && this.pending.has(message.id)) {
      const item = this.pending.get(message.id)
      this.pending.delete(message.id)
      if (message.error) item.reject(new CdpError('INTERNAL_ERROR', message.error.message || 'CDP command failed', { cdpCode: message.error.code, method: item.method }))
      else item.resolve(message.result)
      return
    }
    if (message.method === 'Page.frameNavigated') {
      const frameId = message.params && message.params.frame ? message.params.frame.id : null
      if (frameId) this.worlds.delete(frameId)
      this.generation += 1
    } else if (message.method === 'Page.frameDetached') {
      const frameId = message.params ? message.params.frameId : null
      if (frameId) this.worlds.delete(frameId)
    }
  }

  onClose() {
    this.ws = null
    this.ready = false
    for (const item of this.pending.values()) item.reject(new CdpError('TARGET_NOT_FOUND', 'CDP connection closed'))
    this.pending.clear()
    this.worlds.clear()
    this.target = null
  }

  send(method, params = {}, timeoutMs = 15000) {
    if (!this.ws || this.ws.readyState !== 1) return Promise.reject(new CdpError('TARGET_NOT_FOUND', 'CDP session is not connected', { method }))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new CdpError('INTERNAL_ERROR', 'CDP command timed out: ' + method, { method, timeoutMs })) }, timeoutMs)
      this.pending.set(id, {
        method,
        resolve: (value) => { clearTimeout(timer); resolve(value) },
        reject: (error) => { clearTimeout(timer); reject(error) },
      })
      try {
        this.ws.send(JSON.stringify({ id, method, params }))
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(new CdpError('TARGET_NOT_FOUND', 'CDP send failed: ' + (error && error.message ? error.message : String(error)), { method }))
      }
    })
  }

  async frames() {
    const result = await this.send('Page.getFrameTree')
    return flattenFrames(result)
  }

  async world(frameId) {
    if (this.worlds.has(frameId)) return this.worlds.get(frameId)
    let result
    try {
      result = await this.send('Page.createIsolatedWorld', { frameId, worldName: 'dsh-xuexi-next', grantUniveralAccess: true })
    } catch (error) {
      throw new CdpError('FRAME_NOT_FOUND', 'cannot create execution context for frame ' + frameId, { frameId, cause: error.message })
    }
    this.worlds.set(frameId, result.executionContextId)
    return result.executionContextId
  }

  async evaluateInFrame(frameId, expression) {
    const contextId = await this.world(frameId)
    let result
    try {
      result = await this.send('Runtime.evaluate', { expression, contextId, returnByValue: true, awaitPromise: true, userGesture: false })
    } catch (error) {
      this.worlds.delete(frameId)
      throw error
    }
    if (result.exceptionDetails) {
      const text = result.exceptionDetails.exception && result.exceptionDetails.exception.description || result.exceptionDetails.text || 'page evaluation failed'
      throw new CdpError('INTERNAL_ERROR', text, { frameId })
    }
    return result.result ? result.result.value : undefined
  }

  async pageInfo() {
    const frames = await this.frames()
    if (!frames.length) throw new CdpError('FRAME_NOT_FOUND', 'page target has no frames')
    const top = frames[0].frame
    const info = await this.evaluateInFrame(top.id, '({ url: location.href, title: document.title, visibility: document.visibilityState, readyState: document.readyState })')
    return { ...info, target_id: this.target ? this.target.id : null }
  }

  async close() { this.disconnect() }

  disconnect() {
    if (this.ws) { try { this.ws.close() } catch {} }
    this.ws = null
    this.ready = false
    for (const item of this.pending.values()) item.reject(new CdpError('TARGET_NOT_FOUND', 'CDP session closed'))
    this.pending.clear()
    this.worlds.clear()
    this.target = null
  }
}
