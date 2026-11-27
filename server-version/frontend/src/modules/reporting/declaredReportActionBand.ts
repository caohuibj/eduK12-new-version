export const CHINESE_SELF_CONCEPT_ACTIONS = 'chinese-self-concept-door-with-actions-v2'

const readingBands = ['very_low', 'low', 'middle', 'high', 'very_high'] as const
export type ChineseSelfConceptBand = typeof readingBands[number]

const who5Bands = ['who5_under_13', 'who5_from_13'] as const
export type DeclaredActionBand = ChineseSelfConceptBand | (typeof who5Bands)[number]

export function getDeclaredActionBand(illustrationKey: string | undefined, blocks: readonly unknown[]) {
  if (!Array.isArray(blocks)) return null
  const reading = illustrationKey === CHINESE_SELF_CONCEPT_ACTIONS
  if (!reading && illustrationKey !== 'who5-fortnight-v1') return null
  const metric = reading ? 'academic_self_concept' : 'raw_total'
  const bandKeys: readonly DeclaredActionBand[] = reading ? readingBands : who5Bands
  let match: { index: number; band: DeclaredActionBand } | null = null
  for (const [index, value] of blocks.entries()) {
    if (!value || typeof value !== 'object') continue
    const block = value as Record<string, unknown>
    if (block.type !== 'REFERENCE_BAND' || block.metricKey !== metric) continue
    if (!reading && block.referenceKind !== 'criterion_threshold') return null
    const band = bandKeys.find(key => key === block.bandKey)
    if (!band || match) return null
    match = { index, band }
  }
  return match
}
