import { describe, expect, it } from 'vitest'
import { buildWordmeaningItems, WORDMEANING_PRACTICE_ITEM } from '../prng'
import { WORDMEANING_BANK } from '../bank'

describe('wordmeaning prng', () => {
  it('samples deterministic distinct items from the frozen bank', () => {
    const first = buildWordmeaningItems('seed-1', 30)
    const second = buildWordmeaningItems('seed-1', 30)
    expect(first).toEqual(second)
    expect(new Set(first.map((item) => item.itemId)).size).toBe(30)
    for (const item of first) {
      expect(WORDMEANING_BANK.some((bankItem) => bankItem.id === item.itemId)).toBe(true)
    }
  })

  it('caps at the bank size and keeps option order', () => {
    const items = buildWordmeaningItems('seed-2', 99)
    expect(items).toHaveLength(WORDMEANING_BANK.length)
    for (const item of items) {
      const bankItem = WORDMEANING_BANK.find((candidate) => candidate.id === item.itemId)!
      expect(item.options).toEqual(bankItem.options)
    }
  })

  it('keeps the practice item fixed', () => {
    expect(WORDMEANING_PRACTICE_ITEM.id).toBe('wm-01')
  })
})
