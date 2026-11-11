import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: { compositeAssessmentAttempt: { findUnique: vi.fn() }, assessmentUnitSnapshot: { findMany: vi.fn() } },
  admission: vi.fn(),
  finalize: vi.fn(),
}))
vi.mock('../../config/database', () => ({ prisma: mocks.prisma }))
vi.mock('../../modules/assessment-runtime/form-admission.service', () => ({ ensureCompositeFormAdmissionAtDelivery: mocks.admission }))
vi.mock('../../modules/assessment-runtime/unified-aggregate-finalizer.service', () => ({
  finalizeCompositeAttemptUnifiedIfReady: mocks.finalize,
}))

import { getAttemptState } from '../../modules/composite/composite.service'
import { createFrozenActiveSlotSet, encryptFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import { QuestionnaireCompletionAdmissionBusyError } from '../../services/questionnaireCompletionAdmission'
import { AssessmentStartBusyError } from '../../modules/composite/start-transient'

function fixture() {
  const sections = [0, 1].map(position => ({
    id: `section-${position}`, title: `Section ${position}`, position, contextSection: false,
    items: [{
      id: `field-${position}`, type: 'FORM', formSectionId: `section-${position}`, position, required: true,
      formType: 'text', formLabel: `Field ${position}`, formOptions: null, formPlaceholder: 'Enter a value',
    }],
  }))
  const slots = createFrozenActiveSlotSet({
    schemaVersion: 1, runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
    slots: sections.map(section => ({
      slotKey: `form-section:${section.id}`, unitType: 'FORM_SECTION', required: true,
      sourceDefinitionIdentity: { key: section.id, version: '1', hash: 'a'.repeat(64) }, sourceBinding: {},
    })),
  })
  const parent = {
    id: 'attempt', userId: 'student', recoveryTokenHash: null,
    runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', status: 'IN_PROGRESS',
    attemptEpoch: 1, asyncReportEpoch: null,
    trainingFlowSnapshotEncrypted: null, trainingFlowSnapshotHash: null,
    trainingFlowPathEncrypted: null, trainingFlowPathHash: null,
    trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
    frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slots), frozenActiveSlotSetHash: slots.snapshotHash,
    compositeAssessment: {
      id: 'product', name: 'Forms', items: sections.flatMap(section => section.items), formSections: sections,
      trainingFlowDraft: null, trainingFlowFrozen: null, trainingFlowDigest: null,
      trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null,
    },
    scaleAssessments: [], cognitiveSessions: [], situationalAttempts: [],
  }
  mocks.prisma.compositeAssessmentAttempt.findUnique.mockResolvedValue(parent)
  mocks.prisma.assessmentUnitSnapshot.findMany.mockResolvedValue(
    sections.map(section => ({ slotKey: `form-section:${section.id}`, terminalState: 'COMPLETED' })),
  )
  return { parent, context: { userId: 'student' } }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.DATA_ENCRYPTION_KEY = 'e'.repeat(64)
})

describe('getAttemptState does not disguise a busy aggregate as completion', () => {
  it('rethrows COMPLETION_BUSY when all units are in and finalization is busy, without allUnitsSubmitted', async () => {
    const { parent, context } = fixture()
    const busy = new QuestionnaireCompletionAdmissionBusyError('queue_full', 1)
    mocks.finalize.mockRejectedValue(busy)
    await expect(getAttemptState(parent.id, context)).rejects.toBe(busy)
    expect(mocks.finalize).toHaveBeenCalledTimes(1)
  })

  it('rethrows AssessmentStartBusyError instead of returning allUnitsSubmitted', async () => {
    const { parent, context } = fixture()
    const busy = new AssessmentStartBusyError('ADMISSION_QUEUE_FULL')
    mocks.finalize.mockRejectedValue(busy)
    await expect(getAttemptState(parent.id, context)).rejects.toBe(busy)
  })

  it('still patches state after a successful finalize', async () => {
    const { parent, context } = fixture()
    mocks.finalize.mockResolvedValue({ status: 'COMPLETED', progress: 100, completedAt: new Date('2026-11-11T00:00:00Z') })
    const state = await getAttemptState(parent.id, context)
    expect(state).toMatchObject({ status: 'COMPLETED', progress: 100 })
    expect(state.allUnitsSubmitted).toBeUndefined()
  })
})
