import { randomBytes } from 'crypto'
import { CourseStudentStatus, CognitiveSessionStatus } from '@prisma/client'
import { prisma } from '../../config/database'
import {
  encryptCognitivePayload,
  decryptCognitivePayload,
  getParticipantKey,
} from './cognitive.security'
import { requireCognitiveRegistryEntry } from './cognitive.registry'
import { lockSession } from './session-lock'
import { NOT_FOUND, FORBIDDEN, BAD_REQUEST, CONFLICT } from './cognitive.errors'
import { resolveCognitiveReference } from './reference'

/**
 * D4 — Cognitive Session / Attempt 服务。
 *
 * 边界（D4 §3 / §19）：不写 Trial、不评分、不返回 score/metrics；
 * 普通登录会话仍沿用课程成员资格；公开/综合测评匿名会话由 public.service 负责凭证和入口校验；不建 server timer；
 * 不引 Redis lock / websocket / heartbeat / fingerprint / device binding；
 * 不加新 migration。
 *
 * D6.1：
 * - P1：createSession 先找 existing IN_PROGRESS（resume 现有 attempt，不重新检查资格），
 *   只有"新 attempt"才走 loadStartableAssignment 资格链（与 D5 冻结思想一致）。
 * - P0：restartSession 在 DB transaction + Session 行锁（FOR UPDATE）内执行
 *   ABANDONED + 新建 attempt，与 append/complete 串行化。
 */

interface StartableContext {
  assignment: {
    id: string
    courseId: string | null
    configId: string
    maxAttempts: number
    opensAt: Date | null
    dueAt: Date | null
  }
  validatedConfig: unknown
  config: {
    id: string
    testType: string
    configVersion: string
    engineVersion: string
    scoringVersion: string
  }
}

/**
 * 内部 helper（D4 §6）—— 资格判定 9 步（仅用于**新 attempt**）：
 * 1 assignment 存在 → 2 status=PUBLISHED → 3 courseId 非空 → 4 course 存在
 * → 5 membership ACTIVE/APPROVED → 6 opensAt/dueAt 时间窗（null 不限）
 * → 7 config 存在 → 8 registry entry 存在 → 9 configSchema.parse 成功
 */
export const loadStartableAssignment = async (
  assignmentId: string,
  userId: string
): Promise<StartableContext> => {
  const assignment = await prisma.cognitiveAssignment.findUnique({ where: { id: assignmentId } })
  if (!assignment) throw NOT_FOUND('CognitiveAssignment not found')
  if (assignment.status !== 'PUBLISHED') throw BAD_REQUEST('Assignment is not published')
  if (!assignment.courseId) throw BAD_REQUEST('Assignment has no course')

  const course = await prisma.course.findUnique({ where: { id: assignment.courseId } })
  if (!course) throw NOT_FOUND('Course not found')

  const membership = await prisma.courseStudent.findUnique({
    where: { courseId_studentId: { courseId: assignment.courseId, studentId: userId } },
  })
  if (
    !membership ||
    (membership.status !== CourseStudentStatus.ACTIVE && membership.status !== CourseStudentStatus.APPROVED)
  ) {
    throw FORBIDDEN('Not an active member of this course')
  }

  const now = Date.now()
  if (assignment.opensAt && now < assignment.opensAt.getTime()) {
    throw BAD_REQUEST('Assignment has not opened yet')
  }
  if (assignment.dueAt && now > assignment.dueAt.getTime()) {
    throw BAD_REQUEST('Assignment is past due')
  }

  const config = await prisma.cognitiveTestConfig.findUnique({ where: { id: assignment.configId } })
  if (!config) throw NOT_FOUND('CognitiveTestConfig not found')

  const entry = requireCognitiveRegistryEntry(config.testType, config.engineVersion, config.scoringVersion)
  const parsed = entry.configSchema.safeParse(config.config)
  if (!parsed.success) {
    throw BAD_REQUEST('CognitiveTestConfig does not match its registry schema')
  }

  return {
    assignment: {
      id: assignment.id,
      courseId: assignment.courseId,
      configId: assignment.configId,
      maxAttempts: assignment.maxAttempts,
      opensAt: assignment.opensAt,
      dueAt: assignment.dueAt,
    },
    validatedConfig: parsed.data,
    config: {
      id: config.id,
      testType: config.testType,
      configVersion: config.configVersion,
      engineVersion: config.engineVersion,
      scoringVersion: config.scoringVersion,
    },
  }
}

const isPrismaUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'

/** 组装 runner payload（D4 §12）：绝不返回 participantKey / *Encrypted / userId。 */
const toRunnerPayload = (session: {
  id: string
  assignmentId: string | null
  testType: string
  attemptNo: number
  status: CognitiveSessionStatus
  configVersion: string
  engineVersion: string
  scoringVersion: string
  configSnapshotEncrypted: string
  randomSeed: string
  anonymousCode?: string | null
}, nextTrialIndex?: number, exposeAnonymousCode = false) => {
  const validatedConfig = decryptCognitivePayload<unknown>(session.configSnapshotEncrypted)
  return {
    sessionId: session.id,
    assignmentId: session.assignmentId,
    testType: session.testType,
    attemptNo: session.attemptNo,
    status: session.status,
    configVersion: session.configVersion,
    engineVersion: session.engineVersion,
    scoringVersion: session.scoringVersion,
    config: validatedConfig,
    randomSeed: session.randomSeed,
    ...(nextTrialIndex === undefined ? {} : { nextTrialIndex }),
    ...(exposeAnonymousCode ? { anonymousCode: session.anonymousCode ?? null } : {}),
  }
}

export const createSession = async (userId: string, assignmentId: string) => {
  const participantKey = getParticipantKey(userId)

  // D6.1 (P1)：**先**找 existing IN_PROGRESS → 直接 resume 冻结的现有 attempt，
  // **不重新检查资格**（opensAt/dueAt/membership/archive 状态不影响"继续"已有 session，
  // 与 D5 "Trial 写入不重查资格" 的冻结思想一致）。
  const existing = await prisma.cognitiveSession.findFirst({
    where: { assignmentId, participantKey, status: 'IN_PROGRESS' },
  })
  if (existing) return toRunnerPayload(existing)

  // 无 existing → 这是"新 attempt"，才走完整资格链。
  const ctx = await loadStartableAssignment(assignmentId, userId)

  // 已用次数（COMPLETED/ABANDONED/INVALID 均计入；IN_PROGRESS 已在上方返回）。
  const used = await prisma.cognitiveSession.count({ where: { assignmentId, participantKey } })
  if (used >= ctx.assignment.maxAttempts) {
    throw CONFLICT('Maximum attempts reached for this assignment')
  }

  const last = await prisma.cognitiveSession.findFirst({
    where: { assignmentId, participantKey },
    orderBy: { attemptNo: 'desc' },
    select: { attemptNo: true },
  })
  const attemptNo = (last?.attemptNo ?? 0) + 1

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } })
  const participantSnapshotEncrypted = encryptCognitivePayload({ nickname: user?.nickname ?? null })
  const configSnapshotEncrypted = encryptCognitivePayload(ctx.validatedConfig)
  const randomSeed = randomBytes(16).toString('hex')

  try {
    const session = await prisma.cognitiveSession.create({
      data: {
        userId,
        participantKey,
        participantSnapshotEncrypted,
        assignmentId: ctx.assignment.id,
        configId: ctx.config.id,
        testType: ctx.config.testType,
        attemptNo,
        status: 'IN_PROGRESS',
        configVersion: ctx.config.configVersion,
        configSnapshotEncrypted,
        engineVersion: ctx.config.engineVersion,
        scoringVersion: ctx.config.scoringVersion,
        randomSeed,
      },
    })
    return toRunnerPayload(session)
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      // @@unique([assignmentId, participantKey, attemptNo]) 并发冲突 → 重读当前 session（不引 Redis lock）。
      const current = await prisma.cognitiveSession.findFirst({
        where: { assignmentId, participantKey, status: 'IN_PROGRESS' },
      })
      if (current) return toRunnerPayload(current)
      throw CONFLICT('Session already exists for this attempt')
    }
    throw err
  }
}

export const getSession = async (userId: string, sessionId: string) => {
  const session = await prisma.cognitiveSession.findUnique({
    where: { id: sessionId },
    include: {
      trials: {
        orderBy: { trialIndex: 'desc' },
        take: 1,
        select: { trialIndex: true },
      },
    },
  })
  if (!session) throw NOT_FOUND('CognitiveSession not found')
  if (session.userId !== userId) throw FORBIDDEN('Not the owner of this session')

  if (session.status === 'COMPLETED') {
    // D6 后：完成态返回 decrypted result。
    const runnerPayload = toRunnerPayload(session)
    const score = session.scoreEncrypted
      ? decryptCognitivePayload<number>(session.scoreEncrypted)
      : null
    const metrics = session.metricsEncrypted
      ? decryptCognitivePayload<Record<string, unknown>>(session.metricsEncrypted)
      : null
    const qualityFlags = session.qualityFlagsEncrypted
      ? decryptCognitivePayload<Record<string, unknown>>(session.qualityFlagsEncrypted)
      : null
    const report = (runnerPayload.config as { report?: Record<string, unknown> }).report ?? {}
    const reference = metrics && score !== null
      ? resolveCognitiveReference({
          testType: session.testType,
          metrics,
          score,
          referenceMode: (report.referenceMode as 'none' | 'simulated' | 'literature' | undefined) ?? 'none',
          referenceVersion: report.referenceVersion as string | undefined,
          referenceBand: report.referenceBand as string | undefined,
        })
      : undefined
    return {
      ...runnerPayload,
      status: session.status,
      finishedAt: session.finishedAt,
      result: score !== null && metrics !== null && qualityFlags !== null
        ? { score, metrics, qualityFlags, reference }
        : null,
    }
  }

  // D4：IN_PROGRESS / ABANDONED / INVALID 只回运行信息 + decrypted config + randomSeed，不返回 score/metrics。
  // 综合测评允许登录学生跨设备续答，因此服务端提供下一个安全的试次索引。
  const nextTrialIndex = (session.trials?.[0]?.trialIndex ?? -1) + 1
  return toRunnerPayload(session, nextTrialIndex)
}

/**
 * 公开/匿名会话读取。匿名参与不依赖登录态，而是通过综合测评的恢复凭证
 * 或单个认知公开链接生成的 recoveryTokenHash 校验；服务端仍不返回任何密文。
 */
export const getPublicSession = async (recoveryTokenHash: string, sessionId: string) => {
  const session = await prisma.cognitiveSession.findUnique({
    where: { id: sessionId },
    include: {
      compositeAttempt: { select: { recoveryTokenHash: true, userId: true } },
      trials: {
        orderBy: { trialIndex: 'desc' },
        take: 1,
        select: { trialIndex: true },
      },
    },
  })
  if (!session) throw NOT_FOUND('CognitiveSession not found')
  const allowed = session.userId === null && (
    session.recoveryTokenHash === recoveryTokenHash ||
    session.compositeAttempt?.recoveryTokenHash === recoveryTokenHash
  )
  if (!allowed) throw FORBIDDEN('Recovery credential does not own this session')

  const nextTrialIndex = (session.trials?.[0]?.trialIndex ?? -1) + 1
  const runnerPayload = toRunnerPayload(session, nextTrialIndex, true)
  if (session.status !== 'COMPLETED') return runnerPayload

  const score = session.scoreEncrypted ? decryptCognitivePayload<number>(session.scoreEncrypted) : null
  const metrics = session.metricsEncrypted
    ? decryptCognitivePayload<Record<string, unknown>>(session.metricsEncrypted)
    : null
  const qualityFlags = session.qualityFlagsEncrypted
    ? decryptCognitivePayload<Record<string, unknown>>(session.qualityFlagsEncrypted)
    : null
  const report = (runnerPayload.config as { report?: Record<string, unknown> }).report ?? {}
  const reference = metrics && score !== null
    ? resolveCognitiveReference({
        testType: session.testType,
        metrics,
        score,
        referenceMode: (report.referenceMode as 'none' | 'simulated' | 'literature' | undefined) ?? 'none',
        referenceVersion: report.referenceVersion as string | undefined,
        referenceBand: report.referenceBand as string | undefined,
      })
    : undefined
  return {
    ...runnerPayload,
    finishedAt: session.finishedAt,
    result: score !== null && metrics !== null && qualityFlags !== null
      ? { score, metrics, qualityFlags, reference }
      : null,
  }
}

export const restartSession = async (userId: string, sessionId: string) => {
  const session = await prisma.cognitiveSession.findUnique({ where: { id: sessionId } })
  if (!session) throw NOT_FOUND('CognitiveSession not found')
  if (session.userId !== userId) throw FORBIDDEN('Not the owner of this session')
  if (session.status !== 'IN_PROGRESS' || !session.assignmentId) {
    throw BAD_REQUEST('Only an IN_PROGRESS session with an assignment can be restarted')
  }

  // restart 是**主动新 attempt** → 重新判定资格（尤其 dueAt / membership）。
  const ctx = await loadStartableAssignment(session.assignmentId, userId)
  const participantKey = getParticipantKey(userId)

  const used = await prisma.cognitiveSession.count({ where: { assignmentId: session.assignmentId, participantKey } })
  if (used >= ctx.assignment.maxAttempts) {
    throw CONFLICT('Maximum attempts reached for this assignment')
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } })
  const participantSnapshotEncrypted = encryptCognitivePayload({ nickname: user?.nickname ?? null })
  const configSnapshotEncrypted = encryptCognitivePayload(ctx.validatedConfig)
  const randomSeed = randomBytes(16).toString('hex')

  try {
    return await prisma.$transaction(async (tx) => {
      // D6.1 (P0)：行锁串行化 restart 与 append/complete；锁内校验仍 IN_PROGRESS。
      const locked = await lockSession(tx, sessionId)
      if (!locked) throw NOT_FOUND('CognitiveSession not found')
      if (locked.status !== 'IN_PROGRESS') {
        throw BAD_REQUEST('Session is no longer IN_PROGRESS')
      }

      const newAttemptNo = locked.attemptNo + 1
      const { count } = await tx.cognitiveSession.updateMany({
        where: { id: sessionId, status: 'IN_PROGRESS' },
        data: { status: 'ABANDONED', finishedAt: new Date() },
      })
      if (count === 0) throw CONFLICT('Session is no longer IN_PROGRESS')

      return tx.cognitiveSession.create({
        data: {
          userId,
          participantKey,
          participantSnapshotEncrypted,
          assignmentId: locked.assignmentId,
          configId: locked.configId,
          testType: locked.testType,
          attemptNo: newAttemptNo,
          status: 'IN_PROGRESS',
          configVersion: locked.configVersion,
          configSnapshotEncrypted,
          engineVersion: locked.engineVersion,
          scoringVersion: locked.scoringVersion,
          randomSeed,
        },
      })
    }).then((created) => toRunnerPayload(created))
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      const current = await prisma.cognitiveSession.findFirst({
        where: { assignmentId: session.assignmentId, participantKey, status: 'IN_PROGRESS' },
      })
      if (current) return toRunnerPayload(current)
      throw CONFLICT('Restarted session already exists')
    }
    throw err
  }
}
