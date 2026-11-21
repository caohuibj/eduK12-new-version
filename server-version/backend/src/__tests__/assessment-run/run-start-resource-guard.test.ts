import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

const m = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  acquireClaim: vi.fn(),
  loadPublication: vi.fn(),
  constrained: vi.fn(),
  cpuPaused: vi.fn(),
  awaitResources: vi.fn(),
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
    isAssessmentStartCpuPaused: m.cpuPaused,
    awaitScaleCompositionStartResources: m.awaitResources,
    runWithLowMemoryTrickleAdmission: m.trickle,
  }
})
vi.mock('../../modules/composite/composite.service', () => ({
  buildWholeStartPreload: vi.fn(),
  loadStartComposite: m.loadPublication,
  startRelationalCompositeAttemptInTransaction: vi.fn(),
}))
vi.mock('../../services/instrumentFinalSubmit', async () => {
  const actual = await vi.importActual<typeof import('../../services/instrumentFinalSubmit')>(
    '../../services/instrumentFinalSubmit',
  )
  return actual
})

import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { runStartGate, startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import {
  prepareFrozenCompositionStart,
  readCompositionExecutionSource,
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
    m.cpuPaused.mockReturnValue(false)
    m.awaitResources.mockResolvedValue(false)
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

  it('defers a fresh composition on CPU pressure before loading publication or taking a claim', async () => {
    m.constrained.mockReturnValue(true)
    m.cpuPaused.mockReturnValue(true)
    const busy = new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '系统繁忙', 503)
    m.awaitResources.mockRejectedValueOnce(busy)
    m.queryRaw.mockResolvedValueOnce([])
    const start = () => startAssessmentRunExecution({
      executionId: uuid(10), actorUserId: uuid(1),
      startPreflight: {
        runtimeBindingKind: null, runtimeBindingRef: null, respondentUserId: uuid(1),
        compositionStartCompositeId: uuid(11),
      },
    })
    await expect(start()).rejects.toBe(busy)
    expect(m.awaitResources).toHaveBeenCalledOnce()
    expect(m.queryRaw).toHaveBeenCalledOnce()
    m.awaitResources.mockRejectedValueOnce(busy)
    m.queryRaw.mockResolvedValueOnce([{ runtimeBindingKind: 'COMPOSITE', runtimeBindingRef: uuid(99), respondentUserId: uuid(1) }])
    await expect(start()).resolves.toMatchObject({ state: 'STARTED', runtimeBindingRef: uuid(99), replayed: true })
    expect(m.queryRaw).toHaveBeenCalledTimes(2)
    expect(m.trickle).not.toHaveBeenCalled()
    expect(m.acquireClaim).not.toHaveBeenCalled()
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

    const track = { policy: policy as any, policyHash, organizationId: orgId, key, version: '1.0.0' }
    // 1. The actual cold START preflight warms the catalog before invoking the claim.
    m.loadPublication.mockImplementationOnce(async () => {
      expect(runStartGate().getStats().active).toBe(0)
      return { id: compositeId, trainingContentSnapshotHash: policy.educationComposition.manifestHash }
    })
    m.queryRaw.mockImplementationOnce(async () => {
      expect(runStartGate().getStats().active).toBe(0)
      return [row]
    })
    m.acquireClaim.mockImplementationOnce(async input => {
      expect(runStartGate().getStats().active).toBe(1)
      expect(input.preparedComposition).toMatchObject({
        identity: { compositeId, policyHash },
        provenance: { resourceKey: key, resourcePolicyHash: policyHash, scientificMaturity: 'PILOT' },
      })
      expect(m.queryRaw).toHaveBeenCalledTimes(1)
      expect(m.queryRaw.mock.calls[0][0].sql).toContain('jsonb_array_elements')
      return { kind: 'BOUND', runtimeBindingKind: 'COMPOSITE', runtimeBindingRef: compositeId }
    })
    await startAssessmentRunExecution({ executionId: uuid(10), actorUserId: ownerId,
      startPreflight: { runtimeBindingKind: null, runtimeBindingRef: null, respondentUserId: ownerId,
        compositionStartCompositeId: compositeId, compositionStartTrack: track } })
    expect(m.acquireClaim).toHaveBeenCalledOnce()
    await prepareFrozenCompositionStart(track)
    expect(m.queryRaw).toHaveBeenCalledTimes(1)
    expect(m.queryRaw.mock.calls[0][0].sql).toContain('education_private_tool_versions')

    // 2. Warm cache -> runs only lightweight live PUBLISHED check on composite_assessments
    m.queryRaw.mockResolvedValueOnce([{ id: compositeId }])
    const second = await readFrozenCompositionIdentity(prisma, track)
    expect(second.title).toBe('Cached Teacher Composition')
    expect(m.queryRaw).toHaveBeenCalledTimes(2)
    expect(m.queryRaw.mock.calls[1][0].sql).not.toContain('jsonb_array_elements')
    expect(m.queryRaw.mock.calls[1][0].sql).toContain('education_private_tool_versions')
    expect(m.queryRaw.mock.calls[1][0].sql).toContain("c.status='PUBLISHED'")

    // 3. Retired/unpublished composite -> still fails closed on cache hit
    m.queryRaw.mockResolvedValueOnce([])
    await expect(readFrozenCompositionIdentity(prisma, track))
      .rejects.toMatchObject({ code: 'PRIVATE_COMPOSITION_EXECUTION_INVALID', statusCode: 409 })

    const sourceRow = {
      ...track, product: 'TEACHER', assignmentRef: uuid(19), subjectUserId: ownerId, respondentUserId: ownerId,
      subjectRole: 'TEACHER', respondentRole: 'TEACHER', relationshipKind: 'SELF', perspective: 'SELF_REPORT',
      status: 'ASSIGNED', runStatus: 'PUBLISHED', assignmentStatus: 'OPEN',
    }
    const queryRaw = vi.fn().mockResolvedValueOnce([{ ...sourceRow, checkedAnchorCurrent: true }])
      .mockResolvedValueOnce([{ ...sourceRow, checkedAnchorCurrent: false }])
    const tx = { $queryRaw: queryRaw } as any
    const checked = { tx, identity: second }
    const input = { executionId: uuid(10), compositeId, actorUserId: ownerId }
    const source = await readCompositionExecutionSource(tx, input, checked)
    expect(source.identity).toBe(second)
    expect(queryRaw).toHaveBeenCalledOnce()
    expect(queryRaw.mock.calls[0][0].sql).toContain("c.status='PUBLISHED'")
    expect(queryRaw.mock.calls[0][0].sql).not.toContain('jsonb_array_elements')
    await expect(readCompositionExecutionSource(tx, input, checked)).rejects.toMatchObject({
      code: 'PRIVATE_COMPOSITION_EXECUTION_INVALID',
    })
  })

  it('never writes global cache from scoped transactions, and re-verifies full source anchors on cross-tx hits', async () => {
    const orgId = uuid(23)
    const ownerId = uuid(24)
    const toolId = uuid(26)
    const versionId = uuid(25)
    const compositeId = uuid(27)
    const origin = {
      schemaVersion: 1 as const,
      adapterVersion: '1.0.0' as const,
      mode: 'COMPOSITION' as const,
      entry: 'SCHOOL' as const,
      variantKey: 'STUDENT:SELF' as const,
      organizationId: orgId,
      ownerUserId: ownerId,
      toolId,
      versionId,
      contentHash: 'f'.repeat(64),
    }
    const key = `education-composition:SCHOOL:${versionId}:STUDENT:SELF:1.0.0`
    const policy = {
      family: 'BUNDLE' as const,
      key,
      version: '1.0.0',
      subjectRoles: ['STUDENT'],
      respondentRoles: ['STUDENT'],
      relationshipKinds: ['SELF'],
      perspectives: ['SELF_REPORT'],
      analysisMode: 'INDIVIDUAL_ONLY',
      minimumRespondents: null,
      visibilityPolicyKey: 'PRIVATE_RESPONDENT',
      runtimeLaunchTarget: { kind: 'COMPOSITE' as const, ref: compositeId },
      scientificMaturity: 'PILOT' as const,
      educationComposition: {
        origin,
        manifestHash: '1'.repeat(64),
        unitReports: [],
      },
    }
    const policyHash = canonicalHash(policy)
    const row = {
      title: 'Tx Cached School Composition',
      groupReporting: null,
      publicBindings: [],
      manifest: [{
        blockId: uuid(31),
        kind: 'SCALE' as const,
        versionId: uuid(32),
        sourceProvider: 'STANDARD_SCALE' as const,
        contentHash: '2'.repeat(64),
        itemIds: [uuid(33)],
        sectionIds: [],
        title: 'Scale B',
      }],
      units: [{
        itemId: uuid(33),
        family: 'SCALE' as const,
        scaleId: uuid(34),
        versionId: uuid(32),
        contentHash: '2'.repeat(64),
        releaseId: uuid(35),
        definitionHash: '3'.repeat(64),
        measurementHash: '4'.repeat(64),
      }],
    }
    const rolledBackTxQuery = vi.fn().mockResolvedValueOnce([row])
    const txAfterRollbackQuery = vi.fn().mockResolvedValueOnce([row])

    // Cold reads inside transactions do not populate process-wide cache in case tx rolls back.
    const txOnly = await readFrozenCompositionIdentity({ $queryRaw: rolledBackTxQuery } as any, { policy: policy as any, policyHash, organizationId: orgId, key, version: '1.0.0' })
    await readFrozenCompositionIdentity({ $queryRaw: txAfterRollbackQuery } as any, { policy: policy as any, policyHash, organizationId: orgId, key, version: '1.0.0' })
    expect(txAfterRollbackQuery.mock.calls[0][0].sql).toContain('jsonb_array_elements')

    // Root prisma read populates cache safely; subsequent tx hits skip manifest expansion while rechecking full anchors.
    const rootSpy = vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([row] as any)
    try {
      const fromRoot = await readFrozenCompositionIdentity(prisma, { policy: policy as any, policyHash, organizationId: orgId, key, version: '1.0.0' })
      expect(fromRoot).toEqual(txOnly)
      expect(rootSpy).toHaveBeenCalledTimes(1)
    } finally {
      rootSpy.mockRestore()
    }

    const warmTxQuery = vi.fn().mockResolvedValueOnce([{ id: compositeId }])
    const fromWarmTx = await readFrozenCompositionIdentity({ $queryRaw: warmTxQuery } as any, { policy: policy as any, policyHash, organizationId: orgId, key, version: '1.0.0' })
    expect(fromWarmTx).toEqual(txOnly)
    expect(warmTxQuery).toHaveBeenCalledTimes(1)
    const warmSql = warmTxQuery.mock.calls[0][0].sql as string
    expect(warmSql).not.toContain('jsonb_array_elements')
    expect(warmSql).toContain('education_private_tool_versions')
    expect(warmSql).toContain('c.creation_key=')
    expect(warmSql).toContain('c.creation_hash=')
    expect(warmSql).toContain('c.created_by=')
    expect(warmSql).toContain("c.status='PUBLISHED'")

    const revokedTxQuery = vi.fn().mockResolvedValueOnce([])
    await expect(readFrozenCompositionIdentity({ $queryRaw: revokedTxQuery } as any, { policy: policy as any, policyHash, organizationId: orgId, key, version: '1.0.0' }))
      .rejects.toMatchObject({ code: 'PRIVATE_COMPOSITION_EXECUTION_INVALID', statusCode: 409 })
  })
})
