import { describe, expect, it, vi } from 'vitest'
import { buildRunAttemptIdentity } from '../../modules/assessment-run/startAdmission'
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
