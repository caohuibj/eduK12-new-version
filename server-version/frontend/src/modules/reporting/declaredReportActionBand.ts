export const CHINESE_SELF_CONCEPT_ACTIONS = 'chinese-self-concept-door-with-actions-v2'

export const CHEMISTRY_SELF_CONCEPT_ACTIONS = 'chemistry-self-concept-salt-v1'

const bands = ['very_low', 'low', 'middle', 'high', 'very_high'] as const
type Band = typeof bands[number]
export type SelfConceptAction = Band | `chemistry_${Band}`

export function getDeclaredActionBand(illustrationKey: string | undefined, blocks: readonly unknown[]) {
  if ((illustrationKey !== CHINESE_SELF_CONCEPT_ACTIONS && illustrationKey !== CHEMISTRY_SELF_CONCEPT_ACTIONS) || !Array.isArray(blocks)) return null
  let match: { index: number; band: SelfConceptAction } | null = null
  for (const [index, value] of blocks.entries()) {
    if (!value || typeof value !== 'object') continue
    const block = value as Record<string, unknown>
    if (block.type !== 'REFERENCE_BAND' || block.metricKey !== 'academic_self_concept') continue
    if (illustrationKey === CHEMISTRY_SELF_CONCEPT_ACTIONS && block.referenceKind !== 'normative_distribution') continue
    const band = bands.find(key => key === block.bandKey)
    if (!band || match) return null
    match = { index, band: illustrationKey === CHEMISTRY_SELF_CONCEPT_ACTIONS ? `chemistry_${band}` : band }
  }
  return match
}
