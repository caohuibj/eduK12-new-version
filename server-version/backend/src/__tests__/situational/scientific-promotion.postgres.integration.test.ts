import { declareScience } from './fixtures/scientific-source'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { discoverSources } from '../../../scripts/generate-situational-instruments.mjs'
import { unknownSource, publish } from './fixtures/unknown-source'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { compositeItemSlotKey } from '../../modules/assessment-runtime/slot-set'

const databaseUrl = integrationDatabaseUrl('SITUATIONAL_ONBOARDING_INTEGRATION_DATABASE_URL', 'V32_3_INTEGRATION_DATABASE_URL')
const suite = databaseUrl ? describe : describe.skip
suite('scientific promotion: real standalone and Bundle frozen history', () => {
  let db: PrismaClient
  let runtime: typeof import('../../modules/situational/situational-runtime.service')
  let final: typeof import('../../modules/situational/situational-final-submit.service')
  let composite: typeof import('../../modules/composite/composite.service')
  let registry: typeof import('../../modules/situational/situation-package.registry')
  const sources = [publish(unknownSource(1)), publish(unknownSource(2))]
  const users: string[] = [], courses: string[] = [], composites: string[] = []
  beforeAll(async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'unknown-sjt-pg-'))
    try {
      for (const source of sources) {
        const dir = path.join(root, source.content.identity.instrumentKey, source.content.identity.instrumentVersion); mkdirSync(dir, { recursive: true })
        for (const [name, value] of Object.entries({ instrument: source.content, publication: source.publication, scientific: source.scientific })) writeFileSync(path.join(dir, name + '.json'), JSON.stringify(value))
      }
      expect(discoverSources(root)).toHaveLength(2)
      // Only the generated data input is substituted in this isolated worker.
      // Real registry, gate, selector, scorer, compiler, FINAL and report are used.
      vi.doMock('../../modules/situational/onboarding/instruments.generated', () => ({ GENERATED_SITUATIONAL_INSTRUMENT_SOURCES: sources }))
      vi.doMock('../../modules/situational/onboarding/scientific-registry', async () => {
        const actual = await vi.importActual<typeof import('../../modules/situational/onboarding/scientific-registry')>('../../modules/situational/onboarding/scientific-registry')
        // Simulate a new deployment of declarations; keep real validation, resolver and lifecycle.
        return { ...actual, getSituationalScientificDeclaration: (key: string, version: string) => actual.createSituationalScientificRegistry(sources).get(key, version) }
      })
      process.env.DATABASE_URL = databaseUrl!
      process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
      process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
      db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } }); await db.$connect()
      registry = await import('../../modules/situational/situation-package.registry')
      runtime = await import('../../modules/situational/situational-runtime.service')
      final = await import('../../modules/situational/situational-final-submit.service')
      composite = await import('../../modules/composite/composite.service')
    } finally { rmSync(root, { recursive: true, force: true }) }
  }, 120000)
  afterAll(async () => {
    if (!db) return
    await db.situationalAttempt.deleteMany({ where: { userId: { in: users } } })
    await db.compositeAssessmentAttempt.deleteMany({ where: { compositeAssessmentId: { in: composites } } })
    await db.compositeAssessment.deleteMany({ where: { id: { in: composites } } })
    await db.courseStudent.deleteMany({ where: { courseId: { in: courses } } })
    await db.course.deleteMany({ where: { id: { in: courses } } })
    await db.user.deleteMany({ where: { id: { in: users } } })
    await db.$disconnect()
  })
  it.each([0, 1])('completes unknown version fixture %s through frozen standalone and embedded FINAL', async index => {
    const source = sources[index]!, id = source.content.identity, golden = source.content.goldenCases[0]!
    let baseline: unknown
    let pending: { started: Awaited<ReturnType<typeof runtime.startSituationalAttempt>>; userId: string } | undefined
    const priorBundles: Array<{ row: any; maturity: string; revision: number }> = []
    const priorAttempts: Array<{ id: string; user: string; maturity: string; revision: number }> = []
    for (const [tierIndex, tier] of (['PILOT', 'RESEARCH_READY', 'RESEARCH_GRADE', 'PILOT'] as const).entries()) {
    declareScience(source, tier, tierIndex + 3)
    if (tierIndex === 3) { source.scientific.evidence = []; source.scientific.changeReason = 'Withdraw research evidence' }
    for (const prior of priorBundles) expect(composite.buildCompositeReport(prior.row).unitReports[0]).toMatchObject({ scientificContext: { scientificMaturity: prior.maturity, governanceRevision: prior.revision } })
    if (pending && tierIndex === 1) {
      expect((await runtime.resumeSituationalAttempt(pending.started.attemptId, pending.userId)).instrument.scientificContext).toMatchObject({ scientificMaturity: 'PILOT', governanceRevision: 3 })
      const old = pending.started
      const completed = await final.submitSituationalAttemptFinal({ attemptId: old.attemptId, userId: pending.userId, submissionId: randomUUID(), attemptEpoch: old.attempt.attemptEpoch, definitionHash: old.instrument.definitionHash, instrumentVersion: id.instrumentVersion, compiledRuntimeHash: old.instrument.compiledRuntimeHash, scoringVersion: old.instrument.scoringVersion, responses: golden.responses })
      expect(completed.instrument.scientificContext).toMatchObject({ scientificMaturity: 'PILOT', governanceRevision: 3 })
    }
    const userId = 'sjt-promotion-' + randomUUID(); users.push(userId)
    await db.user.create({ data: { id: userId, username: userId, passwordHash: 'isolated-test-only' } })
    expect(runtime.listSituationalInstruments().find(p => p.key === id.instrumentKey)?.definition.schemaVersion).toBe(index + 1)
    const started = await runtime.startSituationalAttempt(userId, id)
    expect(started.instrument.scientificContext).toMatchObject({ scientificMaturity: tier, governanceRevision: tierIndex + 3, provenance: 'FROZEN' })
    for (const prior of priorAttempts) expect((await runtime.resumeSituationalAttempt(prior.id, prior.user)).instrument.scientificContext).toMatchObject({ scientificMaturity: prior.maturity, governanceRevision: prior.revision })
    priorAttempts.push({ id: started.attemptId, user: userId, maturity: tier, revision: tierIndex + 3 })
    expect((await runtime.resumeSituationalAttempt(started.attemptId, userId)).attempt.status).toBe('IN_PROGRESS')
    const input = { attemptId: started.attemptId, userId, submissionId: randomUUID(), attemptEpoch: started.attempt.attemptEpoch, definitionHash: started.instrument.definitionHash, instrumentVersion: id.instrumentVersion, compiledRuntimeHash: started.instrument.compiledRuntimeHash, scoringVersion: started.instrument.scoringVersion, responses: golden.responses }
    const done = await final.submitSituationalAttemptFinal(input)
    const execution = { definitionHash: started.instrument.definitionHash, compiledRuntimeHash: started.instrument.compiledRuntimeHash, definition: started.instrument.definition, report: started.instrument.report, result: done.result, canonicalCore: done.canonicalResult?.core }
    if (tierIndex === 0) baseline = execution
    else expect(execution).toEqual(baseline)
    expect(done.result?.quality.status).toBe(golden.expected.quality)
    expect(Object.fromEntries(done.result!.metrics.map(m => [m.key, m.value]))).toEqual(golden.expected.metrics)
    expect((await final.submitSituationalAttemptFinal(input)).replayed).toBe(true)
    expect((await runtime.listSituationalHistory(userId)).list.find(p => p.attemptId === started.attemptId)?.instrument.scientificContext).toMatchObject({ scientificMaturity: tier, governanceRevision: tierIndex + 3 })
    expect((await runtime.resumeSituationalAttempt(started.attemptId, userId)).canonicalResult?.resultHash).toBe(done.canonicalResult?.resultHash)
    const course = await db.course.create({ data: { title: userId, courseCode: userId, status: 'PUBLISHED', creatorId: userId } }); courses.push(course.id)
    await db.courseStudent.create({ data: { courseId: course.id, studentId: userId, status: 'ACTIVE' } })
    const bundle = await db.compositeAssessment.create({ data: { code: userId, name: userId, status: 'PUBLISHED', courseId: course.id, createdBy: userId, maxAttempts: 1, publishedAt: new Date() } }); composites.push(bundle.id)
    const item = await db.compositeAssessmentItem.create({ data: { compositeAssessmentId: bundle.id, type: 'SITUATIONAL', position: 0, required: true, situationalInstrumentKey: id.instrumentKey, situationalInstrumentVersion: id.instrumentVersion } })
    const parent = await composite.startUserAttempt(userId, bundle.id)
    const child = await db.situationalAttempt.findUniqueOrThrow({ where: { compositeAttemptId_compositeItemId: { compositeAttemptId: parent.attempt.id, compositeItemId: item.id } } })
    const embedded = { compositeAttemptId: parent.attempt.id, compositeItemId: item.id, compositeSlotKey: compositeItemSlotKey(item.id, 'SITUATIONAL'), userId }
    // Retirement blocks new admission but cannot break an already frozen child.
    const live = registry.getSituationPackage(id.instrumentKey, id.instrumentVersion)!
    live.releaseStatus = 'RETIRED'
    expect((await composite.getAttemptState(parent.attempt.id, { userId })).status).toBe('IN_PROGRESS')
    await expect(runtime.startSituationalAttempt(userId, id)).rejects.toBeDefined()
    expect((await runtime.loadEmbeddedSituationalAttemptRuntime(child.id, embedded)).row.id).toBe(child.id)
    const childInput = { attemptId: child.id, userId, submissionId: randomUUID(), attemptEpoch: child.attemptEpoch, definitionHash: child.definitionHash, instrumentVersion: child.instrumentVersion, compiledRuntimeHash: child.compiledRuntimeHash, scoringVersion: child.scoringVersion, responses: golden.responses, embedded }
    expect((await final.submitSituationalAttemptFinal(childInput)).attempt.status).toBe('COMPLETED')
    expect((await final.submitSituationalAttemptFinal(childInput)).replayed).toBe(true)
    expect((await composite.getAttemptState(parent.attempt.id, { userId })).status).toBe('COMPLETED')
    const row = await db.compositeAssessmentAttempt.findUnique({ where: { id: parent.attempt.id }, include: { compositeAssessment: { include: { items: true, formSections: { include: { items: true } } } }, scaleAssessments: { include: { scale: true } }, cognitiveSessions: true, formAnswers: true, formSectionAttempts: true, situationalAttempts: true } })
    expect(composite.buildCompositeReport(row).unitReports[0]).toMatchObject({ type: 'SITUATIONAL', instrumentKey: id.instrumentKey, scientificContext: { scientificMaturity: tier, governanceRevision: tierIndex + 3, provenance: 'FROZEN' } })
    priorBundles.push({ row, maturity: tier, revision: tierIndex + 3 })
    live.releaseStatus = 'PUBLISHED'
    if (tierIndex === 0) pending = { started: await runtime.startSituationalAttempt(userId, id), userId }
    }
  }, 120000)
})
