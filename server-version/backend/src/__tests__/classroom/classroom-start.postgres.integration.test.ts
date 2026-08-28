import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'

/**
 * Real PostgreSQL race coverage for teacher:start. Enable with
 * PR26_INTEGRATION_DATABASE_URL; the fixture is fully isolated and cleaned
 * up after the assertion.
 */
const DB_URL = process.env.PR26_INTEGRATION_DATABASE_URL
const suite = DB_URL ? describe : describe.skip

let prisma: PrismaClient
let handler: InstanceType<typeof import('../../services/classroomSocketHandler')['ClassroomSocketHandler']>
let socketService: typeof import('../../services/socketService')['socketService']
let userId = ''
let courseId = ''
let classroomId = ''
let questionId = ''

suite('classroom teacher:start concurrency (real PostgreSQL)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'pr26-test-jwt-secret-123456789012345678'
    const database = await import('../../config/database')
    prisma = database.prisma
    const classroomModule = await import('../../services/classroomSocketHandler')
    handler = new classroomModule.ClassroomSocketHandler()
    socketService = (await import('../../services/socketService')).socketService

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const user = await prisma.user.create({
      data: { username: `pr26-classroom-${suffix}`, passwordHash: 'test-only', role: 'TEACHER' },
    })
    userId = user.id
    const course = await prisma.course.create({
      data: {
        title: 'PR26 classroom race fixture',
        courseCode: `PR26-${suffix}`,
        status: 'PUBLISHED',
        creatorId: userId,
      },
    })
    courseId = course.id
    const classroom = await prisma.classroom.create({
      data: {
        code: `${Math.floor(100000 + Math.random() * 900000)}`,
        name: 'PR26 classroom race fixture',
        courseId,
        creatorId: userId,
        status: 'PREPARING',
      },
    })
    classroomId = classroom.id
    const question = await prisma.classroomQuestion.create({
      data: {
        classroomId,
        questionIndex: 1,
        questionContent: { question: 'Concurrent start?' },
        timeLimit: 60,
      },
    })
    questionId = question.id
  })

  afterAll(async () => {
    try {
      if (classroomId) await prisma.classroom.delete({ where: { id: classroomId } })
      if (courseId) await prisma.course.delete({ where: { id: courseId } })
      if (userId) await prisma.user.delete({ where: { id: userId } })
      const timers = (handler as any)?.activeTimers as Map<string, NodeJS.Timeout> | undefined
      timers?.forEach((timer) => clearTimeout(timer))
      timers?.clear()
    } finally {
      await prisma.$disconnect()
    }
  })

  it('returns one authoritative active question for twenty concurrent starts', async () => {
    const originalBroadcast = socketService.broadcastToRoom
    socketService.broadcastToRoom = vi.fn() as any
    try {
      const makeSocket = () => ({
        data: {
          authenticated: true,
          userId,
          userRole: 'TEACHER',
          tokenVersion: 0,
          classroomId,
        },
        emit: vi.fn(),
      })
      const acknowledgements: Array<Record<string, unknown> | undefined> = []
      await Promise.all(Array.from({ length: 20 }, async () => {
        const socket = makeSocket()
        const ack = vi.fn((payload?: unknown) => acknowledgements.push(payload as Record<string, unknown> | undefined))
        await (handler as any).handleTeacherStart(socket, { questionId, timeLimit: 60 }, ack)
      }))

      const activeQuestions = await prisma.classroomQuestion.findMany({
        where: { classroomId, startedAt: { not: null }, endedAt: null },
      })
      expect(activeQuestions).toHaveLength(1)
      expect(acknowledgements).toHaveLength(20)
      expect(acknowledgements.every((payload) => (payload?.question as any)?.questionId === questionId)).toBe(true)
      expect(acknowledgements.filter((payload) => payload?.started === true)).toHaveLength(1)
      expect(socketService.broadcastToRoom).toHaveBeenCalledTimes(1)
    } finally {
      socketService.broadcastToRoom = originalBroadcast
    }
  }, 60000)
})
