import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AuthenticatedPrincipal } from '../../types'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip

suite('Questionnaire student projection over HTTP and real PostgreSQL', () => {
  let db: typeof import('../../config/database')['prisma'] | undefined
  let server: Server | undefined
  let baseUrl: string
  let courseA: { id: string; title: string; courseCode: string }
  let courseB: { id: string; title: string; courseCode: string }
  let courseQuestionnaireId: string
  let publicQuestionnaireId: string
  const users: string[] = [], courses: string[] = [], questionnaires: string[] = []
  const principals = new Map<string, AuthenticatedPrincipal>()

  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    db = (await import('../../config/database')).prisma
    await db.$connect()
    for (const [alias, role] of [['owner', 'TEACHER'], ['student', 'STUDENT'], ['outsider', 'STUDENT']] as const) {
      const user = await db.user.create({ data: {
        username: 'detail-scope-' + randomUUID(), passwordHash: 'synthetic-unusable-password',
        accountDomain: 'TRAINING', role,
      } })
      users.push(user.id)
      principals.set(alias, {
        userId: user.id, username: user.username, role: user.role, businessRole: user.role,
        accountDomain: 'TRAINING', platformRole: 'STANDARD', tokenVersion: user.tokenVersion,
        mustChangePassword: false, teacherApproved: true,
      })
    }
    const ownerId = principals.get('owner')!.userId
    for (const label of ['A', 'B']) {
      const course = await db.course.create({ data: {
        title: 'Synthetic cohort ' + label, courseCode: 'SYNTHETIC-' + randomUUID(), creatorId: ownerId,
        courseType: 'TRAINING_COURSE', status: 'PUBLISHED', isRecruiting: true, isLibrary: false,
      } })
      courses.push(course.id)
      if (label === 'A') courseA = course
      else courseB = course
    }
    await db.courseStudent.create({ data: {
      courseId: courseA.id, studentId: principals.get('student')!.userId, status: 'ACTIVE',
    } })
    await db.assignment.create({ data: {
      courseId: courseB.id, title: 'Synthetic protected text task', content: 'Synthetic text only', status: 'PUBLISHED',
    } })
    for (const visibility of ['COURSE', 'PUBLIC'] as const) {
      // Empty synthetic metadata is sufficient to exercise the detail relation
      // query; no instruments, participant answers, or media are installed.
      const questionnaire = await db.questionnaire.create({ data: {
        code: 'detail-scope-' + randomUUID(), name: 'Synthetic questionnaire ' + visibility,
        instruction: 'Synthetic participation instructions', type: 'COURSE', status: 'PUBLISHED', visibility,
        creatorId: ownerId, courseQuestionnaires: { create: courses.map(courseId => ({ courseId })) },
      } })
      questionnaires.push(questionnaire.id)
      if (visibility === 'COURSE') courseQuestionnaireId = questionnaire.id
      else publicQuestionnaireId = questionnaire.id
    }

    const questionnaireController = (await import('../../controllers/questionnaireController')).questionnaireController
    const courseController = (await import('../../controllers/courseController')).courseController
    const app = express()
    // Trusted identity transport fixture only. Resource authorization, nested
    // Prisma filters, and response projections are production implementations;
    // this test does not certify login, sessions, or MFA.
    app.use((req, res, next) => {
      const principal = principals.get(req.get('x-synthetic-actor') ?? '')
      if (!principal) return res.status(401).json({ code: -1 })
      req.user = principal
      next()
    })
    app.get('/api/questionnaires/:id', questionnaireController.detail)
    app.get('/api/courses/:id/assignments', courseController.getAssignments)
    server = createServer(app)
    const currentServer = server
    await new Promise<void>((resolve, reject) => {
      currentServer.once('error', reject)
      currentServer.listen(0, '127.0.0.1', resolve)
    })
    baseUrl = 'http://127.0.0.1:' + (currentServer.address() as AddressInfo).port
  }, 30000)

  afterAll(async () => {
    try {
      if (server) {
        const currentServer = server
        currentServer.closeAllConnections()
        await new Promise<void>((resolve, reject) => currentServer.close(error => error ? reject(error) : resolve()))
      }
    } finally {
      if (db) {
        try {
          await db.questionnaire.deleteMany({ where: { id: { in: questionnaires } } })
          await db.assignment.deleteMany({ where: { courseId: { in: courses } } })
          await db.courseStudent.deleteMany({ where: { courseId: { in: courses } } })
          await db.course.deleteMany({ where: { id: { in: courses } } })
          await db.user.deleteMany({ where: { id: { in: users } } })
        } finally { await db.$disconnect() }
      }
    }
  }, 30000)

  async function get(alias: string, path: string) {
    const response = await fetch(baseUrl + path, {
      headers: { 'x-synthetic-actor': alias, Connection: 'close' },
    })
    return { status: response.status, body: await response.json() as any }
  }
  function expectNoEnrollmentCredentials(data: unknown) {
    const serialized = JSON.stringify(data)
    expect(serialized).not.toContain('courseCode')
    expect(serialized).not.toContain(courseA.courseCode)
    expect(serialized).not.toContain(courseB.courseCode)
  }

  it('returns only the enrolled cohort summary and preserves denial of another cohort’s tasks', async () => {
    const protectedTasks = '/api/courses/' + courseB.id + '/assignments'
    expect((await get('student', protectedTasks)).status).toBe(403)
    const response = await get('student', '/api/questionnaires/' + courseQuestionnaireId)
    expect(response.status).toBe(200)
    expect(response.body.code).toBe(0)
    expect(response.body.data.courseQuestionnaires).toEqual([
      { courseId: courseA.id, course: { id: courseA.id, title: courseA.title } },
    ])
    expectNoEnrollmentCredentials(response.body.data)
    expect((await get('student', protectedTasks)).status).toBe(403)
    expect(await db!.courseStudent.count({ where: {
      courseId: courseB.id, studentId: principals.get('student')!.userId,
    } })).toBe(0)
  })

  it('keeps public metadata readable without exposing linked cohorts to an unaffiliated student', async () => {
    expect((await get('outsider', '/api/questionnaires/' + courseQuestionnaireId)).status).toBe(403)
    const response = await get('outsider', '/api/questionnaires/' + publicQuestionnaireId)
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ code: 0, data: {
      id: publicQuestionnaireId, instruction: 'Synthetic participation instructions',
      deliveryMode: 'FINAL_ONLY', courseQuestionnaires: [], formSections: [], units: [],
    } })
    expectNoEnrollmentCredentials(response.body.data)
  })

  it('preserves both linked course credentials in the owner’s management response', async () => {
    const response = await get('owner', '/api/questionnaires/' + courseQuestionnaireId)
    expect(response.status).toBe(200)
    expect(response.body.code).toBe(0)
    const summaries = response.body.data.courseQuestionnaires.map((link: any) => link.course)
      .sort((left: { id: string }, right: { id: string }) => left.id.localeCompare(right.id))
    expect(summaries).toEqual([courseA, courseB].map(({ id, title, courseCode }) => ({ id, title, courseCode }))
      .sort((left, right) => left.id.localeCompare(right.id)))
  })
})
