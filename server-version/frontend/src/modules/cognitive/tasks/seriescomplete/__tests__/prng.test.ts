import { describe, expect, it } from 'vitest'
import { buildSeriescompleteItems, SERIESCOMPLETE_PRACTICE_ITEM } from '../prng'
import { SERIESCOMPLETE_BANK } from '../bank'

describe('seriescomplete prng', () => {
  it('samples deterministic distinct items from the frozen bank', () => {
    const first = buildSeriescompleteItems('seed-1', 30)
    const second = buildSeriescompleteItems('seed-1', 30)
    expect(first).toEqual(second)
    expect(new Set(first.map((item) => item.itemId)).size).toBe(24)
    for (const item of first) {
      expect(SERIESCOMPLETE_BANK.some((bankItem) => bankItem.id === item.itemId)).toBe(true)
    }
  })

  it('caps at the bank size and keeps option order', () => {
    const items = buildSeriescompleteItems('seed-2', 99)
    expect(items).toHaveLength(SERIESCOMPLETE_BANK.length)
    for (const item of items) {
      const bankItem = SERIESCOMPLETE_BANK.find((candidate) => candidate.id === item.itemId)!
      expect(item.options).toEqual(bankItem.options)
    }
  })

  it('keeps the practice item fixed', () => {
    expect(SERIESCOMPLETE_PRACTICE_ITEM.id).toBe('sc-01')
  })
})
