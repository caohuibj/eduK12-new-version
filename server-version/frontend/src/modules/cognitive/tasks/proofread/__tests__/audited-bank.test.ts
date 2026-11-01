import { describe, expect, it } from 'vitest'
import { buildProofreadItems, PROOFREAD_PRACTICE_ITEM } from '../prng'
import { PROOFREAD_BANK } from '../bank'
import { PROOFREAD_BANK as authoritative } from '../../../../../../../backend/src/modules/cognitive/tasks/proofread/bank'

describe('proofread audited bank and sequence', () => {
  it('presents the exact authoritative text without shipping formal answers or explanations', () => {
    expect(PROOFREAD_BANK).toEqual(authoritative.map(({ answer: _answer, explanation: _explanation, correction: _correction, correctedStem: _correctedStem, ...item }) => item))
    expect(PROOFREAD_BANK).toHaveLength(36)
    expect(new Set(PROOFREAD_BANK.map(item => item.id)).size).toBe(36)
    for (const item of PROOFREAD_BANK) {
      expect(new Set(item.options).size).toBe(4)
      expect(item).not.toHaveProperty('answer')
    }
  })
  it.each([18, 30, 36])('generates exactly %i distinct formal items for a profile', count => {
    const items = buildProofreadItems('profile-seed', count)
    expect(items).toHaveLength(count)
    expect(new Set(items.map(item => item.itemId)).size).toBe(count)
    expect(items).toEqual(buildProofreadItems('profile-seed', count))
    expect(items.every(item => item.itemId !== PROOFREAD_PRACTICE_ITEM.id)).toBe(true)
    expect(items.every(item => item.stem !== PROOFREAD_PRACTICE_ITEM.stem)).toBe(true)
  })
  it('rejects impossible counts instead of silently ending early', () => {
    for (const count of [0, -1, 1.5, 37, 99, NaN]) expect(() => buildProofreadItems('s', count)).toThrow(RangeError)
  })
  it('changes order across seeds while preserving frozen option order', () => {
    expect(buildProofreadItems('a', 36)).not.toEqual(buildProofreadItems('b', 36))
    for (const item of buildProofreadItems('a', 36)) expect(item.options).toEqual(PROOFREAD_BANK.find(entry => entry.id === item.itemId)!.options)
  })
})
