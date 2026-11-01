import { describe, expect, it } from 'vitest'
import { buildReadingcompItems, READINGCOMP_PRACTICE_ITEM } from '../prng'
import { READINGCOMP_BANK } from '../bank'
import { READINGCOMP_BANK as authoritative } from '../../../../../../../backend/src/modules/cognitive/tasks/readingcomp/bank'

describe('readingcomp audited bank and sequence', () => {
  it('presents the exact authoritative text without shipping formal answers or explanations', () => {
    expect(READINGCOMP_BANK).toEqual(authoritative.map(({ answer: _answer, explanation: _explanation, ...item }) => item))
    expect(READINGCOMP_BANK).toHaveLength(36)
    expect(new Set(READINGCOMP_BANK.map(item => item.id)).size).toBe(36)
    for (const item of READINGCOMP_BANK) {
      expect(new Set(item.options).size).toBe(4)
      expect(item).not.toHaveProperty('answer')
    }
  })
  it.each([18, 30, 36])('generates exactly %i distinct formal items for a profile', count => {
    const items = buildReadingcompItems('profile-seed', count)
    expect(items).toHaveLength(count)
    expect(new Set(items.map(item => item.itemId)).size).toBe(count)
    expect(items).toEqual(buildReadingcompItems('profile-seed', count))
    expect(items.every(item => item.itemId !== READINGCOMP_PRACTICE_ITEM.id)).toBe(true)
    expect(items.every(item => item.passage !== READINGCOMP_PRACTICE_ITEM.passage)).toBe(true)
  })
  it('rejects impossible counts instead of silently ending early', () => {
    for (const count of [0, -1, 1.5, 37, 99, NaN]) expect(() => buildReadingcompItems('s', count)).toThrow(RangeError)
  })
  it('changes order across seeds while preserving frozen option order', () => {
    expect(buildReadingcompItems('a', 36)).not.toEqual(buildReadingcompItems('b', 36))
    for (const item of buildReadingcompItems('a', 36)) expect(item.options).toEqual(READINGCOMP_BANK.find(entry => entry.id === item.itemId)!.options)
  })
})
