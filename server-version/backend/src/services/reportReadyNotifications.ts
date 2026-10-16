import { createHash } from 'node:crypto'
import { createClient } from 'redis'
import { getRedisUrl } from '../config/redis'

const ADVISORY_PREFIX = 'priority:v1:'
const advisoryListeners = new Set<(message: string) => void>()
const transportEnabled = () => enabled() || process.env.ASSESSMENT_REPORT_SUBMISSION_PRIORITY_ENABLED === 'true'
const TOPIC = 'assessment:whole-report-ready:v1'
const MAX_WAITERS = 256
export const REPORT_READY_MAX_WAIT_MS = 4000
type WaitResult = 'ready' | 'timeout' | 'aborted' | 'unavailable' | 'cancelled'
export class ReportReadyWaitRegistry {
  private entries = new Map<string, Set<(result: WaitResult) => void>>()
  private count = 0
  constructor(private readonly limit = MAX_WAITERS) {}
  get size() { return this.count }
  wait(key: string, delayMs: number, signal?: AbortSignal) {
    if (signal?.aborted || this.count >= this.limit || (this.entries.get(key)?.size ?? 0) >= 2) return null
    let finish!: (result: WaitResult) => void
    const done = new Promise<WaitResult>(resolve => {
      let settled = false
      const onAbort = () => finish('aborted')
      const timer = setTimeout(() => finish('timeout'), Math.max(1, Math.min(REPORT_READY_MAX_WAIT_MS, delayMs)))
      timer.unref()
      finish = result => {
        if (settled) return
        settled = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort)
        const set = this.entries.get(key)
        if (set?.delete(finish)) this.count--
        if (set?.size === 0) this.entries.delete(key)
        resolve(result)
      }
      const set = this.entries.get(key) ?? new Set()
      set.add(finish); this.entries.set(key, set); this.count++
      signal?.addEventListener('abort', onAbort, { once: true })
    })
    return { done, cancel: () => finish('cancelled') }
  }
  wake(key: string) { for (const finish of [...(this.entries.get(key) ?? [])]) finish('ready') }
  unavailable() { for (const set of [...this.entries.values()]) for (const finish of [...set]) finish('unavailable') }
}
const waits = new ReportReadyWaitRegistry()
let subscriber: ReturnType<typeof createClient> | null = null
let subscriberConnecting: Promise<boolean> | null = null
let subscribed = false
let notificationSequence = 0
export const reportReadyNotificationSequence = () => notificationSequence
let subscriberRetryAt = 0
let publisher: ReturnType<typeof createClient> | null = null
let publisherConnecting: Promise<boolean> | null = null
let publisherRetryAt = 0
const enabled = () => process.env.ASSESSMENT_REPORT_READY_WAIT_ENABLED === 'true'
const keyFor = (attemptId: string, epoch: number) => createHash('sha256').update(attemptId).update(':').update(String(epoch)).digest('hex')
const client = () => createClient({ url: getRedisUrl(), disableOfflineQueue: true,
  socket: { connectTimeout: 250, reconnectStrategy: false } })
const bounded = async (operation: Promise<boolean>) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([operation, new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 150) })]) }
  finally { if (timer) clearTimeout(timer) }
}
export const prepareReportReadyNotifications = async (): Promise<boolean> => {
  if (!transportEnabled()) return false
  if (subscribed && subscriber?.isReady) return true
  if (subscriberConnecting) return bounded(subscriberConnecting)
  if (Date.now() < subscriberRetryAt) return false
  let connection: ReturnType<typeof createClient>
  try { connection = client() } catch { subscriberRetryAt = Date.now() + 5000; return false }
  try { subscriber?.destroy() } catch { /* discard a failed advisory connection */ }
  subscriber = connection
  connection.on('error', () => { subscribed = false; subscriberRetryAt = Date.now() + 5000; waits.unavailable() })
  connection.on('end', () => { subscribed = false; waits.unavailable() })
  subscriberConnecting = (async () => {
    await connection.connect()
    await connection.subscribe(TOPIC, message => {
      if (/^[a-f0-9]{64}$/.test(message)) { notificationSequence++; waits.wake(message) }
      else if (message.startsWith(ADVISORY_PREFIX) && message.length <= 384) {
        for (const listener of advisoryListeners) { try { listener(message.slice(ADVISORY_PREFIX.length)) } catch { /* advisory isolation */ } }
      }
    })
    subscribed = true; return true
  })().catch(() => {
    subscribed = false; subscriberRetryAt = Date.now() + 5000
    try { connection.destroy() } catch { /* already closed */ }
    return false
  }).finally(() => { subscriberConnecting = null })
  return bounded(subscriberConnecting)
}
export const reportReadyWaitAvailable = () => enabled() && subscribed && Boolean(subscriber?.isReady) && waits.size < MAX_WAITERS
export const beginReportReadyWait = (attemptId: string, epoch: number, delayMs: number, signal?: AbortSignal,
  sinceSequence = notificationSequence) => {
  const key = keyFor(attemptId, epoch)
  const wait = reportReadyWaitAvailable() && Number.isFinite(delayMs) && delayMs > 0
    ? waits.wait(key, delayMs, signal) : null
  // A notification during the first DB read must not be lost before registration.
  // The sequence contains no identities or authorization decisions. An unrelated
  // notification can only cause an extra authoritative read, never a READY result.
  if (wait && notificationSequence !== sinceSequence) waits.wake(key)
  return wait
}

/** Advisory only: failures never change a committed receipt or report status. */
const publishMessage = async (message: string): Promise<void> => {
  if (!transportEnabled()) return
  try {
    if (!publisher?.isReady) {
      if (!publisherConnecting) {
        if (Date.now() < publisherRetryAt) return
        try { publisher?.destroy() } catch { /* already closed */ }
        const connection = client(); publisher = connection
        connection.on('error', () => { publisherRetryAt = Date.now() + 5000 })
        publisherConnecting = connection.connect().then(() => true).catch(() => {
          publisherRetryAt = Date.now() + 5000
          try { connection.destroy() } catch { /* already closed */ }
          return false
        }).finally(() => { publisherConnecting = null })
      }
      if (!await bounded(publisherConnecting)) return
    }
    if (publisher?.isReady) await publisher.publish(TOPIC, message)
  } catch { /* timeout polling and authoritative PostgreSQL reads remain available */ }
}

export const publishReportReady = async (attemptId: string, epoch: number): Promise<void> => {
  if (enabled()) await publishMessage(keyFor(attemptId, epoch))
}
/** Same advisory connection/topic; neither receipts nor leases depend on delivery. */
export const publishReportSchedulingHint = async (message: string): Promise<void> => {
  if (message.length <= 350) await publishMessage(ADVISORY_PREFIX + message)
}
export const onReportSchedulingHint = (listener: (message: string) => void) => {
  advisoryListeners.add(listener)
  void prepareReportReadyNotifications()
  return () => { advisoryListeners.delete(listener) }
}

export const stopReportReadyNotifications = () => {
  waits.unavailable(); subscribed = false
  for (const connection of [subscriber, publisher]) { try { connection?.destroy() } catch { /* already closed */ } }
  subscriber = null; publisher = null
}
