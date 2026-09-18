import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '../../config/database'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { createCanonicalUnitResultEnvelope } from '../../modules/assessment-runtime/unit-result'
import { RelationalAssessmentError } from '../../modules/assessment-relational/errors'
import { projectRelationalUnitFinalResponse, resolveRelationalCompositeResultDisposition } from '../../modules/assessment-relational/result-authority'
import { createRelationalProductRegistry } from '../../modules/assessment-relational/product-registry'
import { createRelationalProductReportService } from '../../modules/assessment-relational/product-report.service'
import { createRelationalProductService } from '../../modules/assessment-relational/product.service'
import type { RelationalCohortAnalysisPolicyV1 } from '../../modules/assessment-relational/analysis'
import type { RelationalApplicabilityV1 } from '../../modules/assessment-relational/types'
import { compositeExportService } from '../../modules/composite/composite-export.service'
import {
  getAnalysisExportForTeacher,
  getReportForTeacher,
  listAttemptsForTeacher,
  listPackageAnalysisSnapshotsForTeacher,
} from '../../modules/composite/composite.service'

const enabled = Boolean(process.env.DATABASE_URL)
const userIds = new Set<string>()
const courseIds = new Set<string>()
const COMPOSITE_ID = 'ra02-cohort-fixture-composite'

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

const policy: RelationalCohortAnalysisPolicyV1 = {
  schemaVersion: 1,
  policyKey: 'ra02-classroom-cohort-v1',
  policyVersion: '1.0.0',
  minimumRespondents: 3,
  metricKeys: ['total'],
}

const registry = createRelationalProductRegistry([{
  title: 'RA-02 classroom experience cohort fixture',
  description: null,
  releaseStatus: 'PUBLISHED',
  scienceMaturity: 'PILOT',
  applicability,
  cohortAnalysisPolicy: policy,
  launchTarget: { runtime: 'COMPOSITE', compositeAssessmentId: COMPOSITE_ID },
}])

const service = createRelationalProductService(registry, prisma)
const reports = createRelationalProductReportService(prisma, registry)
const product = {
  resourceKind: applicability.resourceKind,
  resourceKey: applicability.resourceKey,
  resourceVersion: applicability.resourceVersion,
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
  const students = await Promise.all([0, 1, 2, 3].map((index) => prisma.user.create({
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
  await prisma.compositeAssessment.upsert({
    where: { id: COMPOSITE_ID },
    create: {
      id: COMPOSITE_ID,
      code: `RA02-COHORT-${suffix}`,
      name: 'RA-02 cohort runtime carrier',
      status: 'PUBLISHED',
      createdBy: teacher.id,
      publishedAt: new Date(),
    },
    update: {
      createdBy: teacher.id,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  })
  return { teacher, otherTeacher, students, course }
}

const persistCanonicalRuntimeResult = async (input: {
  assignment: {
    assignmentId: string
    subjectUserId: string
    respondentUserId: string
    episodeId: string
  }
  studentId: string
  total: number
  index: number
}) => {
  const completedAt = new Date()
  const attempt = await prisma.compositeAssessmentAttempt.create({
    data: {
      compositeAssessmentId: COMPOSITE_ID,
      userId: input.studentId,
      participantKey: `user:${input.studentId}`,
      status: 'COMPLETED',
      deliveryMode: 'FINAL_ONLY',
      runtimeGeneration: 'UNIFIED_V1',
      attemptEpoch: 1,
      progress: 100,
      completedItems: 1,
      completedAt,
      subjectUserId: input.assignment.subjectUserId,
      respondentUserId: input.assignment.respondentUserId,
      episodeId: input.assignment.episodeId,
      assignmentRef: input.assignment.assignmentId,
      consentId: null,
    },
  })
  const instrumentKey = 'ra02-cohort-canonical-fixture'
  const instrumentVersion = '1.0.0'
  const sourceDefinitionHash = canonicalHash({ fixture: 'definition', index: input.index })
  const compiledRuntimeHash = canonicalHash({ fixture: 'compiled-runtime', index: input.index })
  const sourceAttemptId = `ra02-cohort-source-${input.assignment.assignmentId}`
  const envelope = createCanonicalUnitResultEnvelope({
    core: {
      schemaVersion: 1,
      unitType: 'SCALE',
      instrumentKey,
      instrumentVersion,
      sourceDefinitionHash,
      compilerVersion: 'ra02-test-compiler',
      compiledRuntimeHash,
      scorerKey: 'ra02-test-scorer',
      scorerVersion: '1.0.0',
      quality: { status: 'interpretable', flags: [] },
      metrics: [{ key: 'total', value: input.total, unit: 'score', quality: 'calculated' }],
      facts: [],
      references: [],
      contextHash: null,
      scientificProvenance: { instrumentKey, instrumentVersion },
    },
    completedAt,
    persistenceProvenance: {
      sourceType: 'ASSESSMENT',
      sourceAttemptId,
    },
  })
  await prisma.assessmentUnitSnapshot.create({
    data: {
      compositeAttemptId: attempt.id,
      attemptEpoch: 1,
      slotKey: 'scale:ra02-cohort-fixture',
      unitType: 'SCALE',
      terminalState: 'COMPLETED',
      payloadKind: 'UNIT_RESULT',
      sourceType: 'ASSESSMENT',
      sourceAttemptId,
      sourceDefinitionHash,
      compiledRuntimeHash,
      canonicalResultEncrypted: encryptUnifiedRuntimePayload(envelope),
      completedAt,
    },
  })
  return attempt
}

afterEach(async () => {
  if (!enabled) return
  const users = [...userIds]
  const courses = [...courseIds]
  await prisma.compositeAssessmentAttempt.deleteMany({ where: { compositeAssessmentId: COMPOSITE_ID } })
  await prisma.compositeAssessment.deleteMany({ where: { id: COMPOSITE_ID } })
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
  it('materializes authoritative cohort results, keeps minimum-N privacy, and blocks generic individual reads', async () => {
    const { teacher, otherTeacher, students, course } = await fixture()
    const assignments = []
    for (const student of students.slice(0, 3)) {
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
    const runtimeAttempts = []
    for (let index = 0; index < assignments.length; index += 1) {
      runtimeAttempts.push(await persistCanonicalRuntimeResult({
        assignment: assignments[index],
        studentId: students[index].id,
        total: index + 1,
        index,
      }))
    }

    expect(await prisma.relationalAnalysisSnapshot.count({
      where: { subjectUserId: teacher.id },
    })).toBe(0)

    expect(await resolveRelationalCompositeResultDisposition(runtimeAttempts[0].id)).toBe('COHORT_ONLY')
    const terminalAck = await projectRelationalUnitFinalResponse(runtimeAttempts[0].id, {
      submissionId: 'cohort-final-1',
      payloadHash: 'cohort-payload-1',
      replayed: false,
      result: { total: 999 },
      canonicalResult: { metrics: [{ key: 'total', value: 999 }] },
    })
    expect(terminalAck).toEqual({
      submissionId: 'cohort-final-1',
      payloadHash: 'cohort-payload-1',
      replayed: false,
      completed: true,
    })
    expect(JSON.stringify(terminalAck)).not.toContain('999')

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
    expect(await prisma.relationalAnalysisSnapshot.count({
      where: { subjectUserId: teacher.id },
    })).toBe(1)

    const replayReady = await reports.teacherCohortReport({
      userId: teacher.id,
      role: 'TEACHER',
      courseId: course.id,
      product,
    })
    expect(replayReady.state).toBe('READY')
    expect(await prisma.relationalAnalysisSnapshot.count({
      where: { subjectUserId: teacher.id },
    })).toBe(1)

    await prisma.relationalAssessmentAssignment.update({
      where: { id: assignments[0].assignmentId },
      data: { status: 'REVOKED', revokedAt: new Date() },
    })
    const replacement = await service.issueStudentExperience({
      studentUserId: students[3].id,
      role: 'STUDENT',
      courseId: course.id,
      product,
    })
    expect(replacement.episodeId).toBe(assignments[0].episodeId)
    await prisma.relationalAssessmentAssignment.update({
      where: { id: replacement.assignmentId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })
    await persistCanonicalRuntimeResult({
      assignment: replacement,
      studentId: students[3].id,
      total: 4,
      index: 3,
    })

    const replacedReady = await reports.teacherCohortReport({
      userId: teacher.id,
      role: 'TEACHER',
      courseId: course.id,
      product,
    })
    expect(replacedReady.state).toBe('READY')
    expect(replacedReady.respondentCount).toBe(3)
    expect(replacedReady.snapshot?.metrics.total).toEqual({
      state: 'present',
      validN: 3,
      missingN: 0,
      mean: 3,
    })
    expect(await prisma.relationalAnalysisSnapshot.count({
      where: { subjectUserId: teacher.id },
    })).toBe(2)

    expect(await errorCode(() => reports.assertRespondentReportAllowed({
      attemptId: runtimeAttempts[0].id,
      userId: students[0].id,
    }))).toBe('RELATIONAL_ANALYSIS_ACCESS')

    const genericList = await listAttemptsForTeacher(teacher.id, 'TEACHER', COMPOSITE_ID, {
      page: 1,
      pageSize: 20,
    })
    expect(genericList.total).toBe(0)
    expect(genericList.attemptCounts).toEqual({
      started: 0,
      inProgress: 0,
      completed: 0,
      abandoned: 0,
    })
    const wideExport = await compositeExportService.getExportData(COMPOSITE_ID, {
      detail: 'summary',
      anonymize: true,
      actor: { userId: teacher.id, role: 'TEACHER' },
    })
    expect(wideExport.rows).toHaveLength(0)
    await expect(getReportForTeacher(
      teacher.id,
      'TEACHER',
      COMPOSITE_ID,
      runtimeAttempts[0].id,
    )).rejects.toThrow(/关系测评/u)
    await expect(getAnalysisExportForTeacher(
      teacher.id,
      'TEACHER',
      COMPOSITE_ID,
      runtimeAttempts[0].id,
    )).rejects.toThrow(/关系测评/u)
    await expect(listPackageAnalysisSnapshotsForTeacher(
      teacher.id,
      'TEACHER',
      runtimeAttempts[0].id,
    )).rejects.toThrow(/关系测评/u)
  })
})
