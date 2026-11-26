import { describe, expect, it } from 'vitest'
import { ClassroomRoundGuard } from '../classroomRound'

const first = { questionId: 'q', startedAt: '2026-10-04T00:00:00Z' }
const second = { questionId: 'q', startedAt: '2026-10-04T00:01:00.000Z' }
describe('ClassroomRoundGuard', () => {
  it('preserves first-round legacy events but requires a marker after the same question restarts', () => {
    const guard = new ClassroomRoundGuard()
    expect(guard.receive(first)).toBe(true)
    expect(guard.matches({ questionId: 'q' })).toBe(true)
    expect(guard.receive(second)).toBe(true)
    expect(guard.matches({ questionId: 'q' })).toBe(false)
    expect(guard.matches(first)).toBe(false)
    expect(guard.matches({ ...second, startedAt: '2026-10-04T00:01:00Z' })).toBe(true)
    expect(guard.matches({ ...second, startedAt: 'not a date' })).toBe(false)
  })
  it('keeps a high-water mark across clear and rejects old snapshots', () => {
    const guard = new ClassroomRoundGuard()
    guard.receive(second)
    expect(guard.receive(first)).toBe(false)
    expect(guard.clear(first)).toBe(false)
    expect(guard.clear(second)).toBe(true)
    expect(guard.receive(second)).toBe(false)
    expect(guard.receive({ ...second, startedAt: '2026-10-04T00:02:00Z' })).toBe(true)
  })
  it('preserves finished state on replays and resets only for a new round or classroom', () => {
    const guard = new ClassroomRoundGuard()
    guard.receive(first)
    guard.finish(first)
    guard.receive(first)
    expect(guard.finished).toBe(true)
    guard.receive(second)
    expect(guard.finished).toBe(false)
    guard.close()
    expect(guard.receive(second)).toBe(false)
    guard.reset()
    expect(guard.receive(first)).toBe(true)
  })
})
