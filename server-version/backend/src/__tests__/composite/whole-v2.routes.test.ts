import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import { createHash, randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { buildFourFamilyTestSlots } from '../assessment-runtime/phase2-test-fixtures'
import {
  buildCompositePublicationPlan,
  generateCompositeUnitSeeds,
} from '../../modules/assessment-runtime/composite-publication-plan'

const checkpoints = new Map<string, any>()
const finals = new Map<string, any>()
const parentState = { status: 'IN_PROGRESS', attemptEpoch: 1, publicationHash: null as string | null }

vi.mock('../../config/database', () => {
  const mockDb: any = {
    $queryRaw: vi.fn(async (sql: any) => {
      const text = Array.isArray(sql?.strings) ? sql.strings.join('?') : String(sql?.sql ?? '')
      if (text.includes('FROM composite_assessment_attempts')) {
        return [{ ...parentState }]
      }
      if (text.includes('FROM composite_attempt_checkpoints')) {
        const row = checkpoints.get(sql.values[0])
        return row ? [{ ...row, lockedSlotKeys: [...row.lockedSlotKeys] }] : []
      }
      if (text.includes('FROM composite_attempt_finals')) {
        const [attemptId, attemptEpoch] = sql.values
        const row = finals.get(`${attemptId}:${attemptEpoch}`)
        return row ? [row] : []
      }
      return []
    }),
    $executeRaw: vi.fn(async (sql: any) => {
      const text = Array.isArray(sql?.strings) ? sql.strings.join('?') : String(sql?.sql ?? '')
      if (text.includes('INSERT INTO composite_attempt_checkpoints')) {
        const [attemptId, attemptEpoch, publicationHash, revision, saveCount, lockedSlotKeys, payloadCipher, payloadHash, expiresAt, updatedAt] = sql.values
        if (text.includes('ON CONFLICT') && checkpoints.has(attemptId)) return 0
        checkpoints.set(attemptId, { attemptId, attemptEpoch, publicationHash, revision, saveCount, lockedSlotKeys: [...lockedSlotKeys], payloadCipher, payloadHash, expiresAt, updatedAt })
        return 1
      }
      if (text.includes('UPDATE composite_attempt_checkpoints')) {
        const [attemptEpoch, publicationHash, revision, saveCount, lockedSlotKeys, payloadCipher, payloadHash, expiresAt, updatedAt, attemptId] = sql.values
        checkpoints.set(attemptId, { attemptId, attemptEpoch, publicationHash, revision, saveCount, lockedSlotKeys: [...lockedSlotKeys], payloadCipher, payloadHash, expiresAt, updatedAt })
        return 1
      }
      if (text.includes('DELETE FROM composite_attempt_checkpoints')) {
        const attemptId = sql.values[0]
        const existing = checkpoints.get(attemptId)
        if (!existing) return 0
        if (text.includes('cardinality(locked_slot_keys) = 0') && existing.lockedSlotKeys.length > 0) return 0
        checkpoints.delete(attemptId)
        return 1
      }
      if (text.includes('INSERT INTO composite_attempt_finals')) {
        const [attemptId, attemptEpoch, compositeId, organizationId, courseId, publicationHash, slotSetHash, contextHash, submissionId, payloadHash, aggregateHash, factsHash, factsCipher, rawHash, rawCipher, feedbackCipher, completedAt] = sql.values
        finals.set(`${attemptId}:${attemptEpoch}`, { attemptId, attemptEpoch, compositeId, organizationId, courseId, publicationHash, slotSetHash, contextHash, submissionId, payloadHash, aggregateHash, factsHash, factsCipher, rawHash, rawCipher, feedbackCipher, completedAt })
        return 1
      }
      return 1
    }),
    $transaction: vi.fn(async (fn: any) => fn(mockDb)),
    assessmentPublicTemplate: {
      findMany: vi.fn(async () => []),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
  }
  return { prisma: mockDb }
})

import { mountCompositeWholeV2Routes } from '../../modules/composite/whole-v2.routes'
import { resolveCompositePublicationPlanForAttempt } from '../../modules/composite/whole-v2.access'
import {
  clearCompositePublicationPlanCacheForTests,
  loadCompositePublicationPlan,
  saveCompositePublicationPlan,
} from '../../modules/assessment-runtime/composite-publication-plan'
import {
  createPublicTemplateStore,
  onCommittedStartTransaction,
  withCommittedStartTemplates,
} from '../../modules/assessment-runtime/public-templates'
import { RelationalAssessmentError } from '../../modules/assessment-relational/errors'
import { gonogoSequence } from '../../modules/cognitive/randomization'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

function makeGonogoTrials(randomSeed: string, count = 8) {
  return gonogoSequence(randomSeed, count, 0.25).map((trialType, idx) => ({
    schemaVersion: 1,
    trialIndex: idx,
    phase: 'test',
    startedAtPerfMs: idx * 1300,
    endedAtPerfMs: idx * 1300 + 360,
    durationMs: 360,
    flags: { timeout: false, premature: false },
    qualityEvents: [],
    payload: {
      trialType,
      responded: trialType !== 'nogo',
      rtMs: trialType === 'nogo' ? null : 350 + idx * 5,
      interrupted: false,
    },
  }))
}

async function startTestServer(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/test', router)
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  const port = (server.address() as AddressInfo).port
  return {
    baseUrl: `http://127.0.0.1:${port}/test`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
}

describe('whole-v2.routes HTTP contract', () => {
  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
    checkpoints.clear()
    finals.clear()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('serves /v2/whole, immutable /v2/whole/template/:hash, monotonic /v2/checkpoint, and fails closed on slot media', async () => {
    const fixture = buildFourFamilyTestSlots()
    const attemptId = randomUUID()
    const plan = buildCompositePublicationPlan({
      compositeId: randomUUID(),
      title: 'HTTP V2 路由测试卷',
      slots: fixture.slots,
    })
    parentState.status = 'IN_PROGRESS'
    parentState.attemptEpoch = 1
    parentState.publicationHash = plan.publicationHash
    const seeds = generateCompositeUnitSeeds(plan, attemptId, 1)!
    const router = express.Router()
    mountCompositeWholeV2Routes(router, {
      prefix: '/attempts',
      middleware: [],
      authorizeAttempt: async () => ({
        attempt: {
          id: attemptId,
          compositeAssessmentId: plan.compositeId,
          attemptEpoch: 1,
          publicationHash: plan.publicationHash,
          unitSeedsEncrypted: seeds.encrypted,
          receiptOnly: true,
          startedAt: new Date(),
        },
        plan,
        audience: 'authenticated',
      }),
    })

    const srv = await startTestServer(router)
    try {
      // 1. GET /v2/whole returns metadata + Cognitive unitSeeds + empty checkpoint
      const wholeRes = await fetch(`${srv.baseUrl}/attempts/${attemptId}/v2/whole`)
      expect(wholeRes.status).toBe(200)
      const wholeBody: any = await wholeRes.json()
      expect(wholeBody.data.executionMode).toBe('WHOLE_V2')
      expect(wholeBody.data.publicationHash).toBe(plan.publicationHash)
      expect(wholeBody.data.unitSeeds[`cognitive:${fixture.cogItemId}`]).toBe(seeds.seeds[`cognitive:${fixture.cogItemId}`])

      // 2. GET /v2/whole/template/:hash returns immutable cacheable 4-family runner template
      const tplRes = await fetch(`${srv.baseUrl}/attempts/${attemptId}/v2/whole/template/${plan.publicationHash}`)
      expect(tplRes.status).toBe(200)
      expect(tplRes.headers.get('cache-control')).toContain('immutable')
      const tplBody: any = await tplRes.json()
      expect(tplBody.data.units).toHaveLength(4)

      // 3A. PUT /v2/checkpoint rejects bad Cognitive seed BEFORE permanently locking (P1-10)
      const cogSlotKey = `cognitive:${fixture.cogItemId}`
      const badLockRes = await fetch(`${srv.baseUrl}/attempts/${attemptId}/v2/checkpoint`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: 0,
          attemptEpoch: 1,
          drafts: {},
          lockUnit: {
            slotKey: cogSlotKey,
            unit: {
              unitType: 'COGNITIVE',
              itemId: fixture.cogItemId,
              randomSeed: 'wrong-seed',
              trials: makeGonogoTrials(seeds.seeds[cogSlotKey], 8),
            },
          },
        }),
      })
      expect(badLockRes.status).toBe(409)

      // 3B. PUT /v2/checkpoint saves draft and locks valid Cognitive unit; DELETE is then blocked (409)
      const putRes = await fetch(`${srv.baseUrl}/attempts/${attemptId}/v2/checkpoint`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: 0,
          attemptEpoch: 1,
          drafts: { [`scale:${fixture.scaleItemId}`]: { q1: 2 } },
          lockUnit: {
            slotKey: cogSlotKey,
            unit: {
              unitType: 'COGNITIVE',
              itemId: fixture.cogItemId,
              randomSeed: seeds.seeds[cogSlotKey],
              trials: makeGonogoTrials(seeds.seeds[cogSlotKey], 8),
            },
          },
        }),
      })
      expect(putRes.status).toBe(200)
      const putBody: any = await putRes.json()
      expect(putBody.data.revision).toBe(1)
      expect(putBody.data.lockedSlotKeys).toEqual([cogSlotKey])

      const delRes = await fetch(`${srv.baseUrl}/attempts/${attemptId}/v2/checkpoint`, { method: 'DELETE' })
      expect(delRes.status).toBe(409)
      const delBody: any = await delRes.json()
      expect(delBody.code).toBe('CHECKPOINT_LOCKED_UNIT_IMMUTABLE')

      // 4. Slot media endpoints fail closed (404) for unknown asset/video
      const imgRes = await fetch(`${srv.baseUrl}/attempts/${attemptId}/slots/scale:${fixture.scaleItemId}/assets/${randomUUID()}/content`)
      expect(imgRes.status).toBe(404)
      const vidRes = await fetch(`${srv.baseUrl}/attempts/${attemptId}/slots/situational:${fixture.sjtItemId}/video-capabilities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ videoKey: 'missing-video' }),
      })
      expect(vidRes.status).toBe(404)

      // 5. POST /v2/whole/submit rejects invalid payload (missing required slots) with 400
      const badSubmitRes = await fetch(`${srv.baseUrl}/attempts/${attemptId}/v2/whole/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          submissionId: `whole-${sha('http-missing')}`,
          attemptEpoch: 1,
          publicationHash: plan.publicationHash,
          slotSetHash: plan.slotSetHash,
          units: {},
        }),
      })
      expect(badSubmitRes.status).toBe(400)

      // 6. Strict WHOLE_V2 isolation: legacy attempt without publicationHash is rejected (409)
      await expect(resolveCompositePublicationPlanForAttempt({
        compositeAssessmentId: plan.compositeId,
        publicationHash: null,
      })).rejects.toMatchObject({ statusCode: 409, code: 'STALE_ATTEMPT' })
    } finally {
      await srv.close()
    }
  })

  it('enforces persistencePolicy on plain drafts, replaceMiddlewareOnSubmit avoids double auth, and maps RelationalAssessmentError to 403/409', async () => {
    const fixture = buildFourFamilyTestSlots()
    const attemptId = randomUUID()
    const plan = buildCompositePublicationPlan({
      compositeId: randomUUID(),
      title: '治理策略与事务授权测试卷',
      slots: fixture.slots,
    })
    parentState.status = 'IN_PROGRESS'
    parentState.attemptEpoch = 1
    parentState.publicationHash = plan.publicationHash
    const seeds = generateCompositeUnitSeeds(plan, attemptId, 1)!
    const readMwCalls: string[] = []
    const submitMwCalls: string[] = []
    const router = express.Router()
    mountCompositeWholeV2Routes(router, {
      prefix: '/attempts',
      middleware: [(_req, _res, next) => { readMwCalls.push('read'); next() }],
      submitMiddleware: [(_req, _res, next) => { submitMwCalls.push('submit'); next() }],
      replaceMiddlewareOnSubmit: true,
      authorizeAttempt: async () => ({
        attempt: {
          id: attemptId,
          compositeAssessmentId: plan.compositeId,
          attemptEpoch: 1,
          publicationHash: plan.publicationHash,
          unitSeedsEncrypted: seeds.encrypted,
          receiptOnly: true,
          startedAt: new Date(),
        },
        plan,
        audience: 'authenticated',
        timingEnabled: false,
        persistencePolicy: {
          draftCheckpointEnabled: false,
          draftTtlHours: null,
          localCognitiveEnabled: false,
          localCognitiveTtlHours: null,
        },
        verifyAuthorityInTx: async () => {
          throw new RelationalAssessmentError('RELATIONAL_CONSENT_REQUIRED', 'accepted consent is required at relational FINAL')
        },
      }),
    })

    const srv = await startTestServer(router)
    try {
      // Plain draft PUT is rejected when draftCheckpointEnabled is false
      const plainPut = await fetch(`${srv.baseUrl}/attempts/${attemptId}/v2/checkpoint`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: 0,
          attemptEpoch: 1,
          drafts: { [`scale:${fixture.scaleItemId}`]: { q1: 1 } },
        }),
      })
      expect(plainPut.status).toBe(403)
      const plainBody: any = await plainPut.json()
      expect(plainBody.code).toBe('CHECKPOINT_NOT_ENABLED')

      // Mandatory Cognitive lockUnit is still allowed even when optional drafts are disabled
      const cogSlotKey = `cognitive:${fixture.cogItemId}`
      const lockPut = await fetch(`${srv.baseUrl}/attempts/${attemptId}/v2/checkpoint`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: 0,
          attemptEpoch: 1,
          drafts: { [`scale:${fixture.scaleItemId}`]: { q1: 1 } },
          lockUnit: {
            slotKey: cogSlotKey,
            unit: {
              unitType: 'COGNITIVE',
              itemId: fixture.cogItemId,
              randomSeed: seeds.seeds[cogSlotKey],
              trials: makeGonogoTrials(seeds.seeds[cogSlotKey], 8),
            },
          },
        }),
      })
      expect(lockPut.status).toBe(200)
      const lockBody: any = await lockPut.json()
      expect(lockBody.data.lockedSlotKeys).toEqual([cogSlotKey])
      // Drafts were stripped because draftCheckpointEnabled=false
      expect(lockBody.data.envelope.drafts).toEqual({})

      // Submit runs submitMiddleware ONCE (not read middleware!) and maps RelationalAssessmentError -> 409
      const readCountBefore = readMwCalls.length
      const submitRes = await fetch(`${srv.baseUrl}/attempts/${attemptId}/v2/whole/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          submissionId: `whole-${sha('consent-revoked')}`,
          attemptEpoch: 1,
          publicationHash: plan.publicationHash,
          slotSetHash: plan.slotSetHash,
          units: {},
        }),
      })
      expect(readMwCalls.length).toBe(readCountBefore)
      expect(submitMwCalls).toEqual(['submit'])
      expect(submitRes.status).toBe(409)
      const submitBody: any = await submitRes.json()
      expect(submitBody.code).toBe('RELATIONAL_CONSENT_REQUIRED')
    } finally {
      await srv.close()
    }
  })

  it('never populates global publication plan cache from a tx-local template store before commit (P1-01)', async () => {
    clearCompositePublicationPlanCacheForTests()
    const fixture = buildFourFamilyTestSlots()
    const plan = buildCompositePublicationPlan({
      compositeId: randomUUID(),
      title: '事务回滚不污染全局缓存测试卷',
      slots: fixture.slots,
    })
    const txRows = new Map<string, any>()
    const txStore = createPublicTemplateStore({
      read: async hashes => hashes.map(h => txRows.get(h)).filter(Boolean),
      append: async rows => { for (const r of rows) txRows.set(r.templateHash, r) },
    })
    // Saving through a tx-local store must NOT populate global planCache
    await saveCompositePublicationPlan(plan, txStore)
    const emptyCommittedStore = createPublicTemplateStore({
      read: async () => [],
      append: async () => {},
    })
    await expect(loadCompositePublicationPlan(plan.publicationHash, emptyCommittedStore))
      .rejects.toThrow('PUBLIC_TEMPLATE_UNAVAILABLE')

    // onCommittedStartTransaction only fires on commit, never on rollback
    let promoted = 0
    await expect(withCommittedStartTemplates(
      async work => {
        const fakeTx = {} as any
        await work(fakeTx)
        throw new Error('SIMULATED_ROLLBACK')
      },
      async tx => {
        onCommittedStartTransaction(tx, () => { promoted += 1 })
      },
    )).rejects.toThrow('SIMULATED_ROLLBACK')
    expect(promoted).toBe(0)

    await withCommittedStartTemplates(
      async work => work({} as any),
      async tx => {
        onCommittedStartTransaction(tx, () => { promoted += 1 })
      },
    )
    expect(promoted).toBe(1)
  })
})
