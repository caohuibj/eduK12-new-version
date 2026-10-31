import { describe, expect, it } from 'vitest'
import { writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { buildParallelFormDesign, PARALLEL_FORM_DESIGN_VERSION } from '../../modules/cognitive/banks/parallel-forms'
import { ICARMATRIX_V2_BANK } from '../../modules/cognitive/tasks/icarmatrix/generator-v2'

/**
 * COG-Intelligence Roadmap v2.0 PR6 — 平行题组设计质检。
 * 设计只做内容平衡（roadmap：难度平衡属统计证据，待真实标定）。
 */
describe('parallel form design (roadmap v2.0 PR6)', () => {
  const design = buildParallelFormDesign()

  it('partitions the bank conserving every item with shared anchors', () => {
    const allBankIds = ICARMATRIX_V2_BANK.map((item) => item.itemId).sort()
    const assigned = design.forms.flatMap((form) => form.itemIds).sort()
    expect(design.formCount).toBe(3)
    expect(design.balancingBasis).toBe('content-only')
    expect([...assigned, ...design.anchorItemIds].sort()).toEqual(allBankIds)
    // forms 之间不重叠
    const overlap = design.forms[0].itemIds.filter((id) => design.forms[1].itemIds.includes(id) || design.forms[2].itemIds.includes(id))
    expect(overlap).toEqual([])
    // 锚题不进入任何 form
    for (const form of design.forms) {
      for (const anchor of design.anchorItemIds) expect(form.itemIds).not.toContain(anchor)
    }
  })

  it('keeps rule coverage balanced across forms (content-only basis)', () => {
    const rules = [...new Set(ICARMATRIX_V2_BANK.flatMap((item) => item.ruleTags))].sort()
    for (const rule of rules) {
      const perForm = design.forms.map((form) => form.ruleCoverage[rule] ?? 0)
      expect(Math.max(...perForm) - Math.min(...perForm), `${rule} coverage spread`).toBeLessThanOrEqual(2)
    }
    // 每组至少覆盖一半以上的规则族
    for (const form of design.forms) {
      expect(Object.keys(form.ruleCoverage).length).toBeGreaterThanOrEqual(Math.ceil(rules.length / 2))
    }
  })

  it('writes the versioned design artifact next to the bank tooling', () => {
    expect(design.designVersion).toBe(PARALLEL_FORM_DESIGN_VERSION)
    const outPath = path.resolve('../tools/matrix-generation/parallel-form-design.json')
    writeFileSync(outPath, `${JSON.stringify(design, null, 2)}\n`)
    const persisted = JSON.parse(readFileSync(outPath, 'utf8'))
    expect(persisted.designVersion).toBe(PARALLEL_FORM_DESIGN_VERSION)
  })
})
