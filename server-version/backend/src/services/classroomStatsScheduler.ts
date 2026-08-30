import { logger } from '../utils/logger'

type RebuildStats = (classroomId: string, questionId: string) => Promise<void>

type PendingStats = {
  classroomId: string
  questionId: string
  timer: NodeJS.Timeout
}

/**
 * Coalesces high-frequency answer events into one authoritative stats rebuild
 * per question window. The answer transaction never waits for this scheduler.
 */
export class ClassroomStatsScheduler {
  private readonly pending = new Map<string, PendingStats>()

  constructor(
    private readonly rebuild: RebuildStats,
    private readonly delayMs = 300,
  ) {}

  schedule(classroomId: string, questionId: string): void {
    const key = `${classroomId}:${questionId}`
    const previous = this.pending.get(key)
    if (previous) clearTimeout(previous.timer)
    const timer = setTimeout(() => {
      void this.flush(classroomId, questionId).catch((error) => {
        logger.error('课堂统计异步重建失败', { classroomId, questionId, error })
      })
    }, Math.max(0, this.delayMs))
    this.pending.set(key, { classroomId, questionId, timer })
  }

  async flush(classroomId: string, questionId: string): Promise<void> {
    const key = `${classroomId}:${questionId}`
    const pending = this.pending.get(key)
    if (pending) {
      clearTimeout(pending.timer)
      this.pending.delete(key)
    }
    await this.rebuild(classroomId, questionId)
  }

  async flushAll(): Promise<void> {
    const entries = [...this.pending.values()]
    await Promise.all(entries.map((entry) => this.flush(entry.classroomId, entry.questionId)))
  }

  clear(): void {
    for (const pending of this.pending.values()) clearTimeout(pending.timer)
    this.pending.clear()
  }

  get size(): number {
    return this.pending.size
  }
}
