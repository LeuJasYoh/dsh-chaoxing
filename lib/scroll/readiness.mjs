/**
 * Internal readiness helper.
 *
 * It never decides whether a business action succeeded. It only polls a
 * caller-provided condition until it is ready or a timeout is reached.
 */

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
}

export async function waitFor(check, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(0, Number(options.timeoutMs)) : 5000
  const intervalMs = Number.isFinite(Number(options.intervalMs)) ? Math.max(10, Number(options.intervalMs)) : 200
  const started = Date.now()
  let attempts = 0
  let lastValue = null
  let lastError = null

  while (true) {
    attempts += 1
    try {
      lastValue = await check()
      lastError = null
    } catch (error) {
      lastValue = null
      lastError = error
    }

    const ready = lastValue && typeof lastValue === 'object' && 'ready' in lastValue
      ? Boolean(lastValue.ready)
      : Boolean(lastValue)

    const elapsedMs = Date.now() - started
    if (ready) return { ok: true, ready: true, value: lastValue, attempts, elapsedMs, error: null }
    if (elapsedMs >= timeoutMs) {
      return {
        ok: false,
        ready: false,
        value: lastValue,
        attempts,
        elapsedMs,
        timeout: true,
        error: lastError ? String(lastError.message || lastError) : null,
      }
    }

    const remaining = timeoutMs - elapsedMs
    await sleep(Math.min(intervalMs, Math.max(10, remaining)))
  }
}
