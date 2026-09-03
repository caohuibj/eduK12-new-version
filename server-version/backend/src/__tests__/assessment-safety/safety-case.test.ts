import { describe, expect, it } from 'vitest'
import {
  SafetyContractError,
  acknowledgeSafetyCase,
  applySafetyWakeup,
  assertCanViewSafetyCase,
  assertReanalysisDoesNotAutoClose,
  buildTestOnlyAuthoritativeTrigger,
  buildTestOnlySafetyPolicy,
  createSafetyCaseAtomic,
  createSafetyPolicyDraft,
  disposeSafetyCase,
  evaluateSafetyTrigger,
  projectSafetyStaffView,
  projectSafetySubjectGuidance,
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

describe('SafetyCase policy / case / wakeup', () => {
  it('creates atomically and is idempotent on duplicate complete', () => {
    const policy = buildTestOnlySafetyPolicy()
    const trigger = evaluateSafetyTrigger({
      policy,
      sourceKind: 'BUNDLE_REPORT_FACTS',
      sourceHash: HASH,
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
    })
    expect(first.created).toBe(true)
    expect(first.safetyCase.status).toBe('OPEN')

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

    // Non-test policy with productionTriggerEnabled=false never fires.
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

  it('supports confirm / dispose / escalate wakeups without auto-closing on reanalysis', () => {
    const policy = buildTestOnlySafetyPolicy()
    const trigger = buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH })
    const created = createSafetyCaseAtomic({
      policy,
      trigger,
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: ['teacher-2'],
      actorUserId: 'system',
    })
    const jobs = scheduleSafetyWakeups({ safetyCase: created.safetyCase, policy })
    expect(jobs).toHaveLength(2)

    const acked = acknowledgeSafetyCase({
      safetyCase: created.safetyCase,
      actorUserId: 'teacher-1',
      note: 'seen',
    })
    expect(acked.safetyCase.status).toBe('ACKNOWLEDGED')

    const wakeupNoop = applySafetyWakeup({
      safetyCase: acked.safetyCase,
      job: jobs[0]!,
    })
    expect(wakeupNoop.event).toBeNull()

    const disposed = disposeSafetyCase({
      safetyCase: acked.safetyCase,
      actorUserId: 'teacher-1',
      note: 'resolved with school counselor',
    })
    expect(disposed.safetyCase.status).toBe('DISPOSED')

    // New reanalysis trigger → new case; old remains DISPOSED.
    const priorStatus = assertReanalysisDoesNotAutoClose({
      priorCase: disposed.safetyCase,
      newAnalysisTriggered: true,
    })
    expect(priorStatus).toBe('DISPOSED')

    const reanalysis = createSafetyCaseAtomic({
      policy,
      trigger: buildTestOnlyAuthoritativeTrigger({ sourceHash: HASH_B }),
      subjectUserId: 'student-1',
      primaryOwnerUserId: 'teacher-1',
      backupOwnerUserIds: ['teacher-2'],
      actorUserId: 'system',
      priorCaseId: disposed.safetyCase.caseId,
    })
    expect(reanalysis.created).toBe(true)
    expect(reanalysis.safetyCase.caseId).not.toBe(disposed.safetyCase.caseId)
    expect(reanalysis.safetyCase.priorCaseId).toBe(disposed.safetyCase.caseId)
    expect(disposed.safetyCase.status).toBe('DISPOSED')
  })
})
