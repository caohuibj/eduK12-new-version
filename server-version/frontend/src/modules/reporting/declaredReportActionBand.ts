export const CHINESE_SELF_CONCEPT_ACTIONS = 'chinese-self-concept-door-with-actions-v2'

const bands = ['very_low', 'low', 'middle', 'high', 'very_high'] as const
export type ChineseSelfConceptBand = typeof bands[number]

export function getDeclaredActionBand(illustrationKey: string | undefined, blocks: readonly unknown[]) {
  if (illustrationKey !== CHINESE_SELF_CONCEPT_ACTIONS || !Array.isArray(blocks)) return null
  let match: { index: number; band: ChineseSelfConceptBand } | null = null
  for (const [index, value] of blocks.entries()) {
    if (!value || typeof value !== 'object') continue
    const block = value as Record<string, unknown>
    if (block.type !== 'REFERENCE_BAND' || block.metricKey !== 'academic_self_concept') continue
    const band = bands.find(key => key === block.bandKey)
    if (!band || match) return null
    match = { index, band }
  }
  return match
}
