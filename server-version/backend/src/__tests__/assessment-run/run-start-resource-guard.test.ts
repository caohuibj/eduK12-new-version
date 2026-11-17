import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

const m = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  acquireClaim: vi.fn(),
  constrained: vi.fn(),
  trickle: vi.fn(),
}))

vi.mock('../../config/database', () => ({
  prisma: { $queryRaw: m.queryRaw },
}))
vi.mock('../../modules/assessment-run/startClaim', () => ({
  acquireRunExecutionStartClaim: m.acquireClaim,
  lockExecutionEnvelope: vi.fn(),
  markRunStartClaimCompleted: vi.fn(),
  markRunStartDispatchIntent: vi.fn(),
  markRunStartUnknown: vi.fn(),
  releaseRolledBackRunStartClaim: vi.fn(),
}))
vi.mock('../../services/assessmentResourceProtection', async () => {
  const actual = await vi.importActual<typeof import('../../services/assessmentResourceProtection')>(
    '../../services/assessmentResourceProtection',
  )
  return {
    ...actual,
    isAssessmentStartResourceConstrained: m.constrained,
    runWithLowMemoryTrickleAdmission: m.trickle,
  }
})
vi.mock('../../modules/composite/composite.service', () => ({
  buildWholeStartPreload: vi.fn(),
  startRelationalCompositeAttemptInTransaction: vi.fn(),
}))
vi.mock('../../services/instrumentFinalSubmit', async () => {
  const actual = await vi.importActual<typeof import('../../services/instrumentFinalSubmit')>(
    '../../services/instrumentFinalSubmit',
  )
  return actual
})

import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import {
  readFrozenCompositionIdentity,
  resetEducationCompositionIdentityCacheForTests,
} from '../../modules/assessment-run/educationCompositionExecution'
import { prisma } from '../../config/database'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('assessment-run pre-gate resource protection & composition identity cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetEducationCompositionIdentityCacheForTests()
    m.constrained.mockReturnValue(false)
    m.trickle.mockImplementation(async (op: () => Promise<unknown>) => op())
  })

  it('refuses constrained NEW starts in pre-gate before claim TX1 and lets BOUND replays bypass', async () => {
    m.constrained.mockReturnValue(true)
    const busyErr = new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '系统繁忙', 503)
    ;(busyErr as { preferredRetryAfterSeconds?: number }).preferredRetryAfterSeconds = 10
    m.trickle.mockRejectedValueOnce(busyErr)

    // Unbound execution -> rejected before acquireRunExecutionStartClaim TX1
    m.queryRaw.mockResolvedValueOnce([{ runtimeBindingKind: null, runtimeBindingRef: null, respondentUserId: uuid(1) }])
    await expect(startAssessmentRunExecution({ executionId: uuid(10), actorUserId: uuid(1) })).rejects.toBe(busyErr)
    expect(m.trickle).toHaveBeenCalledTimes(1)
    expect(m.acquireClaim).not.toHaveBeenCalled()

    // Bound replay for matching respondent -> bypasses trickle/rejection and claim TX1
    m.queryRaw.mockResolvedValueOnce([{ runtimeBindingKind: 'COMPOSITE', runtimeBindingRef: uuid(99), respondentUserId: uuid(1) }])
    await expect(startAssessmentRunExecution({ executionId: uuid(10), actorUserId: uuid(1) })).resolves.toEqual({
      state: 'STARTED',
      runtimeBindingKind: 'COMPOSITE',
      runtimeBindingRef: uuid(99),
      replayed: true,
    })
    expect(m.trickle).toHaveBeenCalledTimes(1)
    expect(m.acquireClaim).not.toHaveBeenCalled()

    // Mismatched actor does not take the bound shortcut
    m.trickle.mockRejectedValueOnce(busyErr)
    m.queryRaw.mockResolvedValueOnce([{ runtimeBindingKind: 'COMPOSITE', runtimeBindingRef: uuid(99), respondentUserId: uuid(1) }])
    await expect(startAssessmentRunExecution({ executionId: uuid(10), actorUserId: uuid(2) })).rejects.toBe(busyErr)
    expect(m.trickle).toHaveBeenCalledTimes(2)
    expect(m.acquireClaim).not.toHaveBeenCalled()
  })

  it('skips the redundant pre-gate SQL when School/Teacher already read the binding', async () => {
    m.constrained.mockReturnValue(true)
    const busyErr = new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '系统繁忙', 503)
    m.trickle.mockRejectedValue(busyErr)
    await expect(startAssessmentRunExecution({
      executionId: uuid(10), actorUserId: uuid(1),
      startPreflight: { runtimeBindingKind: null, runtimeBindingRef: null, respondentUserId: uuid(1) },
    })).rejects.toBe(busyErr)
    expect(m.queryRaw).not.toHaveBeenCalled()
    expect(m.acquireClaim).not.toHaveBeenCalled()

    await expect(startAssessmentRunExecution({
      executionId: uuid(10), actorUserId: uuid(1),
      startPreflight: { runtimeBindingKind: 'COMPOSITE', runtimeBindingRef: uuid(99), respondentUserId: uuid(1) },
    })).resolves.toEqual({
      state: 'STARTED', runtimeBindingKind: 'COMPOSITE', runtimeBindingRef: uuid(99), replayed: true,
    })
    expect(m.queryRaw).not.toHaveBeenCalled()
    expect(m.trickle).toHaveBeenCalledTimes(1)
  })

  it('caches immutable frozen composition identity on prisma reads while keeping live status checks authoritative', async () => {
    const orgId = uuid(3)
    const ownerId = uuid(4)
    const toolId = uuid(16)
    const versionId = uuid(5)
    const compositeId = uuid(6)
    const origin = {
      schemaVersion: 1 as const,
      adapterVersion: '1.0.0' as const,
      mode: 'COMPOSITION' as const,
      entry: 'TEACHER' as const,
      variantKey: 'TEACHER:SELF' as const,
      organizationId: orgId,
      ownerUserId: ownerId,
      toolId,
      versionId,
      contentHash: 'a'.repeat(64),
    }
    const key = `education-composition:TEACHER:${versionId}:TEACHER:SELF:1.0.0`
    const policy = {
      family: 'BUNDLE' as const,
      key,
      version: '1.0.0',
      subjectRoles: ['TEACHER'],
      respondentRoles: ['TEACHER'],
      relationshipKinds: ['SELF'],
      perspectives: ['SELF_REPORT'],
      analysisMode: 'INDIVIDUAL_ONLY',
      minimumRespondents: null,
      visibilityPolicyKey: 'PRIVATE_RESPONDENT',
      runtimeLaunchTarget: { kind: 'COMPOSITE' as const, ref: compositeId },
      scientificMaturity: 'PILOT' as const,
      educationComposition: {
        origin,
        manifestHash: 'b'.repeat(64),
        unitReports: [],
      },
    }
    const policyHash = canonicalHash(policy)
    const row = {
      title: 'Cached Teacher Composition',
      groupReporting: null,
      publicBindings: [],
      manifest: [{
        blockId: uuid(11),
        kind: 'SCALE' as const,
        versionId: uuid(12),
        sourceProvider: 'STANDARD_SCALE' as const,
        contentHash: 'c'.repeat(64),
        itemIds: [uuid(13)],
        sectionIds: [],
        title: 'Scale A',
      }],
      units: [{
        itemId: uuid(13),
        family: 'SCALE' as const,
        scaleId: uuid(14),
        versionId: uuid(12),
        contentHash: 'c'.repeat(64),
        releaseId: uuid(15),
        definitionHash: 'd'.repeat(64),
        measurementHash: 'e'.repeat(64),
      }],
    }

    // 1. Cold cache -> runs heavy catalog join query
    m.queryRaw.mockResolvedValueOnce([row])
    const first = await readFrozenCompositionIdentity(prisma, { policy: policy as any, policyHash, organizationId: orgId, key, version: '1.0.0' })
    expect(first.title).toBe('Cached Teacher Composition')
    expect(m.queryRaw).toHaveBeenCalledTimes(1)
    expect(m.queryRaw.mock.calls[0][0].sql).toContain('education_private_tool_versions')

    // 2. Warm cache -> runs only lightweight live PUBLISHED check on composite_assessments
    m.queryRaw.mockResolvedValueOnce([{ id: compositeId }])
    const second = await readFrozenCompositionIdentity(prisma, { policy: policy as any, policyHash, organizationId: orgId, key, version: '1.0.0' })
    expect(second).toEqual(first)
    expect(m.queryRaw).toHaveBeenCalledTimes(2)
    expect(m.queryRaw.mock.calls[1][0].sql).not.toContain('education_private_tool_versions')
    expect(m.queryRaw.mock.calls[1][0].sql).toContain("c.status='PUBLISHED'")

    // 3. Retired/unpublished composite -> still fails closed on cache hit
    m.queryRaw.mockResolvedValueOnce([])
    await expect(readFrozenCompositionIdentity(prisma, { policy: policy as any, policyHash, organizationId: orgId, key, version: '1.0.0' }))
      .rejects.toMatchObject({ code: 'PRIVATE_COMPOSITION_EXECUTION_INVALID', statusCode: 409 })
  })
})
