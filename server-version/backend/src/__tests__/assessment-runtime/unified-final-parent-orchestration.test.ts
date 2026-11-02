import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => {
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
  return {
    unitActive: false, events: [] as string[],
    cognitive: vi.fn(), scale: vi.fn(), form: vi.fn(), finalize: vi.fn(),
    db: { cognitiveSession: { findUnique: vi.fn() }, assessment: { findUnique: vi.fn() }, compositeAssessmentAttempt: { findUnique: vi.fn() } },
  }
})
vi.mock('../../config/database', () => ({ prisma: m.db }))
vi.mock('../../services/unitSubmitAdmission', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/unitSubmitAdmission')>(),
  withUnitSubmitAdmission: async (submit: () => Promise<unknown>) => {
    m.unitActive = true; m.events.push('unit-enter')
    try { return await submit() } finally { m.unitActive = false; m.events.push('unit-release') }
  },
}))
vi.mock('../../modules/cognitive/unified-final-submit.service', () => ({ submitUnifiedCognitiveSessionFinal: m.cognitive }))
vi.mock('../../modules/scale/unified-final-submit.service', () => ({ submitUnifiedScaleAssessmentFinal: m.scale }))
vi.mock('../../modules/assessment-runtime/unified-form-section-final-submit.service', () => ({ submitUnifiedCompositeFormSectionFinal: m.form }))
vi.mock('../../modules/composite/composite.service', () => ({ finalizeCompositeAttemptIfReady: m.finalize }))

import { submitCognitiveSessionFinalWithContext } from '../../modules/cognitive/final-submit.service'
import { submitScaleAssessmentFinalWithContext } from '../../modules/scale/scale-final-submit.service'
import { submitCompositeFormSectionFinal } from '../../modules/composite/final-submit.service'

const submissionId = '64000000-0000-4000-8000-000000000001'
const child = (parent: string | null = 'parent') => ({ id: 'child', compositeAttemptId: parent, questionnaireAssessmentId: null, attemptEpoch: 1, attemptNo: 1, runtimeGeneration: 'UNIFIED_V1' })
const input = { submissionId, attemptEpoch: 1, definitionHash: 'a'.repeat(64) }
const adapters = [
  { name: 'cognitive', native: m.cognitive, submit: () => submitCognitiveSessionFinalWithContext('owner', { ...input, sessionId: 'child', trials: [] } as any) },
  { name: 'scale', native: m.scale, submit: () => submitScaleAssessmentFinalWithContext({ ...input, assessmentId: 'child', userId: 'owner', answers: [] }) },
  { name: 'form', native: m.form, submit: () => submitCompositeFormSectionFinal({ ...input, attemptId: 'parent', sectionId: 'section', userId: 'owner', answers: [] }) },
]
beforeEach(() => {
  vi.clearAllMocks(); m.unitActive = false; m.events = []
  m.db.cognitiveSession.findUnique.mockResolvedValue(child())
  m.db.assessment.findUnique.mockResolvedValue(child())
  m.db.compositeAssessmentAttempt.findUnique.mockResolvedValue({ id: 'parent', userId: 'owner', runtimeGeneration: 'UNIFIED_V1',
    trainingVariantAllocationEncrypted: null, trainingVariantAllocationHash: null,
    trainingFlowSnapshotEncrypted: null, trainingFlowSnapshotHash: null, trainingFlowPathEncrypted: null, trainingFlowPathHash: null,
    compositeAssessment: { creationKey: null, trainingFlowDraft: null, trainingFlowFrozen: null, trainingFlowDigest: null,
      trainingVariantDraft: null, trainingVariantFrozen: null, trainingVariantDigest: null },
  })
  for (const adapter of adapters) adapter.native.mockImplementation(async () => {
    expect(m.unitActive).toBe(true); m.events.push('child-committed')
    return { submissionId, replayed: false, parent: null }
  })
  m.finalize.mockImplementation(async () => {
    expect(m.unitActive).toBe(false); m.events.push('parent-check')
    return { status: 'COMPLETED', progress: 100, completedAt: new Date() }
  })
})

describe('Unified child FINAL completes its parent without a runner reread', () => {
  it.each(adapters)('$name reconciles only after the child commit and UNIT permit release', async adapter => {
    const result = await adapter.submit()
    expect(m.events).toEqual(['unit-enter', 'child-committed', 'unit-release', 'parent-check'])
    expect(m.finalize).toHaveBeenCalledExactlyOnceWith('parent')
    const publicData = 'data' in result ? result.data : result
    expect(publicData).not.toHaveProperty('shouldFinalize')
    expect(publicData).not.toHaveProperty('finalizeAssessment')
    expect(publicData).not.toHaveProperty('finalizeCompositeAttemptId')
  })
  it.each(adapters)('$name repairs a parent lag on an exact FINAL replay', async adapter => {
    adapter.native.mockImplementation(async () => {
      m.events.push('child-committed'); return { submissionId, replayed: true, parent: null }
    })
    await adapter.submit()
    expect(m.finalize).toHaveBeenCalledExactlyOnceWith('parent')
    expect(adapter.native.mock.calls[0][0].submissionId).toBe(submissionId)
  })
  it.each(adapters)('$name does not finalize a rejected child submission', async adapter => {
    adapter.native.mockRejectedValue(new Error('child rejected'))
    await expect(adapter.submit()).rejects.toThrow('child rejected')
    expect(m.finalize).not.toHaveBeenCalled(); expect(m.unitActive).toBe(false)
  })
  it.each(adapters.slice(0, 2))('$name standalone submission does not finalize a composite', async adapter => {
    m.db.cognitiveSession.findUnique.mockResolvedValue(child(null)); m.db.assessment.findUnique.mockResolvedValue(child(null))
    await adapter.submit(); expect(m.finalize).not.toHaveBeenCalled()
  })
  it('retains an unfinished aggregate instead of treating one form section as the whole report', async () => {
    m.finalize.mockResolvedValue({ status: 'IN_PROGRESS', progress: 50, completedAt: null })
    const result = await adapters[2].submit()
    expect(result.parent).toMatchObject({ status: 'IN_PROGRESS', progress: 50 })
  })
})
