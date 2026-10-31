import { describe, expect, it } from 'vitest'
import { buildReadingcompItems, READINGCOMP_PRACTICE_ITEM } from '../prng'
import { READINGCOMP_BANK } from '../bank'

describe('readingcomp prng', () => {
  it('samples deterministic distinct items from the frozen bank', () => {
    const first = buildReadingcompItems('seed-1', 30)
    const second = buildReadingcompItems('seed-1', 30)
    expect(first).toEqual(second)
    expect(new Set(first.map((item) => item.itemId)).size).toBe(16)
    for (const item of first) {
      expect(READINGCOMP_BANK.some((bankItem) => bankItem.id === item.itemId)).toBe(true)
    }
  })

  it('caps at the bank size and keeps option order', () => {
    const items = buildReadingcompItems('seed-2', 99)
    expect(items).toHaveLength(READINGCOMP_BANK.length)
    for (const item of items) {
      const bankItem = READINGCOMP_BANK.find((candidate) => candidate.id === item.itemId)!
      expect(item.options).toEqual(bankItem.options)
    }
  })

  it('keeps the practice item fixed', () => {
    expect(READINGCOMP_PRACTICE_ITEM.id).toBe('rc-01')
  })
})
