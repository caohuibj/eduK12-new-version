import type { CheckinUploadCleanupConfig } from '../config/checkinUploadCleanup'

/** One tracked sweep per process, no request-triggered enqueue or catch-up loop.
 * Schedule AFTER completion, including failures, so a slow sweep never overlaps
 * its successor. Stop cancels future work and drains the actual active promise;
 * it does not pretend a timeout can cancel Prisma or a remote object deletion.
 */
export function startCheckinUploadCleanupScheduler(
  run: () => Promise<void>,
  config: CheckinUploadCleanupConfig,
  onError: (cause: unknown) => void,
  random: () => number = Math.random,
): () => Promise<void> {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let active: Promise<void> = Promise.resolve()
  const schedule = () => {
    if (stopped) return
    timer = setTimeout(() => {
      timer = undefined
      active = Promise.resolve().then(run).catch(cause => {
        // Diagnostics must not break scheduling or turn shutdown into a rejection.
        try { onError(cause) } catch { /* best-effort diagnostics */ }
      }).then(schedule)
    }, config.intervalMs + Math.floor(random() * (config.jitterMs + 1)))
    timer.unref?.()
  }
  schedule()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    timer = undefined
    return active
  }
}
