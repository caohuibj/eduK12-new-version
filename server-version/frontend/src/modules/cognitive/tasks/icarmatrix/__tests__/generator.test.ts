import { describe, expect, it } from 'vitest'
import { ICARMATRIX_BANK_SIZE, ICARMATRIX_FROZEN_BANK, ICARMATRIX_OPTION_COUNT, icarmatrixItem } from '../generator'

describe('icarmatrix generator', () => {
  it('serves frozen bank items for the first trials regardless of seed', () => {
    const a = icarmatrixItem('seed-a', 0)
    const b = icarmatrixItem('seed-b', 0)
    expect(a).toEqual(b)
    expect(ICARMATRIX_FROZEN_BANK).toHaveLength(ICARMATRIX_BANK_SIZE)
  })

  it('generates seed-stable items after the bank with 6 distinct options', () => {
    const first = icarmatrixItem('seed-1', 10)
    const second = icarmatrixItem('seed-1', 10)
    expect(first).toEqual(second)
    expect(first.options).toHaveLength(ICARMATRIX_OPTION_COUNT)
    expect(first.cells).toHaveLength(8)
    const answers = new Set(first.options.map((option) => `${option.shape}-${option.fill}-${option.count}`))
    expect(answers.size).toBe(ICARMATRIX_OPTION_COUNT)
  })

  it('differs across seeds for generated items', () => {
    expect(icarmatrixItem('seed-a', 12)).not.toEqual(icarmatrixItem('seed-b', 12))
  })

  it('keeps every frozen item answer inside its own options', () => {
    for (const item of ICARMATRIX_FROZEN_BANK) {
      expect(item.answerIndex).toBeGreaterThanOrEqual(0)
      expect(item.answerIndex).toBeLessThan(item.options.length)
    }
  })
})
