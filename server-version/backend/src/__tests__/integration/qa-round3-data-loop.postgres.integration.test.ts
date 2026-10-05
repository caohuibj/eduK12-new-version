import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import express from 'express'
import type { Server } from 'node:http'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { UserRole } from '../../types'

vi.mock('../../config/queue', () => ({ exportQueue: { getJob: vi.fn(), add: vi.fn() }, videoQueue: {}, imageQueue: {} }))
const url = integrationDatabaseUrl('INSTRUMENT_FINAL_INTEGRATION_DATABASE_URL', 'PR38_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
let db: PrismaClient
let server: Server
let base = ''
let owner = '', other = '', scaleId = '', configId = '', sourceId = ''
const composites: string[] = [], assignments: string[] = []
let getScaleExportData: typeof import('../../services/exportService')['getScaleExportData']
let listCollections: typeof import('../../modules/cognitive/collection-data.service')['listCognitiveCollections']
let listReports: typeof import('../../modules/cognitive/professional-report.service')['listProfessionalReports']
let buildResult: typeof import('../../modules/scale/scale-workflow.service')['buildScaleResultForRecord']
let encryptAnswers: typeof import('../../modules/scale/scale-workflow.service')['encryptScaleAnswers']
let encryptResult: typeof import('../../modules/scale/scale-workflow.service')['encryptScaleResult']
let encryptCognitive: typeof import('../../modules/cognitive/cognitive.security')['encryptCognitivePayload']
let definition: ReturnType<typeof import('../../modules/scale/scale-definition')['createCustomScaleDefinition']>
let frozenReport: string

async function collection(actor = owner, assignmentRef: string | null = null, packageKey: string | null = null) {
  const row = await db.compositeAssessment.create({ data: {
    code: 'r3-' + randomUUID(), name: 'R3 ordinary collection', createdBy: actor,
    productKind: packageKey ? 'LEGACY_COMPOSITE' : 'QUESTIONNAIRE', questionnaireType: packageKey ? null : 'GENERAL',
    status: 'ARCHIVED', reportPackageKey: packageKey,
    ...(packageKey ? { reportPackageVersion: '1.0.0', reportPackageProfile: 'standard' } : {}),
  } })
  composites.push(row.id)
  const attempt = await db.compositeAssessmentAttempt.create({ data: {
    compositeAssessmentId: row.id, participantKey: 'fixture-' + randomUUID(), status: 'COMPLETED', completedAt: new Date(),
    assignmentRef,
  } })
  return { row, attempt }
}
async function completedScale(parent: Awaited<ReturnType<typeof collection>>) {
  const scale = await db.scale.findUniqueOrThrow({ where: { id: scaleId } })
  const answers = [3, 4, 3].map((value, index) => ({ itemCode: 'Q' + (index + 1), responseValue: 'option_' + value }))
  const result = await buildResult({ scale, answers })
  await db.assessment.create({ data: {
    scaleId, compositeAttemptId: parent.attempt.id, status: 'COMPLETED', progress: 100,
    completedAt: new Date(), answers: encryptAnswers(answers), result: encryptResult(result),
  } })
  return result
}
async function embeddedCognitive(parent: Awaited<ReturnType<typeof collection>>, report = frozenReport) {
  const wrapper = await db.cognitiveAssignment.create({ data: {
    configId, createdBy: parent.row.createdBy, title: 'Repeated visible title',
    status: 'PUBLISHED', listedStandalone: false, profile: 'standard', profileDefinitionVersion: 'p1',
    resolvedConfigHash: 'a'.repeat(64), resolvedConfigSnapshotEncrypted: encryptCognitive({ trialCount: 20 }),
    resolvedReportSnapshotEncrypted: report,
  } })
  assignments.push(wrapper.id)
  const item = await db.compositeAssessmentItem.create({ data: {
    compositeAssessmentId: parent.row.id, type: 'COGNITIVE', position: 0, cognitiveAssignmentId: wrapper.id,
  } })
  const frozenPresentation = { title: '冻结反应报告', qualityState: 'limited', conclusion: '本次数据不足以稳定解释',
    disclaimer: '描述性结果', practicalTips: [], headline: [], user: [], detail: [], quality: [], method: { testType: 'reaction' } }
  await db.cognitiveSession.create({ data: {
    configId, assignmentId: wrapper.id, compositeAttemptId: parent.attempt.id, compositeItemId: item.id,
    participantKey: 'r3-' + randomUUID(), testType: 'reaction', configVersion: '1.0.0', engineVersion: '1.0.0',
    scoringVersion: '1.0.0', configSnapshotEncrypted: encryptCognitive({}), randomSeed: 'fixture-only',
    status: 'COMPLETED', finishedAt: new Date(), resultSnapshotEncrypted: encryptCognitive({
      schemaVersion: 1, testType: 'reaction', configVersion: '1.0.0', engineVersion: '1.0.0', scoringVersion: '1.0.0',
      profile: 'standard', completedAt: new Date().toISOString(), protocolSignature: 'b'.repeat(64),
      quality: { state: 'limited', flags: {}, reasons: [] }, metrics: {}, report: frozenPresentation, references: [], assessmentContext: null,
    }),
  } })
}

suite('round 3 persisted definitions and owned embedded export scopes', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url!
    requireIsolatedReleaseDatabase(url!)
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    db = (await import('../../config/database')).prisma
    const workflow = await import('../../modules/scale/scale-workflow.service')
    buildResult = workflow.buildScaleResultForRecord; encryptAnswers = workflow.encryptScaleAnswers; encryptResult = workflow.encryptScaleResult
    encryptCognitive = (await import('../../modules/cognitive/cognitive.security')).encryptCognitivePayload
    getScaleExportData = (await import('../../services/exportService')).getScaleExportData
    listCollections = (await import('../../modules/cognitive/collection-data.service')).listCognitiveCollections
    listReports = (await import('../../modules/cognitive/professional-report.service')).listProfessionalReports
    owner = (await db.user.create({ data: { username: 'r3-owner-' + randomUUID(), passwordHash: 'test-only-unused', role: 'TEACHER' } })).id
    other = (await db.user.create({ data: { username: 'r3-other-' + randomUUID(), passwordHash: 'test-only-unused', role: 'TEACHER' } })).id
    definition = (await import('../../modules/scale/scale-definition')).createCustomScaleDefinition()
    definition.responseSets[0].options = definition.responseSets[0].options.slice(0, 4)
    definition.items = ['Q1', 'Q2', 'Q3'].map((itemCode, index) => ({
      itemCode, content: itemCode, type: 'single', required: true, sortOrder: index + 1, responseSetKey: 'default', randomizeOptions: false,
    }))
    definition.scoring.itemRules = definition.items.map(item => ({ itemCode: item.itemCode, transform: { type: 'identity' } }))
    definition.scoring.scores = [{ key: 'total_1', type: 'total', label: '总分', direction: 'descriptive',
      canonical: true, displayPrecision: 1, source: { type: 'items', aggregation: 'sum', items: definition.items.map(item => ({ itemCode: item.itemCode, weight: 1 })) } }]
    definition.report.primaryScoreKeys = ['total_1']; definition.report.scoreOrder = ['total_1']
    definition.report.interpretations = [{ scoreKey: 'total_1', headline: '总分', source: { type: 'score_only' }, summary: '描述性总分', bands: [], guidance: [] }]
    scaleId = (await db.scale.create({ data: { code: 'r3-' + randomUUID(), name: 'R3 scale', creatorId: owner, definition: definition as any } })).id
    configId = (await db.cognitiveTestConfig.create({ data: { testType: 'reaction', configVersion: 'r3-' + randomUUID(),
      name: 'R3 isolated config', status: 'PUBLISHED', engineVersion: '1.0.0', scoringVersion: '1.0.0' } })).id
    frozenReport = encryptCognitive({ reportVersion: 'p1' })
    sourceId = (await db.cognitiveAssignment.create({ data: { configId, createdBy: owner, title: 'Original task', status: 'ARCHIVED',
      profile: 'standard', profileDefinitionVersion: 'p1', resolvedConfigHash: 'a'.repeat(64),
      resolvedConfigSnapshotEncrypted: encryptCognitive({ trialCount: 20 }), resolvedReportSnapshotEncrypted: frozenReport } })).id
    assignments.push(sourceId)
    const controller = (await import('../../controllers/scaleController')).scaleController
    const app = express(); app.use(express.json())
    app.use((req, _res, next) => { req.user = { userId: owner, role: UserRole.TEACHER }; next() })
    app.put('/scales/:id/definition', controller.updateDefinition)
    server = await new Promise<Server>(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)) })
    base = 'http://127.0.0.1:' + (server.address() as { port: number }).port
  })
  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
    if (!db) return
    await db.cognitiveSession.deleteMany({ where: { assignmentId: { in: assignments } } })
    await db.assessment.deleteMany({ where: { scaleId } })
    await db.compositeAssessment.deleteMany({ where: { id: { in: composites } } })
    await db.cognitiveAssignment.deleteMany({ where: { id: { in: assignments } } })
    if (configId) await db.cognitiveTestConfig.delete({ where: { id: configId } })
    if (scaleId) await db.scale.delete({ where: { id: scaleId } })
    await db.user.deleteMany({ where: { id: { in: [owner, other].filter(Boolean) } } })
    await db.$disconnect()
  })
  it('saves all selected score items through HTTP and computes frozen 10 with range 3–12 from the persisted definition', async () => {
    const response = await fetch(base + '/scales/' + scaleId + '/definition', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ definition }) })
    expect(response.status).toBe(200)
    expect((await response.json() as any).code).toBe(0)
    const stored = await db.scale.findUniqueOrThrow({ where: { id: scaleId } })
    expect((stored.definition as any).scoring.scores[0].source.items.map((item: any) => item.itemCode)).toEqual(['Q1', 'Q2', 'Q3'])
    const result = await completedScale(await collection())
    expect(result.scores[0]).toMatchObject({ value: 10, range: { min: 3, max: 12 }, expectedItems: ['Q1', 'Q2', 'Q3'] })
  })
  it('exports owned ordinary embedded results but excludes another teacher, organization assignment and report package', async () => {
    await completedScale(await collection(other))
    await completedScale(await collection(owner, 'organization-task'))
    await completedScale(await collection(owner, null, 'group-package'))
    expect((await getScaleExportData(scaleId)).rows).toHaveLength(0)
    const projected = await getScaleExportData(scaleId, { actor: { userId: owner } })
    expect(projected.rows).toHaveLength(1)
    expect(projected.rows[0]).toHaveProperty('SCORE_total1', 10)
    expect((await getScaleExportData(scaleId, { actor: { userId: other } })).rows).toHaveLength(1)
    const directory = await mkdtemp(join(tmpdir(), 'eduk12-r3-export-'))
    try {
      const { writeExportDataFile } = await import('../../services/exportService')
      for (const format of ['csv', 'sav', 'sps'] as const) {
        const file = join(directory, 'results.' + format)
        await writeExportDataFile(file, projected, format)
        const bytes = await readFile(file)
        expect(bytes.length).toBeGreaterThan(0)
        if (format === 'sav') expect(bytes.subarray(0, 4).toString()).toBe('$FL2')
        else expect(bytes.toString()).toContain('SCORE_total1')
      }
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('lists and reads the owned same-version hidden task result without changing the archived source task or granting another owner access', async () => {
    const selected = await collection()
    await embeddedCognitive(selected)
    await embeddedCognitive(await collection(other))
    await embeddedCognitive(await collection(owner, 'organization-task'))
    await embeddedCognitive(await collection(), encryptCognitive({ reportVersion: 'another-report' }))
    const scopes = await listCollections({ userId: owner, role: UserRole.TEACHER, assignmentId: sourceId })
    expect(scopes.find(scope => scope.id === selected.row.id)?.completedCount).toBe(1)
    expect(scopes.filter(scope => scope.completedCount > 0)).toHaveLength(1)
    const reports = await listReports({ userId: owner, role: UserRole.TEACHER, assignmentId: sourceId, collectionId: selected.row.id, offset: 0 })
    expect(reports.total).toBe(1)
    expect(reports.records[0].report?.conclusion).toBe('本次数据不足以稳定解释')
    await expect(listReports({ userId: other, role: UserRole.TEACHER, assignmentId: sourceId, collectionId: selected.row.id, offset: 0 })).rejects.toMatchObject({ statusCode: 403 })
    const original = await db.cognitiveAssignment.findUniqueOrThrow({ where: { id: sourceId } })
    expect(original).toMatchObject({ status: 'ARCHIVED', listedStandalone: true })
  })
})
