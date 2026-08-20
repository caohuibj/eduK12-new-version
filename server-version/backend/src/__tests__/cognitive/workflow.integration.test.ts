import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { listMyHistory } from '../../modules/cognitive/history.service'

/**
 * Phase 2 workflow coverage. It is opt-in because it writes a complete fixture
 * to a real PostgreSQL database and is intentionally excluded from default unit runs.
 */
const DB_URL = process.env.COGNITIVE_INTEGRATION_DB_URL
const suite = DB_URL ? describe : describe.skip

let prisma: PrismaClient
let userId = ''
let assignmentIds: string[] = []
let createSession: typeof import('../../modules/cognitive/session.service').createSession
let appendTrial: typeof import('../../modules/cognitive/trial.service').appendTrial
let completeSession: typeof import('../../modules/cognitive/completion.service').completeSession
let getSession: typeof import('../../modules/cognitive/session.service').getSession

const createPublishedAssignment = async () => {
  const config = await prisma.cognitiveTestConfig.findFirst({
    where: { testType: 'fake', configVersion: '1.0.0' },
  })
  if (!config) throw new Error('fake config 1.0.0 not found (run seed first)')
  const course = await prisma.course.create({
    data: {
      title: `phase2-workflow-${Date.now()}`,
      courseCode: `P2${Date.now().toString(36).toUpperCase()}`,
      creatorId: userId,
    },
  })
  await prisma.courseStudent.create({
    data: { courseId: course.id, studentId: userId, status: 'ACTIVE' },
  })
  const assignment = await prisma.cognitiveAssignment.create({
    data: {
      courseId: course.id,
      configId: config.id,
      createdBy: userId,
      title: `phase2-workflow-${Date.now()}`,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      maxAttempts: 1,
    },
  })
  assignmentIds.push(assignment.id)
  return assignment.id
}

const completeFakeSession = async (assignmentId: string) => {
  const session = await createSession(userId, assignmentId)
  for (const [trialIndex, payload] of [
    [0, { correct: true, rtMs: 400 }],
    [1, { correct: true, rtMs: 500 }],
    [2, { correct: false, rtMs: 600 }],
  ] as const) {
    await appendTrial(userId, session.sessionId, { trialIndex, payload })
  }
  const completed = await completeSession(userId, session.sessionId)
  return { sessionId: session.sessionId, completed }
}

suite('cognitive workflow integration (real DB)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    const db = await import('../../config/database')
    prisma = db.prisma
    ;({ createSession } = await import('../../modules/cognitive/session.service'))
    ;({ appendTrial } = await import('../../modules/cognitive/trial.service'))
    ;({ completeSession } = await import('../../modules/cognitive/completion.service'))
    ;({ getSession } = await import('../../modules/cognitive/session.service'))

    const user = await prisma.user.create({
      data: {
        username: `p2wf${Date.now().toString(36)}`,
        passwordHash: 'integration-only',
        role: 'STUDENT',
      },
    })
    userId = user.id
  })

  afterAll(async () => {
    try {
      await prisma.cognitiveSession.deleteMany({ where: { assignmentId: { in: assignmentIds } } })
      await prisma.cognitiveAssignment.deleteMany({ where: { id: { in: assignmentIds } } })
      await prisma.courseStudent.deleteMany({ where: { studentId: userId } })
      await prisma.course.deleteMany({ where: { creatorId: userId } })
      await prisma.user.delete({ where: { id: userId } })
    } catch {
      // Fixture cleanup must not hide workflow assertions.
    }
    await prisma.$disconnect()
  })

  it('runs assignment -> session -> trials -> score/report -> cursor history', async () => {
    const firstAssignmentId = await createPublishedAssignment()
    const secondAssignmentId = await createPublishedAssignment()
    const first = await completeFakeSession(firstAssignmentId)
    const second = await completeFakeSession(secondAssignmentId)

    expect(first.completed).toMatchObject({ status: 'COMPLETED', score: 66.66666666666666 })
    expect(second.completed).toMatchObject({ status: 'COMPLETED' })
    const report = await getSession(userId, first.sessionId)
    expect(report).toMatchObject({
      sessionId: first.sessionId,
      status: 'COMPLETED',
      result: { score: expect.any(Number), metrics: expect.any(Object) },
    })

    const firstPage = await listMyHistory(userId, {
      page: 1,
      pageSize: 1,
      skip: 0,
      take: 1,
      cursorMode: true,
    })
    expect(firstPage).toMatchObject({ hasMore: true, list: [{ sessionId: expect.any(String) }] })
    const nextCursor = (firstPage as { nextCursor: string | null }).nextCursor
    expect(nextCursor).toEqual(expect.any(String))

    const secondPage = await listMyHistory(userId, {
      page: 1,
      pageSize: 1,
      skip: 0,
      take: 1,
      cursorMode: true,
      cursor: nextCursor!,
    })
    expect(secondPage).toMatchObject({ hasMore: false, list: [{ sessionId: expect.any(String) }] })
    expect((firstPage as any).list[0].sessionId).not.toBe((secondPage as any).list[0].sessionId)
  }, 60000)
})
