type Signal = 'SIGTERM' | 'SIGKILL'

type ActiveSubprocess = {
  id: symbol
  label: string
  kill: (signal: Signal) => void
  settled: Promise<unknown>
}

const active = new Map<symbol, ActiveSubprocess>()
let shutdownCancellationRequested = false

export class WorkerShutdownCancellationError extends Error {
  readonly code = 'WORKER_SHUTDOWN_CANCELLED'
  constructor(message = 'worker shutdown cancelled active subprocess') {
    super(message)
    this.name = 'WorkerShutdownCancellationError'
  }
}

export const isWorkerShutdownCancellationError = (error: unknown): error is WorkerShutdownCancellationError =>
  error instanceof WorkerShutdownCancellationError
  || (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'WORKER_SHUTDOWN_CANCELLED')

export const workerShutdownCancellationRequested = (): boolean => shutdownCancellationRequested

export const registerWorkerSubprocess = (
  label: string,
  kill: (signal: Signal) => void,
  settled: Promise<unknown>,
): (() => void) => {
  const id = Symbol(label)
  const entry = { id, label, kill, settled }
  active.set(id, entry)
  const remove = () => { active.delete(id) }
  void settled.then(remove, remove)
  return remove
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const waitUntilSettled = async (deadline: number): Promise<boolean> => {
  while (active.size > 0 && Date.now() < deadline) {
    await sleep(50)
  }
  return active.size === 0
}

export const activeWorkerSubprocessCount = (): number => active.size

export const cancelActiveWorkerSubprocesses = async (timeoutMs: number): Promise<{ remaining: number }> => {
  shutdownCancellationRequested = true
  const deadline = Date.now() + Math.max(1, timeoutMs)
  for (const entry of [...active.values()]) {
    try { entry.kill('SIGTERM') } catch { /* process may already be exiting */ }
  }

  const gracefulDeadline = Math.min(deadline, Date.now() + Math.min(2_000, Math.max(250, Math.floor(timeoutMs / 2))))
  if (await waitUntilSettled(gracefulDeadline)) return { remaining: 0 }

  for (const entry of [...active.values()]) {
    try { entry.kill('SIGKILL') } catch { /* process may already be exiting */ }
  }
  await waitUntilSettled(deadline)
  return { remaining: active.size }
}
