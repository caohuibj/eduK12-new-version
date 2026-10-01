import type { UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { hashRelationalCohortPolicy, projectRelationalCohortForSubject } from './analysis'
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
  input: { attemptId: string; userId?: string },
): Promise<boolean> => {
  const attempt = await db.compositeAssessmentAttempt.findUnique({
    where: { id: input.attemptId },
    select: { userId: true, assignmentRef: true },
  })
  if (!attempt || (input.userId && attempt.userId !== input.userId) || !attempt.assignmentRef) return false

  const assignment = await createSqlRelationalAssignmentRepository(db as any).findById(attempt.assignmentRef)
    ?? relationalFail('RELATIONAL_RUNTIME_BINDING', 'relational runtime attempt references a missing assignment')
  if (assignment.perspective === 'RELATIONAL_EXPERIENCE' || assignment.analysisMode === 'COHORT_AGGREGATE') return true
  // Declared Run disclosure uses its summary, including protection against
  // native child result routes that would otherwise disclose additional fields.
  if (assignment.policyDomain === 'ORGANIZATION_RUN') {
    const governed = await db.$queryRawUnsafe(
      `SELECT e.id FROM assessment_run_executions e JOIN assessment_run_tracks t
        ON t.organization_id=e.organization_id AND t.run_id=e.run_id AND t.id=e.track_id
       WHERE e.runtime_binding_kind='COMPOSITE' AND e.runtime_binding_ref=$1
         AND t.frozen_resource_policy ? 'resultDisclosure' LIMIT 1`, input.attemptId)
    if (governed.length) return true
  }
  if (input.userId && assignment.respondentUserId !== input.userId) {
    relationalFail('RELATIONAL_RUNTIME_BINDING', 'relational runtime respondent does not match the signed-in participant')
  }
  return false
}

export const createRelationalProductReportService = (
  db: any = prisma,
  registry: RelationalProductRegistryV1 = relationalProductRegistry,
) => ({
  /** Respondent-specific compatibility guard retained for existing callers. */
  async assertRespondentReportAllowed(input: {
    attemptId: string
    userId: string
  }): Promise<void> {
    if (await aggregateOnlyCompositeAttempt(db, input)) {
      relationalFail('RELATIONAL_ANALYSIS_ACCESS', 'relational-experience results are available only through minimum-N cohort projection')
    }
  },

  /**
   * Generic Composite report/export surfaces must reject aggregate/protected
   * relational attempts for every viewer, including teachers and admins.
   * The owning policy surface is responsible for any permitted projection.
   */
  async assertGenericCompositeReportAllowed(input: { attemptId: string }): Promise<void> {
    if (await aggregateOnlyCompositeAttempt(db, input)) {
      relationalFail('RELATIONAL_ANALYSIS_ACCESS', 'aggregate relational attempts cannot use generic Composite report/export routes')
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

  async assertGenericScaleReportAllowed(input: { assessmentId: string }): Promise<void> {
    const assessment = await db.assessment.findUnique({
      where: { id: input.assessmentId },
      select: { compositeAttemptId: true, status: true },
    })
    if (!assessment?.compositeAttemptId || assessment.status !== 'COMPLETED') return
    if (await aggregateOnlyCompositeAttempt(db, { attemptId: assessment.compositeAttemptId })) {
      relationalFail('RELATIONAL_ANALYSIS_ACCESS', 'aggregate relational assessments cannot use generic Scale/Questionnaire report routes')
    }
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
    const subjectRule = entry.resultDisclosure?.audiences.SUBJECT
    if (!subjectRule || !['AGGREGATE_ONLY', 'DELAYED_AGGREGATE'].includes(subjectRule.mode)) return relationalFail('RELATIONAL_ANALYSIS_ACCESS', 'This content does not disclose a cohort report to the teacher subject')
    // Legacy course episodes have no authoritative collection-close event. They
    // cannot satisfy delayed release; only closed Run reporting can do so.
    if (subjectRule.mode === 'DELAYED_AGGREGATE') relationalFail('RELATIONAL_REPORT_NOT_READY', 'Delayed feedback requires a closed collection window')
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
      assignment.policyDomain === 'LEGACY_COURSE'
      && assignment.subjectRole === 'TEACHER'
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
    const snapshot = await createRelationalProductCohortMaterializer(db).materialize({
      assignments: completed,
      policy: authoritativeCohortPolicy,
    })
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
    const safeSnapshot = projectRelationalCohortForSubject({ snapshot, viewerUserId: input.userId })
    return {
      ...base,
      state: 'READY' as const,
      respondentCount,
      snapshot: { ...safeSnapshot,
        metrics: Object.fromEntries(Object.entries(safeSnapshot.metrics).filter(([key]) => subjectRule!.metricKeys.includes(key))) },
    }
  },
})

export const relationalProductReportService = createRelationalProductReportService()
