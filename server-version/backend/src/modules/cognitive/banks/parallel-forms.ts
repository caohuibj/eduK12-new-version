/** Matrix parallel-form design only: not a psychometrically equated test. */
import { ICARMATRIX_V2_BANK, ICARMATRIX_V2_STIMULUS_SET_VERSION } from '../tasks/icarmatrix/generator-v2'

export const PARALLEL_FORM_DESIGN_VERSION = 'matgen-forms-v1.1.0'

export interface ParallelFormDesign {
  schemaVersion: 1
  designVersion: string
  stimulusSetVersion: string
  matrixType: '2x2' | '3x3'
  formCount: number
  /** Common anchors belong to every form, but are not duplicated in forms[].itemIds. */
  anchorItemIds: string[]
  forms: Array<{ formId: string; itemIds: string[]; ruleCoverage: Record<string, number> }>
  balancingBasis: 'content-only'
}

export const buildParallelFormDesign = (options: {
  matrixType: '2x2' | '3x3'
  formCount?: number
  minItemsPerForm?: number
  stimulusSetVersion?: string
}): ParallelFormDesign => {
  const formCount = options.formCount ?? 3
  const minItemsPerForm = options.minItemsPerForm ?? 5
  const stimulusSetVersion = options.stimulusSetVersion ?? ICARMATRIX_V2_STIMULUS_SET_VERSION
  if (!Number.isInteger(formCount) || formCount < 2 || formCount > 26 ||
      !Number.isInteger(minItemsPerForm) || minItemsPerForm < 1) throw Error('Invalid form count or target length')
  if (stimulusSetVersion !== ICARMATRIX_V2_STIMULUS_SET_VERSION) throw Error('Unsupported frozen bank version')
  // The child/standard tracks are NOT on a common scale. Never mix their anchors.
  const source = ICARMATRIX_V2_BANK.filter((item) => item.matrixType === options.matrixType)
  const allItems = source.map((item) => item.itemId)
  const byItem = new Map(source.map((item) => [item.itemId, item.ruleTags]))
  if (allItems.length < formCount * 2) throw Error('Bank too small for the requested parallel forms')
  const families = [...new Set(source.flatMap((item) => item.ruleTags))].sort()
  const anchorItemIds: string[] = []
  const assigned = new Set<string>()
  for (const family of families) {
    const candidate = allItems.find((id) => !assigned.has(id) && (byItem.get(id) ?? []).includes(family))
    if (candidate) { anchorItemIds.push(candidate); assigned.add(candidate) }
  }
  const forms: string[][] = Array.from({ length: formCount }, () => [])
  const coverage: Map<string, number>[] = Array.from({ length: formCount }, () => new Map())
  const rarity = (id: string): number => Math.min(...(byItem.get(id) ?? []).map((tag) =>
    allItems.filter((other) => (byItem.get(other) ?? []).includes(tag)).length))
  const remaining = allItems.filter((id) => !assigned.has(id)).sort((a, b) => rarity(a) - rarity(b))
  for (const itemId of remaining) {
    const tags = byItem.get(itemId) ?? []
    let bestForm = 0
    let bestScore = Infinity
    for (let form = 0; form < formCount; form += 1) {
      const score = tags.reduce((sum, tag) => sum + (coverage[form].get(tag) ?? 0), 0) * 100 + forms[form].length
      if (score < bestScore) { bestScore = score; bestForm = form }
    }
    forms[bestForm].push(itemId)
    for (const tag of tags) coverage[bestForm].set(tag, (coverage[bestForm].get(tag) ?? 0) + 1)
  }
  if (forms.some((items) => items.length + anchorItemIds.length < minItemsPerForm)) {
    throw Error('Not enough independent items for requested age-specific form length')
  }
  const ruleCoverage = (ids: string[]) => {
    const result: Record<string, number> = {}
    for (const id of ids) {
      for (const tag of byItem.get(id) ?? []) result[tag] = (result[tag] ?? 0) + 1
    }
    return result
  }
  return {
    schemaVersion: 1,
    designVersion: PARALLEL_FORM_DESIGN_VERSION,
    stimulusSetVersion,
    matrixType: options.matrixType,
    formCount,
    anchorItemIds: anchorItemIds.sort(),
    forms: forms.map((ids, index) => ({
      formId: `form-${String.fromCharCode(65 + index)}`,
      itemIds: ids.sort(),
      ruleCoverage: ruleCoverage([...anchorItemIds, ...ids]),
    })),
    balancingBasis: 'content-only',
  }
}
