import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '../../config/database'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import {
  createRelationalCohortAnalysisService,
  type RelationalCohortAnalysisPolicyV1,
} from '../../modules/assessment-relational/analysis'
import { createSqlRelationalAnalysisRepository } from '../../modules/assessment-relational/analysis-repository'
import { RelationalAssessmentError } from '../../modules/assessment-relational/errors'
import { createRelationalProductRegistry } from '../../modules/assessment-relational/product-registry'
import { createRelationalProductReportService } from '../../modules/assessment-relational/product-report.service'
import { createRelationalProductService } from '../../modules/assessment-relational/product.service'
import { createSqlRelationalAssignmentRepository } from '../../modules/assessment-relational/repository'
import type { RelationalApplicabilityV1 } from '../../modules/assessment-relational/types'

const enabled = Boolean(process.env.DATABASE_URL)
const userIds = new Set<string>()
const courseIds = new Set<string>()

const applicability: RelationalApplicabilityV1 = {
  schemaVersion: 1,
  resourceKind: 'BUNDLE',
  resourceKey: 'ra02-student-teacher-cohort-fixture',
  resourceVersion: '1.0.0',
  subjectRoles: ['TEACHER'],
  respondentRoles: ['STUDENT'],
  relationshipKinds: ['COURSE_TEACHER_STUDENT'],
  perspectives: ['RELATIONAL_EXPERIENCE'],
  analysisMode: 'COHORT_AGGREGATE',
  visibilityPolicyKey: 'student_teacher_aggregate_only_v1',
  minimumRespondents: 3,
}

const registry = createRelationalProductRegistry([{
  title: 'RA-02 classroom experience cohort fixture',
  description: null,
  releaseStatus: 'PUBLISHED',
  scienceMaturity: 'PILOT',
  applicability,
  launchTarget: { runtime: 'COMPOSITE', compositeAssessmentId: 'ra02-cohort-fixture-composite' },
}])

const service = createRelationalProductService(registry, prisma)
const reports = createRelationalProductReportService(prisma, registry)
const product = {
  resourceKind: applicability.resourceKind,
  resourceKey: applicability.resourceKey,
  resourceVersion: applicability.resourceVersion,
}

const policy: RelationalCohortAnalysisPolicyV1 = {
  schemaVersion: 1,
  policyKey: 'ra02-classroom-cohort-v1',
  policyVersion: '1.0.0',
  minimumRespondents: 3,
  metricKeys: ['total'],
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

const fixture = async () => {
  const suffix = randomUUID()
  const teacher = await prisma.user.create({
    data: { username: `ra02-cohort-teacher-${suffix}`, passwordHash: 'test', role: 'TEACHER' },
  })
  const otherTeacher = await prisma.user.create({
    data: { username: `ra02-cohort-other-${suffix}`, passwordHash: 'test', role: 'TEACHER' },
  })
  const students = await Promise.all([0, 1, 2].map((index) => prisma.user.create({
    data: { username: `ra02-cohort-student-${index}-${suffix}`, passwordHash: 'test', role: 'STUDENT' },
  })))
  for (const user of [teacher, otherTeacher, ...students]) userIds.add(user.id)

  const course = await prisma.course.create({
    data: {
      title: 'RA-02 cohort fixture course',
      courseCode: `RA02-C-${suffix}`,
      creatorId: teacher.id,
      status: 'PUBLISHED',
    },
  })
  courseIds.add(course.id)
  await prisma.courseStudent.createMany({
    data: students.map((student) => ({ courseId: course.id, studentId: student.id, status: 'ACTIVE' })),
  })
  return { teacher, otherTeacher, students, course }
}

afterEach(async () => {
  if (!enabled) return
  const users = [...userIds]
  const courses = [...courseIds]
  if (users.length) {
    await prisma.relationalAnalysisSnapshot.deleteMany({ where: { subjectUserId: { in: users } } })
    await prisma.relationalAssessmentAssignment.deleteMany({
      where: {
        OR: [
          { subjectUserId: { in: users } },
          { respondentUserId: { in: users } },
          { createdByUserId: { in: users } },
        ],
      },
    })
    await prisma.assessmentEpisode.deleteMany({
      where: {
        OR: [
          { subjectUserId: { in: users } },
          { initiatedByUserId: { in: users } },
        ],
      },
    })
  }
  if (courses.length) {
    await prisma.courseStudent.deleteMany({ where: { courseId: { in: courses } } })
    await prisma.course.deleteMany({ where: { id: { in: courses } } })
  }
  if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } })
  userIds.clear()
  courseIds.clear()
})

describe.skipIf(!enabled)('RA-02 Student-to-Teacher cohort persistence', () => {
  it('shares one cohort episode, keeps issuance idempotent, and enforces minimum-N report privacy', async () => {
    const { teacher, otherTeacher, students, course } = await fixture()
    const assignments = []
    for (const student of students) {
      assignments.push(await service.issueStudentExperience({
        studentUserId: student.id,
        role: 'STUDENT',
        courseId: course.id,
        product,
      }))
    }

    expect(new Set(assignments.map((assignment) => assignment.episodeId)).size).toBe(1)
    const replay = await service.issueStudentExperience({
      studentUserId: students[0].id,
      role: 'STUDENT',
      courseId: course.id,
      product,
    })
    expect(replay.assignmentId).toBe(assignments[0].assignmentId)

    await prisma.relationalAssessmentAssignment.update({
      where: { id: assignments[0].assignmentId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })
    const insufficient = await reports.teacherCohortReport({
      userId: teacher.id,
      role: 'TEACHER',
      courseId: course.id,
      product,
    })
    expect(insufficient).toMatchObject({
      state: 'INSUFFICIENT',
      minimumRespondents: 3,
      respondentCount: null,
      snapshot: null,
    })

    expect(await errorCode(() => reports.respondentReportTarget({
      assignmentId: assignments[0].assignmentId,
      userId: students[0].id,
      role: 'STUDENT',
    }))).toBe('RELATIONAL_ANALYSIS_ACCESS')
    expect(await errorCode(() => reports.teacherCohortReport({
      userId: otherTeacher.id,
      role: 'TEACHER',
      courseId: course.id,
      product,
    }))).toBe('RELATIONAL_ANALYSIS_ACCESS')

    await prisma.relationalAssessmentAssignment.updateMany({
      where: { id: { in: assignments.slice(1).map((assignment) => assignment.assignmentId) } },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })

    const repository = createSqlRelationalAssignmentRepository(prisma as any)
    const metrics = new Map(assignments.map((assignment, index) => [assignment.assignmentId, index + 1]))
    const analysis = createRelationalCohortAnalysisService({
      assignments: repository,
      canonicalResults: {
        async loadForAssignment(assignment) {
          const total = metrics.get(assignment.assignmentId)
          return total === undefined ? null : {
            canonicalResultHash: canonicalHash({ assignmentId: assignment.assignmentId, total }),
            metrics: { total },
          }
        },
      },
    })
    const snapshot = await analysis.build({
      assignmentIds: assignments.map((assignment) => assignment.assignmentId),
      policy,
      createdAt: new Date().toISOString(),
    })
    await createSqlRelationalAnalysisRepository(prisma as any).saveCohort(snapshot)

    const ready = await reports.teacherCohortReport({
      userId: teacher.id,
      role: 'TEACHER',
      courseId: course.id,
      product,
    })
    expect(ready.state).toBe('READY')
    expect(ready.respondentCount).toBe(3)
    expect(ready.snapshot?.respondentCount).toBe(3)
    expect(ready.snapshot?.metrics.total).toEqual({
      state: 'present',
      validN: 3,
      missingN: 0,
      mean: 2,
    })
    expect((ready.snapshot as any)?.inputResultHashes).toBeUndefined()
    expect(JSON.stringify(ready)).not.toContain(students[0].id)
    expect(JSON.stringify(ready)).not.toContain(students[1].id)
    expect(JSON.stringify(ready)).not.toContain(students[2].id)
  })
})
