/**
 * COG-Intelligence Roadmap v2.0 PR6 — 平行题组设计与等值身份。
 *
 * 规则（roadmap §五 PR6 / B3）：
 *  - 平行题组按内容平衡（规则族 + 题量）分配，锚题（anchor）跨组共用。
 *    难度平衡属统计证据：在真实标定（status ≥ PILOT_CALIBRATED）之前，
 *    设计只做内容层面的平衡，不引用任何 IRT 参数（含仿真参数）。
 *  - 平行版本不豁免等值：即使内容相似，跨版本分数也必须经锚题等值
 *    （roadmap B5：等值是三种统计证据之一，独立状态）。
 *  - designVersion 独立版本化；本模块只产出设计，等值证据由阶段二
 *    B3 的统计流程另行登记。
 */

import { ICARMATRIX_V2_BANK, ICARMATRIX_V2_STIMULUS_SET_VERSION } from '../tasks/icarmatrix/generator-v2'

export const PARALLEL_FORM_DESIGN_VERSION = 'matgen-forms-v1.0.0'

export interface ParallelFormDesign {
  schemaVersion: 1
  designVersion: string
  stimulusSetVersion: string
  formCount: number
  /** 锚题：所有组共用的等值链接题（等值证据按 B3 流程登记）。 */
  anchorItemIds: string[]
  forms: Array<{
    formId: string
    itemIds: string[]
    ruleCoverage: Record<string, number>
  }>
  /** 设计原则留痕：仅内容平衡，无难度信息参与（含仿真参数）。 */
  balancingBasis: 'content-only'
}

const collectRuleTags = (): Map<string, string[]> => {
  const byItem = new Map<string, string[]>()
  for (const item of ICARMATRIX_V2_BANK) byItem.set(item.itemId, item.ruleTags)
  return byItem
}

const ruleCoverageFor = (itemIds: string[], byItem: Map<string, string[]>): Record<string, number> => {
  const coverage: Record<string, number> = {}
  for (const itemId of itemIds) {
    for (const tag of byItem.get(itemId) ?? []) coverage[tag] = (coverage[tag] ?? 0) + 1
  }
  return coverage
}

/** 内容平衡分配：先取锚题，再按「最稀缺规则优先」把剩余题轮转分配到各组。 */
export const buildParallelFormDesign = (
  options: { formCount?: number; stimulusSetVersion?: string } = {},
): ParallelFormDesign => {
  const formCount = options.formCount ?? 3
  const stimulusSetVersion = options.stimulusSetVersion ?? ICARMATRIX_V2_STIMULUS_SET_VERSION
  if (formCount < 2) throw new Error('parallel form design requires at least 2 forms')
  const byItem = collectRuleTags()
  const allItems = ICARMATRIX_V2_BANK.map((item) => item.itemId)
  if (allItems.length < formCount * 2) throw new Error('bank too small for parallel forms')

  // 锚题：每个规则族取一题（内容代表性优先，且各组合用）。
  const ruleFamilies = [...new Set([...byItem.values()].flat())].sort()
  const anchorItemIds: string[] = []
  const assigned = new Set<string>()
  for (const family of ruleFamilies) {
    const candidate = allItems.find((itemId) => !assigned.has(itemId) && (byItem.get(itemId) ?? []).includes(family))
    if (candidate) {
      anchorItemIds.push(candidate)
      assigned.add(candidate)
    }
  }

  // 剩余题按「当前组最稀缺规则」轮转分配，保持各 forms 规则覆盖接近。
  const forms: string[][] = Array.from({ length: formCount }, () => [])
  const formCoverage: Map<string, number>[] = Array.from({ length: formCount }, () => new Map())
  const remaining = allItems.filter((itemId) => !assigned.has(itemId))
  // 规则稀缺度升序遍历，让最稀缺的规则先分配。
  const sortedRemaining = [...remaining].sort((a, b) => {
    const rarity = (itemId: string) => Math.min(...(byItem.get(itemId) ?? []).map((tag) => allItems.filter((id) => (byItem.get(id) ?? []).includes(tag)).length))
    return rarity(a) - rarity(b)
  })
  for (const itemId of sortedRemaining) {
    const tags = byItem.get(itemId) ?? []
    // 选「这些规则合计覆盖最低」的组；平局取当前题数最少的组。
    let bestForm = 0
    let bestScore = Number.POSITIVE_INFINITY
    for (let form = 0; form < formCount; form += 1) {
      const score = tags.reduce((sum, tag) => sum + (formCoverage[form].get(tag) ?? 0), 0) * 100 + forms[form].length
      if (score < bestScore) {
        bestScore = score
        bestForm = form
      }
    }
    forms[bestForm].push(itemId)
    assigned.add(itemId)
    for (const tag of tags) formCoverage[bestForm].set(tag, (formCoverage[bestForm].get(tag) ?? 0) + 1)
  }

  return {
    schemaVersion: 1,
    designVersion: PARALLEL_FORM_DESIGN_VERSION,
    stimulusSetVersion,
    formCount,
    anchorItemIds: anchorItemIds.sort(),
    forms: forms.map((itemIds, index) => ({
      formId: `form-${String.fromCharCode(65 + index)}`,
      itemIds: itemIds.sort(),
      ruleCoverage: ruleCoverageFor(itemIds, byItem),
    })),
    balancingBasis: 'content-only',
  }
}
