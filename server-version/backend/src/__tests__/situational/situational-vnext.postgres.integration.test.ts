import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { STANDARDIZED_SITUATIONAL_E2E_PACKAGE } from '../../modules/situational/fixtures/standardized-e2e-fixture'
import { captureFixture } from './vnext-capture-fixture'
import { decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'

const url = integrationDatabaseUrl('SITUATIONAL_VNEXT_INTEGRATION_DATABASE_URL', 'V32_3_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
suite('Situational VNext actual PostgreSQL FINAL and research authority', () => {
  let db: PrismaClient, runtime: typeof import('../../modules/situational/situational-runtime.service'), final: typeof import('../../modules/situational/situational-final-submit.service'), research: typeof import('../../modules/situational/situation-research-export')
  const users: string[] = [], attempts: string[] = []
  beforeAll(async () => {
    process.env.DATABASE_URL = url!; process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64); process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    db = new PrismaClient({ datasources: { db: { url: url! } } }); await db.$connect()
    vi.doMock('../../config/database', () => ({ prisma: db }))
    vi.doMock('../../modules/situational/situation-package.registry', async () => ({ ...(await vi.importActual<object>('../../modules/situational/situation-package.registry')), listSituationPackages: () => [STANDARDIZED_SITUATIONAL_E2E_PACKAGE], getSituationPackage: () => STANDARDIZED_SITUATIONAL_E2E_PACKAGE }))
    runtime = await import('../../modules/situational/situational-runtime.service'); final = await import('../../modules/situational/situational-final-submit.service'); research = await import('../../modules/situational/situation-research-export')
  }, 30000)
  afterAll(async () => {
    delete process.env.SITUATIONAL_RESEARCH_EXPORT_GRANTS
    if (db) { await db.situationalAttempt.deleteMany({ where: { id: { in: attempts } } }); await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect() }
  })
  async function user() {
    const id = randomUUID(); await db.user.create({ data: { id, username: `synthetic-vnext-${id}`, passwordHash: 'synthetic-not-login' } }); users.push(id); return id
  }
  async function start() {
    const userId = await user(), result = await runtime.startSituationalAttempt(userId, { instrumentKey: STANDARDIZED_SITUATIONAL_E2E_PACKAGE.key })
    attempts.push(result.attemptId)
    const fixture = captureFixture(STANDARDIZED_SITUATIONAL_E2E_PACKAGE.definition, result.attemptId)
    return { ...fixture, result, userId, payload: { attemptId: result.attemptId, userId, submissionId: randomUUID(), attemptEpoch: result.attempt.attemptEpoch, definitionHash: result.attempt.definitionHash, responses: fixture.responses, researchCapture: fixture.capture } }
  }
  it('stores one encrypted raw payload, one result, rich bounded coverage and exact replay under concurrent FINAL', async () => {
    const f = await start()
    expect(f.result.instrument).toHaveProperty('assignment.assignmentIdentity', f.assignment.assignmentIdentity)
    const results = await Promise.all([final.submitSituationalAttemptFinal(f.payload), final.submitSituationalAttemptFinal(f.payload)])
    expect(results.map(r => r.replayed).sort()).toEqual([false, true])
    const row = await db.situationalAttempt.findUniqueOrThrow({ where: { id: f.result.attemptId }, include: { rawSubmission: true } })
    expect(row.status).toBe('COMPLETED'); expect(await db.situationalRawSubmission.count({ where: { attemptId: row.id } })).toBe(1)
    const raw = decryptUnifiedRuntimePayload<any>(row.rawSubmission!.payloadEncrypted)
    expect(raw.responses).toHaveLength(4); expect(raw.researchCapture.events.length).toBe(f.capture.events.length)
    expect(raw).not.toHaveProperty('metrics'); expect(JSON.stringify(row.rawSubmission)).not.toContain('Synthetic probe')
    const resumed = await runtime.resumeSituationalAttempt(row.id, f.userId)
    expect(resumed.result!.metrics.map(m => m.value)).toEqual([1, 2])
    expect(resumed.result!.metrics[0]!.coverage!.numberOfIndependentScenes).toBe(1)
    expect(resumed.canonicalResult!.core.metrics[0]).not.toHaveProperty('coverage')
    await expect(final.submitSituationalAttemptFinal({ ...f.payload, researchCapture: { ...f.capture, events: f.capture.events.slice(1) } })).rejects.toThrow()
  })
  it('rejects omitted research evidence, altered assignments and stale response histories before any durable FINAL', async () => {
    const f = await start()
    await expect(final.submitSituationalAttemptFinal({ ...f.payload, researchCapture: undefined })).rejects.toThrow(/capture/)
    await expect(final.submitSituationalAttemptFinal({ ...f.payload, researchCapture: { ...f.capture, assignmentIdentity: 'f'.repeat(64) } })).rejects.toThrow(/identity/)
    const stale = structuredClone(f.payload); stale.responses[2]!.historyIdentity = 'f'.repeat(64)
    await expect(final.submitSituationalAttemptFinal(stale)).rejects.toThrow(/旧的测量历史/)
    expect(await db.situationalRawSubmission.count({ where: { attemptId: f.result.attemptId } })).toBe(0)
  })
  it('exports only explicitly granted synthetic resources and denies expiration, revocation and wrong actors', async () => {
    const f = await start(), researcher = await user()
    await final.submitSituationalAttemptFinal(f.payload)
    await expect(research.exportSituationalResearchAttempt(f.result.attemptId, researcher)).rejects.toMatchObject({ statusCode: 403 })
    const grant = { grantId: 'synthetic-resource-grant', researcherUserId: researcher, attemptIds: [f.result.attemptId], definitionHash: f.definitionHash, expiresAt: '2100-01-01T00:00:00.000Z', approvalReference: 'synthetic-test-only', projection: 'PSEUDONYMOUS_RAW_V1' }
    process.env.SITUATIONAL_RESEARCH_EXPORT_GRANTS = JSON.stringify([grant])
    const artifact = await research.exportSituationalResearchAttempt(f.result.attemptId, researcher)
    expect(artifact.rawResponses).toHaveLength(4); expect(artifact.instrument.definitionHash).toBe(f.definitionHash)
    expect(JSON.stringify(artifact)).not.toContain(f.userId); expect(JSON.stringify(artifact)).not.toContain(f.result.attemptId)
    await expect(research.exportSituationalResearchAttempt(f.result.attemptId, f.userId)).rejects.toMatchObject({ statusCode: 403 })
    await db.user.update({ where: { id: researcher }, data: { isFrozen: true } })
    await expect(research.exportSituationalResearchAttempt(f.result.attemptId, researcher)).rejects.toMatchObject({ statusCode: 403 })
    await db.user.update({ where: { id: researcher }, data: { isFrozen: false } })
    process.env.SITUATIONAL_RESEARCH_EXPORT_GRANTS = JSON.stringify([{ ...grant, expiresAt: '2000-01-01T00:00:00.000Z' }])
    await expect(research.exportSituationalResearchAttempt(f.result.attemptId, researcher)).rejects.toMatchObject({ statusCode: 403 })
    delete process.env.SITUATIONAL_RESEARCH_EXPORT_GRANTS
  })
})
