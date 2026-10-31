import { describe, expect, it } from 'vitest'
import { buildWordproblemItems, WORDPROBLEM_PRACTICE_ITEM } from '../prng'
import { WORDPROBLEM_BANK } from '../bank'

describe('wordproblem prng', () => {
  it('samples deterministic distinct items from the frozen bank', () => {
    const first = buildWordproblemItems('seed-1', 30)
    const second = buildWordproblemItems('seed-1', 30)
    expect(first).toEqual(second)
    expect(new Set(first.map((item) => item.itemId)).size).toBe(24)
    for (const item of first) {
      expect(WORDPROBLEM_BANK.some((bankItem) => bankItem.id === item.itemId)).toBe(true)
    }
  })

  it('caps at the bank size and keeps option order', () => {
    const items = buildWordproblemItems('seed-2', 99)
    expect(items).toHaveLength(WORDPROBLEM_BANK.length)
    for (const item of items) {
      const bankItem = WORDPROBLEM_BANK.find((candidate) => candidate.id === item.itemId)!
      expect(item.options).toEqual(bankItem.options)
    }
  })

  it('keeps the practice item fixed', () => {
    expect(WORDPROBLEM_PRACTICE_ITEM.id).toBe('wp-03')
  })
})
