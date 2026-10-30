import { randomUUID } from 'node:crypto'
import express from 'express'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../config/database'
import { requireIsolatedReleaseDatabase, integrationDatabaseUrl } from '../integration/integration-env'
import { createDraft, updateDraft } from '../../modules/survey/builder.service'
import { createWave, getWave } from '../../modules/survey/waves.service'
import { prepareWave, openWave } from '../../modules/survey/waves.publish'
import { startSingleUnlinkedWave } from '../../modules/survey/admission.service'
import { submitResearchFinal } from '../../modules/survey/final.service'
import { getOwnResearchTask } from '../../modules/survey/task.public'
import { surveyAnalyticsRouter } from '../../modules/survey/analytics.routes'
import { generateToken } from '../../utils/jwt'
import { SURVEY_AUTH_COOKIE_NAME } from '../../utils/authCookies'
import * as security from '../../modules/assessment-runtime/security'
import type { FormDraft } from '../../modules/survey/builder.definition'
import { runtimeMetricLines } from '../../services/runtimeObservability'

const url = integrationDatabaseUrl('GROUP_REPORT_DATABASE_URL')
const suite = url ? describe : describe.skip
let server: Server | undefined
let base = '', ownerId = '', projectId = '', waveId = '', cookie = ''
let firstArtifact = ''
const suffix = randomUUID().slice(0, 8)
const flags = { publication: process.env.SURVEY_PUBLICATION_ENABLED, analytics: process.env.SURVEY_ANALYTICS_ENABLED, workspace: process.env.SURVEY_WORKSPACE_ENABLED }
const evidence: Record<string, unknown> = {}
const form: FormDraft = { schemaVersion: 2, pages: [{ pageKey: 'page', title: '学习体验', questions: [
  { itemKey: 'hours', type: 'NUMBER', prompt: '本周自习小时', required: true, options: [], rows: [] },
  { itemKey: 'activities', type: 'MULTIPLE', prompt: '参加的学习活动', required: true, options: [{ optionKey: 'read', label: '阅读' }, { optionKey: 'talk', label: '讨论' }], rows: [] },
] }] }
async function call(path = '', method = 'GET', body?: unknown, selectedCookie = cookie) {
  const response = await fetch(base + path, { method, headers: { cookie: selectedCookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: response.status, data: await response.json() as { data: Record<string, any>; message: string } }
}
suite('Survey generated group snapshot / real HTTP and PostgreSQL', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    process.env.SURVEY_PUBLICATION_ENABLED = 'true'; process.env.SURVEY_ANALYTICS_ENABLED = 'true'; process.env.SURVEY_WORKSPACE_ENABLED = 'true'
    const admin = await prisma.user.create({ data: { username: `group-admin-${suffix}`, passwordHash: 'synthetic-test', role: 'ADMIN', platformRole: 'SYSTEM_ADMIN' } })
    const owner = await prisma.user.create({ data: { username: `group-owner-${suffix}`, passwordHash: 'synthetic-test', role: 'STUDENT', accountDomain: 'SURVEY' } })
    ownerId = owner.id
    await prisma.surveyAccount.create({ data: { userId: ownerId, loginName: `group-${suffix}`, normalizedLogin: `group-${suffix}` } })
    await prisma.surveyResearcherGrant.create({ data: { userId: ownerId, status: 'ACTIVE', grantedBy: admin.id } })
    await prisma.surveyMfaCredential.create({ data: { userId: ownerId, enabled: true, secretCipher: 'synthetic-test-only' } })
    projectId = randomUUID()
    await prisma.surveyProject.create({ data: { id: projectId, ownerUserId: ownerId, title: '群体报告合成项目', collectionMode: 'SINGLE_UNLINKED' } })
    const draftId = randomUUID()
    await createDraft(ownerId, projectId, { requestId: draftId, kind: 'FORM', instrumentKey: 'learning', title: '学习体验表单' })
    await updateDraft(ownerId, projectId, draftId, { revision: 0, title: '学习体验表单', definition: form })
    const wave = await createWave(ownerId, projectId, { requestId: randomUUID(), title: '第一次施测', consentText: '本次合成研究仅用于验证群体报告功能，参与完全自愿，您可随时停止并退出，不影响任何学习安排。',
      generalText: '感谢参与合成研究。', linkageNoticeConfirmed: false, instrumentIds: [draftId] })
    waveId = wave.id
    await prepareWave(ownerId, projectId, waveId, wave.revision)
    const prepared = await getWave(ownerId, projectId, waveId), opened = await openWave(ownerId, projectId, waveId, prepared.revision)
    for (const [hours, activities] of [[0, ['read', 'talk']], [2, ['read']]] as const) {
      const participant = await startSingleUnlinkedWave({ publicId: opened.publicId, waveId, entryToken: opened.entrySecret, consentVersion: 1, consent: true })
      const task = await getOwnResearchTask({ publicId: opened.publicId, attemptId: participant.attemptId, accessCredential: participant.accessCredential })
      await submitResearchFinal({ publicId: opened.publicId, attemptId: participant.attemptId, accessCredential: participant.accessCredential, submissionId: randomUUID(),
        answers: { [task.units[0].instrumentKey]: { hours, activities: [...activities] } } })
    }
    cookie = `${SURVEY_AUTH_COOKIE_NAME}=${generateToken({ userId: ownerId, username: owner.username, role: owner.role, accountDomain: 'SURVEY', tokenVersion: owner.tokenVersion, mfaVerifiedAt: Math.floor(Date.now() / 1000) })}`
    const app = express(); app.use(express.json()); app.use('/api/survey/projects', surveyAnalyticsRouter)
    server = app.listen(0, '127.0.0.1')
    await new Promise<void>(resolve => server!.once('listening', resolve))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/survey/projects/${projectId}/analytics/waves/${waveId}/group-reports`
  }, 60000)
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()))
    process.env.SURVEY_PUBLICATION_ENABLED = flags.publication; process.env.SURVEY_ANALYTICS_ENABLED = flags.analytics; process.env.SURVEY_WORKSPACE_ENABLED = flags.workspace
    await prisma.$disconnect()
    console.log('GROUP_REPORT_COMPARISON', JSON.stringify(evidence))
  })
  it('generates the real Form report, then reopens without FINAL decryption or regeneration', async () => {
    const catalog = await call(); expect(catalog.status).toBe(200); expect(catalog.data.data.tools[0].instrumentKey).toBe('learning')
    const decrypt = vi.spyOn(security, 'decryptUnifiedRuntimePayload')
    const transaction = vi.spyOn(prisma, '$transaction')
    const start = performance.now(), generated = await call('', 'POST', { instrumentKey: 'learning' })
    evidence.generation = { ms: performance.now() - start, transactions: transaction.mock.calls.length, decryptions: decrypt.mock.calls.length }
    expect(generated.status).toBe(200)
    const snapshot = generated.data.data
    firstArtifact = snapshot.artifactId
    expect(snapshot.projection).toMatchObject({ completedN: 2, assignedN: null, countUnit: 'RESPONSE' })
    expect(snapshot.projection.metrics[0]).toMatchObject({ key: 'hours', validN: 2, mean: 1 })
    expect(snapshot.projection.metrics[1].frequencies.map((cell: { proportion: number }) => cell.proportion)).toEqual([1, .5])
    transaction.mockClear(); decrypt.mockClear()
    const readStart = performance.now(), read = await call('/' + firstArtifact)
    evidence.read = { ms: performance.now() - readStart, transactions: transaction.mock.calls.length, decryptions: decrypt.mock.calls.length }
    expect(read.status).toBe(200); expect(read.data.data).toEqual(snapshot)
    expect(decrypt).toHaveBeenCalledTimes(1) // Only the aggregate artifact, no participant FINALs.
    expect(transaction).toHaveBeenCalledTimes(1)
    decrypt.mockRestore(); transaction.mockRestore()
  })
  it('creates a new version while preserving the old report and enforces actual owner/withdrawal boundaries', async () => {
    // Also usable as a targeted continuation without replaying the timing case.
    if (!firstArtifact) firstArtifact = (await call('', 'POST', { instrumentKey: 'learning' })).data.data.artifactId
    expect(firstArtifact).toBeTruthy()
    const updated = await call('', 'POST', { instrumentKey: 'learning' })
    expect(updated.status).toBe(200); expect(updated.data.data.artifactId).not.toBe(firstArtifact)
    expect((await call('/' + firstArtifact)).status).toBe(200)
    const count = await prisma.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM reporting_task_artifacts WHERE container_id=${projectId}`
    expect(count[0].n).toBe(2)
    const stranger = await prisma.user.create({ data: { username: `group-stranger-${suffix}`, passwordHash: 'synthetic-test', role: 'STUDENT', accountDomain: 'SURVEY' } })
    await prisma.surveyAccount.create({ data: { userId: stranger.id, loginName: `stranger-${suffix}`, normalizedLogin: `stranger-${suffix}` } })
    await prisma.surveyResearcherGrant.create({ data: { userId: stranger.id, status: 'ACTIVE', grantedBy: ownerId } })
    await prisma.surveyMfaCredential.create({ data: { userId: stranger.id, enabled: true, secretCipher: 'synthetic-test-only' } })
    const denied = `${SURVEY_AUTH_COOKIE_NAME}=${generateToken({ userId: stranger.id, username: stranger.username, role: stranger.role, accountDomain: 'SURVEY', tokenVersion: stranger.tokenVersion, mfaVerifiedAt: Math.floor(Date.now() / 1000) })}`
    expect((await call('/' + firstArtifact, 'GET', undefined, denied)).status).toBe(404)
    expect((await call('/' + firstArtifact, 'GET', undefined, '')).status).toBe(401)
    const attempt = await prisma.surveyWaveAttempt.findFirstOrThrow({ where: { projectId, waveId } })
    await prisma.surveyWaveAttempt.update({ where: { id: attempt.id }, data: { excludedAt: new Date() } })
    expect((await call('/' + firstArtifact)).status).toBe(409)
    await expect(prisma.$executeRaw`UPDATE reporting_task_artifacts SET payload_hash='changed' WHERE id=${firstArtifact}`).rejects.toThrow()
  })
  it('counts SQL for one generated report and its snapshot read without repeating the application assertions', async () => {
    const count = () => Number(runtimeMetricLines().find(line => line.startsWith('ptool_prisma_sql_events_total '))?.split(' ')[1])
    if (!Number.isFinite(count())) throw new Error('Explicit isolated count-only SQL instrumentation required')
    const before = count(), start = performance.now()
    const generated = await call('', 'POST', { instrumentKey: 'learning' })
    const middle = count(), generationMs = performance.now() - start
    const readStart = performance.now()
    const read = await call('/' + generated.data.data.artifactId)
    const after = count()
    evidence.sqlComparison = { generation: { sqlEvents: middle - before, ms: generationMs }, read: { sqlEvents: after - middle, ms: performance.now() - readStart },
      unit: 'SQL events including transaction statements; not network round trips', syntheticN: 2 }
    expect(generated.status).toBe(200); expect(read.status).toBe(200)
    expect(after - middle).toBeGreaterThan(0); expect(after - middle).toBeLessThan(middle - before)
  })
})
