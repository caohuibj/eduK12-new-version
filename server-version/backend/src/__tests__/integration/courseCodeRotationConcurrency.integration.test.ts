import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { isCourseJoinable } from '../../utils/courseEnrollment'
import { integrationDatabaseUrl } from './integration-env'

/**
 * Real PostgreSQL coverage for the enrollment/rotate-code race.  The test is
 * opt-in so the normal unit suite never touches a developer database; CI
 * supplies one of the integration URLs used by the other release gates.
 */
const DB_URL = integrationDatabaseUrl(
  'RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL',
  'COGNITIVE_INTEGRATION_DB_URL',
)
const suite = DB_URL ? describe : describe.skip

let prisma: PrismaClient
let teacherId = ''
let courseId = ''

suite('course code rotation enrollment race (real PostgreSQL)', () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } })
    await prisma.$connect()

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const teacher = await prisma.user.create({
      data: { username: `course-code-race-${suffix}`, passwordHash: 'test-only', role: 'TEACHER' },
    })
    teacherId = teacher.id
    const course = await prisma.course.create({
      data: {
        title: 'Course code rotation race fixture',
        courseCode: `OLD-${suffix}`,
        creatorId: teacherId,
        status: 'PUBLISHED',
        isRecruiting: true,
        isLibrary: false,
      },
    })
    courseId = course.id
  })

  afterAll(async () => {
    try {
      if (courseId) await prisma.course.delete({ where: { id: courseId } })
      if (teacherId) await prisma.user.delete({ where: { id: teacherId } })
    } finally {
      await prisma.$disconnect()
    }
  })

  it('rejects the old code after rotation commits before the enrollment lock', async () => {
    const oldCode = (await prisma.course.findUnique({
      where: { id: courseId },
      select: { courseCode: true },
    }))!.courseCode
    const newCode = `${oldCode}-NEW`

    let accepted = false
    await prisma.$transaction(async (enrollmentTx) => {
      // This read intentionally does not lock. It represents the initial
      // lookup performed before the controller enters its write transaction.
      const initiallyResolved = await enrollmentTx.course.findUnique({
        where: { courseCode: oldCode },
        select: { id: true, courseCode: true },
      })
      expect(initiallyResolved?.id).toBe(courseId)

      // Rotate and commit while the enrollment transaction is still open.
      await prisma.$transaction(async (rotateTx) => {
        await rotateTx.$executeRaw`SELECT id FROM "courses" WHERE id = ${courseId} FOR UPDATE`
        await rotateTx.course.update({ where: { id: courseId }, data: { courseCode: newCode } })
      })

      await enrollmentTx.$executeRaw`SELECT id FROM "courses" WHERE id = ${courseId} FOR UPDATE`
      const lockedCourse = await enrollmentTx.course.findUnique({ where: { id: courseId } })
      accepted = Boolean(
        lockedCourse
        && lockedCourse.courseCode === oldCode
        && isCourseJoinable(lockedCourse),
      )
    })

    expect(accepted).toBe(false)
    await expect(prisma.course.findUnique({ where: { id: courseId }, select: { courseCode: true } }))
      .resolves.toEqual({ courseCode: newCode })
  })
})
