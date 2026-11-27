export const CHINESE_SELF_CONCEPT_ACTIONS = 'chinese-self-concept-door-with-actions-v2'

export const CHINESE_SELF_CONCEPT_SCORE_ACTIONS = 'chinese-self-concept-door-with-score-actions-v3'

const bands = ['very_low', 'low', 'middle', 'high', 'very_high'] as const
export type ChineseSelfConceptBand = typeof bands[number]

export function getDeclaredActionBand(illustrationKey: string | undefined, blocks: readonly unknown[]) {
  let source: 'REFERENCE_BAND' | 'SCORE_FEEDBACK'
  if (illustrationKey === CHINESE_SELF_CONCEPT_ACTIONS) source = 'REFERENCE_BAND'
  else if (illustrationKey === CHINESE_SELF_CONCEPT_SCORE_ACTIONS) source = 'SCORE_FEEDBACK'
  else return null
  if (!Array.isArray(blocks)) return null
  let match: { index: number; band: ChineseSelfConceptBand } | null = null
  for (const [index, value] of blocks.entries()) {
    if (!value || typeof value !== 'object') continue
    const block = value as Record<string, unknown>
    if (block.type !== source || block.metricKey !== 'academic_self_concept') continue
    const band = bands.find(key => key === block.bandKey)
    if (!band || match) return null
    match = { index, band }
  }
  return match
}
