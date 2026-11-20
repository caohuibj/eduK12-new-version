import { Worker, WorkerOptions } from 'node:worker_threads'

const workerSource = `
const { parentPort, workerData } = require('node:worker_threads');
const bcrypt = require(workerData.modulePath);
parentPort.on('message', ({ id, password, hash }) => {
  try {
    parentPort.postMessage({ id, valid: bcrypt.compareSync(password, hash) });
  } catch {
    parentPort.postMessage({ id, failed: true });
  }
});
`

type Job = {
  id: number
  password: string
  hash: string
  resolve: (valid: boolean) => void
  reject: (error: Error) => void
}
type Slot = { worker: Worker; job?: Job; timer?: NodeJS.Timeout }
type PoolOptions = {
  size: number
  maxQueue?: number
  timeoutMs?: number
  /** Dependency injection for lifecycle tests; never read from the environment. */
  workerFactory?: (source: string, options: WorkerOptions) => Worker
}

export const createPasswordVerificationPool = (options: PoolOptions) => {
  const maxQueue = options.maxQueue ?? Math.max(32, options.size * 8)
  const timeoutMs = options.timeoutMs ?? 10000
  if (!Number.isInteger(options.size) || options.size < 1 || options.size > 32 ||
      !Number.isInteger(maxQueue) || maxQueue < 0 ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error('Invalid password pool configuration')
  const slots: Array<Slot | undefined> = Array(options.size).fill(undefined)
  const queue: Job[] = []
  let nextId = 0
  let closed = false
  // Distinct duck-typed admission-busy error: isBoundedAdmissionBusyError() in
  // authController maps this to HTTP 503 { code: 'LOGIN_VERIFY_BUSY',
  // Retry-After: 2 } so bounded frontend/pressure retries stay engaged instead
  // of fail-fast on code -1.
  const error = (): Error => {
    const e = new Error('Password verification unavailable') as Error & {
      code: string
      retryAfterSeconds: number
      reason: string
    }
    e.code = 'LOGIN_VERIFY_BUSY'
    e.retryAfterSeconds = 2
    e.reason = 'password_verification_pool'
    return e
  }
  const rejectQueued = () => {
    for (const job of queue.splice(0)) job.reject(error())
  }
  const fail = (index: number, slot: Slot) => {
    if (slots[index] !== slot) return
    slots[index] = undefined
    clearTimeout(slot.timer)
    slot.job?.reject(error())
    slot.job = undefined
    // Starvation guard: flush the queue only when no surviving slot can ever
    // drain it (single-slot pool whose worker died). Multi-slot pools keep the
    // queue so the surviving slots continue serving it; a former unconditional
    // rejectQueued() here cascaded one stuck slot into rejecting every queued
    // login (authController then answered code -1 and clients fail-fasted).
    const aliveElsewhere = slots.some(other => Boolean(other))
    if (!aliveElsewhere) rejectQueued()
    void slot.worker.terminate()
    // Replacement is lazy, on a later request, so a broken worker cannot cause
    // an unbounded restart loop. Authentication never falls back on failure.
  }
  const start = (slot: Slot, job: Job, index: number) => {
    slot.job = job
    slot.worker.ref()
    slot.timer = setTimeout(() => fail(index, slot), timeoutMs)
    slot.timer.unref()
    try {
      slot.worker.postMessage({ id: job.id, password: job.password, hash: job.hash })
    } catch {
      fail(index, slot)
    }
  }
  const makeSlot = (index: number): Slot => {
    const worker = (options.workerFactory ?? ((source, settings) => new Worker(source, settings)))(
      workerSource,
      { eval: true, workerData: { modulePath: require.resolve('@node-rs/bcrypt') }, env: {}, name: 'password-verification' },
    )
    const slot: Slot = { worker }
    slots[index] = slot
    worker.on('message', (message: unknown) => {
      if (slots[index] !== slot || !slot.job) return
      const reply = message as { id?: number; valid?: boolean; failed?: boolean } | null
      if (!reply || reply.id !== slot.job.id ||
          (typeof reply.valid !== 'boolean' && reply.failed !== true)) {
        fail(index, slot)
        return
      }
      clearTimeout(slot.timer)
      slot.timer = undefined
      const job = slot.job
      slot.job = undefined
      if (reply.failed) job.reject(error())
      else job.resolve(reply.valid!)
      const next = queue.shift()
      if (next) start(slot, next, index)
      else worker.unref()
    })
    worker.on('error', () => fail(index, slot))
    worker.on('exit', () => fail(index, slot))
    worker.unref()
    return slot
  }
  return {
    warm(): void {
      if (closed) return
      for (let i = 0; i < slots.length; i += 1) {
        if (!slots[i]) {
          try {
            makeSlot(i)
          } catch {
            // Best-effort warmup; compare() will surface worker errors lazily.
          }
        }
      }
    },
    compare(password: string, hash: string): Promise<boolean> {
      if (closed) return Promise.reject(error())
      return new Promise((resolve, reject) => {
        const job: Job = { id: ++nextId, password, hash, resolve, reject }
        const index = slots.findIndex(slot => !slot?.job)
        if (index >= 0) {
          try {
            start(slots[index] ?? makeSlot(index), job, index)
          } catch {
            reject(error())
          }
        } else if (queue.length < maxQueue) {
          queue.push(job)
        } else {
          reject(error())
        }
      })
    },
    async close(): Promise<void> {
      closed = true
      rejectQueued()
      const active = slots.map(slot => slot).filter((slot): slot is Slot => !!slot)
      slots.fill(undefined)
      for (const slot of active) {
        clearTimeout(slot.timer)
        slot.job?.reject(error())
        slot.job = undefined
      }
      await Promise.all(active.map(slot => slot.worker.terminate()))
    },
  }
}

export type PasswordVerificationPool = ReturnType<typeof createPasswordVerificationPool>
let defaultPool: PasswordVerificationPool | undefined

/** Default 4 workers outside tests; set LOGIN_PASSWORD_WORKERS=0 to opt out.
 * This changes scheduling only, not bcryptjs algorithm, cost or existing hashes. */
export const passwordVerificationPool = (): PasswordVerificationPool | undefined => {
  const raw = process.env.LOGIN_PASSWORD_WORKERS ?? (process.env.NODE_ENV === 'test' ? '0' : '4')
  if (!/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(raw)) throw new Error('Invalid LOGIN_PASSWORD_WORKERS')
  const size = Number(raw)
  if (size === 0) return undefined
  return defaultPool ??= createPasswordVerificationPool({ size })
}

export const warmPasswordVerificationPool = (): void => {
  passwordVerificationPool()?.warm()
}

