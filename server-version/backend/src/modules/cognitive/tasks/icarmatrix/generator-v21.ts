/** Seven visually reviewed 3x3 pilot items. No external standard test items. */
import { ICARMATRIX_V2_BANK, generateIcarmatrixV2Plan as legacyPlan } from './generator-v2'
export { ICARMATRIX_V2_BANK, icarmatrixV2OptionOrder, icarmatrixV2IsCorrect, ICARMATRIX_V2_OPTION_COUNT } from './generator-v2'
export const CURRENT_STIMULUS_SET_VERSION = 'matgen-reviewed-v1.0.0'
export const REVIEWED_ITEM_IDS = [
  'matgen-std-shape-shape-001', 'matgen-std-shape-identity-002', 'matgen-std-identity-shape-003',
  'matgen-std-rotate-rotate-006', 'matgen-std-rotate-identity-007', 'matgen-std-identity-rotate-008',
  'matgen-std-shade-rotate-009',
] as const

/** Every profile includes shape, rotation and combined shading/rotation; no repeats. */
export const generateIcarmatrixV2Plan = (seed: string, totalTrials: number, matrixType: '3x3'): number[] => {
  if (!seed || matrixType !== '3x3' || !Number.isInteger(totalTrials) || totalTrials < 4 || totalTrials > 7) {
    throw new Error('reviewed icarmatrix requires a seed and 4..7 distinct 3x3 items')
  }
  const ranked = legacyPlan(seed, 10, '3x3').filter(index =>
    (REVIEWED_ITEM_IDS as readonly string[]).includes(ICARMATRIX_V2_BANK[index].itemId))
  const required = [
    ranked.find(index => ICARMATRIX_V2_BANK[index].ruleTags.includes('shape'))!,
    ranked.find(index => ICARMATRIX_V2_BANK[index].ruleTags.includes('rotate') && !ICARMATRIX_V2_BANK[index].ruleTags.includes('shade'))!,
    ranked.find(index => ICARMATRIX_V2_BANK[index].ruleTags.includes('shade'))!,
  ]
  const chosen = new Set([...required, ...ranked.filter(index => !required.includes(index))].slice(0, totalTrials))
  return ranked.filter(index => chosen.has(index))
}
