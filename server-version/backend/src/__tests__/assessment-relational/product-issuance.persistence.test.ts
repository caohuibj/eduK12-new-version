import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '../../config/database'
import { RelationalAssessmentError } from '../../modules/assessment-relational/errors'
import { createRelationalProductRegistry } from '../../modules/assessment-relational/product-registry'
import { createRelationalProductService } from '../../modules/assessment-relational/product.service'
import type { RelationalApplicabilityV1 } from '../../modules/assessment-relational/types'

const enabled = Boolean(process.env.DATABASE_URL)
const userIds = new Set<string>()
const courseIds = new Set<string>()

const applicability = (input: Partial<RelationalApplicabilityV1> & Pick<RelationalApplicabilityV1, 'resourceKey'>): RelationalApplicabilityV1 => ({
  schemaVersion: 1,
  resourceKind: 'BUNDLE',
  resourceVersion: '1.0.0',
  subjectRoles: ['STUDENT'],
  respondentRoles: ['PARENT'],
  relationshipKinds: ['PARENT_CHILD'],
  perspectives: ['OBSERVER_REPORT'],
  analysisMode: 'INDIVIDUAL_ONLY',
  visibilityPolicyKey: 'observer_private_respondent_v1',
  minimumRespondents: null,
  ...input,
})

const parentAssigned = applicability({
  resourceKey: 'ra02-parent-assigned-fixture',
  visibilityPolicyKey: 'observer_assigning_teacher_v1',
})
const parentSelfServe = applicability({
  resourceKey: 'ra02-parent-self-serve-fixture',
})
const teacherObserver = applicability({
  resourceKey: 'ra02-teacher-observer-fixture',
  respondentRoles: ['TEACHER'],
  relationshipKinds: ['COURSE_TEACHER_STUDENT'],
  visibilityPolicyKey: 'observer_assigning_teacher_v1',
})
const studentExperience = applicability({
  resourceKey: 'ra02-student-experience-fixture',
  subjectRoles: ['TEACHER'],
  respondentRoles: ['STUDENT'],
  relationshipKinds: ['COURSE_TEACHER_STUDENT'],
  perspectives: ['RELATIONAL_EXPERIENCE'],
  analysisMode: 'COHORT_AGGREGATE',
  visibilityPolicyKey: 'student_teacher_aggregate_only_v1',
  minimumRespondents: 5,
})

const registry = createRelationalProductRegistry([
  parentAssigned,
  parentSelfServe,
  teacherObserver,
  studentExperience,
].map((entry) => ({
  title: entry.resourceKey,
  description: null,
  releaseStatus: 'PUBLISHED' as const,
  scienceMaturity: 'PILOT' as const,
  applicability: entry,
  cohortAnalysisPolicy: entry.analysisMode === 'COHORT_AGGREGATE'
    ? {
        schemaVersion: 1 as const,
        policyKey: 'ra02-issuance-cohort-v1',
        policyVersion: '1.0.0',
        minimumRespondents: entry.minimumRespondents!,
        metricKeys: ['total'],
      }
    : null,
  launchTarget: { runtime: 'COMPOSITE' as const, compositeAssessmentId: 'ra02-fixture-composite' },
})))

const service = createRelationalProductService(registry, prisma)

const product = (entry: RelationalApplicabilityV1) => ({
  resourceKind: entry.resourceKind,
  resourceKey: entry.resourceKey,
  resourceVersion: entry.resourceVersion,
})

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
    data: { username: `ra02-teacher-${suffix}`, passwordHash: 'test', role: 'TEACHER' },
  })
  const otherTeacher = await prisma.user.create({
    data: { username: `ra02-other-teacher-${suffix}`, passwordHash: 'test', role: 'TEACHER' },
  })
  const student = await prisma.user.create({
    data: { username: `ra02-student-${suffix}`, passwordHash: 'test', role: 'STUDENT' },
  })
  const parent = await prisma.user.create({
    data: { username: `ra02-parent-${suffix}`, passwordHash: 'test', role: 'PARENT' },
  })
  for (const user of [teacher, otherTeacher, student, parent]) userIds.add(user.id)

  const course = await prisma.course.create({
    data: {
      title: 'RA-02 fixture course',
      courseCode: `RA02-${suffix}`,
      creatorId: teacher.id,
      status: 'PUBLISHED',
    },
  })
  courseIds.add(course.id)
  await prisma.courseStudent.create({
    data: { courseId: course.id, studentId: student.id, status: 'ACTIVE' },
  })
  await prisma.parentStudentRelationship.create({
    data: {
      parentUserId: parent.id,
      studentUserId: student.id,
      status: 'ACTIVE',
      approvedByUserId: teacher.id,
      approvedAt: new Date(),
      consentVersion: 'parent-rel-v1',
      consentHash: 'a'.repeat(64),
    },
  })
  return { teacher, otherTeacher, student, parent, course }
}

afterEach(async () => {
  if (!enabled) return
  const users = [...userIds]
  const courses = [...courseIds]
  if (users.length) {
    await prisma.relationalAssessmentAssignment.deleteMany({
      where: {
        OR: [
          { subjectUserId: { in: users } },
          { respondentUserId: { in: users } },
          { createdByUserId: { in: users } },
        ],
      },
    })
    await prisma.assessmentAttemptConsent.deleteMany({
      where: {
        OR: [
          { subjectUserId: { in: users } },
          { respondentUserId: { in: users } },
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
    await prisma.parentStudentRelationship.deleteMany({
      where: {
        OR: [
          { parentUserId: { in: users } },
          { studentUserId: { in: users } },
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

describe.skipIf(!enabled)('RA-02 relational product issuance persistence', () => {
  it('teacher assigned parent consent is pending, append-only accepted, then launchable', async () => {
    const { teacher, student, parent, course } = await fixture()
    const issued = await service.issueTeacherToParent({
      teacherUserId: teacher.id,
      role: 'TEACHER',
      courseId: course.id,
      studentUserId: student.id,
      parentUserId: parent.id,
      product: product(parentAssigned),
    })
    expect(issued.respondentRole).toBe('PARENT')
    expect(issued.relationshipKind).toBe('PARENT_CHILD')
    expect(issued.consentRequired).toBe(true)
    expect(issued.launchable).toBe(false)

    const before = await service.tasks(parent.id, 'PARENT')
    expect(before.find((task) => task.assignmentId === issued.assignmentId)?.consentRequired).toBe(true)

    expect(await errorCode(() => service.acceptConsent({
      assignmentId: issued.assignmentId,
      userId: teacher.id,
      role: 'TEACHER',
    }))).toBe('RELATIONAL_ASSIGNMENT_ACTOR')

    expect(await service.acceptConsent({
      assignmentId: issued.assignmentId,
      userId: parent.id,
      role: 'PARENT',
    })).toEqual({ accepted: true, replayed: false })
    expect(await service.acceptConsent({
      assignmentId: issued.assignmentId,
      userId: parent.id,
      role: 'PARENT',
    })).toEqual({ accepted: true, replayed: true })

    const root = await prisma.relationalAssessmentAssignment.findUnique({
      where: { id: issued.assignmentId },
      select: { consentId: true },
    })
    expect(root?.consentId).toBeTruthy()
    const child = await prisma.assessmentAttemptConsent.findUnique({
      where: { priorConsentId: root!.consentId! },
    })
    expect(child?.acceptedAt).toBeTruthy()

    const after = await service.tasks(parent.id, 'PARENT')
    const task = after.find((candidate) => candidate.assignmentId === issued.assignmentId)
    expect(task?.consentRequired).toBe(false)
    expect(task?.launchable).toBe(true)
  })

  it('builds teacher observer and parent self-serve assignments from authoritative relationships', async () => {
    const { teacher, student, parent, course } = await fixture()
    const teacherTask = await service.issueTeacherObserver({
      teacherUserId: teacher.id,
      role: 'TEACHER',
      courseId: course.id,
      studentUserId: student.id,
      product: product(teacherObserver),
    })
    expect(teacherTask.subjectUserId).toBe(student.id)
    expect(teacherTask.respondentRole).toBe('TEACHER')
    expect(teacherTask.relationshipKind).toBe('COURSE_TEACHER_STUDENT')
    expect(teacherTask.consentRequired).toBe(false)

    const parentTask = await service.issueParentSelfServe({
      parentUserId: parent.id,
      role: 'PARENT',
      studentUserId: student.id,
      product: product(parentSelfServe),
    })
    expect(parentTask.subjectUserId).toBe(student.id)
    expect(parentTask.respondentRole).toBe('PARENT')
    expect(parentTask.relationshipKind).toBe('PARENT_CHILD')
    expect(parentTask.launchable).toBe(true)
  })

  it('derives the teacher subject from course creator for student relational experience', async () => {
    const { teacher, otherTeacher, student, course } = await fixture()
    const task = await service.issueStudentExperience({
      studentUserId: student.id,
      role: 'STUDENT',
      courseId: course.id,
      product: product(studentExperience),
    })
    expect(task.subjectUserId).toBe(teacher.id)
    expect(task.subjectRole).toBe('TEACHER')
    expect(task.respondentRole).toBe('STUDENT')
    expect(task.perspective).toBe('RELATIONAL_EXPERIENCE')
    expect(task.analysisMode).toBe('COHORT_AGGREGATE')
    expect(task.minimumRespondents).toBe(5)

    expect(await errorCode(() => service.issueTeacherObserver({
      teacherUserId: otherTeacher.id,
      role: 'TEACHER',
      courseId: course.id,
      studentUserId: student.id,
      product: product(teacherObserver),
    }))).toBe('RELATIONAL_COURSE_TEACHER')
  })
})
