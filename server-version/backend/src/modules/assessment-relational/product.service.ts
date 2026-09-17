import type { UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import {
  acceptPendingAttemptConsent,
  createAttemptConsent,
} from '../assessment-identity/identity'
import type {
  AssessmentAttemptConsentRecordV1,
  ParentStudentRelationshipRecordV1,
} from '../assessment-identity/types'
import {
  getAttemptState,
  startRelationalCompositeAttemptInTransaction,
} from '../composite/composite.service'
import { buildRelationalAssignment } from './assignment'
import { relationalFail } from './errors'
import {
  relationalProductRegistry,
  type RelationalProductEntryV1,
  type RelationalProductRegistryV1,
} from './product-registry'
import {
  resolveCourseTeacherStudentRelationship,
  resolveParentChildRelationship,
} from './relationship'
import { createSqlRelationalAssignmentRepository } from './repository'
import { createRelationalAssessmentService } from './service'
import type {
  RelationalActorRoleV1,
  RelationalAssignmentRecordV1,
  RelationalResourceKindV1,
} from './types'

const RELATIONAL_ATTEMPT_CONSENT_VERSION = 'relational-attempt-v1'

type ProductRef = {
  resourceKind: RelationalResourceKindV1
  resourceKey: string
  resourceVersion: string
}

const actorRole = (role: UserRole): RelationalActorRoleV1 => {
  if (role === 'STUDENT' || role === 'TEACHER' || role === 'PARENT') return role
  return relationalFail('RELATIONAL_PRODUCT_ROLE', 'this account role cannot participate in relational assessment')
}

const publicProduct = (entry: RelationalProductEntryV1) => ({
  resourceKind: entry.applicability.resourceKind,
  resourceKey: entry.applicability.resourceKey,
  resourceVersion: entry.applicability.resourceVersion,
  title: entry.title,
  description: entry.description,
  scienceMaturity: entry.scienceMaturity,
  perspectives: entry.applicability.perspectives,
  analysisMode: entry.applicability.analysisMode,
  minimumRespondents: entry.applicability.minimumRespondents,
})

const taskProjection = (
  assignment: RelationalAssignmentRecordV1,
  registry: RelationalProductRegistryV1,
  consentRequired = false,
) => {
  const entry = registry.findExact(assignment)
  const registryMatches = Boolean(
    entry
    && entry.releaseStatus === 'PUBLISHED'
    && entry.launchTarget
    && registry.applicabilityHash(entry) === assignment.applicabilityHash,
  )
  return {
    assignmentId: assignment.assignmentId,
    episodeId: assignment.episodeId,
    subjectUserId: assignment.subjectUserId,
    subjectRole: assignment.subjectRole,
    respondentRole: assignment.respondentRole,
    perspective: assignment.perspective,
    relationshipKind: assignment.relationshipKind,
    resourceKind: assignment.resourceKind,
    resourceKey: assignment.resourceKey,
    resourceVersion: assignment.resourceVersion,
    analysisMode: assignment.analysisMode,
    minimumRespondents: assignment.minimumRespondents,
    status: assignment.status,
    createdAt: assignment.createdAt,
    startedAt: assignment.startedAt,
    completedAt: assignment.completedAt,
    consentRequired,
    launchable: registryMatches
      && !consentRequired
      && (assignment.status === 'OPEN' || assignment.status === 'STARTED'),
    product: entry && entry.releaseStatus === 'PUBLISHED' ? publicProduct(entry) : null,
  }
}

const releasedEntry = (
  registry: RelationalProductRegistryV1,
  ref: ProductRef,
): RelationalProductEntryV1 => {
  const entry = registry.findExact(ref)
    ?? relationalFail('RELATIONAL_PRODUCT_UNAVAILABLE', 'relational product is not released or launchable')
  if (entry.releaseStatus !== 'PUBLISHED' || !entry.launchTarget) {
    relationalFail('RELATIONAL_PRODUCT_UNAVAILABLE', 'relational product is not released or launchable')
  }
  return entry
}

const assertIndividualObserver = (
  entry: RelationalProductEntryV1,
  respondentRole: 'PARENT' | 'TEACHER',
  visibilityPolicyKey: string,
): void => {
  const applicability = entry.applicability
  if (
    applicability.analysisMode !== 'INDIVIDUAL_ONLY'
    || applicability.minimumRespondents !== null
    || applicability.visibilityPolicyKey !== visibilityPolicyKey
    || !applicability.subjectRoles.includes('STUDENT')
    || !applicability.respondentRoles.includes(respondentRole)
    || !applicability.perspectives.includes('OBSERVER_REPORT')
  ) {
    relationalFail('RELATIONAL_PRODUCT_CONTRACT', 'released product is not an individual observer contract for this journey')
  }
}

const assertStudentTeacherExperience = (entry: RelationalProductEntryV1): void => {
  const applicability = entry.applicability
  if (
    applicability.analysisMode !== 'COHORT_AGGREGATE'
    || (applicability.minimumRespondents ?? 0) < 3
    || !applicability.subjectRoles.includes('TEACHER')
    || !applicability.respondentRoles.includes('STUDENT')
    || !applicability.relationshipKinds.includes('COURSE_TEACHER_STUDENT')
    || !applicability.perspectives.includes('RELATIONAL_EXPERIENCE')
  ) {
    relationalFail('RELATIONAL_PRODUCT_CONTRACT', 'released product is not a minimum-N student-to-teacher experience contract')
  }
}

const parentRelationshipRecord = (relationship: {
  id: string
  parentUserId: string
  studentUserId: string
  status: 'PENDING' | 'ACTIVE' | 'REVOKED'
  inviteCodeId: string | null
  approvedByUserId: string | null
  approvedAt: Date | null
  revokedByUserId: string | null
  revokedAt: Date | null
  revokeReason: string | null
  consentVersion: string | null
  consentHash: string | null
}): ParentStudentRelationshipRecordV1 => ({
  relationshipId: relationship.id,
  parentUserId: relationship.parentUserId,
  studentUserId: relationship.studentUserId,
  status: relationship.status,
  inviteCodeId: relationship.inviteCodeId,
  approvedByUserId: relationship.approvedByUserId,
  approvedAt: relationship.approvedAt?.toISOString() ?? null,
  revokedByUserId: relationship.revokedByUserId,
  revokedAt: relationship.revokedAt?.toISOString() ?? null,
  revokeReason: relationship.revokeReason,
  consentVersion: relationship.consentVersion,
  consentHash: relationship.consentHash,
})

const persistConsent = async (tx: any, consent: AssessmentAttemptConsentRecordV1) => (
  tx.assessmentAttemptConsent.create({
    data: {
      id: consent.consentId,
      priorConsentId: consent.priorConsentId,
      subjectUserId: consent.subjectUserId,
      respondentUserId: consent.respondentUserId,
      respondentType: consent.respondentType,
      consentVersion: consent.consentVersion,
      consentHash: consent.consentHash,
      purpose: consent.purpose,
      visibilityScope: consent.visibilityScope,
      shareTargetsJson: consent.shareTargets,
      acceptedAt: consent.acceptedAt ? new Date(consent.acceptedAt) : null,
      revokedAt: consent.revokedAt ? new Date(consent.revokedAt) : null,
    },
  })
)

const readParentRelationship = async (tx: any, parentUserId: string, studentUserId: string) => {
  const relationship = await tx.parentStudentRelationship.findUnique({
    where: { parentUserId_studentUserId: { parentUserId, studentUserId } },
  })
  if (!relationship || relationship.status !== 'ACTIVE') {
    relationalFail('RELATIONAL_PARENT_CHILD_INACTIVE', 'an ACTIVE parent-child relationship is required')
  }
  return relationship
}

const readCourseRoster = async (tx: any, courseId: string, studentUserId: string) => {
  const course = await tx.course.findUnique({
    where: { id: courseId },
    select: { id: true, creatorId: true },
  })
  if (!course) relationalFail('RELATIONAL_COURSE_NOT_FOUND', 'course not found')
  const membership = await tx.courseStudent.findUnique({
    where: { courseId_studentId: { courseId, studentId: studentUserId } },
    select: { studentId: true, status: true },
  })
  if (!membership || (membership.status !== 'ACTIVE' && membership.status !== 'APPROVED')) {
    relationalFail('RELATIONAL_COURSE_ROSTER', 'student must have ACTIVE or APPROVED course membership')
  }
  return { course, membership }
}

const createEpisode = async (tx: any, input: {
  subjectUserId: string
  initiatedByUserId: string
  initiationMode: 'TEACHER_CAMPAIGN' | 'PARENT_SELF_SERVE' | 'STUDENT_SELF'
  courseId: string | null
}) => tx.assessmentEpisode.create({
  data: input,
  select: { id: true },
})

const createCohortEpisode = async (tx: any, input: {
  subjectUserId: string
  courseId: string
  resourceKind: RelationalResourceKindV1
  resourceKey: string
  resourceVersion: string
  applicabilityHash: string
}) => {
  const cohortHash = canonicalHash({ schema: 'RelationalCohortEpisodeV1', ...input })
  const id = `rel-cohort-${cohortHash}`
  return tx.assessmentEpisode.upsert({
    where: { id },
    create: {
      id,
      subjectUserId: input.subjectUserId,
      initiatedByUserId: null,
      initiationMode: 'STUDENT_SELF',
      courseId: input.courseId,
      campaignKey: `relational-cohort-v1:${cohortHash}`,
      label: 'Student relational-experience cohort',
    },
    update: {},
    select: { id: true },
  })
}

export const createRelationalProductService = (
  registry: RelationalProductRegistryV1 = relationalProductRegistry,
  db: any = prisma,
) => ({
  catalog(role: UserRole) {
    const relationalRole = actorRole(role)
    return registry.listReleasedForRespondent(relationalRole).map(publicProduct)
  },

  async tasks(userId: string, role: UserRole) {
    const relationalRole = actorRole(role)
    const repository = createSqlRelationalAssignmentRepository(db as any)
    const assignments = await repository.listForRespondent(userId)
    return Promise.all(assignments
      .filter((assignment) => assignment.respondentRole === relationalRole)
      .map(async (assignment) => {
        const acceptedConsent = assignment.consentId
          ? await repository.resolveAcceptedConsent(assignment)
          : null
        return taskProjection(assignment, registry, Boolean(assignment.consentId && !acceptedConsent))
      }))
  },

  async issueTeacherToParent(input: {
    teacherUserId: string
    role: UserRole
    courseId: string
    studentUserId: string
    parentUserId: string
    product: ProductRef
  }) {
    if (input.role !== 'TEACHER') {
      relationalFail('RELATIONAL_ASSIGNMENT_ACTOR', 'only a teacher can assign a parent observer task')
    }
    const entry = releasedEntry(registry, input.product)
    assertIndividualObserver(entry, 'PARENT', 'observer_assigning_teacher_v1')

    const assignment = await db.$transaction(async (tx: any) => {
      const { course, membership } = await readCourseRoster(tx, input.courseId, input.studentUserId)
      if (course.creatorId !== input.teacherUserId) {
        relationalFail('RELATIONAL_COURSE_TEACHER', 'teacher must be the course creator')
      }
      const relationship = await readParentRelationship(tx, input.parentUserId, input.studentUserId)
      const snapshot = resolveParentChildRelationship({
        relationship: parentRelationshipRecord(relationship),
        subjectUserId: input.studentUserId,
        subjectRole: 'STUDENT',
        respondentUserId: input.parentUserId,
        respondentRole: 'PARENT',
      })
      if (membership.studentId !== input.studentUserId) {
        relationalFail('RELATIONAL_COURSE_ROSTER', 'student actor does not match course membership')
      }
      const episode = await createEpisode(tx, {
        subjectUserId: input.studentUserId,
        initiatedByUserId: input.teacherUserId,
        initiationMode: 'TEACHER_CAMPAIGN',
        courseId: input.courseId,
      })
      const consent = createAttemptConsent({
        subjectUserId: input.studentUserId,
        respondentUserId: input.parentUserId,
        respondentType: 'PARENT',
        consentVersion: RELATIONAL_ATTEMPT_CONSENT_VERSION,
        purpose: 'teacher_assigned_parent_observer',
        visibilityScope: 'ASSIGNING_TEACHER',
        shareTargets: [input.teacherUserId],
        pending: true,
        acceptedAt: null,
      })
      await persistConsent(tx, consent)
      const record = buildRelationalAssignment({
        applicability: entry.applicability,
        relationshipSnapshot: snapshot,
        perspective: 'OBSERVER_REPORT',
        episodeId: episode.id,
        createdByUserId: input.teacherUserId,
        consentId: consent.consentId,
      })
      await createSqlRelationalAssignmentRepository(tx as any).create(record)
      return record
    })
    return taskProjection(assignment, registry, true)
  },

  async issueTeacherObserver(input: {
    teacherUserId: string
    role: UserRole
    courseId: string
    studentUserId: string
    product: ProductRef
  }) {
    if (input.role !== 'TEACHER') {
      relationalFail('RELATIONAL_ASSIGNMENT_ACTOR', 'only a teacher can create a teacher observer task')
    }
    const entry = releasedEntry(registry, input.product)
    assertIndividualObserver(entry, 'TEACHER', 'observer_assigning_teacher_v1')

    const assignment = await db.$transaction(async (tx: any) => {
      const { course, membership } = await readCourseRoster(tx, input.courseId, input.studentUserId)
      if (course.creatorId !== input.teacherUserId) {
        relationalFail('RELATIONAL_COURSE_TEACHER', 'teacher must be the course creator')
      }
      const snapshot = resolveCourseTeacherStudentRelationship({
        courseId: input.courseId,
        courseCreatorUserId: course.creatorId,
        membershipStudentUserId: membership.studentId,
        membershipStatus: membership.status,
        subjectUserId: input.studentUserId,
        subjectRole: 'STUDENT',
        respondentUserId: input.teacherUserId,
        respondentRole: 'TEACHER',
      })
      const episode = await createEpisode(tx, {
        subjectUserId: input.studentUserId,
        initiatedByUserId: input.teacherUserId,
        initiationMode: 'TEACHER_CAMPAIGN',
        courseId: input.courseId,
      })
      const now = new Date().toISOString()
      const consent = createAttemptConsent({
        subjectUserId: input.studentUserId,
        respondentUserId: input.teacherUserId,
        respondentType: 'TEACHER',
        consentVersion: RELATIONAL_ATTEMPT_CONSENT_VERSION,
        purpose: 'teacher_self_report_observer',
        visibilityScope: 'ASSIGNING_TEACHER',
        shareTargets: [input.teacherUserId],
        acceptedAt: now,
      })
      await persistConsent(tx, consent)
      const record = buildRelationalAssignment({
        applicability: entry.applicability,
        relationshipSnapshot: snapshot,
        perspective: 'OBSERVER_REPORT',
        episodeId: episode.id,
        createdByUserId: input.teacherUserId,
        consentId: consent.consentId,
        createdAt: now,
      })
      await createSqlRelationalAssignmentRepository(tx as any).create(record)
      return record
    })
    return taskProjection(assignment, registry, false)
  },

  async issueParentSelfServe(input: {
    parentUserId: string
    role: UserRole
    studentUserId: string
    product: ProductRef
  }) {
    if (input.role !== 'PARENT') {
      relationalFail('RELATIONAL_ASSIGNMENT_ACTOR', 'only a parent can create a parent self-serve observer task')
    }
    const entry = releasedEntry(registry, input.product)
    assertIndividualObserver(entry, 'PARENT', 'observer_private_respondent_v1')

    const assignment = await db.$transaction(async (tx: any) => {
      const relationship = await readParentRelationship(tx, input.parentUserId, input.studentUserId)
      const snapshot = resolveParentChildRelationship({
        relationship: parentRelationshipRecord(relationship),
        subjectUserId: input.studentUserId,
        subjectRole: 'STUDENT',
        respondentUserId: input.parentUserId,
        respondentRole: 'PARENT',
      })
      const episode = await createEpisode(tx, {
        subjectUserId: input.studentUserId,
        initiatedByUserId: input.parentUserId,
        initiationMode: 'PARENT_SELF_SERVE',
        courseId: null,
      })
      const now = new Date().toISOString()
      const consent = createAttemptConsent({
        subjectUserId: input.studentUserId,
        respondentUserId: input.parentUserId,
        respondentType: 'PARENT',
        consentVersion: RELATIONAL_ATTEMPT_CONSENT_VERSION,
        purpose: 'parent_self_serve_observer',
        visibilityScope: 'PRIVATE_RESPONDENT',
        shareTargets: [],
        acceptedAt: now,
      })
      await persistConsent(tx, consent)
      const record = buildRelationalAssignment({
        applicability: entry.applicability,
        relationshipSnapshot: snapshot,
        perspective: 'OBSERVER_REPORT',
        episodeId: episode.id,
        createdByUserId: input.parentUserId,
        consentId: consent.consentId,
        createdAt: now,
      })
      await createSqlRelationalAssignmentRepository(tx as any).create(record)
      return record
    })
    return taskProjection(assignment, registry, false)
  },

  async issueStudentExperience(input: {
    studentUserId: string
    role: UserRole
    courseId: string
    product: ProductRef
  }) {
    if (input.role !== 'STUDENT') {
      relationalFail('RELATIONAL_ASSIGNMENT_ACTOR', 'only a student can create a student-to-teacher experience task')
    }
    const entry = releasedEntry(registry, input.product)
    assertStudentTeacherExperience(entry)

    const assignment = await db.$transaction(async (tx: any) => {
      const { course, membership } = await readCourseRoster(tx, input.courseId, input.studentUserId)
      const snapshot = resolveCourseTeacherStudentRelationship({
        courseId: input.courseId,
        courseCreatorUserId: course.creatorId,
        membershipStudentUserId: membership.studentId,
        membershipStatus: membership.status,
        subjectUserId: course.creatorId,
        subjectRole: 'TEACHER',
        respondentUserId: input.studentUserId,
        respondentRole: 'STUDENT',
      })
      const applicabilityHash = registry.applicabilityHash(entry)
      const episode = await createCohortEpisode(tx, {
        subjectUserId: course.creatorId,
        courseId: input.courseId,
        resourceKind: entry.applicability.resourceKind,
        resourceKey: entry.applicability.resourceKey,
        resourceVersion: entry.applicability.resourceVersion,
        applicabilityHash,
      })
      const repository = createSqlRelationalAssignmentRepository(tx as any)
      const existingRow = await tx.relationalAssessmentAssignment.findFirst({
        where: {
          episodeId: episode.id,
          respondentUserId: input.studentUserId,
          resourceKind: entry.applicability.resourceKind,
          resourceKey: entry.applicability.resourceKey,
          resourceVersion: entry.applicability.resourceVersion,
        },
        select: { id: true },
      })
      if (existingRow) {
        const existing = await repository.findById(existingRow.id)
          ?? relationalFail('RELATIONAL_RUNTIME_BINDING', 'existing cohort assignment could not be reloaded')
        return existing
      }
      const record = buildRelationalAssignment({
        applicability: entry.applicability,
        relationshipSnapshot: snapshot,
        perspective: 'RELATIONAL_EXPERIENCE',
        episodeId: episode.id,
        createdByUserId: input.studentUserId,
        consentId: null,
      })
      await repository.create(record)
      return record
    })
    return taskProjection(assignment, registry, false)
  },

  async acceptConsent(input: { assignmentId: string; userId: string; role: UserRole }) {
    if (input.role !== 'PARENT') {
      relationalFail('RELATIONAL_ASSIGNMENT_ACTOR', 'only the assigned parent can accept this consent')
    }
    return db.$transaction(async (tx: any) => {
      const repository = createSqlRelationalAssignmentRepository(tx as any)
      const assignment = await repository.findById(input.assignmentId)
        ?? relationalFail('RELATIONAL_ASSIGNMENT_NOT_FOUND', 'assignment not found')
      if (
        assignment.respondentRole !== 'PARENT'
        || assignment.respondentUserId !== input.userId
        || assignment.status !== 'OPEN'
        || !assignment.consentId
      ) {
        relationalFail('RELATIONAL_ASSIGNMENT_ACTOR', 'only the OPEN assignment parent respondent can accept consent')
      }
      const existing = await repository.resolveAcceptedConsent(assignment)
      if (existing) return { accepted: true, replayed: true }

      const root = await tx.assessmentAttemptConsent.findUnique({ where: { id: assignment.consentId } })
      if (!root || root.priorConsentId !== null || root.acceptedAt !== null || root.revokedAt !== null) {
        relationalFail('RELATIONAL_CONSENT_BINDING', 'assignment does not reference an active pending root consent')
      }
      const pending: AssessmentAttemptConsentRecordV1 = {
        consentId: root.id,
        priorConsentId: root.priorConsentId,
        subjectUserId: root.subjectUserId,
        respondentUserId: root.respondentUserId,
        respondentType: root.respondentType as AssessmentAttemptConsentRecordV1['respondentType'],
        consentVersion: root.consentVersion,
        consentHash: root.consentHash,
        purpose: root.purpose,
        visibilityScope: root.visibilityScope,
        shareTargets: Array.isArray(root.shareTargetsJson) ? root.shareTargetsJson as string[] : [],
        acceptedAt: null,
        revokedAt: null,
      }
      const accepted = acceptPendingAttemptConsent({ pending })
      await tx.assessmentAttemptConsent.upsert({
        where: { priorConsentId: root.id },
        create: {
          id: accepted.consentId,
          priorConsentId: accepted.priorConsentId,
          subjectUserId: accepted.subjectUserId,
          respondentUserId: accepted.respondentUserId,
          respondentType: accepted.respondentType,
          consentVersion: accepted.consentVersion,
          consentHash: accepted.consentHash,
          purpose: accepted.purpose,
          visibilityScope: accepted.visibilityScope,
          shareTargetsJson: accepted.shareTargets,
          acceptedAt: new Date(accepted.acceptedAt!),
          revokedAt: null,
        },
        update: {},
      })
      const resolved = await repository.resolveAcceptedConsent(assignment)
        ?? relationalFail('RELATIONAL_CONSENT_REQUIRED', 'consent acceptance was not persisted')
      return { accepted: true, replayed: resolved.consentId !== accepted.consentId }
    })
  },

  async start(input: { assignmentId: string; userId: string; role: UserRole }) {
    const relationalRole = actorRole(input.role)
    const launched = await db.$transaction(async (tx: any) => {
      const repository = createSqlRelationalAssignmentRepository(tx as any)
      const assignment = await repository.findById(input.assignmentId)
        ?? relationalFail('RELATIONAL_ASSIGNMENT_NOT_FOUND', 'assignment not found')
      if (assignment.respondentUserId !== input.userId || assignment.respondentRole !== relationalRole) {
        relationalFail('RELATIONAL_ASSIGNMENT_ACTOR', 'only the assigned respondent can start this assessment')
      }

      const entry = releasedEntry(registry, assignment)
      const launchTarget = entry.launchTarget!
      if (registry.applicabilityHash(entry) !== assignment.applicabilityHash) {
        relationalFail('RELATIONAL_PRODUCT_CONTRACT', 'assignment applicability does not match the released product contract')
      }

      const existing = await tx.compositeAssessmentAttempt.findFirst({
        where: { assignmentRef: assignment.assignmentId },
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          compositeAssessmentId: true,
          userId: true,
          subjectUserId: true,
          respondentUserId: true,
          episodeId: true,
          assignmentRef: true,
          consentId: true,
        },
      })
      if (existing) {
        if (
          existing.compositeAssessmentId !== launchTarget.compositeAssessmentId
          || existing.userId !== input.userId
          || existing.subjectUserId !== assignment.subjectUserId
          || existing.respondentUserId !== assignment.respondentUserId
          || existing.episodeId !== assignment.episodeId
          || existing.assignmentRef !== assignment.assignmentId
        ) {
          relationalFail('RELATIONAL_RUNTIME_BINDING', 'existing runtime attempt does not match the relational assignment')
        }
        if (assignment.status === 'OPEN') {
          relationalFail('RELATIONAL_RUNTIME_BINDING', 'runtime attempt exists while relational assignment is still OPEN')
        }
        return { assignment, attemptId: existing.id, replayed: true }
      }
      if (assignment.status !== 'OPEN') {
        relationalFail('RELATIONAL_RUNTIME_BINDING', 'started relational assignment is missing its runtime attempt')
      }

      const relational = createRelationalAssessmentService(repository)
      const started = await relational.start({
        assignmentId: assignment.assignmentId,
        actorUserId: input.userId,
      })
      const attempt = await startRelationalCompositeAttemptInTransaction(tx as any, {
        compositeAssessmentId: launchTarget.compositeAssessmentId,
        respondentUserId: input.userId,
        attemptIdentity: started.attemptIdentity,
      })
      return { assignment: started.assignment, attemptId: attempt.id, replayed: false }
    })

    return {
      assignment: taskProjection(launched.assignment, registry, false),
      attempt: await getAttemptState(launched.attemptId, { userId: input.userId }),
      replayed: launched.replayed,
    }
  },
})

export const relationalProductService = createRelationalProductService()
