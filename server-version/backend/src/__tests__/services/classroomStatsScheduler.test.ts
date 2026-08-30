import { describe, expect, it, vi } from 'vitest'
import { ClassroomStatsScheduler } from '../../services/classroomStatsScheduler'

describe('ClassroomStatsScheduler', () => {
  it('coalesces a burst of submissions by classroom and question', async () => {
    vi.useFakeTimers()
    try {
      const rebuild = vi.fn(async () => undefined)
      const scheduler = new ClassroomStatsScheduler(rebuild, 300)

      for (let index = 0; index < 200; index += 1) {
        scheduler.schedule('classroom-1', 'question-1')
      }
      scheduler.schedule('classroom-1', 'question-2')
      expect(scheduler.size).toBe(2)

      await vi.advanceTimersByTimeAsync(299)
      expect(rebuild).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)

      expect(rebuild).toHaveBeenCalledTimes(2)
      expect(rebuild).toHaveBeenCalledWith('classroom-1', 'question-1')
      expect(rebuild).toHaveBeenCalledWith('classroom-1', 'question-2')
      expect(scheduler.size).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('supports an explicit flush for final question state', async () => {
    const rebuild = vi.fn(async () => undefined)
    const scheduler = new ClassroomStatsScheduler(rebuild, 30_000)
    scheduler.schedule('classroom-1', 'question-1')
    await scheduler.flush('classroom-1', 'question-1')

    expect(rebuild).toHaveBeenCalledTimes(1)
    expect(scheduler.size).toBe(0)
  })
})
