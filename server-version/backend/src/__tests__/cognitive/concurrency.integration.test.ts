import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
import { integrationDatabaseUrl } from '../integration/integration-env'

/**
 * D6.1 — 真实 DB 并发集成测试（append vs complete / append vs restart /
 * complete vs complete / restart vs restart）。
 *
 * 运行方式（需指向真实 Postgres，例如 compose postgres 容器 IP）：
 *   COGNITIVE_INTEGRATION_DB_URL=postgresql://<pg-host>:5432/ptool \
 *     npm run test:integration
 *
 * 默认 `npm test` 不设该变量 → 本文件整体 skip，不触碰任何数据库、
 * 不影响 approved known-failure baseline 的 0 新增失败口径。
 *
 * 核心不变量（P0）：
 *   1) complete 与 append 并发后，绝不允许出现
 *      "Session=COMPLETED 且其 raw trial 数据集包含评分时不存在的新 trial"
 *      （评分数据集 == 完成时冻结数据集）。
 *   2) append 与 restart 并发后，绝不允许 trial 写入已 ABANDONED 的旧 session
 *      （行锁串行化后二者要么严格先后，要么 append 被拒）。
 *   3) complete vs complete：并发双 complete 都幂等成功，仅一次状态迁移。
 *   4) restart vs restart：并发双 restart 至多一个成功创建新 attempt。
 */

const DB_URL = integrationDatabaseUrl('COGNITIVE_INTEGRATION_DB_URL')
const hasDb = Boolean(DB_URL)
const suite = hasDb ? describe : describe.skip
const configuredRounds = Number.parseInt(process.env.COGNITIVE_CONCURRENCY_ROUNDS || '20', 10)
const CONCURRENCY_ROUNDS = Number.isFinite(configuredRounds)
  ? Math.min(100, Math.max(20, configuredRounds))
  : 20

let prisma: PrismaClient
let appendTrial: (userId: string, sessionId: string, input: { trialIndex: number; payload?: unknown }) => Promise<any>
let completeSession: (userId: string, sessionId: string) => Promise<any>
let restartSession: (userId: string, sessionId: string) => Promise<any>
let createSession: (userId: string, assignmentId: string) => Promise<any>

// 每个场景独立 fixture，避免残留状态互相干扰
let userId: string
let testConfigId: string
let createdAssignmentIds: string[] = []

const ok = async (p: Promise<any>) => {
  try {
    return { ok: true, value: await p }
  } catch (err: any) {
    return { ok: false, statusCode: err?.statusCode ?? null, message: String(err?.message ?? err) }
  }
}

const trialsOf = async (sessionId: string) =>
  prisma.cognitiveTrial.findMany({ where: { sessionId }, orderBy: { trialIndex: 'asc' } })

const freshPublishedAssignment = async (maxAttempts = 10) => {
  const config = await prisma.cognitiveTestConfig.findFirst({
    where: { id: testConfigId },
  })
  if (!config) throw new Error('fake config 1.0.0 not found (run seed first)')
  const course = await prisma.course.create({
    data: {
      title: `D6.1-concurrency-${Date.now()}`,
      courseCode: `C${Date.now().toString(36).toUpperCase()}`,
      creatorId: userId,
    },
  })
  await prisma.courseStudent.create({ data: { courseId: course.id, studentId: userId, status: 'ACTIVE' } })
  const assignment = await prisma.cognitiveAssignment.create({
    data: {
      courseId: course.id,
      configId: config.id,
      createdBy: userId,
      title: `D6.1-concurrency-${Date.now()}`,
      status: 'PUBLISHED',
      maxAttempts,
      publishedAt: new Date(),
    },
  })
  createdAssignmentIds.push(assignment.id)
  return { assignmentId: assignment.id, courseId: course.id }
}

const newSession = async (assignmentId: string) => {
  const payload = await createSession(userId, assignmentId)
  // V32-1 creates new final-only sessions as UNIFIED_V1, whose contract is
  // one-shot final submit and one CognitiveRawSubmission row. This suite
  // covers the legacy append/complete/restart protocol, so explicitly model
  // a pre-V32 session before exercising CognitiveTrial writes.
  await prisma.cognitiveSession.update({
    where: { id: payload.sessionId },
    data: { runtimeGeneration: null, compiledRuntimeHash: null },
  })
  return payload.sessionId
}

const envelope = (trialIndex: number, payload: unknown) => createTrialEnvelope({
  trialIndex,
  phase: 'test',
  payload,
  startedAtPerfMs: trialIndex * 1000,
  endedAtPerfMs: trialIndex * 1000 + 400,
})

const appendAll = async (sessionId: string) => {
  for (const [trialIndex, payload] of [
    [0, { correct: true, rtMs: 400 }],
    [1, { correct: true, rtMs: 500 }],
    [2, { correct: false, rtMs: 600 }],
  ] as const) {
    await appendTrial(userId, sessionId, { trialIndex, payload: envelope(trialIndex, payload) })
  }
}

suite('cognitive concurrency integration (real DB)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    const db = await import('../../config/database')
    prisma = db.prisma
    // Explicit test-owned fixture; the ordinary production seed remains DRAFT.
    const { COGNITIVE_SEEDS } = await import('../../../prisma/seeds/cognitive')
    const seed = COGNITIVE_SEEDS.find(entry => entry.testType === 'fake')!
    testConfigId = (await prisma.cognitiveTestConfig.create({ data: { ...seed, config: seed.config as any, status: 'PUBLISHED', configVersion: 'concurrency-fixture-' + Date.now() } })).id
    const trialMod = await import('../../modules/cognitive/trial.service')
    appendTrial = trialMod.appendTrial
    const compMod = await import('../../modules/cognitive/completion.service')
    completeSession = compMod.completeSession
    const sessMod = await import('../../modules/cognitive/session.service')
    restartSession = sessMod.restartSession
    createSession = sessMod.createSession

    // fixture 学生
    const uname = `d61s${Date.now().toString(36)}`
    const user = await prisma.user.create({
      data: { username: uname, passwordHash: 'x', role: 'STUDENT' },
    })
    userId = user.id
  })

  afterAll(async () => {
    // 最佳努力清理：按 assignmentId 删 sessions（级联 trials，含 restart 产生的新 attempt）
    // → assignments → courses(级联 courseStudents) → users
    try {
      if (createdAssignmentIds.length) {
        await prisma.cognitiveSession.deleteMany({
          where: { assignmentId: { in: createdAssignmentIds } },
        })
        await prisma.cognitiveAssignment.deleteMany({ where: { id: { in: createdAssignmentIds } } })
      }
      if (userId) {
        await prisma.courseStudent.deleteMany({ where: { studentId: userId } })
        await prisma.course.deleteMany({ where: { creatorId: userId } })
        await prisma.user.delete({ where: { id: userId } })
      }
    } catch {
      // 清理失败不阻塞断言结论
    }
    if (testConfigId) await prisma.cognitiveTestConfig.delete({ where: { id: testConfigId } })
    await prisma.$disconnect()
  })

  it('P0: complete vs append — never COMPLETED with a trial appended during scoring', async () => {
    // 多轮独立 assignment 提高碰撞机会
    for (let round = 0; round < CONCURRENCY_ROUNDS; round++) {
      const { assignmentId } = await freshPublishedAssignment()
      const sessionId = await newSession(assignmentId)
      await appendAll(sessionId) // 0,1,2 已就绪，评分本可成功

      const [comp, app] = await Promise.all([
        ok(completeSession(userId, sessionId)),
        ok(appendTrial(userId, sessionId, { trialIndex: 3, payload: envelope(3, { correct: true, rtMs: 100 }) })),
      ])

      const row = await prisma.cognitiveSession.findUnique({ where: { id: sessionId } })
      const trials = await trialsOf(sessionId)
      const hasTrial3 = trials.some((t) => t.trialIndex === 3)

      // 核心不变量：绝不允许 COMPLETED 且含评分时不存在的新 trial。
      expect(!(row?.status === 'COMPLETED' && hasTrial3)).toBe(true)
      // 两种合法结局之一：
      //  A) complete 先赢 → COMPLETED + trials 0,1,2；append 被拒（400/409）
      //  B) append 先赢 → trial3 存在；complete 因 4 trials 评分为 400，session 仍 IN_PROGRESS
      if (row?.status === 'COMPLETED') {
        expect(hasTrial3).toBe(false)
        expect(comp.ok).toBe(true)
        expect(comp.value.status).toBe('COMPLETED')
        expect(app.ok).toBe(false)
      } else {
        expect(row?.status).toBe('IN_PROGRESS')
        expect(comp.ok).toBe(false)
        expect(comp.statusCode).toBe(400)
      }
    }
  }, 120000)

  it('P0: append vs restart — trial never lands in a session already ABANDONED at write time', async () => {
    for (let round = 0; round < CONCURRENCY_ROUNDS; round++) {
      const { assignmentId } = await freshPublishedAssignment()
      const sessionId = await newSession(assignmentId)

      const [app, rst] = await Promise.all([
        ok(appendTrial(userId, sessionId, { trialIndex: 0, payload: envelope(0, { correct: true, rtMs: 400 }) })),
        ok(restartSession(userId, sessionId)),
      ])

      const oldRow = await prisma.cognitiveSession.findUnique({ where: { id: sessionId } })
      const newRow = await prisma.cognitiveSession.findFirst({
        where: { assignmentId, userId },
        orderBy: { attemptNo: 'desc' },
      })

      // 旧 session 必须已 ABANDONED；新 attempt 必须 IN_PROGRESS。
      expect(oldRow?.status).toBe('ABANDONED')
      expect(newRow?.status).toBe('IN_PROGRESS')
      expect(newRow?.attemptNo).toBe(oldRow ? oldRow.attemptNo + 1 : 1)

      const oldTrials = await trialsOf(sessionId)
      const newTrials = newRow ? await trialsOf(newRow.id) : []
      // trial 至多存在于一个 session；且 append 失败时（400/409）两边都不该有该 trial。
      if (app.ok) {
        const total = oldTrials.filter((t) => t.trialIndex === 0).length + newTrials.filter((t) => t.trialIndex === 0).length
        expect(total).toBe(1)
      } else {
        expect(app.statusCode).toBe(400)
        expect(oldTrials.some((t) => t.trialIndex === 0)).toBe(false)
        expect(newTrials.some((t) => t.trialIndex === 0)).toBe(false)
      }
    }
  }, 120000)

  it('P0: complete vs complete — idempotent, single state transition', async () => {
    for (let round = 0; round < CONCURRENCY_ROUNDS; round++) {
      const { assignmentId } = await freshPublishedAssignment()
      const sessionId = await newSession(assignmentId)
      await appendAll(sessionId)

      const [c1, c2] = await Promise.all([
        ok(completeSession(userId, sessionId)),
        ok(completeSession(userId, sessionId)),
      ])

      expect(c1.ok).toBe(true)
      expect(c2.ok).toBe(true)
      expect(c1.value.status).toBe('COMPLETED')
      expect(c2.value.status).toBe('COMPLETED')
      // v2 sessions intentionally no longer expose a generic score. Compare
      // the authoritative metric snapshot returned by both idempotent calls.
      expect(c1.value.metrics).toEqual(c2.value.metrics)

      const row = await prisma.cognitiveSession.findUnique({ where: { id: sessionId } })
      expect(row?.status).toBe('COMPLETED')
      expect(row?.scoreEncrypted).toBeNull()
      expect(row?.metricsEncrypted).toBeTruthy()
      expect(row?.qualityFlagsEncrypted).toBeTruthy()
    }
  }, 120000)

  it('P0: restart vs restart — at most one new attempt is created', async () => {
    for (let round = 0; round < CONCURRENCY_ROUNDS; round++) {
      const { assignmentId } = await freshPublishedAssignment()
      const sessionId = await newSession(assignmentId)

      const [r1, r2] = await Promise.all([
        ok(restartSession(userId, sessionId)),
        ok(restartSession(userId, sessionId)),
      ])

      const oldRow = await prisma.cognitiveSession.findUnique({ where: { id: sessionId } })
      const newRows = await prisma.cognitiveSession.findMany({
        where: { assignmentId, userId, status: 'IN_PROGRESS' },
      })

      expect(oldRow?.status).toBe('ABANDONED')
      expect(newRows.length).toBe(1) // 至多一个新 IN_PROGRESS attempt
      expect(r1.ok || r2.ok).toBe(true) // 至少一个成功
      // 另一个要么成功（幂等语义下不可能，锁内会因 ABANDONED 而 400/409），要么被拒
      const successCount = (r1.ok ? 1 : 0) + (r2.ok ? 1 : 0)
      expect(successCount).toBeGreaterThanOrEqual(1)
      expect(successCount).toBeLessThanOrEqual(2)
    }
  }, 120000)
})
