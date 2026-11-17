import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.hoisted(() => vi.fn())
vi.mock('../../config/database', () => ({
  prisma: { compositeFormSection: { findUnique } },
}))

import { isEducationWholeMediaUnit, loadEducationWholeFormMediaDefinition } from '../../modules/composite/education-whole-media'
import { mapCompositeSection } from '../../modules/assessment-runtime/form-section-definition'
import { formSectionIdentityHash } from '../../modules/assessment-runtime/attempt-runtime'

const catalogSection = {
  id: 'form-b',
  compositeAssessmentId: 'composite-a',
  title: 'Later Form',
  description: null,
  position: 2,
  contextSection: false,
  items: [{
    id: 'field-b', formType: 'single_choice', formLabel: 'Field B', formPlaceholder: null,
    required: true, formOptions: [{ value: 'yes', label: 'Yes' }],
    contextKey: null, position: 2, formSectionPosition: 0,
  }],
}
const frozenHash = formSectionIdentityHash(mapCompositeSection(catalogSection))
const state = {
  status: 'IN_PROGRESS',
  executionMode: 'WHOLE_LOCAL',
  assessmentId: 'composite-a',
  units: [
    { id: 'scale-a', itemId: 'scale-a', type: 'SCALE' },
    { id: 'form-b', formSectionId: 'form-b', type: 'FORM_SECTION' },
    { id: 'scale-c', itemId: 'scale-c', type: 'SCALE' },
  ],
  formSections: [{ id: 'form-b', definitionHash: frozenHash }],
}

beforeEach(() => { vi.clearAllMocks(); findUnique.mockResolvedValue(catalogSection) })

describe('education Whole media membership and frozen Form definition', () => {
  it('permits later frozen slots without making them the current unit', async () => {
    expect(isEducationWholeMediaUnit(state, 'SCALE', 'scale-c')).toBe(true)
    expect(isEducationWholeMediaUnit(state, 'FORM_SECTION', 'form-b')).toBe(true)
    expect(isEducationWholeMediaUnit(state, 'SCALE', 'unknown')).toBe(false)
    expect(isEducationWholeMediaUnit({ ...state, executionMode: 'STEPPED' }, 'SCALE', 'scale-c')).toBe(false)
    expect(isEducationWholeMediaUnit({ ...state, status: 'COMPLETED' }, 'SCALE', 'scale-c')).toBe(false)
    expect(await loadEducationWholeFormMediaDefinition(state, 'form-b')).toEqual(mapCompositeSection(catalogSection))
    expect(findUnique).toHaveBeenCalledTimes(1)
  })

  it('rejects another composite catalog and changed frozen Form content', async () => {
    findUnique.mockResolvedValueOnce({ ...catalogSection, compositeAssessmentId: 'other' })
      .mockResolvedValueOnce({ ...catalogSection, title: 'Changed Form' })
    expect(await loadEducationWholeFormMediaDefinition(state, 'form-b')).toBeNull()
    expect(await loadEducationWholeFormMediaDefinition(state, 'form-b')).toBeNull()
    expect(await loadEducationWholeFormMediaDefinition({ ...state, executionMode: 'STEPPED' }, 'form-b')).toBeNull()
    expect(findUnique).toHaveBeenCalledTimes(2)
  })
})
