import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  prisma: { compositeAssessmentAttempt: { findUnique: vi.fn() }, assessmentUnitSnapshot: { findMany: vi.fn() } },
  admission: vi.fn(),
}))
vi.mock('../../config/database', () => ({ prisma: mocks.prisma }))
vi.mock('../../modules/assessment-runtime/form-admission.service', () => ({ ensureCompositeFormAdmissionAtDelivery: mocks.admission }))
import { getAttemptState } from '../../modules/composite/composite.service'
import { createFrozenActiveSlotSet, encryptFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'

function fixture(completed = 0, anonymous = false) {
  const sections = [0, 1].map(position => ({ id: `section-${position}`, title: `Section ${position}`, position, contextSection: false,
    items: [{ id: `field-${position}`, type: 'FORM', formSectionId: `section-${position}`, position, required: true,
      formType: 'text', formLabel: `Field ${position}`, formOptions: null, formPlaceholder: 'Enter a value' }] }))
  const slots = createFrozenActiveSlotSet({ schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
    slots: sections.map(section => ({ slotKey: `form-section:${section.id}`, unitType: 'FORM_SECTION', required: true,
      sourceDefinitionIdentity: { key: section.id, version: '1', hash: 'a'.repeat(64) }, sourceBinding: {} })) })
  const parent = { id: 'attempt', userId: anonymous ? null : 'student', recoveryTokenHash: anonymous ? 'recovery' : null,
    runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', status: completed === 2 ? 'COMPLETED' : 'IN_PROGRESS', attemptEpoch: 1,
    trainingFlowSnapshotEncrypted: null, trainingFlowSnapshotHash: null, trainingFlowPathEncrypted: null, trainingFlowPathHash: null,
    trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
    frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slots), frozenActiveSlotSetHash: slots.snapshotHash,
    compositeAssessment: { id: 'product', name: 'Forms', items: sections.flatMap(section => section.items), formSections: sections,
      trainingFlowDraft: null, trainingFlowFrozen: null, trainingFlowDigest: null,
      trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null },
    scaleAssessments: [], cognitiveSessions: [], situationalAttempts: [],
  }
  mocks.prisma.compositeAssessmentAttempt.findUnique.mockResolvedValue(parent)
  mocks.prisma.assessmentUnitSnapshot.findMany.mockResolvedValue(sections.slice(0, completed).map(section => ({ slotKey: `form-section:${section.id}`, terminalState: 'COMPLETED' })))
  return { parent, context: anonymous ? { recoveryTokenHash: 'recovery' } : { userId: 'student' } }
}
beforeEach(() => { vi.clearAllMocks(); process.env.DATA_ENCRYPTION_KEY = 'e'.repeat(64) })
describe('explicit current-unit attempt view', () => {
  it.each([0, 1, 2])('preserves current/next/terminal state and frozen source with %i completed sections', async completed => {
    const { parent, context } = fixture(completed)
    const original = JSON.stringify(parent)
    const full = await getAttemptState(parent.id, context)
    const compact = await getAttemptState(parent.id, context, undefined, 'current-unit')
    const { formSections, ...expected } = full
    expect(formSections).toHaveLength(2)
    expect(compact).toEqual(expected)
    expect(compact).not.toHaveProperty('formSections')
    expect(JSON.stringify(parent)).toBe(original)
    if (completed < 2) {
      expect(compact.currentItem).toMatchObject({ id: `section-${completed}`, type: 'FORM_SECTION', answers: [{ formItemId: `field-${completed}`, label: `Field ${completed}`, placeholder: 'Enter a value' }] })
      expect(mocks.admission).toHaveBeenCalledTimes(2)
    } else expect(compact.currentItem).toBeNull()
    expect(await getAttemptState(parent.id, context)).toEqual(full)
  })
  it('does not construct non-current form definitions', async () => {
    const { parent, context } = fixture(1)
    const oldField = parent.compositeAssessment.formSections[0].items[0]
    const readPlaceholder = vi.fn(() => 'Previous placeholder')
    Object.defineProperty(oldField, 'formPlaceholder', { get: readPlaceholder })
    await getAttemptState(parent.id, context, undefined, 'current-unit')
    expect(readPlaceholder).not.toHaveBeenCalled()
    await getAttemptState(parent.id, context)
    expect(readPlaceholder).toHaveBeenCalled()
  })
  it('keeps anonymous recovery authorization and complete current fields', async () => {
    const { parent, context } = fixture(1, true)
    const state = await getAttemptState(parent.id, context, undefined, 'current-unit')
    expect(state.currentItem?.id).toBe('section-1')
    await expect(getAttemptState(parent.id, { recoveryTokenHash: 'wrong' }, undefined, 'current-unit')).rejects.toMatchObject({ statusCode: 403 })
  })
})
