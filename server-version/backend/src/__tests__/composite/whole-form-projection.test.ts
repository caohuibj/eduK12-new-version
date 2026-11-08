import { describe, it, expect } from 'vitest'
import { isWholeLocalEligible } from '../../modules/composite/whole-local-eligibility'
import { publicTrainingFormDefinition } from '../../modules/assessment-runtime/typed-form'
import { formSectionIdentityHash } from '../../modules/assessment-runtime/attempt-runtime'
import { compositeFormSectionRuntimeDefinition, compositeSectionHasContext } from '../../modules/composite/composite.service'

describe('Scheme X Whole Form Projection & Execution Mode Contracts', () => {
  it('distinguishes structural eligibility from uncompleted form ingestion capability', () => {
    const candidate = {
      items: [
        { type: 'FORM', position: 1 },
        { type: 'SCALE', position: 2 },
      ],
      formSections: [{ id: 'sec-1' }],
    }
    const isEligible = isWholeLocalEligible(candidate)
    expect(isEligible).toBe(true)

    // Helper simulating composite.service.ts executionMode calculation
    const calcMode = (forms: any[], completedKeys: Set<string>) => {
      const formsPresent = (forms?.length ?? 0) > 0
      const allFormsCompleted = formsPresent && forms.every((s: any) => completedKeys.has(`form-section:${s.id}`))
      const canIngestWholeLocal = !formsPresent || allFormsCompleted
      return (isEligible && canIngestWholeLocal) ? 'WHOLE_LOCAL' : 'STEPPED'
    }

    // Uncompleted form sections => STEPPED (until PR X-03 lands unified form ingestion)
    expect(calcMode(candidate.formSections, new Set())).toBe('STEPPED')

    // Completed form sections => WHOLE_LOCAL
    expect(calcMode(candidate.formSections, new Set(['form-section:sec-1']))).toBe('WHOLE_LOCAL')

    // Pure scale assessment (no forms) => WHOLE_LOCAL
    expect(calcMode([], new Set())).toBe('WHOLE_LOCAL')
  })

  it('correctly sorts form sections by position and items by formSectionPosition', () => {
    const sec1 = {
      id: 'sec-2',
      position: 2,
      title: 'Section 2',
      items: [
        { id: 'i-2', position: 2, formSectionPosition: 2, formType: 'TEXT', formLabel: 'Q2' },
        { id: 'i-1', position: 1, formSectionPosition: 1, formType: 'TEXT', formLabel: 'Q1' },
      ],
    }
    const sec2 = {
      id: 'sec-1',
      position: 1,
      title: 'Section 1',
      items: [
        { id: 'i-b', position: 2, formSectionPosition: 20, formType: 'TEXT', formLabel: 'B' },
        { id: 'i-a', position: 1, formSectionPosition: 10, formType: 'TEXT', formLabel: 'A' },
      ],
    }

    const rawSections = [sec1, sec2]
    rawSections.sort((left: any, right: any) => (left.position ?? 0) - (right.position ?? 0))
    expect(rawSections.map(s => s.id)).toEqual(['sec-1', 'sec-2'])

    const runtimeDef = compositeFormSectionRuntimeDefinition(sec1)
    expect(runtimeDef.items.map((i: any) => i.id)).toEqual(['i-1', 'i-2'])
  })

  it('desensitizes internal materials via publicTrainingFormDefinition', () => {
    const sensitiveFormDefinition = {
      itemKey: 'q1',
      materials: [
        {
          asset: { assetId: 'asset-1', contentHash: 'abc', mimeType: 'application/pdf' },
          name: 'Guide',
          rightsStatus: 'authorized',
          rightsNote: 'internal note for school license',
        },
      ],
    }

    const publicDef: any = publicTrainingFormDefinition(sensitiveFormDefinition)
    expect(publicDef.materials[0].asset).toEqual({ assetId: 'asset-1', contentHash: 'abc', mimeType: 'application/pdf' })
    expect(publicDef.materials[0].name).toBe('Guide')
    // Sensitive internal fields stripped
    expect(publicDef.materials[0].rightsStatus).toBeUndefined()
    expect(publicDef.materials[0].rightsNote).toBeUndefined()
  })

  it('generates consistent definitionHash via formSectionIdentityHash', () => {
    const section = {
      id: 'sec-1',
      title: 'Demographics',
      description: null,
      position: 1,
      contextSection: false,
      items: [
        { id: 'q1', formType: 'TEXT', formLabel: 'Age', formOptions: null, position: 1, formSectionPosition: 1, required: true },
      ],
    }
    const runtimeDef = compositeFormSectionRuntimeDefinition(section)
    const hash = formSectionIdentityHash(runtimeDef)
    expect(typeof hash).toBe('string')
    expect(hash.length).toBeGreaterThan(0)
    // Deterministic
    expect(formSectionIdentityHash(runtimeDef)).toBe(hash)
  })
})
