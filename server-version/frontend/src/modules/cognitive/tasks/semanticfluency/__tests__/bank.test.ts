import { describe, expect, it } from 'vitest'
import { CATEGORY_LABELS, SEMANTICFLUENCY_BANKS, SEMANTICFLUENCY_CATEGORIES } from '../bank'
import { buildSemanticfluencyRounds } from '../prng'

describe('semanticfluency banks', () => {
  it('exposes the frozen categories with labels', () => {
    expect(SEMANTICFLUENCY_CATEGORIES).toEqual(['animals', 'fruits'])
    expect(CATEGORY_LABELS.animals).toBe('动物')
    expect(CATEGORY_LABELS.fruits).toBe('水果')
  })

  it('keeps bank entries unique after normalization-relevant checks', () => {
    for (const category of SEMANTICFLUENCY_CATEGORIES) {
      const words = SEMANTICFLUENCY_BANKS[category]
      expect(words.length).toBeGreaterThan(50)
      expect(new Set(words).size).toBe(words.length)
      for (const word of words) expect(word.trim()).toBe(word)
    }
  })

  it('alternates and shuffles category rounds deterministically', () => {
    const first = buildSemanticfluencyRounds('seed-1', 6)
    const second = buildSemanticfluencyRounds('seed-1', 6)
    expect(first).toEqual(second)
    const animals = first.filter((round) => round.category === 'animals').length
    const fruits = first.filter((round) => round.category === 'fruits').length
    expect(Math.abs(animals - fruits)).toBeLessThanOrEqual(1)
  })
})
