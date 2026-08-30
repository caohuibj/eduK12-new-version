/**
 * 课堂 Socket.IO 事件处理器
 *
 * Security invariants:
 * - teacher and bigscreen actions require a Socket JWT authenticated against
 *   the current database account.
 * - classroom, question and session ownership is derived from socket state and
 *   server-side relations; client identity fields are ignored.
 * - classroom-wide statistics are sent only to the authorized teacher and
 *   bigscreen subrooms, never to the anonymous student room.
 */

import { randomUUID } from 'crypto'
import { Socket } from 'socket.io'
import { UserRole } from '../types'
import { socketService } from './socketService'
import { prisma } from '../config/database'
import { config } from '../config'
import { logger } from '../utils/logger'
import { StatsAggregator } from './statsAggregator'
import { ClassroomStatsScheduler } from './classroomStatsScheduler'
import {
  generateClassroomResumeToken,
  verifyClassroomResumeToken,
} from '../utils/jwt'
import { resolveSocketClientIp } from '../utils/socketClientIp'
import {
  canManageClassroom,
  findClassroomAccess,
  type ClassroomAccessRecord,
} from '../middleware/classroomAccess'
import {
  checkClassroomLookupRateLimit,
  checkFailedClassroomCodeRateLimit,
  type ClassroomRateLimitResult,
} from '../utils/classroomRateLimiter'

type ClientRole = 'teacher' | 'student' | 'bigscreen'
type SocketAck = (payload?: unknown) => void

const MANAGER_SOCKET_REVALIDATION_INTERVAL_MS = 15_000

const isJoinableClassroomStatus = (status: string): boolean => {
  return status === 'PREPARING' || status === 'ACTIVE'
}

const asRecord = (data: unknown): Record<string, any> => {
  return data && typeof data === 'object' ? data as Record<string, any> : {}
}

const readString = (data: unknown, key: string): string | null => {
  const value = asRecord(data)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const readFiniteNumber = (data: unknown, key: string): number | null => {
  const value = asRecord(data)[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  return value
}

const answerValue = (answer: unknown): unknown => {
  if (
    answer &&
    typeof answer === 'object' &&
    !Array.isArray(answer) &&
    Object.prototype.hasOwnProperty.call(answer, 'value')
  ) {
    return (answer as Record<string, unknown>).value
  }
  return answer
}

const answerText = (answer: unknown): string | null => {
  const value = answerValue(answer)
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null
  }

  const text = String(value).trim()
  return text ? text : null
}

/** The teacher control surface receives this small, authoritative snapshot. */
const classroomQuestionPayload = (question: any): Record<string, unknown> | null => {
  if (!question) return null
  return {
    questionId: question.id,
    questionContent: question.questionContent,
    timeLimit: question.timeLimit,
    questionIndex: question.questionIndex,
    startedAt: question.startedAt instanceof Date
      ? question.startedAt.toISOString()
      : question.startedAt ?? null,
    endedAt: question.endedAt instanceof Date
      ? question.endedAt.toISOString()
      : question.endedAt ?? null,
  }
}

export class ClassroomSocketHandler {
  private activeTimers: Map<string, NodeJS.Timeout> = new Map()
  private managerRevalidationTimers: Map<string, NodeJS.Timeout> = new Map()
  private readonly statsScheduler = new ClassroomStatsScheduler(
    (classroomId, questionId) => this.broadcastStats(classroomId, questionId),
  )

  initialize(): void {
    const namespace = socketService.getClassroomNamespace()

    namespace.on('connection', (socket: Socket) => {
      logger.debug('课堂 Socket 连接已建立')

      socket.on('teacher:join', (data: unknown) => {
        void this.handleTeacherJoin(socket, data)
      })
      socket.on('teacher:start', (data: unknown, ack?: SocketAck) => {
        void this.handleTeacherStart(socket, data, ack)
      })
      socket.on('teacher:next', (data: unknown) => {
        void this.handleTeacherNext(socket, data)
      })
      socket.on('teacher:end', (data: unknown) => {
        void this.handleTeacherEnd(socket, data)
      })
      socket.on('teacher:close', (_data: unknown, ack?: SocketAck) => {
        void this.handleTeacherClose(socket, ack)
      })

      socket.on('student:join', (data: unknown) => {
        void this.handleStudentJoin(socket, data)
      })
      socket.on('student:submit', (data: unknown) => {
        void this.handleStudentSubmit(socket, data)
      })
      socket.on('student:leave', () => {
        void this.handleStudentLeave(socket)
      })

      socket.on('bigscreen:join', (data: unknown) => {
        void this.handleBigscreenJoin(socket, data)
      })
      socket.on('bigscreen:close', (data: unknown) => {
        void this.handleBigscreenClose(socket, data)
      })

      socket.on('disconnect', () => {
        void this.handleDisconnect(socket)
      })
    })

    logger.info('课堂 Socket.IO 事件处理器已初始化')
  }

  private emitError(socket: Socket, message: string): void {
    socket.emit('error', { message })
  }

  private socketAddress(socket: Socket): string {
    return resolveSocketClientIp(socket, config.trustProxyHops)
  }

  private rejectRateLimitedSocket(
    socket: Socket,
    result: ClassroomRateLimitResult
  ): boolean {
    if (!result.available) {
      this.emitError(socket, '公共课堂入口暂不可用，请稍后重试')
      return true
    }

    if (!result.allowed) {
      this.emitError(socket, '请求过于频繁，请稍后重试')
      return true
    }

    return false
  }

  private isManagerSocket(socket: Socket): boolean {
    return (
      socket.data.authenticated === true &&
      (socket.data.userRole === UserRole.ADMIN ||
        socket.data.userRole === UserRole.TEACHER)
    )
  }

  private startManagerRevalidation(socket: Socket): void {
    this.stopManagerRevalidation(socket)

    const timer = setInterval(() => {
      void this.revalidateManagerSocket(socket)
    }, MANAGER_SOCKET_REVALIDATION_INTERVAL_MS)
    timer.unref?.()
    this.managerRevalidationTimers.set(socket.id, timer)
  }

  private stopManagerRevalidation(socket: Socket): void {
    const timer = this.managerRevalidationTimers.get(socket.id)
    if (!timer) {
      return
    }

    clearInterval(timer)
    this.managerRevalidationTimers.delete(socket.id)
  }

  private async revalidateManagerSocket(socket: Socket): Promise<void> {
    if (
      socket.data.clientRole !== 'teacher' &&
      socket.data.clientRole !== 'bigscreen'
    ) {
      this.stopManagerRevalidation(socket)
      return
    }

    const valid = await socketService.refreshAuthenticatedSocket(socket)
    if (!valid || !this.isManagerSocket(socket)) {
      this.stopManagerRevalidation(socket)
      socket.disconnect(true)
    }
  }

  private async authorizeManagerForClassroom(
    socket: Socket,
    classroomId: string,
    expectedRole: Exclude<ClientRole, 'student'>
  ): Promise<ClassroomAccessRecord | null> {
    if (
      !(await socketService.refreshAuthenticatedSocket(socket)) ||
      !this.isManagerSocket(socket)
    ) {
      this.emitError(socket, '需要经过认证的教师或管理员连接')
      return null
    }

    if (socket.data.clientRole && socket.data.clientRole !== expectedRole) {
      this.emitError(socket, 'Socket课堂角色不匹配')
      return null
    }

    if (socket.data.classroomId && socket.data.classroomId !== classroomId) {
      this.emitError(socket, '课堂上下文不匹配')
      return null
    }

    const classroom = await findClassroomAccess(classroomId)
    if (!classroom) {
      this.emitError(socket, '课堂不存在')
      return null
    }

    if (
      !canManageClassroom(
        classroom,
        socket.data.userId,
        socket.data.userRole
      )
    ) {
      this.emitError(socket, '无权限访问此课堂')
      return null
    }

    return classroom
  }

  private async authorizeManagerAction(
    socket: Socket,
    expectedRole: Exclude<ClientRole, 'student'>
  ): Promise<ClassroomAccessRecord | null> {
    if (typeof socket.data.classroomId !== 'string') {
      this.emitError(socket, '请先加入课堂')
      return null
    }

    return this.authorizeManagerForClassroom(
      socket,
      socket.data.classroomId,
      expectedRole
    )
  }

  private async handleTeacherJoin(socket: Socket, data: unknown): Promise<void> {
    try {
      const classroomId = readString(data, 'classroomId')
      if (!classroomId) {
        this.emitError(socket, '缺少课堂信息')
        return
      }

      const classroom = await this.authorizeManagerForClassroom(
        socket,
        classroomId,
        'teacher'
      )
      if (!classroom) {
        return
      }

      const room = 'classroom:' + classroom.id
      socket.join(room)
      socket.join(room + ':teacher')
      socket.data.classroomId = classroom.id
      socket.data.clientRole = 'teacher'
      this.startManagerRevalidation(socket)

      const activeQuestion = await prisma.classroomQuestion.findFirst({
        where: {
          classroomId: classroom.id,
          startedAt: { not: null },
          endedAt: null,
        },
        select: {
          id: true,
          questionContent: true,
          timeLimit: true,
          questionIndex: true,
          startedAt: true,
          endedAt: true,
        },
      })

      logger.info('教师加入课堂', {
        classroomId: classroom.id,
        status: classroom.status,
      })

      socket.emit('teacher:joined', {
        classroomId: classroom.id,
        status: classroom.status,
        currentQuestion: classroomQuestionPayload(activeQuestion),
      })
    } catch {
      logger.error('处理教师加入课堂错误')
      this.emitError(socket, '加入课堂失败')
    }
  }

  private async handleStudentJoin(socket: Socket, data: unknown): Promise<void> {
    try {
      if (socket.data.clientRole) {
        this.emitError(socket, '当前 Socket 已加入课堂')
        return
      }

      const code = readString(data, 'code')
      const address = this.socketAddress(socket)
      const lookupLimit = await checkClassroomLookupRateLimit(address)
      if (this.rejectRateLimitedSocket(socket, lookupLimit)) {
        return
      }

      if (!code || !/^\d{6}$/.test(code)) {
        const failedLimit = await checkFailedClassroomCodeRateLimit(
          address,
          code || 'invalid'
        )
        if (this.rejectRateLimitedSocket(socket, failedLimit)) {
          return
        }
        this.emitError(socket, '课堂不存在或当前不可加入')
        return
      }

      const classroom = await prisma.classroom.findUnique({
        where: { code },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
        },
      })

      if (!classroom || !isJoinableClassroomStatus(classroom.status)) {
        const failedLimit = await checkFailedClassroomCodeRateLimit(
          address,
          code
        )
        if (this.rejectRateLimitedSocket(socket, failedLimit)) {
          return
        }
        this.emitError(socket, '课堂不存在或当前不可加入')
        return
      }

      if (
        socket.data.authenticated === true &&
        socket.data.userRole !== UserRole.STUDENT
      ) {
        this.emitError(socket, '学生连接身份无效')
        return
      }

      const isTemporary = socket.data.authenticated !== true
      const resumeToken = isTemporary ? readString(data, 'resumeToken') : null
      let actualStudentId = isTemporary
        ? 'temp_' + randomUUID()
        : socket.data.userId

      if (!actualStudentId) {
        this.emitError(socket, '学生会话创建失败')
        return
      }

      let session
      if (isTemporary && resumeToken) {
        const resume = verifyClassroomResumeToken(resumeToken, classroom.id)
        if (!resume) {
          this.emitError(socket, '学生会话无效')
          return
        }

        session = await prisma.classroomSession.findFirst({
          where: {
            id: resume.sessionId,
            classroomId: classroom.id,
            isTemporary: true,
          },
        })
        if (!session) {
          this.emitError(socket, '学生会话无效')
          return
        }
        actualStudentId = session.studentId
      } else {
        session = await prisma.classroomSession.findUnique({
          where: {
            classroomId_studentId: {
              classroomId: classroom.id,
              studentId: actualStudentId,
            },
          },
        })

        if (!session) {
          session = await prisma.classroomSession.create({
            data: {
              classroomId: classroom.id,
              studentId: actualStudentId,
              isTemporary,
            },
          })
        }
      }

      if (session.leftAt) {
        session = await prisma.classroomSession.update({
          where: { id: session.id },
          data: { leftAt: null },
        })
      }

      const issuedResumeToken = isTemporary
        ? resumeToken || generateClassroomResumeToken(classroom.id, session.id)
        : null

      const room = 'classroom:' + classroom.id
      socket.join(room)
      socket.join(room + ':students')
      socket.data.classroomId = classroom.id
      socket.data.clientRole = 'student'
      socket.data.studentId = actualStudentId
      socket.data.sessionId = session.id

      logger.info('学生加入课堂', {
        classroomId: classroom.id,
        isTemporary,
      })

      socket.emit('student:joined', {
        classroomId: classroom.id,
        status: classroom.status,
        ...(issuedResumeToken ? { resumeToken: issuedResumeToken } : {}),
      })

      const activeQuestion = await prisma.classroomQuestion.findFirst({
        where: {
          classroomId: classroom.id,
          startedAt: { not: null },
          endedAt: null,
        },
        select: {
          id: true,
          questionContent: true,
          timeLimit: true,
          questionIndex: true,
          startedAt: true,
        },
      })

      if (activeQuestion?.startedAt) {
        const elapsedTime = Math.floor(
          (Date.now() - activeQuestion.startedAt.getTime()) / 1000
        )
        const remainingTime = (activeQuestion.timeLimit || 60) - elapsedTime

        socket.emit('broadcast:question', {
          questionId: activeQuestion.id,
          questionContent: activeQuestion.questionContent,
          timeLimit: activeQuestion.timeLimit,
          questionIndex: activeQuestion.questionIndex,
          remainingTime: Math.max(0, remainingTime),
        })
      }

      await this.broadcastOnlineCount(classroom.id)
    } catch {
      logger.error('处理学生加入课堂错误')
      this.emitError(socket, '加入课堂失败')
    }
  }

  private async handleBigscreenJoin(socket: Socket, data: unknown): Promise<void> {
    try {
      const classroomId = readString(data, 'classroomId')
      if (!classroomId) {
        this.emitError(socket, '缺少课堂信息')
        return
      }

      const classroom = await this.authorizeManagerForClassroom(
        socket,
        classroomId,
        'bigscreen'
      )
      if (!classroom) {
        return
      }

      const room = 'classroom:' + classroom.id
      socket.join(room)
      socket.join(room + ':bigscreen')
      socket.data.classroomId = classroom.id
      socket.data.clientRole = 'bigscreen'
      this.startManagerRevalidation(socket)

      const response: Record<string, any> = {
        classroomId: classroom.id,
        status: classroom.status,
      }

      const activeQuestion = await prisma.classroomQuestion.findFirst({
        where: {
          classroomId: classroom.id,
          startedAt: { not: null },
          endedAt: null,
        },
        select: {
          id: true,
          questionContent: true,
          timeLimit: true,
          questionIndex: true,
          startedAt: true,
        },
      })

      if (activeQuestion?.startedAt) {
        const elapsedTime = Math.floor(
          (Date.now() - activeQuestion.startedAt.getTime()) / 1000
        )
        response.currentQuestion = {
          questionId: activeQuestion.id,
          questionContent: activeQuestion.questionContent,
          questionIndex: activeQuestion.questionIndex,
          timeLimit: activeQuestion.timeLimit,
          remainingTime: Math.max(
            0,
            (activeQuestion.timeLimit || 60) - elapsedTime
          ),
        }
        response.stats = await this.buildStats(
          classroom.id,
          activeQuestion.id
        )
      }

      response.onlineCount = await socketService.getRoomConnectionCount(
        room + ':students'
      )

      logger.info('大屏加入课堂', {
        classroomId: classroom.id,
        hasActiveQuestion: !!activeQuestion,
      })
      socket.emit('bigscreen:joined', response)
    } catch {
      logger.error('处理大屏加入课堂错误')
      this.emitError(socket, '加入课堂失败')
    }
  }

  private async handleTeacherStart(socket: Socket, data: unknown, ack?: SocketAck): Promise<void> {
    const acknowledge = (payload: Record<string, unknown>): void => {
      ack?.(payload)
    }

    try {
      const classroom = await this.authorizeManagerAction(socket, 'teacher')
      if (!classroom) {
        acknowledge({ ok: false, message: '无权限访问此课堂' })
        return
      }

      const questionId = readString(data, 'questionId')
      if (!questionId) {
        this.emitError(socket, '缺少题目信息')
        acknowledge({ ok: false, message: '缺少题目信息' })
        return
      }

      if (classroom.status !== 'PREPARING' && classroom.status !== 'ACTIVE') {
        this.emitError(socket, '课堂当前不可开始答题')
        acknowledge({ ok: false, message: '课堂当前不可开始答题' })
        return
      }

      const requestedTimeLimit = readFiniteNumber(data, 'timeLimit')
      type StartOutcome =
        | { kind: 'started'; question: any }
        | { kind: 'already-active'; question: any }
        | { kind: 'conflict'; question: any }
        | { kind: 'question-not-found' }
        | { kind: 'race-lost' }

      let outcome: StartOutcome
      try {
        outcome = await prisma.$transaction(async (tx): Promise<StartOutcome> => {
          const active = await tx.classroomQuestion.findFirst({
            where: { classroomId: classroom.id, startedAt: { not: null }, endedAt: null },
            select: {
              id: true,
              questionContent: true,
              timeLimit: true,
              questionIndex: true,
              startedAt: true,
              endedAt: true,
            },
          })
          if (active && active.id !== questionId) return { kind: 'conflict', question: active }

          const candidate = await tx.classroomQuestion.findFirst({
            where: { id: questionId, classroomId: classroom.id },
            select: {
              id: true,
              classroomId: true,
              questionContent: true,
              timeLimit: true,
              questionIndex: true,
              startedAt: true,
              endedAt: true,
            },
          })
          if (!candidate) return { kind: 'question-not-found' }
          if (candidate.startedAt && !candidate.endedAt) return { kind: 'already-active', question: candidate }
          const timeLimit = Math.max(1, Math.min(3600, Math.floor(requestedTimeLimit ?? candidate.timeLimit ?? 60)))
          const startedAt = new Date()
          // Compare-and-set on both lifecycle timestamps. This makes two
          // same-question starts idempotent instead of resetting the winner's
          // start time or timer.
          const updated = await tx.classroomQuestion.updateMany({
            where: {
              id: candidate.id,
              classroomId: classroom.id,
              startedAt: candidate.startedAt,
              endedAt: candidate.endedAt,
            },
            data: { startedAt, endedAt: null, timeLimit },
          })
          if (updated.count !== 1) {
            const current = await tx.classroomQuestion.findUnique({
              where: { id: candidate.id },
              select: {
                id: true,
                questionContent: true,
                timeLimit: true,
                questionIndex: true,
                startedAt: true,
                endedAt: true,
              },
            })
            if (current?.startedAt && !current.endedAt) return { kind: 'already-active', question: current }
            const currentActive = await tx.classroomQuestion.findFirst({
              where: { classroomId: classroom.id, startedAt: { not: null }, endedAt: null },
              select: {
                id: true,
                questionContent: true,
                timeLimit: true,
                questionIndex: true,
                startedAt: true,
                endedAt: true,
              },
            })
            return currentActive
              ? { kind: 'conflict', question: currentActive }
              : { kind: 'race-lost' }
          }
          if (candidate.endedAt) {
            await tx.classroomAnswer.deleteMany({ where: { classroomId: classroom.id, questionId: candidate.id } })
          }
          await tx.classroom.update({ where: { id: classroom.id }, data: { status: 'ACTIVE', startedAt } })
          const persisted = await tx.classroomQuestion.findUnique({
            where: { id: candidate.id },
            select: {
              id: true,
              questionContent: true,
              timeLimit: true,
              questionIndex: true,
              startedAt: true,
              endedAt: true,
            },
          })
          return persisted ? { kind: 'started', question: persisted } : { kind: 'race-lost' }
        })
      } catch (startError: any) {
        if (startError?.code === 'P2002') {
          const authoritative = await prisma.classroomQuestion.findFirst({
            where: { classroomId: classroom.id, startedAt: { not: null }, endedAt: null },
            select: {
              id: true,
              questionContent: true,
              timeLimit: true,
              questionIndex: true,
              startedAt: true,
              endedAt: true,
            },
          })
          if (authoritative) {
            const question = classroomQuestionPayload(authoritative)
            if (question) socket.emit('teacher:started', { ...question, authoritative: true })
            acknowledge({ ok: authoritative.id === questionId, started: false, authoritative: true, question })
            return
          }
        }
        throw startError
      }

      if (outcome.kind === 'question-not-found') {
        this.emitError(socket, '题目不存在')
        acknowledge({ ok: false, message: '题目不存在' })
        return
      }

      if (outcome.kind === 'conflict' || outcome.kind === 'race-lost') {
        const authoritative = outcome.kind === 'conflict'
          ? outcome.question
          : await prisma.classroomQuestion.findFirst({
            where: { classroomId: classroom.id, startedAt: { not: null }, endedAt: null },
            select: {
              id: true,
              questionContent: true,
              timeLimit: true,
              questionIndex: true,
              startedAt: true,
              endedAt: true,
            },
          })
        const question = classroomQuestionPayload(authoritative)
        if (question) socket.emit('teacher:started', { ...question, authoritative: true })
        acknowledge({ ok: false, message: '题目正在进行中', code: 'ACTIVE_QUESTION', authoritative: true, question })
        return
      }

      if (outcome.kind === 'already-active') {
        const question = classroomQuestionPayload(outcome.question)
        acknowledge({ ok: true, started: false, alreadyActive: true, authoritative: true, question })
        return
      }

      const question = outcome.question
      const broadcastData = {
        ...classroomQuestionPayload(question),
      }

      socketService.broadcastToRoom(
        'classroom:' + classroom.id,
        'broadcast:question',
        broadcastData
      )

      this.scheduleQuestionTimer(
        classroom.id,
        question.id,
        question.timeLimit || requestedTimeLimit || 60
      )

      logger.info('教师开始答题', {
        classroomId: classroom.id,
        questionId: question.id,
        timeLimit: question.timeLimit || requestedTimeLimit || 60,
      })
      acknowledge({ ok: true, started: true, question: classroomQuestionPayload(question) })
    } catch {
      logger.error('处理教师开始答题错误')
      this.emitError(socket, '开始答题失败')
      acknowledge({ ok: false, message: '开始答题失败' })
    }
  }

  private scheduleQuestionTimer(
    classroomId: string,
    questionId: string,
    timeLimit: number
  ): void {
    const timerKey = classroomId + ':' + questionId
    const previousTimer = this.activeTimers.get(timerKey)
    if (previousTimer) {
      clearTimeout(previousTimer)
    }

    const timer = setTimeout(() => {
      void this.autoEndQuestion(classroomId, questionId)
    }, Math.max(1, timeLimit) * 1000)

    this.activeTimers.set(timerKey, timer)
  }

  private async autoEndQuestion(
    classroomId: string,
    questionId: string
  ): Promise<void> {
    try {
      const result = await prisma.classroomQuestion.updateMany({
        where: {
          id: questionId,
          classroomId,
          endedAt: null,
        },
        data: { endedAt: new Date() },
      })

      if (result.count === 0) {
        return
      }

      this.activeTimers.delete(classroomId + ':' + questionId)
      socketService.broadcastToRoom(
        'classroom:' + classroomId,
        'broadcast:finished',
        { questionId }
      )
      this.statsScheduler.schedule(classroomId, questionId)

      logger.info('答题计时结束', { classroomId, questionId })
    } catch {
      logger.error('自动结束答题错误')
    }
  }

  private async handleStudentSubmit(socket: Socket, data: unknown): Promise<void> {
    try {
      if (
        socket.data.clientRole !== 'student' ||
        typeof socket.data.classroomId !== 'string' ||
        typeof socket.data.sessionId !== 'string' ||
        typeof socket.data.studentId !== 'string'
      ) {
        this.emitError(socket, '学生课堂会话无效')
        return
      }

      const classroomId = socket.data.classroomId
      const sessionId = socket.data.sessionId
      const studentId = socket.data.studentId
      const questionId = readString(data, 'questionId')
      const answer = asRecord(data).answer

      if (!questionId || answer === undefined) {
        this.emitError(socket, '缺少题目或答案')
        return
      }

      const serializedAnswer = JSON.stringify(answer)
      if (!serializedAnswer || serializedAnswer.length > 10000) {
        this.emitError(socket, '答案内容过大')
        return
      }

      const classroom = await prisma.classroom.findUnique({
        where: { id: classroomId },
        select: { status: true },
      })
      if (!classroom || classroom.status !== 'ACTIVE') {
        this.emitError(socket, '课堂当前不可提交答案')
        return
      }

      const question = await prisma.classroomQuestion.findFirst({
        where: {
          id: questionId,
          classroomId,
        },
        select: {
          id: true,
          startedAt: true,
          endedAt: true,
          timeLimit: true,
        },
      })

      if (!question) {
        this.emitError(socket, '题目不存在或不属于当前课堂')
        return
      }

      if (!question.startedAt || question.endedAt) {
        this.emitError(socket, '答题已结束，无法提交答案')
        return
      }

      const session = await prisma.classroomSession.findFirst({
        where: {
          id: sessionId,
          classroomId,
          studentId,
        },
        select: { id: true },
      })
      if (!session) {
        this.emitError(socket, '课堂会话无效')
        return
      }

      if (
        question.timeLimit &&
        Date.now() >= question.startedAt.getTime() + question.timeLimit * 1000
      ) {
        const expired = await prisma.classroomQuestion.updateMany({
          where: {
            id: question.id,
            classroomId,
            endedAt: null,
          },
          data: { endedAt: new Date() },
        })
        if (expired.count > 0) {
          socketService.broadcastToRoom(
            'classroom:' + classroomId,
            'broadcast:finished',
            { questionId: question.id }
          )
          this.statsScheduler.schedule(classroomId, question.id)
        }
        this.emitError(socket, '答题已结束，无法提交答案')
        return
      }

      await prisma.classroomAnswer.create({
        data: {
          classroomId,
          questionId: question.id,
          sessionId: session.id,
          answer: answer as any,
        },
      })

      logger.info('学生提交答案', {
        classroomId,
        questionId: question.id,
      })
      socket.emit('student:submitted', {
        questionId: question.id,
        success: true,
      })
      this.statsScheduler.schedule(classroomId, question.id)
    } catch (error: any) {
      if (error?.code === 'P2002') {
        this.emitError(socket, '您已提交过答案')
        return
      }
      logger.error('处理学生提交答案错误')
      this.emitError(socket, '提交答案失败')
    }
  }

  private async handleTeacherEnd(socket: Socket, data: unknown): Promise<void> {
    try {
      const classroom = await this.authorizeManagerAction(socket, 'teacher')
      if (!classroom) {
        return
      }

      if (classroom.status !== 'ACTIVE') {
        this.emitError(socket, '课堂当前不可结束答题')
        return
      }

      const questionId = readString(data, 'questionId')
      if (!questionId) {
        this.emitError(socket, '缺少题目信息')
        return
      }

      const question = await prisma.classroomQuestion.findFirst({
        where: {
          id: questionId,
          classroomId: classroom.id,
        },
        select: { id: true, startedAt: true, endedAt: true },
      })
      if (!question) {
        this.emitError(socket, '题目不存在或不属于当前课堂')
        return
      }

      if (!question.startedAt || question.endedAt) {
        this.emitError(socket, '题目当前不可结束')
        return
      }

      const timerKey = classroom.id + ':' + question.id
      const timer = this.activeTimers.get(timerKey)
      if (timer) {
        clearTimeout(timer)
        this.activeTimers.delete(timerKey)
      }

      const result = await prisma.classroomQuestion.updateMany({
        where: {
          id: question.id,
          classroomId: classroom.id,
          startedAt: { not: null },
          endedAt: null,
        },
        data: { endedAt: new Date() },
      })

      if (result.count > 0) {
        socketService.broadcastToRoom(
          'classroom:' + classroom.id,
          'broadcast:finished',
          { questionId: question.id }
        )
        this.statsScheduler.schedule(classroom.id, question.id)
      }

      logger.info('教师结束答题', {
        classroomId: classroom.id,
        questionId: question.id,
      })
    } catch {
      logger.error('处理教师结束答题错误')
      this.emitError(socket, '结束答题失败')
    }
  }

  private async handleBigscreenClose(socket: Socket, data: unknown): Promise<void> {
    try {
      const classroom = await this.authorizeManagerAction(socket, 'bigscreen')
      if (!classroom) {
        return
      }

      if (classroom.status !== 'ACTIVE') {
        this.emitError(socket, '课堂当前不可结束答题')
        return
      }

      const questionId = readString(data, 'questionId')
      if (!questionId) {
        this.emitError(socket, '缺少题目信息')
        return
      }

      const question = await prisma.classroomQuestion.findFirst({
        where: {
          id: questionId,
          classroomId: classroom.id,
        },
        select: { id: true, startedAt: true, endedAt: true },
      })
      if (!question) {
        this.emitError(socket, '题目不存在或不属于当前课堂')
        return
      }

      if (!question.startedAt || question.endedAt) {
        this.emitError(socket, '题目当前不可结束')
        return
      }

      const timerKey = classroom.id + ':' + question.id
      const timer = this.activeTimers.get(timerKey)
      if (timer) {
        clearTimeout(timer)
        this.activeTimers.delete(timerKey)
      }

      const result = await prisma.classroomQuestion.updateMany({
        where: {
          id: question.id,
          classroomId: classroom.id,
          startedAt: { not: null },
          endedAt: null,
        },
        data: { endedAt: new Date() },
      })

      if (result.count > 0) {
        socketService.broadcastToRoom(
          'classroom:' + classroom.id,
          'broadcast:finished',
          { questionId: question.id }
        )
        this.statsScheduler.schedule(classroom.id, question.id)
      }

      logger.info('大屏结束答题', {
        classroomId: classroom.id,
        questionId: question.id,
      })
    } catch {
      logger.error('处理大屏关闭错误')
      this.emitError(socket, '结束答题失败')
    }
  }

  private async handleTeacherNext(socket: Socket, data: unknown = {}): Promise<void> {
    try {
      const classroom = await this.authorizeManagerAction(socket, 'teacher')
      if (!classroom) {
        return
      }

      if (classroom.status !== 'ACTIVE') {
        this.emitError(socket, '课堂当前不可切换题目')
        return
      }

      const expectedQuestionId = readString(data, 'expectedQuestionId') || readString(data, 'questionId')
      if (expectedQuestionId) {
        const expectedQuestion = await prisma.classroomQuestion.findFirst({
          where: { id: expectedQuestionId, classroomId: classroom.id },
          select: { id: true },
        })
        if (!expectedQuestion) {
          this.emitError(socket, '题目不存在或不属于当前课堂')
          return
        }
      }

      socketService.broadcastToRoom(
        'classroom:' + classroom.id,
        'broadcast:next',
        {
          expectedQuestionId: expectedQuestionId || null,
        }
      )
      logger.info('教师切换下一题', { classroomId: classroom.id })
    } catch {
      logger.error('处理教师下一题错误')
      this.emitError(socket, '切换题目失败')
    }
  }

  private async handleTeacherClose(socket: Socket, ack?: SocketAck): Promise<void> {
    try {
      const classroom = await this.authorizeManagerAction(socket, 'teacher')
      if (!classroom) {
        ack?.({ ok: false, message: '无权关闭课堂' })
        return
      }

      if (classroom.status === 'ENDED') {
        ack?.({ ok: false, message: '课堂已结束' })
        this.emitError(socket, '课堂已结束')
        return
      }

      for (const [timerKey, timer] of this.activeTimers.entries()) {
        if (timerKey.startsWith(classroom.id + ':')) {
          clearTimeout(timer)
          this.activeTimers.delete(timerKey)
        }
      }

      await prisma.$transaction(async (tx) => {
        const endedAt = new Date()
        await tx.classroomQuestion.updateMany({
          where: { classroomId: classroom.id, startedAt: { not: null }, endedAt: null },
          data: { endedAt },
        })
        await tx.classroom.update({ where: { id: classroom.id }, data: { status: 'ENDED', endedAt } })
      })

      ack?.({ ok: true, classroomId: classroom.id })
      socketService.broadcastToRoom(
        'classroom:' + classroom.id,
        'broadcast:closed',
        { classroomId: classroom.id }
      )
      logger.info('教师关闭课堂', { classroomId: classroom.id })
    } catch {
      logger.error('处理教师关闭课堂错误')
      ack?.({ ok: false, message: '关闭课堂失败' })
      this.emitError(socket, '关闭课堂失败')
    }
  }

  private async handleStudentLeave(socket: Socket): Promise<void> {
    try {
      if (
        socket.data.clientRole !== 'student' ||
        typeof socket.data.classroomId !== 'string' ||
        typeof socket.data.sessionId !== 'string' ||
        typeof socket.data.studentId !== 'string'
      ) {
        return
      }

      const classroomId = socket.data.classroomId
      const result = await prisma.classroomSession.updateMany({
        where: {
          id: socket.data.sessionId,
          classroomId,
          studentId: socket.data.studentId,
          leftAt: null,
        },
        data: { leftAt: new Date() },
      })

      socket.leave('classroom:' + classroomId)
      socket.leave('classroom:' + classroomId + ':students')
      socket.data.clientRole = undefined
      socket.data.classroomId = undefined
      socket.data.studentId = undefined
      socket.data.sessionId = undefined
      if (result.count > 0) {
        await this.broadcastOnlineCount(classroomId)
      }

      logger.info('学生离开课堂', {
        classroomId,
        updated: result.count,
      })
    } catch {
      logger.error('处理学生离开课堂错误')
    }
  }

  private async handleDisconnect(socket: Socket): Promise<void> {
    this.stopManagerRevalidation(socket)

    try {
      if (
        socket.data.clientRole === 'student' &&
        typeof socket.data.classroomId === 'string' &&
        typeof socket.data.sessionId === 'string' &&
        typeof socket.data.studentId === 'string'
      ) {
        const classroomId = socket.data.classroomId
        const result = await prisma.classroomSession.updateMany({
          where: {
            id: socket.data.sessionId,
            classroomId,
            studentId: socket.data.studentId,
            leftAt: null,
          },
          data: { leftAt: new Date() },
        })
        if (result.count > 0) {
          await this.broadcastOnlineCount(classroomId)
        }
      }

      logger.debug('课堂 Socket 已断开', {
        classroomId: socket.data.classroomId,
        clientRole: socket.data.clientRole,
      })
    } catch {
      logger.error('处理课堂 Socket 断开错误')
    }
  }

  private async buildStats(
    classroomId: string,
    questionId: string
  ): Promise<Record<string, any> | null> {
    const question = await prisma.classroomQuestion.findFirst({
      where: {
        id: questionId,
        classroomId,
      },
      select: {
        id: true,
        questionContent: true,
      },
    })
    if (!question) {
      return null
    }

    const [answerCount, totalSessions] = await Promise.all([
      prisma.classroomAnswer.count({
        where: {
          classroomId,
          questionId,
        },
      }),
      prisma.classroomSession.count({
        where: { classroomId, leftAt: null },
      }),
    ])

    const content = question.questionContent as any
    const supportedQuestionTypes = ['single_choice', 'multiple_choice', 'fill_blank', 'text_input']
    let optionStats: Record<string, number> | null = null
    if (
      content &&
      typeof content === 'object' &&
      (content.type === 'single_choice' ||
        content.type === 'multiple_choice')
    ) {
      const answers = await prisma.classroomAnswer.findMany({
        where: {
          classroomId,
          questionId,
        },
        select: { answer: true },
      })
      const optionCounts: Record<string, number> = {}

      answers.forEach(({ answer }) => {
        const value = answerValue(answer)
        if (Array.isArray(value)) {
          value.forEach((option) => {
            if (typeof option === 'string' && option.trim()) {
              optionCounts[option.trim()] =
                (optionCounts[option.trim()] || 0) + 1
            }
          })
          return
        }

        if (typeof value === 'string') {
          value.split(',').forEach((option) => {
            const normalized = option.trim()
            if (normalized) {
              optionCounts[normalized] =
                (optionCounts[normalized] || 0) + 1
            }
          })
        }
      })
      optionStats = optionCounts
    }

    let textAnswers: Array<{ text: string; timestamp: number }> | null = null
    let wordCloud: Record<string, any> | null = null
    if (
      content &&
      typeof content === 'object' &&
      (content.type === 'fill_blank' || content.type === 'text_input')
    ) {
      try {
        const statsAggregator = new StatsAggregator()
        const questionStats = await statsAggregator.getQuestionStats(questionId)
        if (questionStats?.stats) {
          wordCloud = {
            topWords: questionStats.stats.topWords,
            wordFrequency: questionStats.stats.wordFrequency,
          }
        }
      } catch {
        logger.error('生成课堂词云数据失败')
      }

      const answers = await prisma.classroomAnswer.findMany({
        where: {
          classroomId,
          questionId,
        },
        select: {
          answer: true,
          submittedAt: true,
        },
        orderBy: { submittedAt: 'desc' },
        take: 50,
      })

      textAnswers = answers
        .map((item) => {
          const text = answerText(item.answer)
          return text
            ? { text, timestamp: item.submittedAt.getTime() }
            : null
        })
        .filter((item): item is { text: string; timestamp: number } => !!item)
    }

    return {
      questionId,
      unsupportedType: !(
        content
        && typeof content === 'object'
        && !Array.isArray(content)
        && supportedQuestionTypes.includes(content.type)
      ),
      answerCount,
      totalSessions,
      submissionRate: totalSessions > 0
        ? (answerCount / totalSessions) * 100
        : 0,
      optionStats,
      textAnswers,
      wordCloud,
    }
  }

  private async broadcastStats(
    classroomId: string,
    questionId: string
  ): Promise<void> {
    const stats = await this.buildStats(classroomId, questionId)
    if (!stats) {
      return
    }

    const room = 'classroom:' + classroomId
    const managerRoomsValid = await Promise.all([
      socketService.revalidateManagerSockets(room + ':teacher'),
      socketService.revalidateManagerSockets(room + ':bigscreen'),
    ])
    if (managerRoomsValid.some((valid) => !valid)) {
      return
    }

    // Statistics contain answer-derived data and are restricted to managers.
    socketService.broadcastToRoom(room + ':teacher', 'broadcast:stats', stats)
    socketService.broadcastToRoom(
      room + ':bigscreen',
      'broadcast:stats',
      stats
    )
  }

  private async broadcastOnlineCount(classroomId: string): Promise<void> {
    const onlineCount = await socketService.getRoomConnectionCount(
      'classroom:' + classroomId + ':students'
    )
    socketService.broadcastToRoom(
      'classroom:' + classroomId,
      'broadcast:online',
      { onlineCount }
    )
  }
}

export const classroomSocketHandler = new ClassroomSocketHandler()
