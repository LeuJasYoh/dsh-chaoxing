import { CdpError } from '../cdp/session.mjs'

/**
 * Resolve a scroll-domain tool argument to a concrete document frame.
 *
 * Preferred input is the composite domain handle returned by page_snapshot:
 *   { domain_id, frame_id, frame_epoch, generation?, kind: 'document' }
 *
 * A bare frame_id remains supported for older callers.
 */
export function resolveDomainInput(args = {}, session) {
  const frameIdArg = args.frame_id == null ? '' : String(args.frame_id).trim()
  const domain = args.domain && typeof args.domain === 'object' ? args.domain : null

  if (frameIdArg && domain) {
    throw new CdpError('INVALID_ARGUMENT', 'provide exactly one of frame_id or domain', {})
  }
  if (!frameIdArg && !domain) {
    throw new CdpError('INVALID_ARGUMENT', 'provide frame_id or a domain handle', {})
  }

  if (!domain) {
    return { frame_id: frameIdArg, domain: null, source: 'frame_id' }
  }

  const domainId = domain.domain_id == null ? '' : String(domain.domain_id).trim()
  const frameId = domain.frame_id == null ? '' : String(domain.frame_id).trim()
  const frameEpoch = domain.frame_epoch
  const generation = domain.generation
  const kind = domain.kind == null ? 'document' : String(domain.kind)

  if (!domainId) throw new CdpError('INVALID_ARGUMENT', 'domain.domain_id is required', {})
  if (!frameId) throw new CdpError('INVALID_ARGUMENT', 'domain.frame_id is required', {})
  if (!Number.isInteger(frameEpoch)) throw new CdpError('INVALID_ARGUMENT', 'domain.frame_epoch must be an integer', {})
  if (kind !== 'document') {
    throw new CdpError('UNSUPPORTED_DOMAIN', 'scroll_domain currently supports document domains only', {
      domain_id: domainId,
      kind,
    })
  }
  if (generation != null && generation !== session.generation) {
    throw new CdpError('STALE_HANDLE', 'handle is no longer valid', {
      reason: 'generation',
      expected_generation: generation,
      current_generation: session.generation,
    })
  }
  const currentEpoch = session.frameEpoch(frameId)
  if (frameEpoch !== currentEpoch) {
    throw new CdpError('STALE_HANDLE', 'handle is no longer valid', {
      reason: 'frame_epoch',
      expected_frame_epoch: frameEpoch,
      current_frame_epoch: currentEpoch,
      frame_id: frameId,
    })
  }

  return {
    frame_id: frameId,
    domain: { domain_id: domainId, frame_id: frameId, frame_epoch: frameEpoch, generation: generation != null ? generation : session.generation, kind },
    source: 'domain',
  }
}
