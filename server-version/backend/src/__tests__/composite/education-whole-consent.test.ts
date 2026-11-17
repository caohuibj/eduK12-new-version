import { beforeEach, describe, expect, it, vi } from 'vitest'
const consent = vi.hoisted(() => vi.fn())
const mocks = vi.hoisted(() => ({
  db: { $queryRaw: vi.fn(), compositeAssessmentAttempt: { findUnique: vi.fn() }, assessment: { findMany: vi.fn() } },
  register: vi.fn(),
  storage: vi.fn(),
}))
vi.mock('../../config/database', () => ({ prisma: mocks.db }))
vi.mock('../../modules/assessment-relational/runtime-consent', () => ({ relationalRuntimeConsentAuthority: { assertCompositeFinal: consent } }))
vi.mock('../../modules/assessment-runtime/report-outbox.service', async importOriginal => ({
  ...(await importOriginal<typeof import('../../modules/assessment-runtime/report-outbox.service')>()),
  registerWholeQuestionnaireReceipt: mocks.register,
}))
vi.mock('../../modules/assessment-runtime/whole-receipt-storage', () => ({
  admitWholeReceiptStorage: mocks.storage, detachedWholeReceiptsEnabled: () => false, recordWholeReceiptStored: vi.fn(),
}))
vi.mock('../../modules/assessment-runtime/whole-form-materialization.service', () => ({
  verifyWholeFormSectionsAtReceipt: vi.fn(), materializeWholeFormSections: vi.fn(),
}))
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { prepareCanonicalSubmission } from '../../services/instrumentFinalSubmit'
import { clearWholeValidationRulesForTest, submitWholeQuestionnaire } from '../../modules/composite/whole-questionnaire.service'
import { formSectionSlotKey } from '../../modules/assessment-runtime/slot-set'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('DATA_ENCRYPTION_KEY', 'e'.repeat(64))
  vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED', 'true')
  vi.stubEnv('ASSESSMENT_WHOLE_SUBMIT_ENABLED', 'true')
  vi.stubEnv('ASSESSMENT_WHOLE_REQUEST_CONTEXT_REUSE_ENABLED', 'false')
  clearWholeValidationRulesForTest()
  consent.mockResolvedValue(undefined)
  mocks.storage.mockResolvedValue(undefined)
  mocks.register.mockImplementation(async (_parent, input) => ({ acceptedAt: input.acceptedAt, replayed: false, queueDepth: 0 }))
})

describe('education whole consent', () => {
  it('rejects missing required Forms and checks consent once per request', async () => {
    const definitionHash = 'd'.repeat(64)
    const manifest = {
      schemaVersion: 1 as const,
      binding: { attemptId: 'parent', attemptEpoch: 1, slotSetHash: 'a'.repeat(64), contextHash: null, userId: 'user', recoveryTokenHash: null },
      requiredFormSlots: [formSectionSlotKey('section')],
      units: [],
      formSections: [{ sectionId: 'section', definitionHash, items: [{ id: 'field', required: false, formType: 'text_input' }] }],
    }
    const parent = {
      id: 'parent', status: 'IN_PROGRESS', runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY',
      attemptEpoch: 1, asyncReportEpoch: 1, userId: 'user', recoveryTokenHash: null, assignmentRef: 'assignment',
      contextSnapshotHash: null, frozenActiveSlotSetHash: 'a'.repeat(64), trainingTimingSnapshot: null,
      trainingFlowSnapshotEncrypted: null, trainingFlowSnapshotHash: null, trainingFlowPathEncrypted: null, trainingFlowPathHash: null,
      trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
      compositeAssessment: { productKind: 'ORGANIZATION_RESOURCE', reportPackageKey: null, analysisProtocolKey: null,
        trainingFlowDraft: null, trainingFlowFrozen: null, trainingFlowDigest: null,
        trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null },
    }
    const header = {
      ...parent, productKind: 'ORGANIZATION_RESOURCE', reportPackageKey: null, analysisProtocolKey: null,
      trainingFlowDraft: null, trainingFlowFrozen: null, trainingFlowDigest: null,
      trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null,
      hasStandardCombination: false, jobId: 'job', jobStatus: 'WAITING', leaseToken: null,
      wholeSubmissionId: null, wholePayloadHash: null, wholeAcceptedAt: null,
      wholeValidationEncrypted: encryptUnifiedRuntimePayload(manifest),
      wholeValidationHash: prepareCanonicalSubmission(manifest).hash,
    }
    mocks.db.$queryRaw.mockResolvedValue([header])
    const input = {
      submissionId: 'education-form-only-1', attemptEpoch: 1, slotSetHash: 'a'.repeat(64), contextSnapshotHash: null,
      units: [], formAnswers: [{ sectionId: 'section', definitionHash, answers: [] }],
    }
    const originalValidation = { encrypted: header.wholeValidationEncrypted, hash: header.wholeValidationHash }
    const incompleteManifest = { ...manifest, requiredFormSlots: [...manifest.requiredFormSlots, formSectionSlotKey('missing-section')] }
    header.wholeValidationEncrypted = encryptUnifiedRuntimePayload(incompleteManifest)
    header.wholeValidationHash = prepareCanonicalSubmission(incompleteManifest).hash
    await expect(submitWholeQuestionnaire('parent', input, { userId: 'user' }))
      .rejects.toThrow('整份问卷缺少必需表单区段')
    expect(mocks.register).not.toHaveBeenCalled()
    header.wholeValidationEncrypted = originalValidation.encrypted
    header.wholeValidationHash = originalValidation.hash

    const first = await submitWholeQuestionnaire('parent', input, { userId: 'user' })
    expect(first).toMatchObject({ status: 'ACCEPTED', replayed: false })
    expect(consent).toHaveBeenCalledTimes(2)
    expect(mocks.register.mock.calls[0][1].rejectPriorUnitSnapshots).toBe(true)
    header.wholeSubmissionId = input.submissionId
    header.wholePayloadHash = first.payloadHash
    mocks.db.$queryRaw.mockResolvedValue([header])
    await expect(submitWholeQuestionnaire('parent', input, { userId: 'user' })).resolves.toMatchObject({ status: 'ACCEPTED', replayed: true })
    expect(consent).toHaveBeenCalledTimes(3)
  })
})
