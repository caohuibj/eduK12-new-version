import { describe, expect, it } from 'vitest'
import { buildSeqlearnPositions, SEQLEARN_PRACTICE_POSITIONS } from '../prng'

describe('seqlearn prng', () => {
  it('follows the frozen pattern sequence in pattern blocks and respects random blocks', () => {
    const positions = buildSeqlearnPositions('seed-1', 30, 10, [3, 1, 4, 2, 1, 3, 2, 4, 1, 2], [2])
    for (let index = 0; index < 30; index += 1) {
      const block = Math.floor(index / 10) + 1
      if (block === 2) {
        expect(positions[index].isRandomBlock).toBe(true)
        expect(positions[index].position).toBeGreaterThanOrEqual(1)
        expect(positions[index].position).toBeLessThanOrEqual(4)
      } else {
        expect(positions[index].isRandomBlock).toBe(false)
        expect(positions[index].position).toBe([3, 1, 4, 2, 1, 3, 2, 4, 1, 2][index % 10])
      }
    }
  })

  it('is deterministic for a fixed seed', () => {
    expect(buildSeqlearnPositions('seed-1', 20, 10, [1, 2, 3, 4], [2])).toEqual(buildSeqlearnPositions('seed-1', 20, 10, [1, 2, 3, 4], [2]))
  })

  it('keeps the practice positions fixed and in range', () => {
    expect(SEQLEARN_PRACTICE_POSITIONS).toEqual([2, 3, 1, 4])
  })
})
