import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PlatformRole, PrismaClient, UserRole } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createOrganization } from '../../modules/organization/service'
import {
  assertTeacherCourseResetPreflight,
  resetEnrolledStudentPassword,
} from '../../services/courseStudentPasswordResetService'

const DATABASE_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DATABASE_URL ? describe : describe.skip
let db: PrismaClient

const unique = (label: string) => 'training-password-' + label + '-' + randomUUID()

async function makeUser(
  role: UserRole,
  label: string,
  extras: { platformRole?: PlatformRole; teacherApproved?: boolean } = {},
) {
  return db.user.create({
    data: {
      username: unique(label),
      passwordHash: 'old-hash-fixture',
      role,
      platformRole: extras.platformRole ?? PlatformRole.STANDARD,
      teacherApproved: extras.teacherApproved ?? true,
    },
  })
}
async function makeCourse(teacherId: string) {
  return db.course.create({
    data: { creatorId: teacherId, title: unique('course'), courseCode: randomUUID() },
  })
}
async function enroll(courseId: string, studentId: string, status: 'ACTIVE' | 'APPROVED' | 'PENDING' = 'ACTIVE') {
  return db.courseStudent.create({ data: { courseId, studentId, status } })
}
async function beforeReset(studentId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: studentId },
    select: { passwordHash: true, tokenVersion: true, mustChangePassword: true },
  })
}

suite('Training Course teacher credential recovery — real PostgreSQL', () => {
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: DATABASE_URL! } } })
    await db.$connect()
  })
  afterAll(async () => { await db.$disconnect() })

  it('allows only an owned, active enrolled learner and atomically audits without storing a secret', async () => {
    const owner = await makeUser(UserRole.TEACHER, 'owner')
    const learner = await makeUser(UserRole.STUDENT, 'learner')
    const course = await makeCourse(owner.id)
    await enroll(course.id, learner.id)
    const old = await beforeReset(learner.id)

    await expect(assertTeacherCourseResetPreflight({
      actorUserId: owner.id, courseId: course.id, studentId: learner.id,
    })).resolves.toBeUndefined()
    await expect(resetEnrolledStudentPassword({
      actorUserId: owner.id,
      courseId: course.id,
      studentId: learner.id,
      passwordHash: 'test-only-replacement-hash',
    })).resolves.toEqual({ studentId: learner.id, username: learner.username })
    const next = await beforeReset(learner.id)
    expect(next).toEqual({
      passwordHash: 'test-only-replacement-hash',
      tokenVersion: old.tokenVersion + 1,
      mustChangePassword: true,
    })

    const audit = await db.organizationGovernanceAudit.findFirst({
      where: { actorUserId: owner.id, targetId: learner.id, action: 'COURSE_STUDENT_PASSWORD_RESET' },
    })
    expect(audit).not.toBeNull()
    expect(audit?.organizationId).toBeNull()
    expect(audit?.payload).toMatchObject({ courseId: course.id, delivery: 'ONE_TIME_TEACHER_VIEW' })
    expect(JSON.stringify(audit?.payload)).not.toMatch(/replacement|password|hash/i)
  })

  it('rejects another course teacher without modifying the shared User credential', async () => {
    const owner = await makeUser(UserRole.TEACHER, 'owner')
    const unrelated = await makeUser(UserRole.TEACHER, 'unrelated')
    const learner = await makeUser(UserRole.STUDENT, 'learner')
    const course = await makeCourse(owner.id)
    await enroll(course.id, learner.id)
    const old = await beforeReset(learner.id)

    await expect(assertTeacherCourseResetPreflight({
      actorUserId: unrelated.id, courseId: course.id, studentId: learner.id,
    })).rejects.toMatchObject({ code: 'COURSE_PASSWORD_RESET_FORBIDDEN', statusCode: 403 })
    await expect(resetEnrolledStudentPassword({
      actorUserId: unrelated.id, courseId: course.id, studentId: learner.id,
      passwordHash: 'should-not-write',
    })).rejects.toMatchObject({ code: 'COURSE_PASSWORD_RESET_FORBIDDEN', statusCode: 403 })
    expect(await beforeReset(learner.id)).toEqual(old)
  })

  it('rejects pending enrollment, and re-checks after an allowed preflight becomes stale', async () => {
    const owner = await makeUser(UserRole.TEACHER, 'owner')
    const learner = await makeUser(UserRole.STUDENT, 'learner')
    const course = await makeCourse(owner.id)
    const membership = await enroll(course.id, learner.id)
    await assertTeacherCourseResetPreflight({ actorUserId: owner.id, courseId: course.id, studentId: learner.id })
    await db.courseStudent.update({ where: { id: membership.id }, data: { status: 'PENDING' } })
    const old = await beforeReset(learner.id)

    await expect(resetEnrolledStudentPassword({
      actorUserId: owner.id, courseId: course.id, studentId: learner.id,
      passwordHash: 'should-not-write',
    })).rejects.toMatchObject({ code: 'COURSE_PASSWORD_RESET_FORBIDDEN', statusCode: 403 })
    expect(await beforeReset(learner.id)).toEqual(old)
  })

  it('does not let a trainer recover a SYSTEM_ADMIN or non-STUDENT account', async () => {
    const owner = await makeUser(UserRole.TEACHER, 'owner')
    const protectedStudent = await makeUser(UserRole.STUDENT, 'protected', { platformRole: PlatformRole.SYSTEM_ADMIN })
    const differentRole = await makeUser(UserRole.PARENT, 'parent')
    const course = await makeCourse(owner.id)
    await enroll(course.id, protectedStudent.id)
    await enroll(course.id, differentRole.id)

    for (const studentId of [protectedStudent.id, differentRole.id]) {
      const old = await beforeReset(studentId)
      await expect(resetEnrolledStudentPassword({
        actorUserId: owner.id, courseId: course.id, studentId,
        passwordHash: 'should-not-write',
      })).rejects.toMatchObject({ code: 'COURSE_PASSWORD_RESET_FORBIDDEN', statusCode: 403 })
      expect(await beforeReset(studentId)).toEqual(old)
    }
  })

  it('refuses course-based reset of a learner who governs another Organization', async () => {
    const owner = await makeUser(UserRole.TEACHER, 'owner')
    const learner = await makeUser(UserRole.STUDENT, 'org-admin-learner')
    const course = await makeCourse(owner.id)
    await enroll(course.id, learner.id)
    await createOrganization({
      name: unique('sensitive-organization'),
      meta: { actorUserId: learner.id, commandKey: unique('org-command') },
    })
    const old = await beforeReset(learner.id)
    await expect(resetEnrolledStudentPassword({
      actorUserId: owner.id, courseId: course.id, studentId: learner.id,
      passwordHash: 'should-not-write',
    })).rejects.toMatchObject({ code: 'COURSE_PASSWORD_RESET_FORBIDDEN', statusCode: 403 })
    expect(await beforeReset(learner.id)).toEqual(old)
  })

  it('re-checks a demoted or unapproved trainer against current DB authority', async () => {
    const owner = await makeUser(UserRole.TEACHER, 'owner')
    const learner = await makeUser(UserRole.STUDENT, 'learner')
    const course = await makeCourse(owner.id)
    await enroll(course.id, learner.id)
    await db.user.update({ where: { id: owner.id }, data: { teacherApproved: false } })

    await expect(resetEnrolledStudentPassword({
      actorUserId: owner.id, courseId: course.id, studentId: learner.id,
      passwordHash: 'should-not-write',
    })).rejects.toMatchObject({ code: 'COURSE_PASSWORD_RESET_FORBIDDEN', statusCode: 403 })
  })
})
