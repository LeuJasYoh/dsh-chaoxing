export class ObservationRegistry {
  constructor() {
    this.generation = 0
    this.frames = new Map()
  }

  sync(session) {
    const generation = session.generation
    if (generation !== this.generation) {
      this.generation = generation
      this.frames.clear()
      return
    }
    for (const [frameId, context] of this.frames) {
      if (session.frameEpoch(frameId) !== context.epoch) this.frames.delete(frameId)
    }
  }

  frameContext(session, frameId) {
    this.sync(session)
    const epoch = session.frameEpoch(frameId)
    let context = this.frames.get(frameId)
    if (!context || context.epoch !== epoch) {
      context = { epoch, elements: new Map(), domains: new Map(), nextElement: 0, nextDomain: 0 }
      this.frames.set(frameId, context)
    }
    return context
  }

  elementRef(session, frameId, identity) {
    const context = this.frameContext(session, frameId)
    let id = context.elements.get(identity)
    if (!id) {
      id = 'e' + context.nextElement++
      context.elements.set(identity, id)
    }
    return { element_id: id, frame_id: frameId, frame_epoch: context.epoch, generation: this.generation }
  }

  domainRef(session, frameId, identity, kind = 'element') {
    const context = this.frameContext(session, frameId)
    const key = kind + ':' + identity
    let id = context.domains.get(key)
    if (!id) {
      id = 'd' + context.nextDomain++
      context.domains.set(key, id)
    }
    return { domain_id: id, frame_id: frameId, frame_epoch: context.epoch, generation: this.generation, kind }
  }

  staleReason(session, ref) {
    if (!ref || typeof ref !== 'object') return 'generation'
    if (ref.generation != null && ref.generation !== session.generation) return 'generation'
    if (ref.frame_id && session.frameEpoch(ref.frame_id) !== ref.frame_epoch) return 'frame_epoch'
    return null
  }
}
