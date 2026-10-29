/**
 * SPANE-12: score positive and negative items independently, then SPANE-B = P - N.
 * Instrument-local custom scorer; no shared scoring-engine or schema changes.
 * Every absent score is null; no zero filling or imputation.
 */
import type { ScaleCustomScorer, ScaleScoreValue } from '../../../scale-scoring'

export const SPANE_SCORER_KEY = 'spane12.balance.v1' as const

const POSITIVE = ["SPANE12_01","SPANE12_03","SPANE12_05","SPANE12_07","SPANE12_10","SPANE12_12"] as const
const NEGATIVE = ["SPANE12_02","SPANE12_04","SPANE12_06","SPANE12_08","SPANE12_09","SPANE12_11"] as const

export const spane12BalanceScorer: ScaleCustomScorer = ({ definition, itemScores }) => {
  const values = new Map(itemScores.map((item) => [item.itemCode, item.score]))
  const answered = (codes: readonly string[]): string[] => codes.filter((c) => values.has(c))
  const sum = (codes: readonly string[]): number | null => (
    codes.every((c) => values.has(c))
      ? codes.reduce((acc, c) => acc + (values.get(c) as number), 0)
      : null
  )
  const p = sum(POSITIVE)
  const n = sum(NEGATIVE)
  const valueByKey: Record<string, number | null> = {
    spane_p: p, spane_n: n, spane_b: p === null || n === null ? null : p - n,
  }
  const answerCodes: Record<string, readonly string[]> = {
    spane_p: POSITIVE, spane_n: NEGATIVE, spane_b: [...POSITIVE, ...NEGATIVE],
  }
  const scores: ScaleScoreValue[] = definition.scoring.scores.map((score) => {
    const source = answerCodes[score.key]
    if (!source || !score.range) throw new Error('SPANE scorer missing declared source or score range: ' + score.key)
    const value = valueByKey[score.key]
    return {
      key: score.key,
      type: score.type,
      label: score.label,
      description: score.description,
      direction: score.direction,
      canonical: score.canonical,
      displayPrecision: score.displayPrecision,
      value,
      range: score.range,
      expectedItems: [...source],
      answeredItems: answered(source),
      status: value === null ? 'not_calculable' : 'calculated',
      prorated: false,
    }
  })
  const missing = scores.some((score) => score.status !== 'calculated')
  return {
    scores,
    quality: {
      status: missing ? 'invalid' : 'interpretable',
      flags: missing ? ['missing_items', 'score_not_calculable'] : [],
    },
  }
}
