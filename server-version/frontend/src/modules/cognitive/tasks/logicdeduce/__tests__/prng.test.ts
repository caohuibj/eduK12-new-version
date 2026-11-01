import { describe, expect, it } from 'vitest'
import { buildLogicdeduceItems, LOGICDEDUCE_PRACTICE_ITEM } from '../prng'
import { LOGICDEDUCE_BANK } from '../bank'

describe('logicdeduce prng', () => {
  it('samples deterministic distinct items from the frozen bank', () => {
    const first = buildLogicdeduceItems('seed-1', 30)
    const second = buildLogicdeduceItems('seed-1', 30)
    expect(first).toEqual(second)
    expect(new Set(first.map((item) => item.itemId)).size).toBe(24)
    for (const item of first) {
      expect(LOGICDEDUCE_BANK.some((bankItem) => bankItem.id === item.itemId)).toBe(true)
    }
  })

  it('caps at the bank size and keeps option order', () => {
    const items = buildLogicdeduceItems('seed-2', 99)
    expect(items).toHaveLength(LOGICDEDUCE_BANK.length)
    for (const item of items) {
      const bankItem = LOGICDEDUCE_BANK.find((candidate) => candidate.id === item.itemId)!
      expect(item.options).toEqual(bankItem.options)
    }
  })

  it('keeps the practice item fixed', () => {
    expect(LOGICDEDUCE_PRACTICE_ITEM.id).toBe('ld-01')
  })
})
