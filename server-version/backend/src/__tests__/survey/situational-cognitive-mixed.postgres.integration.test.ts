import {grantGovernedCatalogFixture,revokeGovernedCatalogFixture} from '../fixtures/governed-catalog'
import { randomBytes, randomUUID } from 'node:crypto'
import { PrismaClient, type Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
const isolated=await vi.hoisted(async()=>{
 vi.resetModules()
 const {isolatedTestDatabase}=await import('../fixtures/isolated-test-database')
 return isolatedTestDatabase(['SURVEY_NATIVE_SJT_TEST_DATABASE_URL','SURVEY_COGNITIVE_TEST_DATABASE_URL','RELEASE_INTEGRATION_DATABASE_URL'],'survey_mixed')
})
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { gonogoSequence } from '../../modules/cognitive/randomization'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
import {publishCognitiveConfig} from '../../modules/cognitive/release.service'
import { createSjtDraft, requestSjtReview, reviewSjtDraft } from '../../modules/situational/authoring/service'
import { compileSjtTemplate } from '../../modules/situational/authoring/template'
import { situationalLegacyFinalSubmitSchema } from '../../modules/situational/situational-final-submit.schema'
import { createDraft, importCatalogDraft, updateDraft } from '../../modules/survey/builder.service'
import type { FormDraft, ScaleDraft } from '../../modules/survey/builder.definition'
import { grantCatalogSource } from '../../modules/survey/catalog.service'
import { SURVEY_GONOGO_CONFIG, type SurveyCognitiveReference } from '../../modules/survey/cognitive.definition'
import { loadSurveyCognitiveResults, verifySurveyCognitiveReferences } from '../../modules/survey/cognitive.results'
import { readSurveyCognitive, startSurveyCognitive, submitSurveyCognitiveFinal } from '../../modules/survey/cognitive.service'
import { bindSurveyAttemptContent } from '../../modules/survey/content-binding.service'
import type { SurveyComputedFinal } from '../../modules/survey/final.compute'
import { readGeneralForOwnAttempt, submitResearchFinal } from '../../modules/survey/final.service'
import { hashResearchCredential } from '../../modules/survey/identity.service'
import { publishSurveyMeasurementDraft } from '../../modules/survey/measurement-publication.service'
import { freezeResearchWaveDraft, type ResearchFrozenPublication } from '../../modules/survey/publication.service'
import { surveySituationalReceiptReferenceSchema, type SurveySituationalReceiptReference } from '../../modules/survey/situational-native.contract'
import { loadSurveySituationalResults } from '../../modules/survey/situational-native.results'
import { readSurveySituational, startSurveySituational, submitSurveySituationalFinal } from '../../modules/survey/situational-native.service'
import { getOwnResearchTask } from '../../modules/survey/task.public'
import { compileSjtNativeStagedFixture, createSjtNativeStagedFinalFixture, sjtNativeStagedTemplate } from '../fixtures/sjt-native-staged.fixture'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

const url = integrationDatabaseUrl('SURVEY_NATIVE_SJT_TEST_DATABASE_URL', 'SURVEY_COGNITIVE_TEST_DATABASE_URL', 'RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
const provenance = { schemaVersion: 1 as const, deviceClass: 'DESKTOP_LAPTOP' as const, administrationMode: 'KEYBOARD_MOUSE' as const }
const priorAnswers = { screen: { eligible: 'yes' }, scale: { teamwork: 'o4' } }
const finalAnswers = () => ({ ...structuredClone(priorAnswers), staged: {}, go: {} })
const form: FormDraft = { schemaVersion: 1, pages: [{ pageKey: 'page', title: 'Synthetic form', questions: [
  { itemKey: 'eligible', type: 'SINGLE', prompt: 'Continue with this synthetic task?', required: true,
    options: [{ optionKey: 'yes', label: 'Yes' }, { optionKey: 'no', label: 'No' }], rows: [] },
] }] }
const scale: ScaleDraft = { schemaVersion: 1, presentationMode: 'ALL_AT_ONCE', respondentType: 'participant_self_report',
  responseOptions: [1, 2, 3, 4, 5].map(value => ({ optionKey: 'o' + value, label: String(value), score: value })),
  dimensions: [{ dimensionKey: 'coordination', label: 'Synthetic response mean', direction: 'descriptive' }],
  aggregation: 'mean', items: [{ itemKey: 'teamwork', prompt: 'Synthetic ordinary scale item', required: true,
    reverse: false, dimensionKeys: ['coordination'] }] }
type Order = 'SJT_FIRST' | 'COGNITIVE_FIRST'
type Session = Awaited<ReturnType<typeof startSurveyCognitive>>
type Fixture = { waveId: string; publicationId: string; snapshot: ResearchFrozenPublication;
  proof: { publicId: string; attemptId: string; accessCredential: string } }
const cognitiveInput = (session: Session) => ({ submissionId: randomUUID(), attemptEpoch: session.attemptEpoch,
  definitionHash: session.definitionHash!, administrationProvenance: provenance,
  trials: gonogoSequence(session.randomSeed, 120, 0.25).map((trialType, index) => createTrialEnvelope({
    trialIndex: index, phase: 'test', startedAtPerfMs: index * 1300, endedAtPerfMs: index * 1300 + 800,
    payload: { trialType, responded: trialType === 'go', rtMs: trialType === 'go' ? 320 : null, interrupted: false },
  })) })

// Real author review, catalog grants, publication, child scoring and PostgreSQL
// facts. Only content/identities are synthetic; no scoring or permission mocks.
suite('Survey fixed mixed native staged SJT and Cognitive lifecycle — PostgreSQL', () => {
  let db: PrismaClient, admin: string, author: string, owner: string, projectId: string, publicId: string
  let stagedId: string, cognitiveId: string, formId: string, scaleId: string, ordinal = 0
  let compiled: ReturnType<typeof compileSjtNativeStagedFixture>

  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64))
    vi.stubEnv('DATA_PSEUDONYM_KEY', 'b'.repeat(64))
    vi.stubEnv('SURVEY_WORKSPACE_ENABLED', 'true')
    vi.stubEnv('SURVEY_PUBLICATION_ENABLED', 'true')
    db = new PrismaClient({ datasources: { db: { url: url! } } })
    await db.$connect()
    const user = async (role: 'ADMIN' | 'STUDENT', accountDomain: 'LEGACY' | 'SURVEY') =>
      (await db.user.create({ data: { username: 'mixed-native-' + randomUUID(), passwordHash: 'synthetic-only', role,
        accountDomain, ...(role === 'ADMIN' ? { platformRole: 'SYSTEM_ADMIN' } : {}) } })).id
    admin = await user('ADMIN', 'LEGACY'); author = await user('STUDENT', 'LEGACY'); owner = await user('STUDENT', 'SURVEY')
    await db.adminEntryGrant.create({ data: { id: randomUUID(), userId: admin, entry: 'SURVEY', grantedBy: admin } })
    const login = 'mixed_' + randomUUID().replace(/-/g, '').slice(0, 24)
    await db.surveyAccount.create({ data: { userId: owner, loginName: login, normalizedLogin: login } })
    await db.surveyResearcherGrant.create({ data: { userId: owner, status: 'ACTIVE', grantedBy: admin } })
    await db.surveyMfaCredential.create({ data: { userId: owner, enabled: true, secretCipher: 'synthetic-only' } })
    projectId = randomUUID(); publicId = randomUUID()
    await db.surveyProject.create({ data: { id: projectId, publicId, ownerUserId: owner,
      title: 'Synthetic fixed mixed task composition', status: 'ACTIVE', collectionMode: 'SINGLE_UNLINKED' } })

    const template = { ...structuredClone(sjtNativeStagedTemplate), instrumentKey: 'synthetic-mixed-' + randomUUID() }
    compiled = compileSjtTemplate(template) as ReturnType<typeof compileSjtNativeStagedFixture>
    const authored = await createSjtDraft({ userId: author, admin: false }, template, { authorizationPolicy: null })
    await requestSjtReview({ userId: author, admin: false }, authored.id, authored.revision, authored.contentDigest)
    await reviewSjtDraft({ userId: admin, admin: true }, authored.id, authored.revision, authored.contentDigest, true,
      'Independent synthetic software fixture; no participant data or new scientific claims')
    const release = await db.sjtAuthorRelease.findFirstOrThrow({ where: { instrumentKey: template.instrumentKey } })
    const stagedGrant = await grantGovernedCatalogFixture(db,admin, owner, { kind: 'SJT', sourceId: release.id, sourceVersion: template.instrumentVersion })
    stagedId = (await importCatalogDraft(owner, projectId, stagedGrant.id, { requestId: randomUUID(),
      instrumentKey: 'staged', title: 'Synthetic native staged task' })).id

    // The builder deliberately cannot create Cognitive instruments. Use the
    // actual fixed catalog identity and its real grant/import path instead.
    // A pre-existing seed is never rewritten to make this fixture pass.
    let config = await db.cognitiveTestConfig.findUnique({ where: {
      testType_configVersion: { testType: 'gonogo', configVersion: '1.1.0' },
    } }) ?? await db.cognitiveTestConfig.create({ data: { testType: 'gonogo', configVersion: '1.1.0',
      name: 'Existing fixed Survey Go/No-Go protocol, synthetic catalog fixture', engineVersion: '1.0.0', scoringVersion: '1.0.0',
      config: SURVEY_GONOGO_CONFIG, status: 'DRAFT', accessPolicy: 'OPEN' } })
    expect(config.config).toEqual(SURVEY_GONOGO_CONFIG)
    if(config.status==='DRAFT'){
      await publishCognitiveConfig(config.id,admin)
      config=await db.cognitiveTestConfig.findUniqueOrThrow({where:{id:config.id}})
    }
    expect(config.measurementReleaseId).not.toBeNull()
    expect(config).toMatchObject({ testType: 'gonogo', configVersion: '1.1.0', engineVersion: '1.0.0',
      scoringVersion: '1.0.0', status: 'PUBLISHED', accessPolicy: 'OPEN' })
    expect(config.config).toEqual(SURVEY_GONOGO_CONFIG)
    const cognitiveGrant = await grantGovernedCatalogFixture(db,admin, owner, { kind: 'COGNITIVE', sourceId: config.id, sourceVersion: '1.1.0' })
    cognitiveId = (await importCatalogDraft(owner, projectId, cognitiveGrant.id, { requestId: randomUUID(),
      instrumentKey: 'go', title: 'Fixed Go/No-Go' })).id
    for (const [kind, instrumentKey, definition] of [['FORM', 'screen', form], ['SCALE', 'scale', scale]] as const) {
      const created = await createDraft(owner, projectId, { requestId: randomUUID(), kind, instrumentKey, title: 'Synthetic ' + kind })
      const updated = await updateDraft(owner, projectId, created.id, { revision: 0, title: created.title, definition })
      if (kind === 'FORM') formId = updated.id
      else {
        scaleId = updated.id
        await publishSurveyMeasurementDraft(owner, projectId, scaleId, updated.revision)
      }
    }
  })
  afterAll(async () => { await db?.$disconnect(); vi.unstubAllEnvs(); await isolated.restore() })

  async function attempt(wave: Omit<Fixture, 'proof'>): Promise<Fixture> {
    const attemptId = randomUUID(), accessCredential = randomBytes(32).toString('base64url')
    await db.$transaction(async tx => {
      await tx.surveyWaveAttempt.create({ data: { id: attemptId, projectId, waveId: wave.waveId, status: 'STARTED',
        sessionHash: hashResearchCredential(accessCredential) } })
      await tx.surveyConsent.create({ data: { id: randomUUID(), projectId, waveId: wave.waveId, attemptId,
        consentVersion: 1, accepted: true } })
      await bindSurveyAttemptContent(tx, { projectId, waveId: wave.waveId, attemptId,
        publicationId: wave.publicationId, newAttempt: true })
    })
    return { waveId: wave.waveId, publicationId: wave.publicationId, snapshot: wave.snapshot,
      proof: { publicId, attemptId, accessCredential } }
  }
  async function fixture(order: Order): Promise<Fixture> {
    const waveId = randomUUID(), ids = order === 'SJT_FIRST' ? [stagedId, cognitiveId] : [cognitiveId, stagedId]
    await db.surveyWave.create({ data: { id: waveId, projectId, ordinal: ++ordinal, title: 'Synthetic ' + order,
      instrumentIds: [formId, scaleId, ...ids], consentText: 'Synthetic mixed task consent; no real participant information is collected.' } })
    const published = await freezeResearchWaveDraft({ actorUserId: owner, projectId, waveId, revision: 0,
      participantFeedback: [{ instrumentId: stagedId, feedback: { policyVersion: 'SURVEY_RAW_METRICS_V1',
        mode: 'DESCRIPTIVE', metricKeys: ['coordination'], release: 'AFTER_FINAL' } }] })
    const stored = await db.surveyPublication.findUniqueOrThrow({ where: { id: published.publicationId } })
    const snapshot = stored.compiledSnapshot as unknown as ResearchFrozenPublication
    expect(canonicalHash(snapshot)).toBe(stored.definitionDigest)
    expect(snapshot.units.map(unit => unit.instrumentKey)).toEqual(['screen', 'scale', ...(order === 'SJT_FIRST' ? ['staged', 'go'] : ['go', 'staged'])])
    expect(snapshot).not.toHaveProperty('flow')
    expect(snapshot.measurementNotice).toMatchObject({ version: 'SURVEY_COMBINED_TASK_NOTICE_V1', includes: ['COGNITIVE', 'STAGED_SJT'] })
    await db.surveyWave.update({ where: { id: waveId }, data: { status: 'OPEN', opensAt: new Date(Date.now() - 60_000),
      closesAt: new Date(Date.now() + 3_600_000), finishUntil: new Date(Date.now() + 7_200_000) } })
    return attempt({ waveId, publicationId: published.publicationId, snapshot })
  }
  const startCognitive = (f: Fixture, answers: unknown = priorAnswers) => startSurveyCognitive(f.proof, 'go', {
    priorAnswers: answers, administrationProvenance: provenance,
  })
  const nativeInput = (childId: string) => situationalLegacyFinalSubmitSchema.parse({
    ...createSjtNativeStagedFinalFixture(childId, 'path-A-A', compiled).finalInput, submissionId: randomUUID(),
  })
  async function withParentLock<T>(f: Fixture, callback: (tx: Prisma.TransactionClient) => Promise<T>) {
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM survey_projects WHERE id=${projectId} FOR SHARE`
      await tx.$queryRaw`SELECT id FROM survey_waves WHERE id=${f.waveId} AND project_id=${projectId} FOR SHARE`
      await tx.$queryRaw`SELECT id FROM survey_wave_attempts WHERE id=${f.proof.attemptId} FOR UPDATE`
      return callback(tx)
    })
  }
  async function finish(f: Fixture, native: SurveySituationalReceiptReference, cognitive: SurveyCognitiveReference) {
    const input = { ...f.proof, submissionId: randomUUID(), answers: finalAnswers(),
      situationalReferences: [native], cognitiveReferences: [cognitive] }
    // Neither child completion substitutes for the other receipt, nor may a
    // complete parent silently accept a changed ordinary answer lock.
    await expect(submitResearchFinal({ ...input, situationalReferences: [] })).rejects.toThrow()
    await expect(submitResearchFinal({ ...input, cognitiveReferences: [] })).rejects.toThrow()
    await expect(submitResearchFinal({ ...input, answers: { ...input.answers, screen: { eligible: 'no' } } })).rejects.toThrow('前置答案')
    await expect(submitResearchFinal({ ...input, answers: { ...input.answers, scale: { teamwork: 'o5' } } })).rejects.toThrow('前置答案')
    await expect(submitResearchFinal({ ...input, situationalReferences: [{ ...native, payloadHash: '0'.repeat(64) }] })).rejects.toThrow()
    await expect(submitResearchFinal({ ...input, cognitiveReferences: [{ ...cognitive, resultHash: '0'.repeat(64) }] })).rejects.toThrow()
    expect(await db.surveyWaveFinal.count({ where: { attemptId: f.proof.attemptId } })).toBe(0)
    expect((await db.surveyWaveAttempt.findUniqueOrThrow({ where: { id: f.proof.attemptId } })).status).toBe('STARTED')

    const foreign = await attempt(f)
    await expect(readSurveySituational(foreign.proof, 'staged', native.attemptId)).rejects.toThrow()
    const ownSession = await db.surveyCognitiveSession.findFirstOrThrow({ where: { attemptId: f.proof.attemptId, slotKey: 'go' } })
    await expect(readSurveyCognitive(foreign.proof, 'go', ownSession.id)).rejects.toThrow()
    // Verify each receipt's exact parent independently, so an earlier failed
    // Cognitive check cannot hide an untested native receipt boundary.
    await withParentLock(foreign, async tx => {
      await expect(loadSurveySituationalResults(tx, { surveyAttemptId: foreign.proof.attemptId,
        surveyPublicationId: f.publicationId, snapshot: f.snapshot, references: [native] })).rejects.toThrow()
      await expect(verifySurveyCognitiveReferences(tx, { projectId, waveId: f.waveId, attemptId: foreign.proof.attemptId,
        publicationId: f.publicationId, snapshot: f.snapshot, references: [cognitive] })).rejects.toThrow()
    })
    await expect(submitResearchFinal({ ...input, ...foreign.proof })).rejects.toThrow()
    await withParentLock(f, async tx => {
      const wrongPublicationId = randomUUID()
      await expect(loadSurveySituationalResults(tx, { surveyAttemptId: f.proof.attemptId,
        surveyPublicationId: wrongPublicationId, snapshot: f.snapshot, references: [native] })).rejects.toThrow()
      await expect(verifySurveyCognitiveReferences(tx, { projectId, waveId: f.waveId, attemptId: f.proof.attemptId,
        publicationId: wrongPublicationId, snapshot: f.snapshot, references: [cognitive] })).rejects.toThrow()
      const nativeFacts = await loadSurveySituationalResults(tx, { surveyAttemptId: f.proof.attemptId,
        surveyPublicationId: f.publicationId, snapshot: f.snapshot, references: [native], includeRaw: true })
      const cognitiveFacts = await loadSurveyCognitiveResults(tx, { projectId, waveId: f.waveId, attemptId: f.proof.attemptId,
        publicationId: f.publicationId, references: [cognitive], includeRaw: true })
      expect(nativeFacts[0].result.metrics.find(metric => metric.key === 'coordination')?.value).toBe(5)
      expect(nativeFacts[0].raw?.researchCapture?.events.length).toBeGreaterThan(0)
      expect(cognitiveFacts[0].raw?.trials).toHaveLength(120)
      expect(cognitiveFacts[0].result.metrics.hitRate).toBe(1)
      expect(cognitiveFacts[0].result.rawHash).toBe(canonicalHash(cognitiveFacts[0].raw))
    })

    const completed = await submitResearchFinal(input)
    expect(completed.status).toBe('COMPLETED')
    expect(completed.idempotent).toBe(false)
    expect(await submitResearchFinal(input)).toMatchObject({ receiptId: completed.receiptId, idempotent: true })
    await expect(submitResearchFinal({ ...input, cognitiveReferences: [] })).rejects.toThrow()
    await expect(submitResearchFinal({ ...input, situationalReferences: [] })).rejects.toThrow()
    const parent = await db.surveyWaveFinal.findUniqueOrThrow({ where: { attemptId: f.proof.attemptId } })
    const result = decryptUnifiedRuntimePayload<SurveyComputedFinal>(parent.resultsCipher)
    expect(canonicalHash(result)).toBe(parent.resultsHash)
    expect(result.units.map(unit => unit.instrumentKey)).toEqual(f.snapshot.units.map(unit => unit.instrumentKey))
    expect(result.units.find(unit => unit.instrumentKey === 'staged')).toMatchObject({ nativeReference: native, rawAnswers: {} })
    expect(result.units.find(unit => unit.instrumentKey === 'go')).toMatchObject({ childReference: cognitive, rawAnswers: {} })
    expect(result.units.find(unit => unit.instrumentKey === 'screen')?.rawAnswers).toEqual(priorAnswers.screen)
    expect(result.units.find(unit => unit.instrumentKey === 'scale')?.rawAnswers).toEqual(priorAnswers.scale)
    expect(JSON.stringify(result)).not.toMatch(/startedAtPerfMs|researchCapture/)
    expect(await db.surveyWaveFinal.count({ where: { attemptId: f.proof.attemptId } })).toBe(1)
    expect(await db.situationalRawSubmission.count({ where: { attemptId: native.attemptId } })).toBe(1)
    expect(await db.surveyCognitiveResult.count({ where: { attemptId: f.proof.attemptId } })).toBe(1)
    expect((await readGeneralForOwnAttempt(f.proof)).kind).toBe('DESCRIPTIVE')
    expect((await readSurveySituational(f.proof, 'staged', native.attemptId)).receipt).toEqual(native)
    expect((await readSurveyCognitive(f.proof, 'go', ownSession.id)).resultReference).toEqual(cognitive)
    await expect(startSurveySituational(f.proof, 'staged')).rejects.toThrow()
    await expect(startCognitive(f)).rejects.toThrow()
  }

  it('requires durable staged SJT before Cognitive, locks only ordinary answers and commits both child receipts once', async () => {
    const f = await fixture('SJT_FIRST')
    const task = await getOwnResearchTask(f.proof)
    expect(task.units.map(unit => unit.kind)).toEqual(['FORM', 'SCALE', 'SJT', 'COGNITIVE'])
    expect(task.units[2]).toMatchObject({ instrumentKey: 'staged', executionProtocol: 'SITUATIONAL_NATIVE_V1' })
    expect(JSON.stringify(task)).not.toContain('expertKey')
    await expect(startCognitive(f)).rejects.toThrow()
    const native = await startSurveySituational(f.proof, 'staged'), payload = nativeInput(native.attempt.id)
    await expect(startCognitive(f)).rejects.toThrow()
    await expect(submitSurveySituationalFinal(f.proof, 'staged', native.attempt.id, { ...payload, researchCapture: undefined })).rejects.toThrow()
    await expect(startCognitive(f)).rejects.toThrow()
    expect(await db.surveyCognitiveSession.count({ where: { attemptId: f.proof.attemptId } })).toBe(0)
    expect(await db.situationalRawSubmission.count({ where: { attemptId: native.attempt.id } })).toBe(0)
    const accepted = await submitSurveySituationalFinal(f.proof, 'staged', native.attempt.id, payload)
    const receipt = surveySituationalReceiptReferenceSchema.parse(accepted.receipt)
    expect((await submitSurveySituationalFinal(f.proof, 'staged', native.attempt.id, payload)).receipt).toEqual(receipt)
    await expect(startCognitive(f, { ...priorAnswers, staged: {} })).rejects.toThrow('普通答案')
    await expect(startCognitive(f, { screen: priorAnswers.screen })).rejects.toThrow()
    const cognitive = await startCognitive(f)
    expect(cognitive.lockedPriorAnswers).toEqual(priorAnswers)
    expect(cognitive.lockedPriorAnswers).not.toHaveProperty('staged')
    expect((await startCognitive(f)).sessionId).toBe(cognitive.sessionId)
    const input = cognitiveInput(cognitive)
    const completed = await submitSurveyCognitiveFinal(f.proof, 'go', cognitive.sessionId, input)
    expect((await submitSurveyCognitiveFinal(f.proof, 'go', cognitive.sessionId, input)).resultReference).toEqual(completed.resultReference)
    await finish(f, receipt, completed.resultReference)
  })

  it('requires the latest completed Cognitive epoch before a new SJT, while keeping the reverse composition completable', async () => {
    const f = await fixture('COGNITIVE_FIRST')
    await expect(startSurveySituational(f.proof, 'staged')).rejects.toThrow('认知工具')
    const cognitive = await startCognitive(f)
    expect(cognitive.lockedPriorAnswers).toEqual(priorAnswers)
    // A later native slot is not part of Cognitive's required frozen prefix.
    expect(await db.situationalAttempt.count({ where: { surveyAttemptId: f.proof.attemptId } })).toBe(0)
    await expect(startSurveySituational(f.proof, 'staged')).rejects.toThrow('认知工具')
    const input = cognitiveInput(cognitive)
    const completed = await submitSurveyCognitiveFinal(f.proof, 'go', cognitive.sessionId, input)
    expect((await submitSurveyCognitiveFinal(f.proof, 'go', cognitive.sessionId, input)).resultReference).toEqual(completed.resultReference)
    const native = await startSurveySituational(f.proof, 'staged'), payload = nativeInput(native.attempt.id)
    expect((await startSurveySituational(f.proof, 'staged')).attempt.id).toBe(native.attempt.id)
    const accepted = await submitSurveySituationalFinal(f.proof, 'staged', native.attempt.id, payload)
    const receipt = surveySituationalReceiptReferenceSchema.parse(accepted.receipt)
    expect((await submitSurveySituationalFinal(f.proof, 'staged', native.attempt.id, payload)).receipt).toEqual(receipt)
    await finish(f, receipt, completed.resultReference)

    // Guard-only corrupt-state fixture: the public restart API correctly will
    // not replace an already completed epoch. Preserve its real 120-trial result
    // and add an uncompleted latest epoch, without mutating terminal facts.
    const corrupt = await attempt(f), old = await startCognitive(corrupt)
    const oldResult = await submitSurveyCognitiveFinal(corrupt.proof, 'go', old.sessionId, cognitiveInput(old))
    const oldRow = await db.surveyCognitiveSession.findUniqueOrThrow({ where: { id: old.sessionId } })
    const latest = await db.surveyCognitiveSession.create({ data: { ...oldRow, id: randomUUID(), epoch: 2,
      status: 'IN_PROGRESS', startedAt: new Date(), interruptedAt: null, finishedAt: null } })
    await expect(startSurveySituational(corrupt.proof, 'staged')).rejects.toThrow('认知工具')
    expect(await db.situationalAttempt.count({ where: { surveyAttemptId: corrupt.proof.attemptId } })).toBe(0)
    await withParentLock(corrupt, async tx => {
      await expect(verifySurveyCognitiveReferences(tx, { projectId, waveId: corrupt.waveId, attemptId: corrupt.proof.attemptId,
        publicationId: corrupt.publicationId, snapshot: corrupt.snapshot, references: [oldResult.resultReference] })).rejects.toThrow()
    })
    // A bare COMPLETED flag is not a committed result either.
    await db.surveyCognitiveSession.update({ where: { id: latest.id }, data: { status: 'COMPLETED', finishedAt: new Date() } })
    await expect(startSurveySituational(corrupt.proof, 'staged')).rejects.toThrow('认知工具')
    expect(await db.situationalAttempt.count({ where: { surveyAttemptId: corrupt.proof.attemptId } })).toBe(0)
    expect(await db.surveyCognitiveResult.count({ where: { attemptId: corrupt.proof.attemptId } })).toBe(1)
    expect(await db.surveyWaveFinal.count({ where: { attemptId: corrupt.proof.attemptId } })).toBe(0)
  })
})
