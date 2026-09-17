import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '../../config/database'
import {
  RelationalAssessmentError,
  createRelationalAssessmentService,
  createSqlRelationalAssignmentRepository,
  resolveParentChildRelationship,
  type RelationalApplicabilityV1,
} from '../../modules/assessment-relational'
import type { ParentStudentRelationshipRecordV1 } from '../../modules/assessment-identity/types'

const enabled = Boolean(process.env.DATABASE_URL)
const ids = new Set<string>()
const episodeIds = new Set<string>()
const consentIds = new Set<string>()

const applicability: RelationalApplicabilityV1 = {
  schemaVersion: 1,
  resourceKind: 'BUNDLE',
  resourceKey: 'parent_observer_persistence_fixture_v1',
  resourceVersion: '1.0.0',
  subjectRoles: ['STUDENT'],
  respondentRoles: ['PARENT'],
  relationshipKinds: ['PARENT_CHILD'],
  perspectives: ['OBSERVER_REPORT'],
  analysisMode: 'INDIVIDUAL_ONLY',
  visibilityPolicyKey: 'observer_assigning_teacher_v1',
  minimumRespondents: null,
}

const errorCode = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run()
    throw new Error('expected RelationalAssessmentError')
  } catch (error) {
    if (error instanceof RelationalAssessmentError) return error.code
    throw error
  }
}

const createFixture = async () => {
  const suffix = randomUUID()
  const student = await prisma.user.create({
    data: { username: `rel-student-${suffix}`, passwordHash: 'test', role: 'STUDENT' },
  })
  const parent = await prisma.user.create({
    data: { username: `rel-parent-${suffix}`, passwordHash: 'test', role: 'PARENT' },
  })
  const teacher = await prisma.user.create({
    data: { username: `rel-teacher-${suffix}`, passwordHash: 'test', role: 'TEACHER' },
  })
  ids.add(student.id)
  ids.add(parent.id)
  ids.add(teacher.id)

  const episode = await prisma.assessmentEpisode.create({
    data: {
      subjectUserId: student.id,
      initiatedByUserId: teacher.id,
      initiationMode: 'TEACHER_CAMPAIGN',
    },
  })
  episodeIds.add(episode.id)

  const pending = await prisma.assessmentAttemptConsent.create({
    data: {
      subjectUserId: student.id,
      respondentUserId: parent.id,
      respondentType: 'PARENT',
      consentVersion: '1.0.0',
      consentHash: 'a'.repeat(64),
      purpose: 'teacher_assigned_parent_observer',
      visibilityScope: 'ASSIGNING_TEACHER',
      shareTargetsJson: [teacher.id],
      acceptedAt: null,
    },
  })
  consentIds.add(pending.id)

  const relationship: ParentStudentRelationshipRecordV1 = {
    relationshipId: `rel-${suffix}`,
    parentUserId: parent.id,
    studentUserId: student.id,
    status: 'ACTIVE',
    inviteCodeId: null,
    approvedByUserId: teacher.id,
    approvedAt: new Date().toISOString(),
    revokedByUserId: null,
    revokedAt: null,
    revokeReason: null,
    consentVersion: '1.0.0',
    consentHash: 'b'.repeat(64),
  }
  const repository = createSqlRelationalAssignmentRepository(prisma as any)
  const service = createRelationalAssessmentService(repository)
  const assignment = await service.issue({
    applicability,
    relationshipSnapshot: resolveParentChildRelationship({
      relationship,
      subjectUserId: student.id,
      subjectRole: 'STUDENT',
      respondentUserId: parent.id,
      respondentRole: 'PARENT',
    }),
    perspective: 'OBSERVER_REPORT',
    episodeId: episode.id,
    createdByUserId: teacher.id,
    consentId: pending.id,
    assignmentId: `assignment-${suffix}`,
  })

  return { student, parent, teacher, episode, pending, assignment, service }
}

afterEach(async () => {
  if (!enabled) return
  if (episodeIds.size > 0) {
    await prisma.relationalAssessmentAssignment.deleteMany({ where: { episodeId: { in: [...episodeIds] } } })
  }
  if (consentIds.size > 0) {
    const consentList = [...consentIds]
    await prisma.assessmentAttemptConsent.deleteMany({ where: { priorConsentId: { in: consentList } } })
    await prisma.assessmentAttemptConsent.deleteMany({ where: { id: { in: consentList } } })
  }
  if (episodeIds.size > 0) {
    await prisma.assessmentEpisode.deleteMany({ where: { id: { in: [...episodeIds] } } })
  }
  if (ids.size > 0) {
    await prisma.user.deleteMany({ where: { id: { in: [...ids] } } })
  }
  ids.clear()
  episodeIds.clear()
  consentIds.clear()
})

describe.skipIf(!enabled)('relational consent lineage persistence', () => {
  it('does not accept an unrelated consent, then starts through the valid append-only accepted child', async () => {
    const fixture = await createFixture()

    const unrelated = await prisma.assessmentAttemptConsent.create({
      data: {
        subjectUserId: fixture.student.id,
        respondentUserId: fixture.parent.id,
        respondentType: 'PARENT',
        consentVersion: '1.0.0',
        consentHash: 'c'.repeat(64),
        purpose: 'teacher_assigned_parent_observer',
        visibilityScope: 'ASSIGNING_TEACHER',
        shareTargetsJson: [fixture.teacher.id],
        acceptedAt: new Date('2026-09-17T03:00:00.000Z'),
      },
    })
    consentIds.add(unrelated.id)

    expect(await errorCode(() => fixture.service.start({
      assignmentId: fixture.assignment.assignmentId,
      actorUserId: fixture.parent.id,
    }))).toBe('RELATIONAL_CONSENT_REQUIRED')

    const accepted = await prisma.assessmentAttemptConsent.create({
      data: {
        priorConsentId: fixture.pending.id,
        subjectUserId: fixture.student.id,
        respondentUserId: fixture.parent.id,
        respondentType: 'PARENT',
        consentVersion: '1.0.0',
        consentHash: 'd'.repeat(64),
        purpose: 'teacher_assigned_parent_observer',
        visibilityScope: 'ASSIGNING_TEACHER',
        shareTargetsJson: [fixture.teacher.id],
        acceptedAt: new Date('2026-09-17T03:05:00.000Z'),
      },
    })
    consentIds.add(accepted.id)

    const started = await fixture.service.start({
      assignmentId: fixture.assignment.assignmentId,
      actorUserId: fixture.parent.id,
      startedAt: '2026-09-17T03:10:00.000Z',
    })
    expect(started.assignment.consentId).toBe(fixture.pending.id)
    expect(started.attemptIdentity.consentId).toBe(accepted.id)
    expect(started.attemptIdentity.subjectUserId).toBe(fixture.student.id)
    expect(started.attemptIdentity.respondentUserId).toBe(fixture.parent.id)
  })

  it('rejects a lineage child that changes purpose or visibility contract', async () => {
    const fixture = await createFixture()
    const substituted = await prisma.assessmentAttemptConsent.create({
      data: {
        priorConsentId: fixture.pending.id,
        subjectUserId: fixture.student.id,
        respondentUserId: fixture.parent.id,
        respondentType: 'PARENT',
        consentVersion: '1.0.0',
        consentHash: 'e'.repeat(64),
        purpose: 'parent_self_serve_observer',
        visibilityScope: 'PRIVATE_RESPONDENT',
        shareTargetsJson: [],
        acceptedAt: new Date('2026-09-17T03:05:00.000Z'),
      },
    })
    consentIds.add(substituted.id)

    expect(await errorCode(() => fixture.service.start({
      assignmentId: fixture.assignment.assignmentId,
      actorUserId: fixture.parent.id,
    }))).toBe('RELATIONAL_CONSENT_BINDING')
  })
})
