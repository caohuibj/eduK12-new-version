import {grantGovernedCatalogFixture,revokeGovernedCatalogFixture} from '../fixtures/governed-catalog'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { decryptFrozenSituationalRuntimeSnapshot } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { createSjtDraft, requestSjtReview, reviewSjtDraft } from '../../modules/situational/authoring/service'
import { compileSjtTemplate } from '../../modules/situational/authoring/template'
import { situationalLegacyFinalSubmitSchema } from '../../modules/situational/situational-final-submit.schema'
import { startSingleUnlinkedWave } from '../../modules/survey/admission.service'
import { rawLongExport } from '../../modules/survey/analytics.raw-export'
import { loadSurveySource } from '../../modules/survey/analytics.source'
import { createDraft, importCatalogDraft, updateDraft } from '../../modules/survey/builder.service'
import type { FormDraft, ScaleDraft } from '../../modules/survey/builder.definition'
import { grantCatalogSource } from '../../modules/survey/catalog.service'
import { saveSurveyCheckpoint } from '../../modules/survey/checkpoint.service'
import type { SurveyComputedFinal } from '../../modules/survey/final.compute'
import { readGeneralForOwnAttempt, submitResearchFinal } from '../../modules/survey/final.service'
import type { SurveyFlowAssignment } from '../../modules/survey/flow.assignment'
import type { SurveyFlowDraft } from '../../modules/survey/flow.definition'
import { screenOutResearchAttempt } from '../../modules/survey/flow.screen-out.service'
import { withdrawSingleResearchAttempt } from '../../modules/survey/identity.service'
import { publishSurveyMeasurementDraft } from '../../modules/survey/measurement-publication.service'
import type { ResearchFrozenPublication } from '../../modules/survey/publication.service'
import { surveySituationalReceiptReferenceSchema } from '../../modules/survey/situational-native.contract'
import { frozenSurveyNativeSituationalRuntime } from '../../modules/survey/situational-native.definition'
import { startSurveySituational, submitSurveySituationalFinal } from '../../modules/survey/situational-native.service'
import { getOwnResearchTask } from '../../modules/survey/task.public'
import { createWave, getWave } from '../../modules/survey/waves.service'
import { openWave, prepareWave } from '../../modules/survey/waves.publish'
import { compileSjtNativeStagedFixture, createSjtNativeStagedFinalFixture, sjtNativeStagedTemplate } from '../fixtures/sjt-native-staged.fixture'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

const url = integrationDatabaseUrl('SURVEY_NATIVE_SJT_TEST_DATABASE_URL', 'RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
type Proof = { publicId: string; attemptId: string; accessCredential: string }
type Mode = 'COMPLETE_EARLY' | 'SCREEN_OUT' | 'MATERIAL_ONLY'
const ordinary = { screen: { decision: 'stop' } }
const form: FormDraft = { schemaVersion: 1, pages: [{ pageKey: 'page', title: 'Synthetic stopping condition', questions: [
  { itemKey: 'decision', type: 'SINGLE', prompt: 'Synthetic route choice.', required: true, rows: [],
    options: [{ optionKey: 'stop', label: 'Stop after the native task' }, { optionKey: 'continue', label: 'Continue' }] },
] }] }
const scale: ScaleDraft = { schemaVersion: 1, presentationMode: 'ALL_AT_ONCE', respondentType: 'participant_self_report', aggregation: 'mean',
  responseOptions: [1, 2, 3, 4, 5].map(value => ({ optionKey: 'o' + value, label: String(value), score: value })),
  dimensions: [{ dimensionKey: 'response', label: 'Synthetic response', direction: 'descriptive' }],
  items: [{ itemKey: 'reflection', prompt: 'Synthetic tail item.', required: true, reverse: false, dimensionKeys: ['response'] }] }

// The existing host END and material allocator remain authoritative. All SJT
// content is the original synthetic staged fixture, not a production package.
suite('Survey native host termination and material-only assignment — PostgreSQL', () => {
  let db: PrismaClient, owner: string, projectId: string, nativeId: string, formId: string, scaleId: string
  let compiled: ReturnType<typeof compileSjtNativeStagedFixture>
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    for (const [name, value] of Object.entries({ DATA_ENCRYPTION_KEY: 'a'.repeat(64), DATA_PSEUDONYM_KEY: 'b'.repeat(64),
      SURVEY_WORKSPACE_ENABLED: 'true', SURVEY_PUBLICATION_ENABLED: 'true' })) vi.stubEnv(name, value)
    db = new PrismaClient({ datasources: { db: { url: url! } } }); await db.$connect()
    const user = async (role: 'ADMIN' | 'STUDENT', accountDomain: 'LEGACY' | 'SURVEY') =>
      (await db.user.create({ data: { username: 'native-end-' + randomUUID(), passwordHash: 'synthetic-only', role, accountDomain,
        ...(role === 'ADMIN' ? { platformRole: 'SYSTEM_ADMIN' } : {}) } })).id
    const admin = await user('ADMIN', 'LEGACY'), author = await user('STUDENT', 'LEGACY'); owner = await user('STUDENT', 'SURVEY')
    await db.adminEntryGrant.create({ data: { id: randomUUID(), userId: admin, entry: 'SURVEY', grantedBy: admin } })
    const login = 'end_' + randomUUID().replace(/-/g, '').slice(0, 24)
    await db.surveyAccount.create({ data: { userId: owner, loginName: login, normalizedLogin: login } })
    await db.surveyResearcherGrant.create({ data: { userId: owner, status: 'ACTIVE', grantedBy: admin } })
    await db.surveyMfaCredential.create({ data: { userId: owner, enabled: true, secretCipher: 'synthetic-only' } })
    projectId = randomUUID()
    await db.surveyProject.create({ data: { id: projectId, ownerUserId: owner, title: 'Synthetic native host endings',
      status: 'DRAFT', collectionMode: 'SINGLE_UNLINKED' } })
    const template = { ...structuredClone(sjtNativeStagedTemplate), instrumentKey: 'synthetic-native-end-' + randomUUID() }
    compiled = compileSjtTemplate(template) as ReturnType<typeof compileSjtNativeStagedFixture>
    const authored = await createSjtDraft({ userId: author, admin: false }, template, { authorizationPolicy: null })
    await requestSjtReview({ userId: author, admin: false }, authored.id, authored.revision, authored.contentDigest)
    await reviewSjtDraft({ userId: admin, admin: true }, authored.id, authored.revision, authored.contentDigest, true, 'Original synthetic host integration fixture')
    const release = await db.sjtAuthorRelease.findFirstOrThrow({ where: { instrumentKey: template.instrumentKey } })
    const grant = await grantGovernedCatalogFixture(db,admin, owner, { kind: 'SJT', sourceId: release.id, sourceVersion: template.instrumentVersion })
    nativeId = (await importCatalogDraft(owner, projectId, grant.id, { requestId: randomUUID(), instrumentKey: 'native', title: 'Synthetic staged task' })).id
    for (const [kind, instrumentKey, definition] of [['FORM', 'screen', form], ['SCALE', 'tail', scale]] as const) {
      const created = await createDraft(owner, projectId, { requestId: randomUUID(), kind, instrumentKey, title: 'Synthetic ' + kind })
      const updated = await updateDraft(owner, projectId, created.id, { revision: 0, title: created.title, definition })
      if (kind === 'FORM') formId = updated.id
      else { scaleId = updated.id; await publishSurveyMeasurementDraft(owner, projectId, scaleId, updated.revision) }
    }
  }, 30_000)
  afterAll(async () => { await db?.$disconnect(); vi.unstubAllEnvs() })

  async function wave(mode: Mode) {
    const flow: SurveyFlowDraft = { schemaVersion: 1, embeddedData: [], blocks: [
      { blockKey: 'screen', kind: 'INSTRUMENT', instrumentKey: 'screen' },
      { blockKey: 'native', kind: 'INSTRUMENT', instrumentKey: 'native' },
    ] }
    if (mode === 'MATERIAL_ONLY') flow.experiment = { experimentKey: 'native_material', linkedPolicy: 'RERANDOMIZE', groups: [
      { groupKey: 'a', weight: 1, materialTitle: 'Synthetic A', materialBody: 'Original synthetic material alpha.' },
      { groupKey: 'b', weight: 1, materialTitle: 'Synthetic B', materialBody: 'Original synthetic material beta.' },
    ] }
    else flow.blocks.push({ blockKey: 'stop', kind: 'END', termination: mode,
      when: { op: 'EQUALS', field: { source: 'ANSWER', instrumentKey: 'screen', itemKey: 'decision' }, value: 'stop' } })
    flow.blocks.push({ blockKey: 'tail', kind: 'INSTRUMENT', instrumentKey: 'tail' })
    const draft = await createWave(owner, projectId, { requestId: randomUUID(), title: 'Synthetic ' + mode,
      consentText: 'Synthetic research consent covering native staged responses and optional temporary answer storage.',
      instrumentIds: [formId, nativeId, scaleId], flowDefinition: flow,
      checkpointPolicy: { schemaVersion: 1, enabled: true, ttlHours: 2 },
      ...(mode === 'MATERIAL_ONLY' ? { quotaPolicy: { schemaVersion: 1 as const, groupLimits: { a: 1, b: 1 } } } : {}) })
    const prepared = await prepareWave(owner, projectId, draft.id, draft.revision, undefined, [{ instrumentId: nativeId,
      feedback: { policyVersion: 'SURVEY_RAW_METRICS_V1', mode: 'DESCRIPTIVE', metricKeys: ['coordination'], release: 'AFTER_FINAL' } }])
    const opened = await openWave(owner, projectId, draft.id, (await getWave(owner, projectId, draft.id)).revision)
    const publication = await db.surveyPublication.findUniqueOrThrow({ where: { id: prepared.publicationId } })
    const snapshot = publication.compiledSnapshot as unknown as ResearchFrozenPublication
    expect(canonicalHash(snapshot)).toBe(publication.definitionDigest)
    const admit = async (): Promise<Proof> => ({ publicId: opened.publicId, ...await startSingleUnlinkedWave({
      publicId: opened.publicId, waveId: draft.id, entryToken: opened.entrySecret, consent: true, consentVersion: 1,
    }) })
    return { id: draft.id, snapshot, admit }
  }
  async function acceptedNative(proof: Proof) {
    const child = await startSurveySituational(proof, 'native', ordinary)
    const payload = situationalLegacyFinalSubmitSchema.parse({
      ...createSjtNativeStagedFinalFixture(child.attempt.id, 'path-A-A', compiled).finalInput, submissionId: randomUUID(),
    })
    const accepted = await submitSurveySituationalFinal(proof, 'native', child.attempt.id, payload)
    return { child, payload, reference: surveySituationalReceiptReferenceSchema.parse(accepted.receipt) }
  }
  const source = (waveId: string) => loadSurveySource({ actorUserId: owner, projectId, waveIds: [waveId], includeAttendance: false })

  it('accepts native facts before COMPLETE_EARLY and marks the unexecuted tail NOT_SHOWN without requiring its answers', async () => {
    const w = await wave('COMPLETE_EARLY'), proof = await w.admit(), native = await acceptedNative(proof)
    const input = { ...proof, submissionId: randomUUID(), answers: { ...ordinary, native: {} },
      situationalReferences: [native.reference], presentation: { shownBlocks: ['screen', 'native', 'stop'] } }
    await expect(submitResearchFinal({ ...input, situationalReferences: [] })).rejects.toThrow()
    await expect(submitResearchFinal({ ...input, answers: { ...input.answers, tail: { reflection: 'o4' } } })).rejects.toThrow()
    const done = await submitResearchFinal(input)
    expect(done.status).toBe('COMPLETED')
    expect(await submitResearchFinal(input)).toMatchObject({ receiptId: done.receiptId, idempotent: true })
    const row = await db.surveyWaveFinal.findUniqueOrThrow({ where: { attemptId: proof.attemptId } })
    const result = decryptUnifiedRuntimePayload<SurveyComputedFinal>(row.resultsCipher)
    expect(result.executionTrace).toMatchObject({ termination: 'COMPLETE_EARLY', endBlockKey: 'stop',
      shownBlocks: ['screen', 'native', 'stop'], skippedInstrumentKeys: ['tail'] })
    expect(result.units.find(unit => unit.instrumentKey === 'native')).toMatchObject({ nativeReference: native.reference, rawAnswers: {} })
    expect(result.units.find(unit => unit.instrumentKey === 'tail')).toMatchObject({ notExecuted: true, privateScoring: null })
    expect(await readGeneralForOwnAttempt(proof)).toMatchObject({ kind: 'DESCRIPTIVE', measurements: [
      { instrumentKey: 'native', metrics: [{ key: 'coordination', value: 5 }] },
    ] })
    const exported = await source(w.id)
    expect(exported).toMatchObject({ completeAttempts: 1, fullCompletionAttempts: 0, earlyCompletionAttempts: 1 })
    expect(exported.scores.find(score => score.measurement.instrumentKey === 'tail')).toMatchObject({ value: null, missingReason: 'NOT_SHOWN' })
    expect(exported.raw.filter(raw => raw.instrumentKey === 'tail')).toEqual([expect.objectContaining({ value: null, missingReason: 'NOT_SHOWN' })])
    expect(rawLongExport(projectId, exported, w.id).csv).toContain('COMPLETE_EARLY')
    expect(await db.situationalRawSubmission.count({ where: { attemptId: native.child.attempt.id } })).toBe(1)
  }, 30_000)

  it('screens out after accepted native facts without a parent FINAL or report, stores only verified reference identities and recovers lost status safely', async () => {
    const w = await wave('SCREEN_OUT'), proof = await w.admit(), native = await acceptedNative(proof)
    const input = { ...proof, submissionId: randomUUID(), answers: { ...ordinary, native: {} },
      situationalReferences: [native.reference], presentation: { shownBlocks: ['screen', 'native', 'stop'] } }
    await saveSurveyCheckpoint(proof, { revision: 0, answers: input.answers })
    await expect(submitResearchFinal(input)).rejects.toThrow()
    await expect(screenOutResearchAttempt({ ...input, situationalReferences: [] })).rejects.toThrow()
    await expect(screenOutResearchAttempt({ ...input, situationalReferences: [{ ...native.reference, payloadHash: '0'.repeat(64) }] })).rejects.toThrow()
    await expect(screenOutResearchAttempt({ ...input, answers: { screen: { decision: 'continue' }, native: {} } })).rejects.toThrow()
    expect((await db.surveyWaveAttempt.findUniqueOrThrow({ where: { id: proof.attemptId } })).status).toBe('STARTED')
    expect(await screenOutResearchAttempt(input)).toEqual({ status: 'SCREENED_OUT', idempotent: false })
    expect(await db.surveyWaveFinal.count({ where: { attemptId: proof.attemptId } })).toBe(0)
    expect(await db.surveyAttemptCheckpoint.count({ where: { attemptId: proof.attemptId } })).toBe(0)
    expect((await db.situationalAttempt.findUniqueOrThrow({ where: { id: native.child.attempt.id } })).status).toBe('COMPLETED')
    expect(await db.situationalRawSubmission.count({ where: { attemptId: native.child.attempt.id } })).toBe(1)
    const events = await db.surveyEvent.findMany({ where: { projectId, action: 'SURVEY_FLOW_SCREENED_OUT' } })
    expect(events).toHaveLength(1)
    expect(events[0].metadata).toMatchObject({ acceptedTaskReferences: { cognitive: [], situational: [native.reference] } })
    const eventText = JSON.stringify(events[0].metadata)
    for (const forbidden of ['"decision"', '"responses"', '"researchCapture"', '"metrics"', '"coordination"', proof.accessCredential])
      expect(eventText).not.toContain(forbidden)
    expect(await getOwnResearchTask(structuredClone(proof))).toMatchObject({ status: 'SCREENED_OUT', units: [] })
    await expect(readGeneralForOwnAttempt(proof)).rejects.toThrow()
    const exported = await source(w.id)
    expect(exported).toMatchObject({ completeAttempts: 0, raw: [], scores: [] })
    // Terminal retry is only a fresh-authority status confirmation, not
    // acceptance of another payload or another set of task references.
    expect(await screenOutResearchAttempt({ ...input, submissionId: randomUUID(), answers: {}, situationalReferences: [] }))
      .toEqual({ status: 'SCREENED_OUT', idempotent: true })
    expect(await db.surveyEvent.count({ where: { projectId, action: 'SURVEY_FLOW_SCREENED_OUT' } })).toBe(1)
    expect((await db.surveyEvent.findUniqueOrThrow({ where: { id: events[0].id } })).metadata).toEqual(events[0].metadata)
    await expect(screenOutResearchAttempt({ ...input, accessCredential: 'x'.repeat(43) })).rejects.toThrow()
    await withdrawSingleResearchAttempt(proof)
    await expect(screenOutResearchAttempt(input)).rejects.toThrow()
    await expect(getOwnResearchTask(proof)).rejects.toThrow()
    expect(await db.situationalRawSubmission.count({ where: { attemptId: native.child.attempt.id } })).toBe(1)
  }, 30_000)

  it('uses the real material-only quota allocator and stable recovery without changing native scientific identity', async () => {
    const w = await wave('MATERIAL_ONLY')
    expect(w.snapshot.flow?.experiment).not.toHaveProperty('mode')
    const proofs = [await w.admit(), await w.admit()]
    await expect(w.admit()).rejects.toThrow()
    expect(await db.surveyWaveAttempt.count({ where: { waveId: w.id } })).toBe(2)
    expect((await db.surveyWave.findUniqueOrThrow({ where: { id: w.id } })).startsCount).toBe(2)
    const quota = async () => (await db.surveyExperimentQuotaBucket.findMany({ where: { waveId: w.id }, orderBy: { groupKey: 'asc' } }))
      .map(row => ({ groupKey: row.groupKey, assignedCount: row.assignedCount }))
    expect(await quota()).toEqual([{ groupKey: 'a', assignedCount: 1 }, { groupKey: 'b', assignedCount: 1 }])
    const groups = new Map<string, string>(), frozen = frozenSurveyNativeSituationalRuntime(w.snapshot.units.find(unit => unit.instrumentKey === 'native')!)
    for (const proof of proofs) {
      const before = await db.surveyWaveAttempt.findUniqueOrThrow({ where: { id: proof.attemptId } })
      const assigned = decryptUnifiedRuntimePayload<SurveyFlowAssignment>(before.flowAssignmentCipher!)
      expect(assigned.algorithm).toBe('CRYPTO_QUOTA_WEIGHTED_V1')
      expect(assigned).not.toHaveProperty('variant')
      groups.set(proof.attemptId, assigned.groupKey!)
      const material = w.snapshot.flow!.experiment!.groups.find(group => group.groupKey === assigned.groupKey)!
      const task = await getOwnResearchTask(proof), recovered = await getOwnResearchTask(structuredClone(proof))
      expect(task.flow?.selectedMaterial).toEqual({ blockKey: 'assigned_material', title: material.materialTitle, body: material.materialBody })
      expect(recovered.flow).toEqual(task.flow)
      expect(JSON.stringify(task)).not.toContain('"groupKey"')
      const native = await acceptedNative(proof)
      // Deliberate isolated-fixture corruption: an existing child must never
      // silently allocate again when its parent's authoritative assignment is missing.
      await db.surveyWaveAttempt.update({ where: { id: proof.attemptId }, data: { flowAssignmentCipher: null } })
      await expect(startSurveySituational(proof, 'native')).rejects.toThrow('持久化')
      expect((await db.surveyWaveAttempt.findUniqueOrThrow({ where: { id: proof.attemptId } })).flowAssignmentCipher).toBeNull()
      await db.surveyWaveAttempt.update({ where: { id: proof.attemptId }, data: { flowAssignmentCipher: before.flowAssignmentCipher } })
      expect((await startSurveySituational(proof, 'native')).attempt.id).toBe(native.child.attempt.id)
      expect(native.child.attempt).toMatchObject({ definitionHash: compiled.definitionHash,
        compiledRuntimeHash: frozen.header.compiledRuntimeHash, scorerKey: frozen.header.scorerKey, scoringVersion: frozen.header.scoringVersion })
      const stored = await db.situationalAttempt.findUniqueOrThrow({ where: { id: native.child.attempt.id } })
      expect(canonicalHash(decryptFrozenSituationalRuntimeSnapshot(stored.runtimeSnapshotEncrypted))).toBe(canonicalHash(frozen.snapshot))
      expect((await db.surveyWaveAttempt.findUniqueOrThrow({ where: { id: proof.attemptId } })).flowAssignmentCipher).toBe(before.flowAssignmentCipher)
      const input = { ...proof, submissionId: randomUUID(), answers: { ...ordinary, native: {}, tail: { reflection: 'o4' } },
        situationalReferences: [native.reference], presentation: { shownBlocks: ['assigned_material', 'screen', 'native', 'tail'] } }
      await expect(submitResearchFinal({ ...input, presentation: { shownBlocks: ['screen', 'native', 'tail'] } })).rejects.toThrow()
      await submitResearchFinal(input)
      const parent = await db.surveyWaveFinal.findUniqueOrThrow({ where: { attemptId: proof.attemptId } })
      expect(decryptUnifiedRuntimePayload<SurveyComputedFinal>(parent.resultsCipher).executionTrace).toMatchObject({
        groupKey: assigned.groupKey, experimentKey: 'native_material', algorithm: 'CRYPTO_QUOTA_WEIGHTED_V1',
        shownBlocks: input.presentation.shownBlocks, termination: 'COMPLETE',
      })
    }
    expect(new Set(groups.values())).toEqual(new Set(['a', 'b']))
    expect(await quota()).toEqual([{ groupKey: 'a', assignedCount: 1 }, { groupKey: 'b', assignedCount: 1 }])
    const exported = await source(w.id)
    expect(exported.completeAttempts).toBe(2)
    expect(exported.raw.some(row => row.instrumentKey === 'native')).toBe(true)
    expect(exported.raw.every(row => row.experimentGroup === groups.get(row.attemptId) && row.flowTermination === 'COMPLETE')).toBe(true)
    expect(exported.scores.filter(row => row.measurement.instrumentKey === 'native').map(row => row.value)).toEqual([5, 5])
  }, 30_000)
})
