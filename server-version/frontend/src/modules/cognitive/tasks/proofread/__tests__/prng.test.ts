import { describe, expect, it } from 'vitest'
import { buildProofreadItems, PROOFREAD_PRACTICE_ITEM } from '../prng.v1'
import { PROOFREAD_BANK } from '../bank.v1'

describe('proofread prng', () => {
  it('samples deterministic distinct items from the frozen bank', () => {
    const first = buildProofreadItems('seed-1', 30)
    const second = buildProofreadItems('seed-1', 30)
    expect(first).toEqual(second)
    expect(new Set(first.map((item) => item.itemId)).size).toBe(24)
    for (const item of first) {
      expect(PROOFREAD_BANK.some((bankItem) => bankItem.id === item.itemId)).toBe(true)
    }
  })

  it('caps at the bank size and keeps option order', () => {
    const items = buildProofreadItems('seed-2', 99)
    expect(items).toHaveLength(PROOFREAD_BANK.length)
    for (const item of items) {
      const bankItem = PROOFREAD_BANK.find((candidate) => candidate.id === item.itemId)!
      expect(item.options).toEqual(bankItem.options)
    }
  })

  it('keeps the practice item fixed', () => {
    expect(PROOFREAD_PRACTICE_ITEM.id).toBe('pf-01')
  })
})
