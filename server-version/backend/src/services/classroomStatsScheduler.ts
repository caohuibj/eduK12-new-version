import { logger } from '../utils/logger'

type RebuildStats = (classroomId: string, questionId: string, startedAt?: string) => Promise<void>

type PendingStats = {
  classroomId: string
  questionId: string
  startedAt?: string
  timer: NodeJS.Timeout | null
  firstScheduledAt: number
}

/**
 * Coalesces high-frequency answer events into one authoritative stats rebuild
 * per question window. The answer transaction never waits for this scheduler.
 */
export class ClassroomStatsScheduler {
  private readonly pending = new Map<string, PendingStats>()
  private readonly inFlight = new Map<string, Promise<void>>()
  private readonly cancelled = new Set<string>()
  private readonly delayMs: number
  private readonly maxWaitMs: number
  private readonly retryDelayMs: number

  constructor(
    private readonly rebuild: RebuildStats,
    delayMs = 300,
    maxWaitMs = Math.max(delayMs, 500),
  ) {
    this.delayMs = Math.max(0, delayMs)
    this.maxWaitMs = Math.max(this.delayMs, maxWaitMs)
    this.retryDelayMs = Math.max(1000, this.maxWaitMs)
  }

  schedule(classroomId: string, questionId: string, startedAt?: string): void {
    const key = `${classroomId}:${questionId}${startedAt ? ':' + startedAt : ''}`
    this.cancelled.delete(key)
    const now = Date.now()
    const pending = this.pending.get(key) ?? {
      classroomId,
      questionId,
      startedAt,
      timer: null,
      firstScheduledAt: now,
    }
    if (pending.timer) clearTimeout(pending.timer)
    const maxRemaining = Math.max(0, this.maxWaitMs - (now - pending.firstScheduledAt))
    const delay = Math.min(this.delayMs, maxRemaining)
    this.pending.set(key, pending)
    if (delay === 0) {
      void this.flush(classroomId, questionId, startedAt).catch((error) => {
        logger.error('课堂统计异步重建失败', { classroomId, questionId, error })
      })
      return
    }
    pending.timer = setTimeout(() => {
      pending.timer = null
      void this.flush(classroomId, questionId, startedAt).catch((error) => {
        logger.error('课堂统计异步重建失败', { classroomId, questionId, error })
      })
    }, delay)
  }

  async flush(classroomId: string, questionId: string, startedAt?: string): Promise<void> {
    const key = `${classroomId}:${questionId}${startedAt ? ':' + startedAt : ''}`
    const running = this.inFlight.get(key)
    if (running) {
      await running
      return this.flush(classroomId, questionId, startedAt)
    }
    const pending = this.pending.get(key)
    if (!pending) return
    if (pending.timer) clearTimeout(pending.timer)
    this.pending.delete(key)

    const rebuild = (async () => {
      try {
        if (startedAt === undefined) await this.rebuild(classroomId, questionId)
        else await this.rebuild(classroomId, questionId, startedAt)
      } catch (error) {
        if (!this.cancelled.has(key)) this.scheduleRetry(classroomId, questionId, startedAt)
        throw error
      }
    })()
    this.inFlight.set(key, rebuild)
    try {
      await rebuild
    } finally {
      if (this.inFlight.get(key) === rebuild) this.inFlight.delete(key)
      this.cancelled.delete(key)
    }
  }

  async flushAll(): Promise<void> {
    while (this.pending.size > 0 || this.inFlight.size > 0) {
      const entries = [...this.pending.values()]
      const running = [...this.inFlight.values()]
      await Promise.all([
        ...entries.map((entry) => this.flush(entry.classroomId, entry.questionId, entry.startedAt)),
        ...running,
      ])
    }
  }

  clear(): void {
    for (const pending of this.pending.values()) {
      if (pending.timer) clearTimeout(pending.timer)
    }
    this.pending.clear()
    for (const key of this.inFlight.keys()) this.cancelled.add(key)
  }

  cancel(classroomId: string, questionId: string, startedAt?: string): void {
    const key = `${classroomId}:${questionId}${startedAt ? ':' + startedAt : ''}`
    const pending = this.pending.get(key)
    if (pending?.timer) clearTimeout(pending.timer)
    this.pending.delete(key)
    if (this.inFlight.has(key)) this.cancelled.add(key)
  }

  get size(): number {
    return this.pending.size
  }

  private scheduleRetry(classroomId: string, questionId: string, startedAt?: string): void {
    const key = `${classroomId}:${questionId}${startedAt ? ':' + startedAt : ''}`
    const existing = this.pending.get(key)
    if (existing?.timer) return
    const pending = existing ?? {
      classroomId,
      questionId,
      startedAt,
      timer: null,
      firstScheduledAt: Date.now(),
    }
    this.pending.set(key, pending)
    pending.timer = setTimeout(() => {
      pending.timer = null
      void this.flush(classroomId, questionId, startedAt).catch((error) => {
        logger.error('课堂统计异步重建重试失败', { classroomId, questionId, error })
      })
    }, this.retryDelayMs)
  }
}
