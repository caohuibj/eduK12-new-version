import { logger } from '../utils/logger'

type RebuildStats = (classroomId: string, questionId: string) => Promise<void>

type PendingStats = {
  classroomId: string
  questionId: string
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

  schedule(classroomId: string, questionId: string): void {
    const key = `${classroomId}:${questionId}`
    const now = Date.now()
    const pending = this.pending.get(key) ?? {
      classroomId,
      questionId,
      timer: null,
      firstScheduledAt: now,
    }
    if (pending.timer) clearTimeout(pending.timer)
    const maxRemaining = Math.max(0, this.maxWaitMs - (now - pending.firstScheduledAt))
    const delay = Math.min(this.delayMs, maxRemaining)
    this.pending.set(key, pending)
    if (delay === 0) {
      void this.flush(classroomId, questionId).catch((error) => {
        logger.error('课堂统计异步重建失败', { classroomId, questionId, error })
      })
      return
    }
    pending.timer = setTimeout(() => {
      pending.timer = null
      void this.flush(classroomId, questionId).catch((error) => {
        logger.error('课堂统计异步重建失败', { classroomId, questionId, error })
      })
    }, delay)
  }

  async flush(classroomId: string, questionId: string): Promise<void> {
    const key = `${classroomId}:${questionId}`
    const running = this.inFlight.get(key)
    if (running) return running
    const pending = this.pending.get(key)
    if (!pending) return
    if (pending.timer) clearTimeout(pending.timer)
    this.pending.delete(key)

    const rebuild = (async () => {
      try {
        await this.rebuild(classroomId, questionId)
      } catch (error) {
        this.scheduleRetry(classroomId, questionId)
        throw error
      }
    })()
    this.inFlight.set(key, rebuild)
    try {
      await rebuild
    } finally {
      if (this.inFlight.get(key) === rebuild) this.inFlight.delete(key)
    }
  }

  async flushAll(): Promise<void> {
    while (this.pending.size > 0 || this.inFlight.size > 0) {
      const entries = [...this.pending.values()]
      const running = [...this.inFlight.values()]
      await Promise.all([
        ...entries.map((entry) => this.flush(entry.classroomId, entry.questionId)),
        ...running,
      ])
    }
  }

  clear(): void {
    for (const pending of this.pending.values()) {
      if (pending.timer) clearTimeout(pending.timer)
    }
    this.pending.clear()
  }

  get size(): number {
    return this.pending.size
  }

  private scheduleRetry(classroomId: string, questionId: string): void {
    const key = `${classroomId}:${questionId}`
    const existing = this.pending.get(key)
    if (existing?.timer) return
    const pending = existing ?? {
      classroomId,
      questionId,
      timer: null,
      firstScheduledAt: Date.now(),
    }
    this.pending.set(key, pending)
    pending.timer = setTimeout(() => {
      pending.timer = null
      void this.flush(classroomId, questionId).catch((error) => {
        logger.error('课堂统计异步重建重试失败', { classroomId, questionId, error })
      })
    }, this.retryDelayMs)
  }
}
