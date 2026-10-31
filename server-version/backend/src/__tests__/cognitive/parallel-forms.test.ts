import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { buildParallelFormDesign, PARALLEL_FORM_DESIGN_VERSION } from '../../modules/cognitive/banks/parallel-forms'
import { ICARMATRIX_V2_BANK } from '../../modules/cognitive/tasks/icarmatrix/generator-v2'

describe('age-isolated parallel form design (content-only, not equated)', () => {
  for (const matrixType of ['2x2', '3x3'] as const) {
    const form = buildParallelFormDesign({ matrixType })
    it(`never mixes child and standard bank items in ${matrixType} forms`, () => {
      const bankIds = ICARMATRIX_V2_BANK.filter((item) => item.matrixType === matrixType).map((i) => i.itemId).sort()
      const unique = form.forms.flatMap((f) => f.itemIds)
      expect([...unique, ...form.anchorItemIds].sort()).toEqual(bankIds)
      expect(new Set(unique).size).toBe(unique.length)
      expect(form.balancingBasis).toBe('content-only')
      for (const part of form.forms) {
        expect(part.itemIds).not.toEqual([])
        expect(part.itemIds.length + form.anchorItemIds.length).toBeGreaterThanOrEqual(5)
        expect(part.itemIds.every((id) => bankIds.includes(id))).toBe(true)
      }
    })
    it(`keeps a versioned, read-only design snapshot for ${matrixType}`, () => {
      const filename = matrixType === '2x2' ? 'parallel-form-design.child.json' : 'parallel-form-design.json'
      const persisted = JSON.parse(readFileSync(path.resolve('../tools/matrix-generation', filename), 'utf8'))
      expect(form.designVersion).toBe(PARALLEL_FORM_DESIGN_VERSION)
      expect(persisted).toEqual(form)
    })
  }
  it('refuses mismatched bank and unattainable lengths', () => {
    expect(() => buildParallelFormDesign({ matrixType: '2x2', stimulusSetVersion: 'unknown-bank' })).toThrow(/Unsupported/)
    expect(() => buildParallelFormDesign({ matrixType: '2x2', minItemsPerForm: 8 })).toThrow(/Not enough/)
  })
})
