import { describe, expect, it } from 'vitest'
import {
  CANCELLATION_GRID_SIZE,
  CANCELLATION_TARGET_COUNT,
  cancellationScan,
} from '../generator'

describe('cancellation generator', () => {
  it('rebuilds identical grids for the same seed+scan', () => {
    expect(cancellationScan('seed-1', 0)).toEqual(cancellationScan('seed-1', 0))
  })

  it('places exactly the target count and fills the rest with distractors', () => {
    const scan = cancellationScan('seed-1', 0)
    expect(scan.grid).toHaveLength(CANCELLATION_GRID_SIZE)
    const targetPositions = scan.grid.filter((symbol) => symbol === scan.target)
    expect(targetPositions).toHaveLength(CANCELLATION_TARGET_COUNT)
    expect(scan.targetCells).toHaveLength(CANCELLATION_TARGET_COUNT)
  })

  it('rotates targets across scans and differs across seeds', () => {
    expect(cancellationScan('seed-1', 0).target).not.toBe(cancellationScan('seed-1', 1).target)
    expect(cancellationScan('seed-a', 0).grid).not.toEqual(cancellationScan('seed-b', 0).grid)
  })
})
