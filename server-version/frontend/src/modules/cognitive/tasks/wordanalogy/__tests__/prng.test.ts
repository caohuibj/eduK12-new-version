import { describe, expect, it } from 'vitest'
import { buildWordanalogyItems, WORDANALOGY_PRACTICE_ITEM } from '../prng'
import { WORDANALOGY_BANK } from '../bank'

describe('wordanalogy prng', () => {
  it('samples deterministic distinct items from the frozen bank', () => {
    const first = buildWordanalogyItems('seed-1', 30)
    const second = buildWordanalogyItems('seed-1', 30)
    expect(first).toEqual(second)
    expect(new Set(first.map((item) => item.itemId)).size).toBe(30)
    for (const item of first) {
      expect(WORDANALOGY_BANK.some((bankItem) => bankItem.id === item.itemId)).toBe(true)
    }
  })

  it('caps at the bank size and keeps option order', () => {
    const items = buildWordanalogyItems('seed-2', 99)
    expect(items).toHaveLength(WORDANALOGY_BANK.length)
    for (const item of items) {
      const bankItem = WORDANALOGY_BANK.find((candidate) => candidate.id === item.itemId)!
      expect(item.options).toEqual(bankItem.options)
    }
  })

  it('keeps the practice item fixed', () => {
    expect(WORDANALOGY_PRACTICE_ITEM.id).toBe('wa-02')
  })
})
