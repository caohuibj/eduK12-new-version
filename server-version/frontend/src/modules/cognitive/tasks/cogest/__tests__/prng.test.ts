import { describe, expect, it } from 'vitest'
import { buildCogestItems, COGEST_PRACTICE_ITEM } from '../prng'
import { COGEST_BANK } from '../bank'

describe('cogest prng', () => {
  it('samples deterministic distinct items from the frozen bank', () => {
    const first = buildCogestItems('seed-1', 30)
    const second = buildCogestItems('seed-1', 30)
    expect(first).toEqual(second)
    expect(new Set(first.map((item) => item.itemId)).size).toBe(24)
    for (const item of first) {
      expect(COGEST_BANK.some((bankItem) => bankItem.id === item.itemId)).toBe(true)
    }
  })

  it('caps at the bank size and keeps option order', () => {
    const items = buildCogestItems('seed-2', 99)
    expect(items).toHaveLength(COGEST_BANK.length)
    for (const item of items) {
      const bankItem = COGEST_BANK.find((candidate) => candidate.id === item.itemId)!
      expect(item.options).toEqual(bankItem.options)
    }
  })

  it('keeps the practice item fixed', () => {
    expect(COGEST_PRACTICE_ITEM.id).toBe('ce-01')
  })
})
