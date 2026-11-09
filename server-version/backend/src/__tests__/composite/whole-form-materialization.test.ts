import { describe, expect, it, vi, beforeEach } from 'vitest'

process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)

const { activateAdmission, ensureAttempt, submitSection } = vi.hoisted(() => ({
  activateAdmission: vi.fn(),
  ensureAttempt: vi.fn(),
  submitSection: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: {} }))
vi.mock('../../modules/assessment-runtime/form-admission.service', () => ({
  ensureCompositeSectionAttempt: (...args: unknown[]) => ensureAttempt(...args),
  activateStoredOrCatalogCompositeFormAdmission: (...args: unknown[]) => activateAdmission(...args),
  loadCompositeFormDefinition: (admission: { definition: unknown }) => admission.definition,
  loadStoredFormAdmission: async (row: { admission?: unknown } | null) => row?.admission ?? null,
}))
vi.mock('../../modules/assessment-runtime/unified-form-section-final-submit.service', () => ({
  submitUnifiedCompositeFormSectionFinal: (...args: unknown[]) => submitSection(...args),
}))

import { prisma } from '../../config/database'
import {
  materializeWholeFormSections,
  verifyWholeFormSectionsAtReceipt,
  wholeFormSubmissionId,
} from '../../modules/assessment-runtime/whole-form-materialization.service'

const sectionDefinition = {
  id: 'sec-1', title: 'Form', description: null, position: 0, contextSection: false,
  items: [
    { id: 'f-1', formType: 'text_input', formLabel: 'Required', placeholder: null, required: true, formOptions: null, contextKey: null, position: 0, formSectionPosition: 0 },
    { id: 'f-2', formType: 'text_input', formLabel: 'Optional', placeholder: null, required: false, formOptions: null, contextKey: null, position: 1, formSectionPosition: 1 },
  ],
} as any

const definitionHash = '0'.repeat(64)
const execution = { submissionId: '0123456789abcdef0123456789abcdef', payloadHash: 'p'.repeat(64), leaseToken: 'lease-1', acceptedAtMs: 1_700_000_000_000 }
const principal = { userId: 'student-1' }

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma as any).$queryRaw = vi.fn().mockResolvedValue([{ id: 'job-1' }])
  ;(prisma as any).compositeFormSectionAttempt = { findUnique: vi.fn().mockResolvedValue(null) }
  ;(prisma as any).compositeFormSection = { findUnique: vi.fn(), findMany: vi.fn() }
})

describe('whole Form materialization (X-04A)', () => {
  it('derives stable per-section submission ids from the accepted whole receipt', () => {
    const first = wholeFormSubmissionId(execution.submissionId, 'sec-1')
    expect(first).toBe(wholeFormSubmissionId(execution.submissionId, 'sec-1'))
    expect(first).not.toBe(wholeFormSubmissionId(execution.submissionId, 'sec-2'))
    expect(first.startsWith('whole-form-')).toBe(true)
    expect(first).toHaveLength('whole-form-'.length + 64)
  })

  it('materializes context sections first and threads the receipt lease fence into every submit', async () => {
    ;(prisma.compositeFormSection as any).findMany.mockResolvedValue([
      { id: 'sec-plain', contextSection: false, items: [{ contextKey: null }] },
      { id: 'sec-ctx', contextSection: true, items: [] },
    ])
    ensureAttempt.mockImplementation((_attemptId: string, sectionId: string) => Promise.resolve({ id: 'child-' + sectionId, attemptEpoch: 1 }))
    activateAdmission.mockImplementation((input: { sectionId: string }) => Promise.resolve({
      formSection: { kind: 'composite', id: input.sectionId, identityHash: definitionHash },
      contextSnapshotHash: null,
      definition: sectionDefinition,
    }))
    // The envelope lists the plain section before the context section.
    const results = await materializeWholeFormSections(
      { attemptId: 'attempt-1', attemptEpoch: 1, contextHash: null },
      [
        { sectionId: 'sec-plain', definitionHash, answers: [{ formItemId: 'f-1', value: '答案' }] },
        { sectionId: 'sec-ctx', definitionHash, answers: [{ formItemId: 'f-1', value: '张三' }] },
      ],
      execution as any,
      principal,
    )
    expect(results).toHaveLength(2)
    // Context section materializes first so stepped requiresContext ordering holds.
    expect(submitSection.mock.calls[0][0].sectionId).toBe('sec-ctx')
    expect(submitSection.mock.calls[1][0].sectionId).toBe('sec-plain')
    for (const [index, sectionId] of ['sec-ctx', 'sec-plain'].entries()) {
      const input = submitSection.mock.calls[index][0]
      expect(input.attemptId).toBe('attempt-1')
      expect(input.attemptEpoch).toBe(1)
      expect(input.definitionHash).toBe(definitionHash)
      expect(input.submissionId).toBe(wholeFormSubmissionId(execution.submissionId, sectionId))
      expect(input.userId).toBe('student-1')
      // The frozen admission owns the section context binding.
      expect(input.contextSnapshotHash).toBeNull()
      // Whole receipt rides along: snapshot enqueue becomes a read-only fence.
      expect(submitSection.mock.calls[index][3]).toBe(execution)
    }
  })

  it('fails closed on a lost lease before any preparatory admission write', async () => {
    ;(prisma as any).$queryRaw = vi.fn().mockResolvedValue([])
    ;(prisma.compositeFormSection as any).findMany.mockResolvedValue([{ id: 'sec-1', contextSection: false, items: [] }])
    await expect(materializeWholeFormSections(
      { attemptId: 'attempt-1', attemptEpoch: 1, contextHash: null },
      [{ sectionId: 'sec-1', definitionHash, answers: [] }],
      execution as any,
      principal,
    )).rejects.toMatchObject({ message: 'REPORT_PROCESSING_LEASE_LOST' })
    expect(ensureAttempt).not.toHaveBeenCalled()
    expect(activateAdmission).not.toHaveBeenCalled()
    expect(submitSection).not.toHaveBeenCalled()
  })

  it('fails closed when the frozen admission identity does not match the delivered section hash', async () => {
    ;(prisma.compositeFormSection as any).findMany.mockResolvedValue([{ id: 'sec-1', contextSection: false, items: [] }])
    ensureAttempt.mockResolvedValue({ id: 'child-1', attemptEpoch: 1 })
    activateAdmission.mockResolvedValue({
      formSection: { kind: 'composite', id: 'sec-1', identityHash: '1'.repeat(64) },
      contextSnapshotHash: null,
    })
    await expect(materializeWholeFormSections(
      { attemptId: 'attempt-1', attemptEpoch: 1, contextHash: null },
      [{ sectionId: 'sec-1', definitionHash, answers: [] }],
      execution as any,
      principal,
    )).rejects.toMatchObject({ code: 'STALE_ATTEMPT' })
    expect(submitSection).not.toHaveBeenCalled()
  })

  it('receipt validation reuses the authoritative normalization against the stored admission', async () => {
    ;(prisma.compositeFormSectionAttempt as any).findUnique.mockResolvedValue({
      frozenAdmissionSnapshotEncrypted: 'enc', frozenAdmissionSnapshotHash: 'hash',
      admission: { formSection: { kind: 'composite', id: 'sec-1', identityHash: definitionHash }, definition: sectionDefinition },
    })
    await verifyWholeFormSectionsAtReceipt('attempt-1', [
      { sectionId: 'sec-1', definitionHash, answers: [{ formItemId: 'f-1', value: '  保留答案  ' }] },
    ])
    // Read-only by contract: no admission activation or section attempt creation.
    expect(ensureAttempt).not.toHaveBeenCalled()
    expect(activateAdmission).not.toHaveBeenCalled()
  })

  it('receipt validation falls back to the catalog definition and verifies its identity hash', async () => {
    const { mapCompositeSection } = await import('../../modules/assessment-runtime/form-section-definition')
    const { formSectionIdentityHash } = await import('../../modules/assessment-runtime/attempt-runtime')
    const catalogHash = formSectionIdentityHash(mapCompositeSection(sectionDefinition))
    ;(prisma.compositeFormSectionAttempt as any).findUnique.mockResolvedValue(null)
    ;(prisma.compositeFormSection as any).findUnique.mockResolvedValue(sectionDefinition)
    await verifyWholeFormSectionsAtReceipt('attempt-1', [
      { sectionId: 'sec-1', definitionHash: catalogHash, answers: [{ formItemId: 'f-1', value: 'x' }] },
    ])
    await expect(verifyWholeFormSectionsAtReceipt('attempt-1', [
      { sectionId: 'sec-1', definitionHash: '9'.repeat(64), answers: [{ formItemId: 'f-1', value: 'x' }] },
    ])).rejects.toMatchObject({ code: 'STALE_ATTEMPT' })
  })

  it('receipt validation rejects answer classes the worker could not materialize', async () => {
    ;(prisma.compositeFormSectionAttempt as any).findUnique.mockResolvedValue({
      frozenAdmissionSnapshotEncrypted: 'enc', frozenAdmissionSnapshotHash: 'hash',
      admission: { formSection: { kind: 'composite', id: 'sec-1', identityHash: definitionHash }, definition: sectionDefinition },
    })
    const sections = (answers: unknown[]) => [{ sectionId: 'sec-1', definitionHash, answers }] as any
    // Unknown item, duplicate item, missing required, otherText without policy.
    await expect(verifyWholeFormSectionsAtReceipt('attempt-1', sections([{ formItemId: 'ghost', value: 'x' }]))).rejects.toMatchObject({ code: 'FORM_ANSWER_INVALID' })
    await expect(verifyWholeFormSectionsAtReceipt('attempt-1', sections([{ formItemId: 'f-1', value: 'x' }, { formItemId: 'f-1', value: 'y' }]))).rejects.toMatchObject({ code: 'FORM_ANSWER_INVALID' })
    await expect(verifyWholeFormSectionsAtReceipt('attempt-1', sections([{ formItemId: 'f-2', value: 'x' }]))).rejects.toMatchObject({ code: 'FORM_ANSWER_INVALID' })
    await expect(verifyWholeFormSectionsAtReceipt('attempt-1', sections([{ formItemId: 'f-1', value: 'x', otherText: 'not allowed' }]))).rejects.toMatchObject({ code: 'FORM_ANSWER_INVALID' })
  })
})
