import { describe, expect, it, vi } from 'vitest'
import { buildRunAttemptIdentity,loadRunExecutionStartAdmission } from '../../modules/assessment-run/startAdmission'
import type { RelationalAssignmentRecordV1 } from '../../modules/assessment-relational/types'

const assignment = (overrides: Partial<RelationalAssignmentRecordV1> = {}): RelationalAssignmentRecordV1 => ({
  assignmentId: 'assignment-1',
  episodeId: 'episode-1',
  subjectUserId: 'student-1',
  subjectRole: 'STUDENT',
  respondentUserId: 'parent-1',
  respondentRole: 'PARENT',
  createdByUserId: 'publisher-1',
  relationshipKind: 'PARENT_CHILD',
  relationshipRef: 'relationship-1',
  relationshipSnapshot: {
    schemaVersion: 1,
    relationshipKind: 'PARENT_CHILD',
    relationshipRef: 'relationship-1',
    subjectUserId: 'student-1',
    subjectRole: 'STUDENT',
    respondentUserId: 'parent-1',
    respondentRole: 'PARENT',
    courseId: null,
    verifiedAt: new Date(0).toISOString(),
    facts: {},
  },
  relationshipSnapshotHash: 'a'.repeat(64),
  perspective: 'OBSERVER_REPORT',
  resourceKind: 'BUNDLE',
  resourceKey: 'bundle-1',
  resourceVersion: '1.0.0',
  applicabilityHash: 'b'.repeat(64),
  analysisMode: 'INDIVIDUAL_ONLY',
  minimumRespondents: null,
  consentId: 'root-consent',
  visibilityPolicyKey: 'observer_assigning_teacher_v1',
  policyDomain: 'ORGANIZATION_RUN',
  status: 'OPEN',
  createdAt: new Date(0).toISOString(),
  startedAt: null,
  completedAt: null,
  revokedAt: null,
  ...overrides,
})

describe('Run START consent lineage admission', () => {
  it('binds the current accepted consent row, not the frozen lineage root', async () => {
    const resolveAcceptedConsent = vi.fn().mockResolvedValue({
      consentId: 'accepted-consent-v2',
      acceptedAt: new Date(1000).toISOString(),
    })
    const identity = await buildRunAttemptIdentity(assignment(), { resolveAcceptedConsent })
    expect(resolveAcceptedConsent).toHaveBeenCalledWith(expect.objectContaining({ consentId: 'root-consent' }))
    expect(identity).toEqual({
      subjectUserId: 'student-1',
      respondentUserId: 'parent-1',
      respondentType: 'PARENT',
      episodeId: 'episode-1',
      assignmentRef: 'assignment-1',
      consentId: 'accepted-consent-v2',
    })
  })

  it('fails closed when a consent-bearing assignment has no currently accepted row', async () => {
    await expect(buildRunAttemptIdentity(assignment(), {
      resolveAcceptedConsent: vi.fn().mockResolvedValue(null),
    })).rejects.toMatchObject({ code: 'RUN_CONSENT_REQUIRED', statusCode: 409 })
  })

  it('keeps consent-free assignments consent-free', async () => {
    const resolveAcceptedConsent = vi.fn()
    const identity = await buildRunAttemptIdentity(assignment({
      relationshipKind: 'SELF',
      respondentUserId: 'student-1',
      respondentRole: 'STUDENT',
      consentId: null,
    }), { resolveAcceptedConsent })
    expect(resolveAcceptedConsent).not.toHaveBeenCalled()
    expect(identity.consentId).toBeNull()
    expect(identity.respondentType).toBe('SELF')
  })
})

describe('Private runtime retains actual respondent and consent admission',()=>{
 const execution={executionId:'execution-1',organizationId:'org-1',runId:'run-1',trackId:'track-1',executionStatus:'ASSIGNED',runStatus:'PUBLISHED',relationalAssignmentId:'assignment-1',policyDomain:'ORGANIZATION_RUN',respondentUserId:'parent-1',runtimeBindingKind:null,runtimeBindingRef:null}
 it('holds private FORM execution until its dedicated runtime is connected, after actual respondent validation',async()=>{
  const tx={$queryRaw:vi.fn().mockResolvedValue([execution])} as any
  const assignments={findById:vi.fn().mockResolvedValue(assignment({resourceKind:'FORM',resourceKey:'private-form:SCHOOL:fixed:STUDENT:PARENT_REPORT'})),resolveAcceptedConsent:vi.fn()}
  await expect(loadRunExecutionStartAdmission({tx,executionId:'execution-1',actorUserId:'parent-1',assignments})).rejects.toMatchObject({code:'PRIVATE_FORM_ACTIVITY_RUNTIME_NOT_READY'})
  expect(assignments.resolveAcceptedConsent).not.toHaveBeenCalled()
  await expect(loadRunExecutionStartAdmission({tx,executionId:'execution-1',actorUserId:'other',assignments})).rejects.toMatchObject({code:'RUN_EXECUTION_ACTOR'})
 })
 it('does not bypass required consent for a persisted private assignment',async()=>{
  const tx={$queryRaw:vi.fn().mockResolvedValue([execution])} as any
  const assignments={findById:vi.fn().mockResolvedValue(assignment({resourceKind:'SCALE',resourceKey:'private-scale:SCHOOL:fixed:STUDENT:PARENT_REPORT'})),resolveAcceptedConsent:vi.fn().mockResolvedValue(null)}
  await expect(loadRunExecutionStartAdmission({tx,executionId:'execution-1',actorUserId:'parent-1',assignments})).rejects.toMatchObject({code:'RUN_CONSENT_REQUIRED'})
  assignments.resolveAcceptedConsent.mockResolvedValue({consentId:'accepted-private-consent',acceptedAt:new Date().toISOString()})
  const admitted=await loadRunExecutionStartAdmission({tx,executionId:'execution-1',actorUserId:'parent-1',assignments})
  expect(admitted.assignment.resourceKey).toBe('private-scale:SCHOOL:fixed:STUDENT:PARENT_REPORT')
  expect(admitted.attemptIdentity.consentId).toBe('accepted-private-consent')
  expect(admitted.attemptIdentity.respondentUserId).toBe('parent-1')
  assignments.findById.mockClear()
  await expect(loadRunExecutionStartAdmission({tx,executionId:'execution-1',actorUserId:'other',assignments})).rejects.toMatchObject({code:'RUN_EXECUTION_ACTOR'})
  expect(assignments.findById).not.toHaveBeenCalled()
 })
 it('keeps existing nonprivate admission and actor identity checks unchanged',async()=>{
  const tx={$queryRaw:vi.fn().mockResolvedValue([execution])} as any
  const assignments={findById:vi.fn().mockResolvedValue(assignment()),resolveAcceptedConsent:vi.fn().mockResolvedValue({consentId:'accepted-consent',acceptedAt:new Date().toISOString()})}
  const result=await loadRunExecutionStartAdmission({tx,executionId:'execution-1',actorUserId:'parent-1',assignments})
  expect(result.attemptIdentity.consentId).toBe('accepted-consent')
  assignments.findById.mockClear()
  await expect(loadRunExecutionStartAdmission({tx,executionId:'execution-1',actorUserId:'other',assignments})).rejects.toMatchObject({code:'RUN_EXECUTION_ACTOR'})
  expect(assignments.findById).not.toHaveBeenCalled()
 })
})
