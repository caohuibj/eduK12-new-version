import { randomUUID } from 'node:crypto'
import { PrismaClient, UserRole } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { listAvailableForStudent } from '../../modules/composite/composite.service'

/**
 * Contract lock for the Training course-assessment catalog (the
 * /composite-assessments/available?courseId=X source). The frontend's
 * secondary /courses/my/tasks re-verification reads the SAME
 * questionnaire_course_deliveries table through the student task feed;
 * these tests pin the /available contract that makes that re-verification
 * redundant: multi-course delivery, foreign-course exclusion, library
 * exclusion, archived visibility and membership scoping.
 */
const URL = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL')
const suite = URL ? describe : describe.skip
let db: PrismaClient
let courseIdA: string, courseIdB: string, courseIdLib: string
let studentId: string, strangerId: string
let qAB: string, qBOnly: string, qLib: string, qArchived: string, legacyA: string

beforeAll(async () => {
  requireIsolatedReleaseDatabase(URL!)
  db = new PrismaClient({ datasources: { db: { url: URL! } } })
  await db.$connect()
  const suffix = `catlock-${Date.now()}`
  const owner = await db.user.create({ data: { id: `${suffix}-owner`, username: `${suffix}-owner`, passwordHash: 'SYNTHETIC NONLOGIN', role: 'TEACHER', teacherApproved: true, accountDomain: 'TRAINING' } })
  studentId = `${suffix}-student`
  strangerId = `${suffix}-stranger`
  await db.user.create({ data: { id: studentId, username: `${suffix}-student`, passwordHash: 'SYNTHETIC NONLOGIN', role: 'STUDENT', accountDomain: 'TRAINING' } })
  await db.user.create({ data: { id: strangerId, username: `${suffix}-stranger`, passwordHash: 'SYNTHETIC NONLOGIN', role: 'STUDENT', accountDomain: 'TRAINING' } })
  const mkCourse = async (title: string, library = false) => db.course.create({ data: { title, courseCode: `${suffix}-${title}`, creatorId: owner.id, status: 'PUBLISHED', courseType: 'TRAINING_COURSE', isLibrary: library } })
  courseIdA = (await mkCourse('contract A')).id
  courseIdB = (await mkCourse('contract B')).id
  courseIdLib = (await mkCourse('contract LIB', true)).id
  await db.courseStudent.create({ data: { courseId: courseIdA, studentId, status: 'ACTIVE' } })
  await db.courseStudent.create({ data: { courseId: courseIdB, studentId, status: 'ACTIVE' } })
  // The stranger has no course memberships at all.
  const mkQuestionnaire = async (name: string, status: 'PUBLISHED' | 'ARCHIVED', deliveries: string[]) => {
    const q = await db.compositeAssessment.create({ data: {
      code: `${suffix}-${name}`, name, createdBy: owner.id, productKind: 'QUESTIONNAIRE',
      questionnaireType: 'COURSE', status: 'DRAFT', maxAttempts: 3,
      questionnaireCourses: { create: deliveries.map(courseId => ({ courseId })) },
      items: { create: { type: 'FORM', position: 0, required: true } },
    } })
    await db.compositeAssessment.update({ where: { id: q.id }, data: { status, publishedAt: new Date('2026-10-01T00:00:00Z') } })
    return q.id
  }
  qAB = await mkQuestionnaire('delivered A+B', 'PUBLISHED', [courseIdA, courseIdB])
  qBOnly = await mkQuestionnaire('delivered B only', 'PUBLISHED', [courseIdB])
  qLib = await mkQuestionnaire('delivered library', 'PUBLISHED', [courseIdLib])
  qArchived = await mkQuestionnaire('archived no attempts', 'ARCHIVED', [courseIdA])
  legacyA = (await db.compositeAssessment.create({ data: {
    code: `${suffix}-legacy`, name: 'legacy course-bound', createdBy: owner.id,
    productKind: 'LEGACY_COMPOSITE', status: 'DRAFT', maxAttempts: 3, courseId: courseIdA,
    items: { create: { type: 'FORM', position: 0, required: true } },
  } })).id
  await db.compositeAssessment.update({ where: { id: legacyA }, data: { status: 'PUBLISHED', publishedAt: new Date('2026-10-01T00:00:00Z') } })
}, 120_000)
afterAll(async () => { await db?.$disconnect() })

suite('Training catalog contract (real PostgreSQL)', () => {
  it('returns exactly the deliveries for the requested course, in membership scope', async () => {
    const list = await listAvailableForStudent(studentId, Date.now(), courseIdA)
    const ids = list.map(item => item.id).sort()
    expect(ids).toEqual([legacyA, qAB].sort())
  })

  it('never leaks a foreign-course delivery or a library-course row', async () => {
    const list = await listAvailableForStudent(studentId, Date.now(), courseIdA)
    expect(list.some(item => item.id === qBOnly)).toBe(false)
    expect(list.some(item => item.id === qLib)).toBe(false)
    expect(list.some(item => item.id === qArchived)).toBe(false)
  })

  it('multi-course delivery keeps one row per course via the same deliveries table', async () => {
    const rows = await db.questionnaireCourseDelivery.findMany({ where: { compositeId: qAB }, select: { courseId: true } })
    expect(rows.map(r => r.courseId).sort()).toEqual([courseIdA, courseIdB].sort())
    // The B-side student sees the same questionnaire from course B.
    const listB = await listAvailableForStudent(strangerId, Date.now(), courseIdB)
    expect(listB.some(item => item.id === qAB)).toBe(false) // stranger has no membership in B
    const memberB = await listAvailableForStudent(studentId, Date.now(), courseIdB)
    expect(memberB.some(item => item.id === qAB)).toBe(true)
  })

  it('hides everything from a student without the course membership', async () => {
    const list = await listAvailableForStudent(strangerId, Date.now(), courseIdA)
    expect(list).toEqual([])
  })
})
