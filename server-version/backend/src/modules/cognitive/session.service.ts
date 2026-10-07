import { assertCognitiveProductEligible } from './product-eligibility'
import { randomBytes } from 'crypto'
import { CourseStudentStatus, CognitiveSessionStatus } from '@prisma/client'
import { prisma } from '../../config/database'
import type { AssetDatabase } from '../../services/assetStorage'
import {
  encryptCognitivePayload,
  decryptCognitivePayload,
  getParticipantKey,
} from './cognitive.security'
import { requireCognitiveRegistryEntry } from './cognitive.registry'
import { hashResolvedConfig, readFrozenReport, type FrozenReportSnapshot } from './profile-freeze'
import { lockSession } from './session-lock'
import { admitCognitiveAttempt, cognitiveQuotaSource, lockCognitiveQuota } from './attempt-quota'
import { NOT_FOUND, FORBIDDEN, BAD_REQUEST, CONFLICT } from './cognitive.errors'
import { rejectWrapperForStandaloneUse } from './assignment.access'
import { resolveCognitiveReferenceForResult } from './reference'
import { buildCognitiveSingleTaskReport } from './single-task-report'
import { getCognitiveV2TaskDefinition } from './v2/registry'
import {
  createSessionConfigSnapshot,
  sessionConfigFromStoredValue,
} from './v2/session-snapshot'
import { cognitivePresentationAssetReferences } from './v2/presentation'
import { parseCognitiveResultSnapshot, referencesForCognitiveResult } from './v2/result-snapshot'
import { compileCognitiveRuntime } from '../assessment-runtime/compiler'
import { isRelationalCohortOnlyCompositeAttempt } from '../assessment-relational/result-authority'
import { freezeExactReferenceBindings, type ExactReferenceDb } from '../assessment-runtime/reference-binding'
import {
  ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
  ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
  retainAssessmentAssetReferences,
} from '../assessment-media/assessment-asset'

/**
 * D4 — Cognitive Session / Attempt 服务。
 *
 * 边界（D4 §3 / §19）：不写 Trial、不评分、不返回 score/metrics；
 * 普通登录会话仍沿用课程成员资格；公开/综合测评匿名会话由 public.service 负责凭证和入口校验；不建 server timer；
 * 不引 Redis lock / websocket / heartbeat / fingerprint / device binding；
 * 数据库变更由版本化 Prisma migration 管理。
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
  configSnapshotEncrypted: string
  frozenReport: FrozenReportSnapshot | null
  config: {
    id: string
    testType: string
    configVersion: string
    engineVersion: string
    scoringVersion: string
  }
}

/**
 * New sessions persist the complete v2 measurement snapshot in the existing
 * encrypted config column. The raw assignment snapshot remains the source
 * used to construct it; legacy sessions continue to be readable below.
 */
export const createCognitiveSessionConfigSnapshot = (input: {
  testType: string
  configVersion: string
  engineVersion: string
  scoringVersion: string
  config: unknown
}): string => {
  assertCognitiveProductEligible(input.testType)
  const definition = getCognitiveV2TaskDefinition(
    input.testType,
    input.engineVersion,
    input.scoringVersion,
  )
  if (!definition) throw new Error(`No Cognitive v2 definition for ${input.testType}/${input.engineVersion}/${input.scoringVersion}`)
  const snapshot = createSessionConfigSnapshot({
    definition,
    configVersion: input.configVersion,
    config: input.config,
  })
  return encryptCognitivePayload(snapshot)
}

/**
 * Create the unified final-only snapshot at attempt start. The existing
 * encrypted config column remains the single Cognitive snapshot store; the
 * evolved snapshot carries the serializable runtime identity and the exact
 * reference bindings used by the attempt.
 */
export const createUnifiedCognitiveSessionConfigSnapshot = async (input: {
  testType: string
  configVersion: string
  engineVersion: string
  scoringVersion: string
  config: unknown
  db?: ExactReferenceDb & AssetDatabase
}): Promise<{ encrypted: string; compiledRuntime: ReturnType<typeof compileCognitiveRuntime> }> => {
  assertCognitiveProductEligible(input.testType)
  const definition = getCognitiveV2TaskDefinition(
    input.testType,
    input.engineVersion,
    input.scoringVersion,
  )
  if (!definition) throw new Error(`No Cognitive v2 definition for ${input.testType}/${input.engineVersion}/${input.scoringVersion}`)
  const compiledRuntime = compileCognitiveRuntime({
    definition,
    instrumentVersion: input.engineVersion,
  })
  const db = input.db ?? (prisma as unknown as ExactReferenceDb & AssetDatabase)
  const referenceBindings = await freezeExactReferenceBindings(db, {
    instrumentType: 'COGNITIVE',
    instrumentKey: definition.testType,
    selections: compiledRuntime.referenceBindingDefinition.selections,
  })
  const snapshot = createSessionConfigSnapshot({
    definition,
    configVersion: input.configVersion,
    config: input.config,
    runtime: {
      runtimeGeneration: 'UNIFIED_V1',
      compiledRuntime,
      referenceBindings,
    },
  })
  const mediaReferences = cognitivePresentationAssetReferences(snapshot.presentation)
  if (mediaReferences.length > 0) {
    await retainAssessmentAssetReferences({
      owner: {
        entityType: ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
        entityId: `COGNITIVE:${compiledRuntime.compiledRuntimeHash}`,
        field: ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
      },
      references: mediaReferences,
      db,
    })
  }
  return { encrypted: encryptCognitivePayload(snapshot), compiledRuntime }
}

/** Decode either a v2 session snapshot or the legacy raw config snapshot. */
export const readCognitiveSessionConfig = <TConfig = Record<string, unknown>>(encrypted: string): {
  config: TConfig
  snapshot: ReturnType<typeof sessionConfigFromStoredValue<TConfig>>['snapshot']
  compiledRuntime: ReturnType<typeof sessionConfigFromStoredValue<TConfig>>['compiledRuntime']
} => sessionConfigFromStoredValue<TConfig>(decryptCognitivePayload<unknown>(encrypted))

const v2ResultFromSnapshot = (encrypted: string) => {
  const snapshot = parseCognitiveResultSnapshot(decryptCognitivePayload<unknown>(encrypted))
  return {
    metrics: snapshot.metrics,
    quality: snapshot.quality,
    qualityFlags: snapshot.quality.flags,
    references: referencesForCognitiveResult(snapshot),
    report: snapshot.report,
    assessmentContext: snapshot.assessmentContext,
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
  userId: string,
  options: { allowCompositeWrapper?: boolean } = {},
): Promise<StartableContext> => {
  const assignment = await prisma.cognitiveAssignment.findUnique({ where: { id: assignmentId } })
  if (!assignment) throw NOT_FOUND('CognitiveAssignment not found')
  if (assignment.status !== 'PUBLISHED') throw BAD_REQUEST('Assignment is not published')
  if (!options.allowCompositeWrapper) rejectWrapperForStandaloneUse(assignment)
  if (!assignment.courseId) throw BAD_REQUEST('Assignment has no course')

  const course = await prisma.course.findUnique({ where: { id: assignment.courseId } })
  if (!course) throw NOT_FOUND('Course not found')
  if (course.isLibrary) throw FORBIDDEN('库课程上的认知任务不能单独作答')

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
  let validatedConfig: unknown
  let configSnapshotEncrypted: string
  let frozenReport: FrozenReportSnapshot | null = null
  if (assignment.resolvedConfigSnapshotEncrypted) {
    const thawed = decryptCognitivePayload<unknown>(assignment.resolvedConfigSnapshotEncrypted)
    const parsedFrozen = entry.configSchema.safeParse(thawed)
    if (!parsedFrozen.success) {
      throw BAD_REQUEST('冻结的 Profile 配置与任务 schema 不匹配')
    }
    if (assignment.resolvedConfigHash && hashResolvedConfig(parsedFrozen.data) !== assignment.resolvedConfigHash) {
      throw BAD_REQUEST('冻结的 Profile 配置校验失败')
    }
    validatedConfig = parsedFrozen.data
    configSnapshotEncrypted = assignment.resolvedConfigSnapshotEncrypted
    frozenReport = readFrozenReport(assignment.resolvedReportSnapshotEncrypted)
  } else {
    const parsed = entry.configSchema.safeParse(config.config)
    if (!parsed.success) {
      throw BAD_REQUEST('CognitiveTestConfig does not match its registry schema')
    }
    validatedConfig = parsed.data
    configSnapshotEncrypted = encryptCognitivePayload(parsed.data)
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
    validatedConfig,
    configSnapshotEncrypted,
    frozenReport,
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
  deliveryMode?: string
  submittedAt?: Date | null
  anonymousCode?: string | null
  assignment?: { resolvedReportSnapshotEncrypted?: string | null } | null
  compositeAttempt?: { contextSnapshotHash?: string | null } | null
}, nextTrialIndex?: number, exposeAnonymousCode = false, frozenReport?: FrozenReportSnapshot | null) => {
  const storedConfig = readCognitiveSessionConfig(session.configSnapshotEncrypted)
  const validatedConfig = storedConfig.config
  const snapshot = storedConfig.snapshot
  const report = frozenReport ?? readFrozenReport(session.assignment?.resolvedReportSnapshotEncrypted)
  const entry = report ? null : requireCognitiveRegistryEntry(session.testType, session.engineVersion, session.scoringVersion)
  return {
    sessionId: session.id,
    assignmentId: session.assignmentId,
    testType: session.testType,
    attemptNo: session.attemptNo,
    attemptEpoch: session.attemptNo,
    status: session.status,
    deliveryMode: session.deliveryMode ?? 'FINAL_ONLY',
    configVersion: session.configVersion,
    engineVersion: session.engineVersion,
    scoringVersion: session.scoringVersion,
    config: validatedConfig,
    ...(snapshot ? { protocol: snapshot.protocol, protocolSignature: snapshot.protocolSignature } : {}),
    ...(snapshot?.presentation ? { presentation: snapshot.presentation } : {}),
    randomSeed: session.randomSeed,
    profile: report?.profile ?? null,
    reportCaveats: report?.reportCaveats ?? [],
    metricDefinitions: report?.metricDefinitions ?? entry?.metricDefinitions,
    qualityDefinitions: report?.qualityDefinitions ?? entry?.qualityDefinitions,
    reportDefinition: report?.reportDefinition ?? entry?.reportDefinition,
    ...(snapshot ? { definitionHash: snapshot.configHash } : {}),
    contextSnapshotHash: session.compositeAttempt?.contextSnapshotHash ?? null,
    ...(nextTrialIndex === undefined ? {} : { nextTrialIndex }),
    ...(session.submittedAt ? { submittedAt: session.submittedAt } : {}),
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
    include: { assignment: { select: { resolvedReportSnapshotEncrypted: true } } },
  })
  if (existing) {
    const assignment = await prisma.cognitiveAssignment.findUnique({ where: { id: assignmentId } })
    if (!assignment) throw NOT_FOUND('CognitiveAssignment not found')
    rejectWrapperForStandaloneUse(assignment)
    if (assignment.courseId) {
      const course = await prisma.course.findUnique({ where: { id: assignment.courseId }, select: { isLibrary: true } })
      if (course?.isLibrary) throw FORBIDDEN('库课程上的认知任务不能单独作答')
    }
    return toRunnerPayload(existing)
  }

  // 无 existing → 这是"新 attempt"，才走完整资格链。
  const ctx = await loadStartableAssignment(assignmentId, userId)

  // 已用次数（COMPLETED/ABANDONED/INVALID 均计入；IN_PROGRESS 已在上方返回）。
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } })
  const participantSnapshotEncrypted = encryptCognitivePayload({ nickname: user?.nickname ?? null })
  const unifiedSnapshot = await createUnifiedCognitiveSessionConfigSnapshot({
    testType: ctx.config.testType,
    configVersion: ctx.config.configVersion,
    engineVersion: ctx.config.engineVersion,
    scoringVersion: ctx.config.scoringVersion,
    config: ctx.validatedConfig,
  })
  const randomSeed = randomBytes(16).toString('hex')

  try {
    const session = await prisma.$transaction(async tx => {
      const source = await cognitiveQuotaSource(tx, assignmentId)
      await lockCognitiveQuota(tx, userId, source.id)
      const resumed = await tx.cognitiveSession.findFirst({
        where: { assignmentId, participantKey, status: 'IN_PROGRESS' },
        include: { assignment: { select: { resolvedReportSnapshotEncrypted: true } } },
      })
      if (resumed) return resumed
      await admitCognitiveAttempt(tx, userId, assignmentId)
      const last = await tx.cognitiveSession.findFirst({ where: { assignmentId, participantKey }, orderBy: { attemptNo: 'desc' }, select: { attemptNo: true } })
      return tx.cognitiveSession.create({
      data: {
        userId,
        participantKey,
        participantSnapshotEncrypted,
        assignmentId: ctx.assignment.id,
        configId: ctx.config.id,
        testType: ctx.config.testType,
        attemptNo: (last?.attemptNo ?? 0) + 1,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        configVersion: ctx.config.configVersion,
        configSnapshotEncrypted: unifiedSnapshot.encrypted,
        engineVersion: ctx.config.engineVersion,
        scoringVersion: ctx.config.scoringVersion,
        randomSeed,
        runtimeGeneration: 'UNIFIED_V1',
        compiledRuntimeHash: unifiedSnapshot.compiledRuntime.compiledRuntimeHash,
      },
      })
    })
    return toRunnerPayload(session, undefined, false, ctx.frozenReport)
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      // @@unique([assignmentId, participantKey, attemptNo]) 并发冲突 → 重读当前 session（不引 Redis lock）。
      const current = await prisma.cognitiveSession.findFirst({
        where: { assignmentId, participantKey, status: 'IN_PROGRESS' },
        include: { assignment: { select: { resolvedReportSnapshotEncrypted: true } } },
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
      assignment: { select: { resolvedReportSnapshotEncrypted: true } },
      compositeAttempt: { select: { contextSnapshotHash: true, status: true } },
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
    // Relational cohort-only attempts expose terminal state but never an
    // individual Cognitive result. The parent cohort projection is authoritative.
    const runnerPayload = toRunnerPayload(session)
    if (session.compositeAttemptId && session.compositeAttempt?.status !== 'COMPLETED') {
      return { ...runnerPayload, status: session.status, finishedAt: session.finishedAt, feedbackDeferred: true }
    }
    if (
      session.compositeAttemptId
      && await isRelationalCohortOnlyCompositeAttempt(session.compositeAttemptId)
    ) {
      return {
        ...runnerPayload,
        status: session.status,
        finishedAt: session.finishedAt,
      }
    }
    // D6 后：普通完成态返回 decrypted result。
    const storedConfig = readCognitiveSessionConfig(session.configSnapshotEncrypted)
    if (storedConfig.snapshot) {
      if (!session.resultSnapshotEncrypted) throw CONFLICT('v2 completed session result snapshot is missing')
      return {
        ...runnerPayload,
        status: session.status,
        finishedAt: session.finishedAt,
        result: v2ResultFromSnapshot(session.resultSnapshotEncrypted),
      }
    }
    const score = session.scoreEncrypted
      ? decryptCognitivePayload<number>(session.scoreEncrypted)
      : null
    const metrics = session.metricsEncrypted
      ? decryptCognitivePayload<Record<string, unknown>>(session.metricsEncrypted)
      : null
    const qualityFlags = session.qualityFlagsEncrypted
      ? decryptCognitivePayload<Record<string, unknown>>(session.qualityFlagsEncrypted)
      : null
    const frozenReport = readFrozenReport(session.assignment?.resolvedReportSnapshotEncrypted)
    const profile = frozenReport?.profile ?? runnerPayload.profile ?? null
    const reference = metrics && score !== null
      ? resolveCognitiveReferenceForResult({
          testType: session.testType,
          metrics,
          score,
          qualityFlags: qualityFlags ?? undefined,
          config: runnerPayload.config as Record<string, unknown>,
          profile,
          engineVersion: session.engineVersion,
          scoringVersion: session.scoringVersion,
          configVersion: session.configVersion,
        })
      : undefined
    const singleTaskReport = score !== null && metrics !== null && qualityFlags !== null
      ? buildCognitiveSingleTaskReport({
          testType: session.testType,
          engineVersion: session.engineVersion,
          scoringVersion: session.scoringVersion,
          configVersion: session.configVersion,
          profile,
          frozenReport,
          score,
          metrics,
          qualityFlags,
          reference: reference ?? null,
        })
      : null
    return {
      ...runnerPayload,
      status: session.status,
      finishedAt: session.finishedAt,
      result: score !== null && metrics !== null && qualityFlags !== null
        ? { score, metrics, qualityFlags, reference, singleTaskReport }
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
      assignment: { select: { resolvedReportSnapshotEncrypted: true } },
      compositeAttempt: { select: { recoveryTokenHash: true, userId: true, contextSnapshotHash: true, status: true } },
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
  if (session.compositeAttemptId && session.compositeAttempt?.status !== 'COMPLETED') {
    return { ...runnerPayload, finishedAt: session.finishedAt, feedbackDeferred: true }
  }

  const storedConfig = readCognitiveSessionConfig(session.configSnapshotEncrypted)
  if (storedConfig.snapshot) {
    if (!session.resultSnapshotEncrypted) throw CONFLICT('v2 completed session result snapshot is missing')
    return {
      ...runnerPayload,
      finishedAt: session.finishedAt,
      result: v2ResultFromSnapshot(session.resultSnapshotEncrypted),
    }
  }

  const score = session.scoreEncrypted ? decryptCognitivePayload<number>(session.scoreEncrypted) : null
  const metrics = session.metricsEncrypted
    ? decryptCognitivePayload<Record<string, unknown>>(session.metricsEncrypted)
    : null
  const qualityFlags = session.qualityFlagsEncrypted
    ? decryptCognitivePayload<Record<string, unknown>>(session.qualityFlagsEncrypted)
    : null
  const frozenReport = readFrozenReport(session.assignment?.resolvedReportSnapshotEncrypted)
  const profile = frozenReport?.profile ?? runnerPayload.profile ?? null
  const reference = metrics && score !== null
    ? resolveCognitiveReferenceForResult({
        testType: session.testType,
        metrics,
        score,
        qualityFlags: qualityFlags ?? undefined,
        config: runnerPayload.config as Record<string, unknown>,
        profile,
        engineVersion: session.engineVersion,
        scoringVersion: session.scoringVersion,
        configVersion: session.configVersion,
      })
    : undefined
  const singleTaskReport = score !== null && metrics !== null && qualityFlags !== null
    ? buildCognitiveSingleTaskReport({
        testType: session.testType,
        engineVersion: session.engineVersion,
        scoringVersion: session.scoringVersion,
        configVersion: session.configVersion,
        profile,
        frozenReport,
        score,
        metrics,
        qualityFlags,
        reference: reference ?? null,
      })
    : null
  return {
    ...runnerPayload,
    finishedAt: session.finishedAt,
    result: score !== null && metrics !== null && qualityFlags !== null
      ? { score, metrics, qualityFlags, reference, singleTaskReport }
      : null,
  }
}

export const restartSession = async (userId: string, sessionId: string) => {
  const session = await prisma.cognitiveSession.findUnique({ where: { id: sessionId } })
  if (!session) throw NOT_FOUND('CognitiveSession not found')
  if (session.userId !== userId) throw FORBIDDEN('Not the owner of this session')
  if (session.compositeAttemptId) {
    throw CONFLICT('综合测评中的认知任务必须重启整个综合测评')
  }
  if (session.status !== 'IN_PROGRESS' || !session.assignmentId) {
    throw BAD_REQUEST('Only an IN_PROGRESS session with an assignment can be restarted')
  }

  // restart 是**主动新 attempt** → 重新判定资格（尤其 dueAt / membership）。
  const ctx = await loadStartableAssignment(session.assignmentId, userId, {
    allowCompositeWrapper: Boolean(session.compositeAttemptId && session.compositeItemId),
  })
  // Composite sessions use an attempt/item-scoped participant key. Preserve
  // the frozen key across restart; falling back to the standalone user key
  // would disconnect the new Session from the Composite Attempt and also
  // make the completion path unable to select it as the latest result.
  const participantKey = session.participantKey

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } })
  const participantSnapshotEncrypted = encryptCognitivePayload({ nickname: user?.nickname ?? null })
  const unifiedSnapshot = await createUnifiedCognitiveSessionConfigSnapshot({
    testType: ctx.config.testType,
    configVersion: ctx.config.configVersion,
    engineVersion: ctx.config.engineVersion,
    scoringVersion: ctx.config.scoringVersion,
    config: ctx.validatedConfig,
  })
  const randomSeed = randomBytes(16).toString('hex')

  try {
    return await prisma.$transaction(async (tx) => {
      await admitCognitiveAttempt(tx, userId, session.assignmentId!)
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
          compositeAttemptId: locked.compositeAttemptId,
          compositeItemId: locked.compositeItemId,
          recoveryTokenHash: locked.recoveryTokenHash,
          configId: locked.configId,
          testType: locked.testType,
          attemptNo: newAttemptNo,
          status: 'IN_PROGRESS',
          deliveryMode: 'FINAL_ONLY',
          configVersion: locked.configVersion,
          configSnapshotEncrypted: unifiedSnapshot.encrypted,
          engineVersion: locked.engineVersion,
          scoringVersion: locked.scoringVersion,
          randomSeed,
          anonymousCode: locked.anonymousCode,
          runtimeGeneration: 'UNIFIED_V1',
          compiledRuntimeHash: unifiedSnapshot.compiledRuntime.compiledRuntimeHash,
        },
      })
    }).then((created) => toRunnerPayload(created, undefined, false, ctx.frozenReport))
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
