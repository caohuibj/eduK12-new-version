import type { UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { hashRelationalCohortPolicy, projectRelationalCohortForSubject } from './analysis'
import { createSqlRelationalAnalysisRepository } from './analysis-repository'
import { relationalFail } from './errors'
import { createRelationalProductCohortMaterializer } from './product-cohort-materializer'
import {
  relationalProductRegistry,
  type RelationalProductRegistryV1,
} from './product-registry'
import { createSqlRelationalAssignmentRepository } from './repository'
import type { RelationalResourceKindV1 } from './types'

type ProductRef = {
  resourceKind: RelationalResourceKindV1
  resourceKey: string
  resourceVersion: string
}

const assertParticipantRole = (role: UserRole): void => {
  if (role !== 'STUDENT' && role !== 'PARENT' && role !== 'TEACHER') {
    relationalFail('RELATIONAL_PRODUCT_ROLE', 'this account role cannot read a relational respondent report')
  }
}

const assertIndividualRespondentReport = (assignment: {
  perspective: string
  analysisMode: string
}): void => {
  if (assignment.perspective === 'RELATIONAL_EXPERIENCE' || assignment.analysisMode === 'COHORT_AGGREGATE') {
    relationalFail('RELATIONAL_ANALYSIS_ACCESS', 'relational-experience results are available only through minimum-N cohort projection')
  }
}

const aggregateOnlyCompositeAttempt = async (
  db: any,
  input: { attemptId: string; userId: string },
): Promise<boolean> => {
  const attempt = await db.compositeAssessmentAttempt.findUnique({
    where: { id: input.attemptId },
    select: { userId: true, assignmentRef: true },
  })
  if (!attempt || attempt.userId !== input.userId || !attempt.assignmentRef) return false

  const assignment = await createSqlRelationalAssignmentRepository(db as any).findById(attempt.assignmentRef)
    ?? relationalFail('RELATIONAL_RUNTIME_BINDING', 'relational runtime attempt references a missing assignment')
  if (assignment.respondentUserId !== input.userId) {
    relationalFail('RELATIONAL_RUNTIME_BINDING', 'relational runtime respondent does not match the signed-in participant')
  }
  return assignment.perspective === 'RELATIONAL_EXPERIENCE' || assignment.analysisMode === 'COHORT_AGGREGATE'
}

export const createRelationalProductReportService = (
  db: any = prisma,
  registry: RelationalProductRegistryV1 = relationalProductRegistry,
) => ({
  /**
   * Guard the generic participant Composite report endpoint. Historical/non-relational
   * attempts remain unchanged; relational-experience attempts fail closed so a
   * respondent cannot bypass the product UI by guessing an attempt URL.
   */
  async assertRespondentReportAllowed(input: {
    attemptId: string
    userId: string
  }): Promise<void> {
    if (await aggregateOnlyCompositeAttempt(db, input)) {
      relationalFail('RELATIONAL_ANALYSIS_ACCESS', 'relational-experience results are available only through minimum-N cohort projection')
    }
  },

  async aggregateOnlyCompositeAttempt(input: {
    attemptId: string
    userId: string
  }): Promise<boolean> {
    return aggregateOnlyCompositeAttempt(db, input)
  },

  async aggregateOnlyCognitiveSession(input: {
    sessionId: string
    userId: string
  }): Promise<boolean> {
    const session = await db.cognitiveSession.findUnique({
      where: { id: input.sessionId },
      select: { userId: true, compositeAttemptId: true, status: true },
    })
    if (
      !session
      || session.userId !== input.userId
      || session.status !== 'COMPLETED'
      || !session.compositeAttemptId
    ) return false
    return aggregateOnlyCompositeAttempt(db, {
      attemptId: session.compositeAttemptId,
      userId: input.userId,
    })
  },

  async aggregateOnlyScaleAssessment(input: {
    assessmentId: string
    userId: string
  }): Promise<boolean> {
    const assessment = await db.assessment.findUnique({
      where: { id: input.assessmentId },
      select: { userId: true, compositeAttemptId: true, status: true },
    })
    if (
      !assessment
      || assessment.userId !== input.userId
      || assessment.status !== 'COMPLETED'
      || !assessment.compositeAttemptId
    ) return false
    return aggregateOnlyCompositeAttempt(db, {
      attemptId: assessment.compositeAttemptId,
      userId: input.userId,
    })
  },

  async respondentReportTarget(input: {
    assignmentId: string
    userId: string
    role: UserRole
  }): Promise<{ attemptId: string }> {
    assertParticipantRole(input.role)
    const repository = createSqlRelationalAssignmentRepository(db as any)
    const assignment = await repository.findById(input.assignmentId)
      ?? relationalFail('RELATIONAL_ASSIGNMENT_NOT_FOUND', 'assignment not found')
    if (assignment.respondentUserId !== input.userId || assignment.respondentRole !== input.role) {
      relationalFail('RELATIONAL_ANALYSIS_ACCESS', 'only the assignment respondent can open this report target')
    }
    assertIndividualRespondentReport(assignment)
    if (assignment.status !== 'COMPLETED') {
      relationalFail('RELATIONAL_REPORT_NOT_READY', 'assignment is not completed')
    }
    const attempt = await db.compositeAssessmentAttempt.findFirst({
      where: {
        assignmentRef: assignment.assignmentId,
        userId: input.userId,
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        subjectUserId: true,
        respondentUserId: true,
        episodeId: true,
        assignmentRef: true,
      },
    })
    if (!attempt) relationalFail('RELATIONAL_REPORT_NOT_READY', 'completed runtime attempt not found')
    if (
      attempt.subjectUserId !== assignment.subjectUserId
      || attempt.respondentUserId !== assignment.respondentUserId
      || attempt.episodeId !== assignment.episodeId
      || attempt.assignmentRef !== assignment.assignmentId
    ) {
      relationalFail('RELATIONAL_RUNTIME_BINDING', 'runtime report target does not match the relational assignment')
    }
    return { attemptId: attempt.id }
  },

  async teacherCohortReport(input: {
    userId: string
    role: UserRole
    courseId: string
    product: ProductRef
  }) {
    if (input.role !== 'TEACHER') {
      relationalFail('RELATIONAL_ANALYSIS_ACCESS', 'only the teacher subject can read this cohort report')
    }
    const entry = registry.findExact(input.product)
      ?? relationalFail('RELATIONAL_PRODUCT_UNAVAILABLE', 'relational product is not released')
    const applicability = entry.applicability
    if (
      entry.releaseStatus !== 'PUBLISHED'
      || applicability.analysisMode !== 'COHORT_AGGREGATE'
      || !applicability.subjectRoles.includes('TEACHER')
      || !applicability.respondentRoles.includes('STUDENT')
      || !applicability.perspectives.includes('RELATIONAL_EXPERIENCE')
      || !applicability.relationshipKinds.includes('COURSE_TEACHER_STUDENT')
    ) {
      relationalFail('RELATIONAL_PRODUCT_CONTRACT', 'released product is not a Student-to-Teacher cohort contract')
    }
    const minimumRespondents = applicability.minimumRespondents ?? 0
    if (minimumRespondents < 3) {
      relationalFail('RELATIONAL_PRODUCT_CONTRACT', 'released product must freeze a minimum respondent threshold of at least 3')
    }
    const cohortPolicy = entry.cohortAnalysisPolicy
    if (!cohortPolicy || cohortPolicy.minimumRespondents !== minimumRespondents) {
      relationalFail('RELATIONAL_PRODUCT_CONTRACT', 'released cohort product is missing its frozen authoritative analysis policy')
    }
    const authoritativeCohortPolicy = cohortPolicy!

    const course = await db.course.findUnique({
      where: { id: input.courseId },
      select: { id: true, creatorId: true },
    })
    if (!course) relationalFail('RELATIONAL_COURSE_NOT_FOUND', 'course not found')
    if (course.creatorId !== input.userId) {
      relationalFail('RELATIONAL_ANALYSIS_ACCESS', 'teacher must be the course creator and cohort subject')
    }

    const repository = createSqlRelationalAssignmentRepository(db as any)
    const expectedHash = registry.applicabilityHash(entry)
    const candidates = (await repository.listForSubject(input.userId, 200)).filter((assignment) => (
      assignment.subjectRole === 'TEACHER'
      && assignment.perspective === 'RELATIONAL_EXPERIENCE'
      && assignment.analysisMode === 'COHORT_AGGREGATE'
      && assignment.relationshipKind === 'COURSE_TEACHER_STUDENT'
      && assignment.relationshipSnapshot.courseId === input.courseId
      && assignment.resourceKind === input.product.resourceKind
      && assignment.resourceKey === input.product.resourceKey
      && assignment.resourceVersion === input.product.resourceVersion
      && assignment.applicabilityHash === expectedHash
      && assignment.minimumRespondents === minimumRespondents
      && assignment.status !== 'REVOKED'
      && assignment.status !== 'EXPIRED'
    ))

    const base = {
      courseId: input.courseId,
      resourceKind: input.product.resourceKind,
      resourceKey: input.product.resourceKey,
      resourceVersion: input.product.resourceVersion,
      title: entry.title,
      minimumRespondents,
    }
    if (candidates.length === 0) {
      return { ...base, state: 'EMPTY' as const, respondentCount: null, snapshot: null }
    }

    // New RA-02 issuance uses one deterministic cohort episode. For compatibility
    // with any pre-release rows, select the most recently active episode rather
    // than mixing assignments across episodes.
    const episodeLatest = new Map<string, string>()
    for (const assignment of candidates) {
      const previous = episodeLatest.get(assignment.episodeId)
      if (!previous || assignment.createdAt > previous) episodeLatest.set(assignment.episodeId, assignment.createdAt)
    }
    const episodeId = [...episodeLatest.entries()].sort((a, b) => b[1].localeCompare(a[1]))[0][0]
    const cohort = candidates.filter((assignment) => assignment.episodeId === episodeId)
    const completed = cohort.filter((assignment) => assignment.status === 'COMPLETED')
    const respondentCount = new Set(completed.map((assignment) => assignment.respondentUserId)).size
    if (respondentCount < minimumRespondents) {
      return {
        ...base,
        state: 'INSUFFICIENT' as const,
        respondentCount: null,
        snapshot: null,
      }
    }

    const seed = cohort[0]
    const expectedPolicyHash = hashRelationalCohortPolicy(authoritativeCohortPolicy)
    const analysisRepository = createSqlRelationalAnalysisRepository(db as any)
    let snapshot = await analysisRepository.latestCohort({
      subjectUserId: input.userId,
      courseId: input.courseId,
      episodeId,
      resourceKind: input.product.resourceKind,
      resourceKey: input.product.resourceKey,
      resourceVersion: input.product.resourceVersion,
      applicabilityHash: expectedHash,
    })
    if (!snapshot || snapshot.policyHash !== expectedPolicyHash || snapshot.respondentCount < respondentCount) {
      snapshot = await createRelationalProductCohortMaterializer(db).materialize({
        assignments: completed,
        policy: authoritativeCohortPolicy,
      })
    }
    if (!snapshot) {
      return {
        ...base,
        state: 'AWAITING_ANALYSIS' as const,
        respondentCount,
        snapshot: null,
      }
    }
    if (
      snapshot.minimumRespondents !== seed.minimumRespondents
      || snapshot.policyHash !== expectedPolicyHash
      || snapshot.respondentCount < minimumRespondents
    ) {
      relationalFail('RELATIONAL_COHORT_SCOPE', 'stored cohort snapshot does not match the frozen assignment privacy contract')
    }
    return {
      ...base,
      state: 'READY' as const,
      respondentCount,
      snapshot: projectRelationalCohortForSubject({ snapshot, viewerUserId: input.userId }),
    }
  },
})

export const relationalProductReportService = createRelationalProductReportService()
