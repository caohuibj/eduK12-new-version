import {grantGovernedCatalogFixture,revokeGovernedCatalogFixture} from '../fixtures/governed-catalog'
import { randomBytes, randomUUID } from 'node:crypto'
import { PrismaClient, type Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { createSjtDraft, requestSjtReview, reviewSjtDraft } from '../../modules/situational/authoring/service'
import { compileSjtTemplate } from '../../modules/situational/authoring/template'
import { situationalLegacyFinalSubmitSchema } from '../../modules/situational/situational-final-submit.schema'
import { exportLong, exportWide } from '../../modules/survey/analytics.export-format'
import { rawLongExport, rawWideExport } from '../../modules/survey/analytics.raw-export'
import { loadSurveySource } from '../../modules/survey/analytics.source'
import type { FormDraft, ScaleDraft } from '../../modules/survey/builder.definition'
import { createDraft, importCatalogDraft, updateDraft } from '../../modules/survey/builder.service'
import { grantCatalogSource } from '../../modules/survey/catalog.service'
import { readSurveyCheckpoint, saveSurveyCheckpoint } from '../../modules/survey/checkpoint.service'
import { bindSurveyAttemptContent } from '../../modules/survey/content-binding.service'
import type { SurveyComputedFinal } from '../../modules/survey/final.compute'
import { readGeneralForOwnAttempt, submitResearchFinal } from '../../modules/survey/final.service'
import { ensureSurveyFlowAssignment, type SurveyFlowAssignment } from '../../modules/survey/flow.assignment'
import type { SurveyFlowDraft } from '../../modules/survey/flow.definition'
import { hashResearchCredential, withdrawSingleResearchAttempt } from '../../modules/survey/identity.service'
import { publishSurveyMeasurementDraft } from '../../modules/survey/measurement-publication.service'
import { freezeResearchWaveDraft, type ResearchFrozenPublication } from '../../modules/survey/publication.service'
import { surveySituationalReceiptReferenceSchema } from '../../modules/survey/situational-native.contract'
import { readSurveySituational, startSurveySituational, submitSurveySituationalFinal } from '../../modules/survey/situational-native.service'
import { getOwnResearchTask } from '../../modules/survey/task.public'
import { compileSjtNativeStagedFixture, createSjtNativeStagedFinalFixture, sjtNativeStagedTemplate } from '../fixtures/sjt-native-staged.fixture'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

const url = integrationDatabaseUrl('SURVEY_NATIVE_SJT_TEST_DATABASE_URL', 'RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
type Route = 'a' | 'b'
type Wave = { waveId: string; publicationId: string; snapshot: ResearchFrozenPublication }
type Proof = { publicId: string; attemptId: string; accessCredential: string }
const prefix = (route: Route) => ({ screen: { route } })
const slot = (route: Route) => route === 'a' ? 'nativea' : 'nativeb'
const shown = (route: Route) => ['screen', 'intro', 'path' + route, 'tail']
const form: FormDraft = { schemaVersion: 1, pages: [{ pageKey: 'page', title: 'Synthetic route selection', questions: [
  { itemKey: 'route', type: 'SINGLE', prompt: 'Choose a synthetic route.', required: true,
    options: [{ optionKey: 'a', label: 'Route A' }, { optionKey: 'b', label: 'Route B' }], rows: [] },
] }] }
const scale: ScaleDraft = { schemaVersion: 1, presentationMode: 'ALL_AT_ONCE', respondentType: 'participant_self_report',
  responseOptions: [1, 2, 3, 4, 5].map(value => ({ optionKey: 'o' + value, label: String(value), score: value })),
  dimensions: [{ dimensionKey: 'response', label: 'Synthetic ordinary mean', direction: 'descriptive' }], aggregation: 'mean',
  items: [{ itemKey: 'reflection', prompt: 'Synthetic final scale item.', required: true, reverse: false, dimensionKeys: ['response'] }] }
const flow: SurveyFlowDraft = { schemaVersion: 1, embeddedData: [], blocks: [
  { blockKey: 'screen', kind: 'INSTRUMENT', instrumentKey: 'screen' },
  { blockKey: 'intro', kind: 'MATERIAL', title: 'Synthetic introduction', body: 'Original synthetic branch instructions.' },
  { blockKey: 'patha', kind: 'INSTRUMENT', instrumentKey: 'nativea', when: {
    op: 'EQUALS', field: { source: 'ANSWER', instrumentKey: 'screen', itemKey: 'route' }, value: 'a',
  } },
  { blockKey: 'pathb', kind: 'INSTRUMENT', instrumentKey: 'nativeb', when: {
    op: 'EQUALS', field: { source: 'ANSWER', instrumentKey: 'screen', itemKey: 'route' }, value: 'b',
  } },
  { blockKey: 'tail', kind: 'INSTRUMENT', instrumentKey: 'tail' },
] }

// No experiment, END, Cognitive, production package or scorer/authority mocks.
// Both native slots import the same newly authored synthetic staged release;
// selecting a host branch never changes that release's scientific protocol.
suite('Survey bounded native conditional flow — real PostgreSQL', () => {
  let db: PrismaClient, admin: string, author: string, owner: string, projectId: string, publicId: string
  let formId: string, scaleId: string, nativeAId: string, nativeBId: string, ordinal = 0
  let compiled: ReturnType<typeof compileSjtNativeStagedFixture>

  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64))
    vi.stubEnv('DATA_PSEUDONYM_KEY', 'b'.repeat(64))
    vi.stubEnv('SURVEY_WORKSPACE_ENABLED', 'true')
    vi.stubEnv('SURVEY_PUBLICATION_ENABLED', 'true')
    db = new PrismaClient({ datasources: { db: { url: url! } } }); await db.$connect()
    const user = async (role: 'ADMIN' | 'STUDENT', accountDomain: 'LEGACY' | 'SURVEY') =>
      (await db.user.create({ data: { username: 'native-flow-' + randomUUID(), passwordHash: 'synthetic-only', role,
        accountDomain, ...(role === 'ADMIN' ? { platformRole: 'SYSTEM_ADMIN' } : {}) } })).id
    admin = await user('ADMIN', 'LEGACY'); author = await user('STUDENT', 'LEGACY'); owner = await user('STUDENT', 'SURVEY')
    await db.adminEntryGrant.create({ data: { id: randomUUID(), userId: admin, entry: 'SURVEY', grantedBy: admin } })
    const login = 'flow_' + randomUUID().replace(/-/g, '').slice(0, 24)
    await db.surveyAccount.create({ data: { userId: owner, loginName: login, normalizedLogin: login } })
    await db.surveyResearcherGrant.create({ data: { userId: owner, status: 'ACTIVE', grantedBy: admin } })
    await db.surveyMfaCredential.create({ data: { userId: owner, enabled: true, secretCipher: 'synthetic-only' } })
    projectId = randomUUID(); publicId = randomUUID()
    await db.surveyProject.create({ data: { id: projectId, publicId, ownerUserId: owner,
      title: 'Synthetic bounded native host flow', status: 'ACTIVE', collectionMode: 'SINGLE_UNLINKED' } })
    const template = { ...structuredClone(sjtNativeStagedTemplate), instrumentKey: 'synthetic-native-flow-' + randomUUID() }
    compiled = compileSjtTemplate(template) as ReturnType<typeof compileSjtNativeStagedFixture>
    const authored = await createSjtDraft({ userId: author, admin: false }, template, { authorizationPolicy: null })
    await requestSjtReview({ userId: author, admin: false }, authored.id, authored.revision, authored.contentDigest)
    await reviewSjtDraft({ userId: admin, admin: true }, authored.id, authored.revision, authored.contentDigest, true,
      'Independent synthetic conditional host test; no new scientific claims or real participant data')
    const release = await db.sjtAuthorRelease.findFirstOrThrow({ where: { instrumentKey: template.instrumentKey } })
    const grant = await grantGovernedCatalogFixture(db,admin, owner, { kind: 'SJT', sourceId: release.id, sourceVersion: template.instrumentVersion })
    nativeAId = (await importCatalogDraft(owner, projectId, grant.id, { requestId: randomUUID(), instrumentKey: 'nativea', title: 'Synthetic native route A' })).id
    nativeBId = (await importCatalogDraft(owner, projectId, grant.id, { requestId: randomUUID(), instrumentKey: 'nativeb', title: 'Synthetic native route B' })).id
    for (const [kind, instrumentKey, definition] of [['FORM', 'screen', form], ['SCALE', 'tail', scale]] as const) {
      const created = await createDraft(owner, projectId, { requestId: randomUUID(), kind, instrumentKey, title: 'Synthetic ' + kind })
      const updated = await updateDraft(owner, projectId, created.id, { revision: 0, title: created.title, definition })
      if (kind === 'FORM') formId = updated.id
      else { scaleId = updated.id; await publishSurveyMeasurementDraft(owner, projectId, scaleId, updated.revision) }
    }
  }, 30_000)
  afterAll(async () => { await db?.$disconnect(); vi.unstubAllEnvs() })

  async function wave(): Promise<Wave> {
    const waveId = randomUUID()
    await db.surveyWave.create({ data: { id: waveId, projectId, ordinal: ++ordinal, title: 'Synthetic conditional native wave',
      instrumentIds: [formId, nativeAId, nativeBId, scaleId],
      consentText: 'Synthetic conditional task consent. No real participant data is collected.',
      flowDefinition: flow as unknown as Prisma.InputJsonValue, checkpointPolicy: { schemaVersion: 1, enabled: true, ttlHours: 2 } } })
    const published = await freezeResearchWaveDraft({ actorUserId: owner, projectId, waveId, revision: 0,
      participantFeedback: [nativeAId, nativeBId].map(instrumentId => ({ instrumentId, feedback: {
        policyVersion: 'SURVEY_RAW_METRICS_V1' as const, mode: 'DESCRIPTIVE' as const,
        metricKeys: ['coordination'], release: 'AFTER_FINAL' as const,
      } })) })
    const publication = await db.surveyPublication.findUniqueOrThrow({ where: { id: published.publicationId } })
    const snapshot = publication.compiledSnapshot as unknown as ResearchFrozenPublication
    expect(canonicalHash(snapshot)).toBe(publication.definitionDigest)
    expect(snapshot.flow).toMatchObject(flow)
    expect(snapshot.flow).not.toHaveProperty('experiment')
    expect(snapshot.flow?.blocks.some(block => block.kind === 'END')).toBe(false)
    expect(snapshot.units.filter(unit => unit.executionProtocol === 'SITUATIONAL_NATIVE_V1').map(unit => unit.instrumentKey)).toEqual(['nativea', 'nativeb'])
    await db.surveyWave.update({ where: { id: waveId }, data: { status: 'OPEN', opensAt: new Date(Date.now() - 60_000),
      closesAt: new Date(Date.now() + 3_600_000), finishUntil: new Date(Date.now() + 7_200_000) } })
    return { waveId, publicationId: published.publicationId, snapshot }
  }
  async function attempt(w: Wave, consent = true): Promise<Proof> {
    const attemptId = randomUUID(), accessCredential = randomBytes(32).toString('base64url')
    await db.$transaction(async tx => {
      await tx.surveyWaveAttempt.create({ data: { id: attemptId, projectId, waveId: w.waveId, status: 'STARTED',
        sessionHash: hashResearchCredential(accessCredential) } })
      if (consent) await tx.surveyConsent.create({ data: { id: randomUUID(), projectId, waveId: w.waveId, attemptId,
        consentVersion: 1, accepted: true } })
      // Even without an experiment, the flow has a durable NO_EXPERIMENT
      // assignment before the selected content binding is constructed.
      await ensureSurveyFlowAssignment(tx, { projectId, waveId: w.waveId, attemptId, participantId: null,
        accessCredential, snapshot: w.snapshot })
      await bindSurveyAttemptContent(tx, { projectId, waveId: w.waveId, attemptId, publicationId: w.publicationId, newAttempt: true })
    })
    return { publicId, attemptId, accessCredential }
  }
  const finalInput = (childId: string) => situationalLegacyFinalSubmitSchema.parse({
    ...createSjtNativeStagedFinalFixture(childId, 'path-A-A', compiled).finalInput, submissionId: randomUUID(),
  })

  it.each(['a', 'b'] as const)('completes route %s with immutable prefix, cross-device recovery and NOT_SHOWN export for the other native slot', async route => {
    const w = await wave(), proof = await attempt(w), selected = slot(route)
    const otherRoute: Route = route === 'a' ? 'b' : 'a', unselected = slot(otherRoute)
    const ordinary = prefix(route)
    const firstTask = await getOwnResearchTask(proof)
    expect(firstTask.flow?.blocks.map(block => block.blockKey)).toEqual(['screen', 'intro', 'patha', 'pathb', 'tail'])
    expect(firstTask.flow).not.toHaveProperty('selectedMaterial')
    expect(JSON.stringify(firstTask)).not.toContain('expertKey')
    const parentBefore = await db.surveyWaveAttempt.findUniqueOrThrow({ where: { id: proof.attemptId } })
    const assignment = decryptUnifiedRuntimePayload<SurveyFlowAssignment>(parentBefore.flowAssignmentCipher!)
    expect(assignment).toMatchObject({ algorithm: 'NO_EXPERIMENT', experimentKey: null, groupKey: null,
      flowDigest: w.snapshot.flow!.flowDigest })
    await expect(startSurveySituational(proof, selected, {})).rejects.toThrow()
    await expect(startSurveySituational(proof, unselected, ordinary)).rejects.toThrow()
    expect(await db.situationalAttempt.count({ where: { surveyAttemptId: proof.attemptId } })).toBe(0)

    const started = await startSurveySituational(proof, selected, ordinary)
    expect(started).toMatchObject({ lockedPriorAnswers: ordinary })
    expect(started).not.toHaveProperty('lockedPriorAnswers.tail')
    // An answer change cannot create a second branch after admission.
    await expect(startSurveySituational(proof, unselected, prefix(otherRoute))).rejects.toThrow()
    expect(await db.situationalAttempt.count({ where: { surveyAttemptId: proof.attemptId, surveySlotKey: unselected } })).toBe(0)
    const secondDevice = structuredClone(proof)
    const recoveredTask = await getOwnResearchTask(secondDevice)
    expect(recoveredTask).toMatchObject({ lockedPriorAnswers: ordinary })
    expect((await startSurveySituational(secondDevice, selected)).attempt.id).toBe(started.attempt.id)
    expect(await readSurveySituational(secondDevice, selected, started.attempt.id)).toMatchObject({ lockedPriorAnswers: ordinary })
    expect((await db.surveyWaveAttempt.findUniqueOrThrow({ where: { id: proof.attemptId } })).flowAssignmentCipher).toBe(parentBefore.flowAssignmentCipher)
    const wrongProof = { ...proof, accessCredential: randomBytes(32).toString('base64url') }
    await expect(readSurveySituational(wrongProof, selected, started.attempt.id)).rejects.toThrow()
    await expect(getOwnResearchTask(wrongProof)).rejects.toThrow()

    const checkpointAnswers = { ...ordinary, [selected]: {}, tail: { reflection: 'o4' } }
    const saved = await saveSurveyCheckpoint(proof, { revision: 0, answers: checkpointAnswers })
    expect(saved.revision).toBe(1)
    expect((await readSurveyCheckpoint(secondDevice)).checkpoint?.answers).toEqual(checkpointAnswers)
    await expect(saveSurveyCheckpoint(proof, { revision: 1, answers: { ...checkpointAnswers, ...prefix(otherRoute) } })).rejects.toThrow()
    await expect(saveSurveyCheckpoint(proof, { revision: 1, answers: {
      ...checkpointAnswers, [selected]: { PLAN_CHOICE: 'A' },
    } })).rejects.toThrow()
    expect((await readSurveyCheckpoint(secondDevice)).revision).toBe(1)
    expect(await getOwnResearchTask(secondDevice)).toMatchObject({ lockedPriorAnswers: ordinary })

    const payload = finalInput(started.attempt.id)
    const accepted = await submitSurveySituationalFinal(proof, selected, started.attempt.id, payload)
    const reference = surveySituationalReceiptReferenceSchema.parse(accepted.receipt)
    expect((await submitSurveySituationalFinal(secondDevice, selected, started.attempt.id, payload)).receipt).toEqual(reference)
    expect(await db.situationalRawSubmission.count({ where: { attemptId: started.attempt.id } })).toBe(1)

    // A real opposite-branch receipt from another parent must not become an
    // optional extra receipt or satisfy this parent's unreachable native slot.
    const foreign = await attempt(w)
    const foreignChild = await startSurveySituational(foreign, unselected, prefix(otherRoute))
    const foreignAccepted = await submitSurveySituationalFinal(foreign, unselected, foreignChild.attempt.id, finalInput(foreignChild.attempt.id))
    const foreignReference = surveySituationalReceiptReferenceSchema.parse(foreignAccepted.receipt)
    await expect(readSurveySituational(proof, unselected, foreignChild.attempt.id)).rejects.toThrow()
    const submission = { ...proof, submissionId: randomUUID(), answers: checkpointAnswers,
      situationalReferences: [reference], presentation: { shownBlocks: shown(route) } }
    await expect(submitResearchFinal({ ...submission, situationalReferences: [] })).rejects.toThrow()
    await expect(submitResearchFinal({ ...submission, situationalReferences: [reference, foreignReference] })).rejects.toThrow()
    await expect(submitResearchFinal({ ...submission, answers: { ...checkpointAnswers, ...prefix(otherRoute) } })).rejects.toThrow()
    await expect(submitResearchFinal({ ...submission, answers: { ...checkpointAnswers, [unselected]: {} } })).rejects.toThrow()
    await expect(submitResearchFinal({ ...submission, presentation: { shownBlocks: shown(otherRoute) } })).rejects.toThrow()
    expect(await db.surveyWaveFinal.count({ where: { attemptId: proof.attemptId } })).toBe(0)
    const done = await submitResearchFinal(submission)
    expect(done).toMatchObject({ status: 'COMPLETED', idempotent: false })
    expect(await submitResearchFinal(submission)).toMatchObject({ receiptId: done.receiptId, idempotent: true })
    expect(await db.surveyAttemptCheckpoint.count({ where: { attemptId: proof.attemptId } })).toBe(0)
    const final = await db.surveyWaveFinal.findUniqueOrThrow({ where: { attemptId: proof.attemptId } })
    const result = decryptUnifiedRuntimePayload<SurveyComputedFinal>(final.resultsCipher)
    expect(canonicalHash(result)).toBe(final.resultsHash)
    expect(result.executionTrace).toMatchObject({ shownBlocks: shown(route), skippedInstrumentKeys: [unselected],
      algorithm: 'NO_EXPERIMENT', experimentKey: null, groupKey: null, termination: 'COMPLETE', endBlockKey: null })
    expect(result.units.find(unit => unit.instrumentKey === selected)).toMatchObject({ nativeReference: reference, rawAnswers: {} })
    const skipped = result.units.find(unit => unit.instrumentKey === unselected)!
    expect(skipped).toMatchObject({ notExecuted: true, rawAnswers: {}, privateScoring: null })
    expect(skipped).not.toHaveProperty('nativeReference')
    expect(await db.situationalAttempt.count({ where: { surveyAttemptId: proof.attemptId, surveySlotKey: unselected } })).toBe(0)
    expect(await readGeneralForOwnAttempt(proof)).toMatchObject({ kind: 'DESCRIPTIVE', measurements: [
      { instrumentKey: selected, metrics: [{ key: 'coordination', value: 5 }] },
    ] })

    const source = await loadSurveySource({ actorUserId: owner, projectId, waveIds: [w.waveId], includeAttendance: false, includeWideSchema: true })
    expect(source.completeAttempts).toBe(1)
    expect(source.scores.find(row => row.measurement.instrumentKey === selected)).toMatchObject({ value: 5, missingReason: null })
    const skippedScores = source.scores.filter(row => row.measurement.instrumentKey === unselected)
    expect(skippedScores).toHaveLength(1)
    expect(skippedScores[0]).toMatchObject({ value: null, missingReason: 'NOT_SHOWN' })
    expect(source.scores.find(row => row.measurement.instrumentKey === 'tail')).toMatchObject({ value: 4, missingReason: null })
    const raw = source.raw.find(row => row.instrumentKey === selected && row.itemKey === '__native_raw')!
    expect(JSON.parse(raw.value as string).researchCapture.events.length).toBeGreaterThan(0)
    const skippedRaw = source.raw.filter(row => row.instrumentKey === unselected)
    expect(skippedRaw.length).toBeGreaterThan(0)
    expect(skippedRaw.every(row => row.value === null && row.missingReason === 'NOT_SHOWN')).toBe(true)
    expect(source.raw.every(row => row.flowDigest === w.snapshot.flow!.flowDigest && row.flowTermination === 'COMPLETE')).toBe(true)
    const rawExport = rawLongExport(projectId, source, w.waveId)
    expect(rawExport.csv).toContain('NOT_SHOWN')
    expect(rawExport.manifest.flowDigests).toEqual([w.snapshot.flow!.flowDigest])
    expect(rawExport.codebook.some(row => row.instrumentKey === unselected)).toBe(true)
    expect(rawExport.csv).not.toContain(proof.accessCredential)
    const scoreExport = exportLong(projectId, source.scores, [], source.scoreColumns)
    expect(scoreExport.csv).toContain('NOT_SHOWN')
    expect(scoreExport.csv).not.toContain(proof.accessCredential)
    // Conditional native tasks do not widen the existing anonymous export
    // contract into cross-wave, participant-linked wide tables.
    expect(() => rawWideExport(projectId, source)).toThrow()
    expect(() => exportWide(projectId, source.scores, [], source.scoreColumns)).toThrow()

    if (route === 'a') {
      const noConsent = await attempt(w, false)
      await expect(startSurveySituational(noConsent, selected, ordinary)).rejects.toThrow()
      expect(await db.situationalAttempt.count({ where: { surveyAttemptId: noConsent.attemptId } })).toBe(0)
    }
    // Real user withdrawal, not a direct status rewrite: immutable child and
    // parent facts remain, while stale proof loses recovery/report/export use.
    expect(await withdrawSingleResearchAttempt(proof)).toMatchObject({ status: 'WITHDRAWN', excludedAttempts: 1 })
    await expect(getOwnResearchTask(proof)).rejects.toThrow()
    await expect(readSurveySituational(proof, selected, started.attempt.id)).rejects.toThrow()
    await expect(submitSurveySituationalFinal(proof, selected, started.attempt.id, payload)).rejects.toThrow()
    await expect(submitResearchFinal(submission)).rejects.toThrow()
    await expect(readGeneralForOwnAttempt(proof)).rejects.toThrow()
    await expect(readSurveyCheckpoint(proof)).rejects.toThrow()
    expect(await db.situationalRawSubmission.count({ where: { attemptId: started.attempt.id } })).toBe(1)
    expect(await db.surveyWaveFinal.count({ where: { attemptId: proof.attemptId } })).toBe(1)
    const afterWithdrawal = await loadSurveySource({ actorUserId: owner, projectId, waveIds: [w.waveId], includeAttendance: false })
    expect(afterWithdrawal.raw.some(row => row.attemptId === proof.attemptId)).toBe(false)
    expect(afterWithdrawal.scores.some(row => row.attemptId === proof.attemptId)).toBe(false)
  }, 30_000)
})
