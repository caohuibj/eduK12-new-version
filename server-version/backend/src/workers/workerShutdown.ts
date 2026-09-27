export type WorkerActiveCounts = { video: number; image: number; export: number }

export type WorkerShutdownDeps = {
  pauseConsumers: () => Promise<void>
  activeCounts: () => Promise<WorkerActiveCounts>
  cancelSubprocesses: (timeoutMs: number) => Promise<{ remaining: number }>
  activeSubprocessCount: () => number
  closeQueues: (doNotWaitJobs?: boolean) => Promise<void>
  disconnectDatabase: () => Promise<void>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export type WorkerShutdownResult = {
  activeJobs: number
  subprocessesRemaining: number
  forcedQueueClose: boolean
  failed: boolean
}

const totalActive = (counts: WorkerActiveCounts): number =>
  counts.video + counts.image + counts.export

export const shutdownWorkerRuntime = async (
  deps: WorkerShutdownDeps,
  timeoutMs: number,
): Promise<WorkerShutdownResult> => {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const now = deps.now ?? Date.now
  const deadline = now() + Math.max(1, timeoutMs)
  let activeJobs = 0
  let subprocessesRemaining = 0
  let failed = false

  const waitForDrain = async (until: number) => {
    activeJobs = totalActive(await deps.activeCounts())
    while (activeJobs > 0 && now() < until) {
      await sleep(100)
      activeJobs = totalActive(await deps.activeCounts())
    }
  }

  try {
    await deps.pauseConsumers()
    const drainDeadline = Math.min(deadline, now() + Math.floor(timeoutMs / 2))
    await waitForDrain(drainDeadline)

    if (activeJobs > 0 || deps.activeSubprocessCount() > 0) {
      const cancelled = await deps.cancelSubprocesses(Math.max(1, deadline - now()))
      subprocessesRemaining = cancelled.remaining
      await waitForDrain(deadline)
    }

    await deps.closeQueues(activeJobs > 0)
  } catch {
    failed = true
    try { await deps.closeQueues(true) } catch { /* best-effort final close */ }
  }

  try {
    await deps.disconnectDatabase()
  } catch {
    failed = true
  }

  return {
    activeJobs,
    subprocessesRemaining,
    forcedQueueClose: activeJobs > 0,
    failed,
  }
}
