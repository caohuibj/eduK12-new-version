import { describe, expect, it } from 'vitest'
import { buildSymbolmatchSequence } from '../prng'

describe('symbolmatch prng', () => {
  it('produces deterministic in-set sequences for a fixed seed', () => {
    const first = buildSymbolmatchSequence('seed-1', 20, ['●', '■', '▲', '◆', '★'])
    const second = buildSymbolmatchSequence('seed-1', 20, ['●', '■', '▲', '◆', '★'])
    expect(first).toEqual(second)
    for (const symbol of first) expect(['●', '■', '▲', '◆', '★']).toContain(symbol)
  })

  it('covers multiple symbols and avoids long repeats', () => {
    const sequence = buildSymbolmatchSequence('seed-2', 40, ['●', '■', '▲', '◆', '★'])
    expect(new Set(sequence).size).toBeGreaterThanOrEqual(4)
    let maxRun = 1
    let run = 1
    for (let index = 1; index < sequence.length; index += 1) {
      run = sequence[index] === sequence[index - 1] ? run + 1 : 1
      maxRun = Math.max(maxRun, run)
    }
    expect(maxRun).toBeLessThanOrEqual(2)
  })

  it('changes the sequence when the seed changes', () => {
    expect(buildSymbolmatchSequence('a', 12, ['●', '■', '▲'])).not.toEqual(buildSymbolmatchSequence('b', 12, ['●', '■', '▲']))
  })
})
