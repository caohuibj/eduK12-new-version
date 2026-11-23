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

vi.mock('../../config/database', () => {
  const mockDb: any = {
    $queryRaw: vi.fn(async (sql: any) => {
      const text = Array.isArray(sql?.strings) ? sql.strings.join('?') : String(sql?.sql ?? '')
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
        checkpoints.set(attemptId, { attemptId, attemptEpoch, publicationHash, revision, saveCount, lockedSlotKeys: [...lockedSlotKeys], payloadCipher, payloadHash, expiresAt, updatedAt })
        return 1
      }
      if (text.includes('UPDATE composite_attempt_checkpoints')) {
        const [attemptEpoch, publicationHash, revision, saveCount, lockedSlotKeys, payloadCipher, payloadHash, expiresAt, updatedAt, attemptId] = sql.values
        checkpoints.set(attemptId, { attemptId, attemptEpoch, publicationHash, revision, saveCount, lockedSlotKeys: [...lockedSlotKeys], payloadCipher, payloadHash, expiresAt, updatedAt })
        return 1
      }
      if (text.includes('DELETE FROM composite_attempt_checkpoints')) {
        checkpoints.delete(sql.values[0])
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

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

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

      // 3. PUT /v2/checkpoint saves draft and locks Cognitive unit; DELETE is then blocked (409)
      const cogSlotKey = `cognitive:${fixture.cogItemId}`
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
              trials: [],
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
    } finally {
      await srv.close()
    }
  })
})
