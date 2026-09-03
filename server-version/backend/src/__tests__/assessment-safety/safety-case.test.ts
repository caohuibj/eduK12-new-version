import { describe, expect, it } from 'vitest'
import {
  SafetyContractError,
  acknowledgeSafetyCase,
  applySafetyWakeup,
  assertCanViewSafetyCase,
  assertReanalysisDoesNotAutoClose,
  buildSafetyIdempotencyKey,
  buildTestOnlyAuthoritativeTrigger,
  buildTestOnlySafetyPolicy,
  createSafetyCaseAtomic,
  createSafetyPolicyDraft,
  disposeSafetyCase,
  evaluateSafetyTrigger,
  processSafetyWakeupDelivery,
  processWakeupAtomically,
  projectSafetyStaffView,
  projectSafetySubjectGuidance,
  rescheduleSafetyWakeupsAfterRestart,
  scheduleSafetyWakeups,
} from '../../modules/assessment-safety'

const HASH = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

const failCode = (run: () => unknown): string => {
  try {
    run()
    throw new Error('expected SafetyContractError')
  } catch (error) {
    if (error instanceof SafetyContractError) return error.code
    throw error
  }
}

describe('SafetyCase policy / case / wakeup (Prep 15.1)', () => {
  it('creates atomically and is idempotent on duplicate complete', () => {
    const policy = buildTestOnlySafetyPolicy()
    const trigger = evaluateSafetyTrigger({
      policy,
      sourceKind: 'BUNDLE_REPORT_FACTS',
      sourceHash: HASH,
      sourceRecordId: 'snap-1',
      authoritativeSafetySignal: false,
      testFixtureForceTrigger: true,
    })
    expect(trigger).toBeTruthy()

    const first = createSafetyCaseAtomic({
      policy,
      trigger: trigger!,
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: ['teacher-2'],
      actorUserId: 'system:finalizer',
      now: '2026-09-03T06:00:00.000Z',
    })
    expect(first.created).toBe(true)
    expect(first.safetyCase.status).toBe('OPEN')
    expect(first.safetyCase.ackDueAt).toBe(
      new Date(Date.parse('2026-09-03T06:00:00.000Z') + policy.acknowledgeWithinMs).toISOString(),
    )
    expect(first.safetyCase.disposeDueAt).toBe(
      new Date(Date.parse('2026-09-03T06:00:00.000Z') + policy.disposeWithinMs).toISOString(),
    )

    const second = createSafetyCaseAtomic({
      policy,
      trigger: trigger!,
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: ['teacher-2'],
      actorUserId: 'system:finalizer',
      existingByIdempotencyKey: first.safetyCase,
    })
    expect(second.created).toBe(false)
    expect(second.safetyCase.caseId).toBe(first.safetyCase.caseId)
  })

  it('keeps unauthorized viewers invisible and ordinary low scores from triggering', () => {
    const policy = buildTestOnlySafetyPolicy()
    expect(evaluateSafetyTrigger({
      policy,
      sourceKind: 'BUNDLE_REPORT_FACTS',
      sourceHash: HASH,
      authoritativeSafetySignal: false,
      testFixtureForceTrigger: false,
      notes: ['WHO-5 low score'],
    })).toBeNull()

    const prodDraft = createSafetyPolicyDraft({
      policyKey: 'prod_noop',
      policyVersion: '1.0.0',
      name: 'prod noop',
      acknowledgeWithinMs: 1000,
      disposeWithinMs: 2000,
      escalationChain: ['admin'],
      productionTriggerEnabled: false,
      testOnlyAuthoritativeFixture: false,
      createdByUserId: 'admin',
    })
    expect(evaluateSafetyTrigger({
      policy: { ...prodDraft, status: 'APPROVED', approvedByUserId: 'admin' },
      sourceKind: 'BUNDLE_REPORT_FACTS',
      sourceHash: HASH,
      authoritativeSafetySignal: true,
    })).toBeNull()

    const trigger = buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH })
    const created = createSafetyCaseAtomic({
      policy,
      trigger,
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: ['teacher-2'],
      actorUserId: 'system',
    })
    expect(failCode(() => assertCanViewSafetyCase({
      safetyCase: created.safetyCase,
      viewerUserId: 'stranger',
      viewerRole: 'TEACHER',
      isAuthorizedAdmin: false,
    }))).toBe('SAFETY_UNAUTHORIZED')

    expect(failCode(() => projectSafetyStaffView({
      safetyCase: created.safetyCase,
      events: [created.event],
      viewerUserId: 'parent-1',
      isAuthorizedAdmin: false,
    }))).toBe('SAFETY_UNAUTHORIZED')

    const guidance = projectSafetySubjectGuidance()
    expect(guidance.caseVisible).toBe(false)
  })

  it('schedules from persisted deadlines and restart does not drift SLA start', () => {
    const policy = buildTestOnlySafetyPolicy()
    const created = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH }),
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: ['teacher-2'],
      actorUserId: 'system',
      now: '2026-09-03T06:00:00.000Z',
    })
    const scheduled = scheduleSafetyWakeups({ safetyCase: created.safetyCase, policy })
    expect(scheduled.jobs).toHaveLength(2)
    expect(scheduled.payloads.every((p) => {
      const keys = Object.keys(p).sort().join(',')
      return keys === 'caseId,kind,wakeupJobId'
    })).toBe(true)
    expect(scheduled.jobs[0]!.fireAt).toBe(created.safetyCase.ackDueAt)
    expect(scheduled.jobs[1]!.fireAt).toBe(created.safetyCase.disposeDueAt)

    const restarted = rescheduleSafetyWakeupsAfterRestart({
      safetyCase: created.safetyCase,
      policy,
      now: '2026-09-03T10:00:00.000Z', // much later — must not slide
    })
    expect(restarted.jobs[0]!.fireAt).toBe(created.safetyCase.ackDueAt)
    expect(restarted.jobs[1]!.fireAt).toBe(created.safetyCase.disposeDueAt)
  })

  it('duplicate Bull delivery no-ops; ACK/DISPOSE before fire cancel escalation', () => {
    const policy = buildTestOnlySafetyPolicy()
    const created = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH }),
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: ['teacher-2'],
      actorUserId: 'system',
    })
    const { payloads } = scheduleSafetyWakeups({ safetyCase: created.safetyCase, policy })
    const ackPayload = payloads[0]!

    // Fire at persisted deadline while still OPEN → escalate
    const first = applySafetyWakeup({
      safetyCase: created.safetyCase,
      payload: ackPayload,
      now: created.safetyCase.ackDueAt,
    })
    expect(first.event?.type).toBe('ESCALATED')
    expect(first.safetyCase.status).toBe('ESCALATED')

    // Duplicate delivery of same wakeupJobId → no-op
    const dup = applySafetyWakeup({
      safetyCase: first.safetyCase,
      payload: ackPayload,
      existingLedger: first.ledger,
      priorEscalationForJob: first.event,
      now: created.safetyCase.ackDueAt,
    })
    expect(dup.event).toBeNull()
    expect(dup.job.status).toBe('DUPLICATE_NOOP')

    // ACK after enqueue before fire
    const created2 = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH_B, sourceRecordId: 'snap-2' }),
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: ['teacher-2'],
      actorUserId: 'system',
    })
    const scheduled2 = scheduleSafetyWakeups({ safetyCase: created2.safetyCase, policy })
    const acked = acknowledgeSafetyCase({
      safetyCase: created2.safetyCase,
      actorUserId: 'teacher-1',
      note: 'seen before fire',
    })
    const ackNoop = applySafetyWakeup({
      safetyCase: acked.safetyCase,
      payload: scheduled2.payloads[0]!,
      now: created2.safetyCase.ackDueAt,
    })
    expect(ackNoop.event).toBeNull()
    expect(acked.safetyCase.status).toBe('ACKNOWLEDGED')

    // DISPOSE before fire
    const created3 = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH_B, sourceRecordId: 'snap-3' }),
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: ['teacher-2'],
      actorUserId: 'system',
    })
    const scheduled3 = scheduleSafetyWakeups({ safetyCase: created3.safetyCase, policy })
    const disposed = disposeSafetyCase({
      safetyCase: created3.safetyCase,
      actorUserId: 'teacher-1',
      note: 'resolved before fire',
    })
    const disposeNoop = applySafetyWakeup({
      safetyCase: disposed.safetyCase,
      payload: scheduled3.payloads[1]!,
      now: created3.safetyCase.disposeDueAt,
    })
    expect(disposeNoop.event).toBeNull()
    expect(disposeNoop.job.status).toBe('CANCELLED')
  })

  it('same-hash reanalysis opens new case; cross-subject uniqueness holds', () => {
    const policy = buildTestOnlySafetyPolicy()
    const keyA = buildSafetyIdempotencyKey({
      subjectUserId: 'student-1',
      sourceKind: 'BUNDLE_REPORT_FACTS',
      sourceHash: HASH,
      sourceRecordId: 'analysis-1',
      policyKey: policy.policyKey,
      policyVersion: policy.policyVersion,
    })
    const keyReanalysis = buildSafetyIdempotencyKey({
      subjectUserId: 'student-1',
      sourceKind: 'BUNDLE_REPORT_FACTS',
      sourceHash: HASH, // same hash
      sourceRecordId: 'analysis-2', // different instance
      policyKey: policy.policyKey,
      policyVersion: policy.policyVersion,
    })
    const keyOtherSubject = buildSafetyIdempotencyKey({
      subjectUserId: 'student-2',
      sourceKind: 'BUNDLE_REPORT_FACTS',
      sourceHash: HASH,
      sourceRecordId: 'analysis-1',
      policyKey: policy.policyKey,
      policyVersion: policy.policyVersion,
    })
    expect(keyA).not.toBe(keyReanalysis)
    expect(keyA).not.toBe(keyOtherSubject)

    const first = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH, sourceRecordId: 'analysis-1' }),
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: [],
      actorUserId: 'system',
    })
    const reanalysis = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH, sourceRecordId: 'analysis-2' }),
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: [],
      actorUserId: 'system',
      priorCaseId: first.safetyCase.caseId,
    })
    expect(reanalysis.created).toBe(true)
    expect(reanalysis.safetyCase.caseId).not.toBe(first.safetyCase.caseId)
    expect(assertReanalysisDoesNotAutoClose({
      priorCase: first.safetyCase,
      newAnalysisTriggered: true,
    })).toBe('OPEN')

    const other = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH, sourceRecordId: 'analysis-1' }),
      subjectUserId: 'student-2',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: [],
      actorUserId: 'system',
    })
    expect(other.created).toBe(true)
    expect(other.safetyCase.idempotencyKey).not.toBe(first.safetyCase.idempotencyKey)
  })

  it('worker process rejects non-ID payloads and loads case by id', () => {
    const policy = buildTestOnlySafetyPolicy()
    const created = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH }),
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: [],
      actorUserId: 'system',
    })
    const { payloads } = scheduleSafetyWakeups({ safetyCase: created.safetyCase, policy })
    const store = new Map([[created.safetyCase.caseId, created.safetyCase]])
    const result = processSafetyWakeupDelivery({
      loadCase: (id) => store.get(id) ?? null,
      loadLedger: () => null,
      loadPriorEscalation: () => null,
      payload: payloads[0]!,
      now: created.safetyCase.ackDueAt,
    })
    expect(result.applied?.event?.type).toBe('ESCALATED')

    expect(failCode(() => processSafetyWakeupDelivery({
      loadCase: () => created.safetyCase,
      loadLedger: () => null,
      loadPriorEscalation: () => null,
      payload: {
        ...payloads[0]!,
        // @ts-expect-error intentional smuggle
        safetyCase: created.safetyCase,
      } as never,
    }))).toBe('SAFETY_INPUT')
  })
})

describe('SafetyCase Prep 17.1 wakeup concurrency / restart', () => {
  it('uses deterministic wakeupJobId; restart reuses same logical IDs', () => {
    const policy = buildTestOnlySafetyPolicy()
    const created = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH, sourceRecordId: 'det-1' }),
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: [],
      actorUserId: 'system',
      now: '2026-09-03T06:00:00.000Z',
    })
    const first = scheduleSafetyWakeups({ safetyCase: created.safetyCase, policy })
    const second = rescheduleSafetyWakeupsAfterRestart({
      safetyCase: created.safetyCase,
      policy,
      now: '2026-09-03T12:00:00.000Z',
    })
    expect(first.payloads[0]!.wakeupJobId).toBe(second.payloads[0]!.wakeupJobId)
    expect(first.payloads[1]!.wakeupJobId).toBe(second.payloads[1]!.wakeupJobId)
    expect(first.payloads[0]!.wakeupJobId).toMatch(/^[a-f0-9]{64}$/)
    expect(first.payloads[0]!.wakeupJobId).not.toBe(first.payloads[1]!.wakeupJobId)
  })

  it('now < fireAt is TOO_EARLY no-op (Bull delay is not authority)', () => {
    const policy = buildTestOnlySafetyPolicy()
    const created = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH, sourceRecordId: 'early-1' }),
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: [],
      actorUserId: 'system',
      now: '2026-09-03T06:00:00.000Z',
    })
    const { payloads } = scheduleSafetyWakeups({ safetyCase: created.safetyCase, policy })
    const early = applySafetyWakeup({
      safetyCase: created.safetyCase,
      payload: payloads[0]!,
      now: '2026-09-03T06:00:00.000Z', // before ackDueAt
    })
    expect(early.event).toBeNull()
    expect(early.job.status).toBe('TOO_EARLY')
    expect(early.safetyCase.status).toBe('OPEN')
  })

  it('processWakeupAtomically: concurrent same wakeupJobId → one ESCALATED only', () => {
    const policy = buildTestOnlySafetyPolicy()
    const created = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH, sourceRecordId: 'race-1' }),
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: [],
      actorUserId: 'system',
      now: '2026-09-03T06:00:00.000Z',
    })
    const { payloads } = scheduleSafetyWakeups({ safetyCase: created.safetyCase, policy })
    const payload = payloads[0]!
    const claimed = new Set<string>()
    const cases = new Map([[created.safetyCase.caseId, created.safetyCase]])
    const fireNow = created.safetyCase.ackDueAt // at deadline

    const run = () => processWakeupAtomically({
      payload,
      now: fireNow,
      loadCase: (id) => cases.get(id) ?? null,
      claimLedger: ({ wakeupJobId }) => {
        if (claimed.has(wakeupJobId)) return false
        claimed.add(wakeupJobId)
        return true
      },
    })

    const results = [run(), run(), run()]
    const winners = results.filter((row) => row.claimed && row.applied?.event?.type === 'ESCALATED')
    const losers = results.filter((row) => !row.claimed)
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(2)
    expect(losers.every((row) => row.applied?.event === null)).toBe(true)
  })
})
