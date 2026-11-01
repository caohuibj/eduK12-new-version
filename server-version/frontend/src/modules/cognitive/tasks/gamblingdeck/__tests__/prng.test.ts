import { describe, expect, it } from 'vitest'
import { deckOutcome, DECKS, DECK_SCHEDULE } from '../prng'

describe('gamblingdeck schedule', () => {
  it('pins the frozen per-deck schedules in sync with the scorer', () => {
    expect(DECK_SCHEDULE.A).toHaveLength(10)
    expect(DECK_SCHEDULE.B).toHaveLength(10)
    expect(DECK_SCHEDULE.C).toHaveLength(10)
    expect(DECK_SCHEDULE.D).toHaveLength(10)
    const net = (deck: 'A' | 'B' | 'C' | 'D') => DECK_SCHEDULE[deck].reduce((sum, value) => sum + value, 0)
    expect(net('A')).toBe(-250)
    expect(net('B')).toBe(-250)
    expect(net('C')).toBe(250)
    expect(net('D')).toBe(250)
  })

  it('derives outcomes by cycling within the deck schedule', () => {
    expect(deckOutcome('A', 0)).toBe(100)
    expect(deckOutcome('A', 5)).toBe(-150)
    expect(deckOutcome('A', 10)).toBe(100)
    expect(deckOutcome('B', 9)).toBe(-1150)
  })

  it('exposes exactly four decks', () => {
    expect(DECKS).toEqual(['A', 'B', 'C', 'D'])
  })
})
