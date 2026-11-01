import type { GamblingdeckDeck } from '../../types'

/** 与后端 scoringVersion 1.0.0 钉死的计划一致；仅用于前端展示每次开箱的输赢反馈。 */
export const DECK_SCHEDULE: Record<GamblingdeckDeck, number[]> = {
  A: [100, 100, 100, 100, 100, -150, -150, -150, -150, -150],
  B: [100, 100, 100, 100, 100, 100, 100, 100, 100, -1150],
  C: [50, 50, 50, 50, 50, 50, 50, 50, 50, -200],
  D: [25, 25, 25, 25, 25, 25, 25, 25, 25, 25],
}

export const DECKS: GamblingdeckDeck[] = ['A', 'B', 'C', 'D']

export const DECK_STYLES: Record<GamblingdeckDeck, string> = {
  A: 'bg-amber-100 border-amber-300 text-amber-800',
  B: 'bg-rose-100 border-rose-300 text-rose-800',
  C: 'bg-sky-100 border-sky-300 text-sky-800',
  D: 'bg-emerald-100 border-emerald-300 text-emerald-800',
}

/** 产出第 position 次开箱（0-based）的净结果，与后端推导一致。 */
export const deckOutcome = (deck: GamblingdeckDeck, position: number): number =>
  DECK_SCHEDULE[deck][position % DECK_SCHEDULE[deck].length]
