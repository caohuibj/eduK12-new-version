import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload, encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { decryptFrozenSituationalRuntimeSnapshot } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { createSjtDraft, requestSjtReview, reviewSjtDraft } from '../../modules/situational/authoring/service'
import { compileSjtTemplate } from '../../modules/situational/authoring/template'
import { situationalLegacyFinalSubmitSchema } from '../../modules/situational/situational-final-submit.schema'
import { joinLinkedStudy, startLinkedWave } from '../../modules/survey/admission.service'
import { exportLong } from '../../modules/survey/analytics.export-format'
import { rawLongExport } from '../../modules/survey/analytics.raw-export'
import { loadSurveySource } from '../../modules/survey/analytics.source'
import type { FormDraft, ScaleDraft } from '../../modules/survey/builder.definition'
import { createDraft, importCatalogDraft, updateDraft } from '../../modules/survey/builder.service'
import { grantCatalogSource } from '../../modules/survey/catalog.service'
import { readSurveyCheckpoint, saveSurveyCheckpoint } from '../../modules/survey/checkpoint.service'
import type { SurveyAttemptContentBinding } from '../../modules/survey/content-binding.service'
import type { SurveyComputedFinal } from '../../modules/survey/final.compute'
import { readGeneralForOwnAttempt, submitResearchFinal } from '../../modules/survey/final.service'
import { assignedSurveySnapshot, ensureSurveyFlowAssignment, type SurveyFlowAssignment } from '../../modules/survey/flow.assignment'
import { surveyVariantProvenance, type SurveyFlowDraft } from '../../modules/survey/flow.definition'
import { revokeLinkedResearchAccess, withdrawLinkedResearchData } from '../../modules/survey/identity.service'
import { publishSurveyMeasurementDraft } from '../../modules/survey/measurement-publication.service'
import type { ResearchFrozenPublication } from '../../modules/survey/publication.service'
import { surveySituationalReceiptReferenceSchema } from '../../modules/survey/situational-native.contract'
import { frozenSurveyNativeSituationalRuntime } from '../../modules/survey/situational-native.definition'
import { authorizeSurveySituationalImage, readSurveySituational, startSurveySituational, submitSurveySituationalFinal } from '../../modules/survey/situational-native.service'
import { getOwnResearchTask } from '../../modules/survey/task.public'
import { createWave, getWave } from '../../modules/survey/waves.service'
import { openWave, prepareWave } from '../../modules/survey/waves.publish'
import { getLocalAssetPath, storeAsset } from '../../services/assetStorage'
import { compileSjtNativeStagedFixture, createSjtNativeStagedFinalFixture, sjtNativeStagedTemplate } from '../fixtures/sjt-native-staged.fixture'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

// Only the existing allocator's integer draw is controlled. Crypto identities,
// encrypted persistence, author permissions, native execution and scoring are real.
const { draw } = vi.hoisted(() => ({ draw: vi.fn((_max: number): number => { throw new Error('Unexpected allocation draw') }) }))
vi.mock('node:crypto', async original => ({ ...await original<typeof import('node:crypto')>(), randomInt: draw }))
const url = integrationDatabaseUrl('SURVEY_NATIVE_SJT_TEST_DATABASE_URL', 'RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
type Arm = 'a' | 'b'
type Proof = { publicId: string; attemptId: string; researchCode: string; accessCredential: string }
const ordinary = { screen: { ready: 'yes' } }
const branch = (arm: Arm) => 'native_' + arm
const selectedKeys = (arm: Arm) => ['screen', 'common', branch(arm), 'tail']
const form: FormDraft = { schemaVersion: 1, pages: [{ pageKey: 'page', title: 'Synthetic introduction', questions: [
  { itemKey: 'ready', type: 'SINGLE', prompt: 'Ready for this synthetic task?', required: true, rows: [],
    options: [{ optionKey: 'yes', label: 'Ready' }, { optionKey: 'no', label: 'Not ready' }] },
] }] }
const scale: ScaleDraft = { schemaVersion: 1, presentationMode: 'ALL_AT_ONCE', respondentType: 'participant_self_report', aggregation: 'mean',
  responseOptions: [1, 2, 3, 4, 5].map(value => ({ optionKey: 'o' + value, label: String(value), score: value })),
  dimensions: [{ dimensionKey: 'response', label: 'Synthetic response', direction: 'descriptive' }],
  items: [{ itemKey: 'reflection', prompt: 'Synthetic tail item.', required: true, reverse: false, dimensionKeys: ['response'] }] }
const flow: SurveyFlowDraft = { schemaVersion: 1, embeddedData: [], experiment: {
  experimentKey: 'native_variants', mode: 'QUESTIONNAIRE_VARIANTS', linkedPolicy: 'RERANDOMIZE',
  groups: (['a', 'b'] as const).map(arm => ({ groupKey: arm, variantLabel: arm.toUpperCase(), weight: 1,
    materialTitle: '', materialBody: '', instrumentKeys: selectedKeys(arm) })),
}, blocks: ['screen', 'common', 'native_a', 'native_b', 'tail'].map(instrumentKey => ({ blockKey: instrumentKey, kind: 'INSTRUMENT', instrumentKey })) }
// Original synthetic RGB pixel. No production package or remote media is used.
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQSl0FAAGuASIgVC/fAAAAAElFTkSuQmCC', 'base64')

suite('Survey native questionnaire variants — real PostgreSQL', () => {
  let db: PrismaClient, owner: string, projectId: string, formId: string, scaleId: string, assetId: string, assetPath: string
  const nativeIds: string[] = []
  let compiled: ReturnType<typeof compileSjtNativeStagedFixture>
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    for (const [name, value] of Object.entries({ DATA_ENCRYPTION_KEY: 'a'.repeat(64), DATA_PSEUDONYM_KEY: 'b'.repeat(64),
      SURVEY_WORKSPACE_ENABLED: 'true', SURVEY_PUBLICATION_ENABLED: 'true' })) vi.stubEnv(name, value)
    db = new PrismaClient({ datasources: { db: { url: url! } } }); await db.$connect()
    const user = async (role: 'ADMIN' | 'STUDENT', accountDomain: 'LEGACY' | 'SURVEY') =>
      (await db.user.create({ data: { username: 'native-variants-' + randomUUID(), passwordHash: 'synthetic-only', role, accountDomain,
        ...(role === 'ADMIN' ? { platformRole: 'SYSTEM_ADMIN' } : {}) } })).id
    const admin = await user('ADMIN', 'LEGACY'), author = await user('STUDENT', 'LEGACY'); owner = await user('STUDENT', 'SURVEY')
    await db.adminEntryGrant.create({ data: { id: randomUUID(), userId: admin, entry: 'SURVEY', grantedBy: admin } })
    const login = 'variant_' + randomUUID().replace(/-/g, '').slice(0, 24)
    await db.surveyAccount.create({ data: { userId: owner, loginName: login, normalizedLogin: login } })
    await db.surveyResearcherGrant.create({ data: { userId: owner, status: 'ACTIVE', grantedBy: admin } })
    await db.surveyMfaCredential.create({ data: { userId: owner, enabled: true, secretCipher: 'synthetic-only' } })
    projectId = randomUUID()
    await db.surveyProject.create({ data: { id: projectId, ownerUserId: owner, title: 'Synthetic native variants',
      status: 'DRAFT', collectionMode: 'LINKED_WAVES' } })
    const asset = await storeAsset({ buffer: pixel, originalName: 'original-variant-pixel.png', mimeType: 'image/png',
      ownerId: author, accessScope: 'PRIVATE', scopeId: 'sjt-authoring', provider: 'local' })
    assetId = asset.id; assetPath = getLocalAssetPath(asset.objectKey)
    const image = { asset: { assetId, contentHash: asset.sha256, mimeType: 'image/png' as const },
      altText: 'Original synthetic blue pixel.', rightsStatus: 'self_authored' as const, rightsNote: 'Original synthetic fixture pixel.' }
    const template = { ...structuredClone(sjtNativeStagedTemplate), instrumentKey: 'synthetic-variants-' + randomUUID(),
      nodes: sjtNativeStagedTemplate.nodes.map((node, index) => ({ ...node, ...(index === 0 ? { image } : {}) })) }
    compiled = compileSjtTemplate(template) as ReturnType<typeof compileSjtNativeStagedFixture>
    const authored = await createSjtDraft({ userId: author, admin: false }, template, { authorizationPolicy: null })
    await requestSjtReview({ userId: author, admin: false }, authored.id, authored.revision, authored.contentDigest)
    await reviewSjtDraft({ userId: admin, admin: true }, authored.id, authored.revision, authored.contentDigest, true,
      'Original synthetic staged source and image; host variants do not change its scientific protocol')
    const release = await db.sjtAuthorRelease.findFirstOrThrow({ where: { sourceDraftId: authored.id } })
    const grant = await grantCatalogSource(admin, owner, { kind: 'SJT', sourceId: release.id, sourceVersion: template.instrumentVersion })
    for (const instrumentKey of ['common', 'native_a', 'native_b']) nativeIds.push((await importCatalogDraft(owner, projectId, grant.id,
      { requestId: randomUUID(), instrumentKey, title: 'Synthetic ' + instrumentKey })).id)
    for (const [kind, instrumentKey, definition] of [['FORM', 'screen', form], ['SCALE', 'tail', scale]] as const) {
      const created = await createDraft(owner, projectId, { requestId: randomUUID(), kind, instrumentKey, title: 'Synthetic ' + kind })
      const updated = await updateDraft(owner, projectId, created.id, { revision: 0, title: created.title, definition })
      if (kind === 'FORM') formId = updated.id
      else { scaleId = updated.id; await publishSurveyMeasurementDraft(owner, projectId, scaleId, updated.revision) }
    }
  }, 30_000)
  beforeEach(() => { draw.mockReset().mockImplementation(() => { throw new Error('Unexpected allocation draw') }) })
  afterAll(async () => {
    try { if (assetPath) await rm(assetPath, { force: true }) }
    finally { await db?.$disconnect(); vi.unstubAllEnvs() }
  })

  async function wave() {
    const draft = await createWave(owner, projectId, { requestId: randomUUID(), title: 'Synthetic native variants',
      consentText: 'Synthetic study consent covering linked waves and staged responses. No real participant data.',
      linkageNoticeConfirmed: true, allowNewParticipants: true, instrumentIds: [formId, ...nativeIds, scaleId], flowDefinition: flow,
      checkpointPolicy: { schemaVersion: 1, enabled: true, ttlHours: 2 } })
    const prepared = await prepareWave(owner, projectId, draft.id, draft.revision, undefined, nativeIds.map(instrumentId => ({ instrumentId,
      feedback: { policyVersion: 'SURVEY_RAW_METRICS_V1', mode: 'DESCRIPTIVE', metricKeys: ['coordination'], release: 'AFTER_FINAL' } })))
    const opened = await openWave(owner, projectId, draft.id, (await getWave(owner, projectId, draft.id)).revision)
    const publication = await db.surveyPublication.findUniqueOrThrow({ where: { id: prepared.publicationId } })
    const snapshot = publication.compiledSnapshot as unknown as ResearchFrozenPublication
    expect(canonicalHash(snapshot)).toBe(publication.definitionDigest)
    expect(snapshot.flow?.experiment?.mode).toBe('QUESTIONNAIRE_VARIANTS')
    expect(snapshot.quotaPolicy).toBeUndefined()
    const admit = async (arm: Arm): Promise<Proof> => {
      draw.mockImplementationOnce(max => { expect(max).toBe(2); return arm === 'a' ? 0 : 1 })
      const joined = await joinLinkedStudy({ publicId: opened.publicId, waveId: draft.id, entryToken: opened.entrySecret,
        consentVersion: 1, consent: true })
      return { publicId: opened.publicId, ...joined }
    }
    return { id: draft.id, snapshot, admit }
  }
  async function accepted(proof: Proof, slotKey: string) {
    const child = await startSurveySituational(proof, slotKey, ordinary)
    expect((await startSurveySituational(structuredClone(proof), slotKey)).attempt.id).toBe(child.attempt.id)
    expect((await readSurveySituational(proof, slotKey, child.attempt.id)).attempt.id).toBe(child.attempt.id)
    expect((await authorizeSurveySituationalImage(proof, slotKey, child.attempt.id, assetId)).definition.scenes[0].stimulus)
      .toMatchObject({ type: 'IMAGE', asset: { assetId } })
    const payload = situationalLegacyFinalSubmitSchema.parse({
      ...createSjtNativeStagedFinalFixture(child.attempt.id, 'path-A-A', compiled).finalInput, submissionId: randomUUID(),
    })
    const done = await submitSurveySituationalFinal(proof, slotKey, child.attempt.id, payload)
    const reference = surveySituationalReceiptReferenceSchema.parse(done.receipt)
    expect((await submitSurveySituationalFinal(proof, slotKey, child.attempt.id, payload)).receipt).toEqual(reference)
    return { child, payload, reference }
  }
  const source = (waveId: string) => loadSurveySource({ actorUserId: owner, projectId, waveIds: [waveId], includeAttendance: false })

  it('persists both selected variants through native resume, parent FINAL, report and union NOT_SHOWN exports', async () => {
    const w = await wave(), arms = ['a', 'b'] as const
    const participants = []
    for (const arm of arms) {
      const proof = await w.admit(arm), selected = branch(arm), other = branch(arm === 'a' ? 'b' : 'a')
      const parent = await db.surveyWaveAttempt.findUniqueOrThrow({ where: { id: proof.attemptId } })
      const assignment = decryptUnifiedRuntimePayload<SurveyFlowAssignment>(parent.flowAssignmentCipher!)
      expect(assignment).toMatchObject({ groupKey: arm, algorithm: 'CRYPTO_RANDOM_INT_V1', variant: surveyVariantProvenance(w.snapshot.flow!, arm) })
      // Cognitive host callers already carry the selected snapshot. Re-validating
      // their assignment must still compare the original publication identity.
      expect(await db.$transaction(tx => ensureSurveyFlowAssignment(tx, { projectId, waveId: w.id,
        attemptId: proof.attemptId, participantId: parent.participantId, researchCode: proof.researchCode,
        accessCredential: proof.accessCredential, snapshot: assignedSurveySnapshot(w.snapshot, assignment) }))).toEqual(assignment)
      const binding = decryptUnifiedRuntimePayload<SurveyAttemptContentBinding>(parent.contentBindingCipher!)
      expect(canonicalHash(binding)).toBe(parent.contentBindingHash)
      expect(binding.units.map(unit => unit.instrumentKey)).toEqual(['common', selected, 'tail'])
      expect(binding.units).toEqual(w.snapshot.units.filter(unit => ['common', selected, 'tail'].includes(unit.instrumentKey)).map(unit => ({
        instrumentKey: unit.instrumentKey, measurement: unit.measurementRelease, references: [],
      })))
      const task = await getOwnResearchTask(proof)
      expect(task.units.map(unit => unit.instrumentKey)).toEqual(selectedKeys(arm))
      expect(JSON.stringify(task)).not.toContain(other)
      expect(await getOwnResearchTask(structuredClone(proof))).toEqual(task)
      expect(await startLinkedWave({ ...proof, waveId: w.id, consentVersion: 1, consent: true }))
        .toMatchObject({ attemptId: proof.attemptId, recovered: true })
      await expect(startSurveySituational(proof, other, ordinary)).rejects.toThrow()
      const common = await accepted(proof, 'common'), own = await accepted(proof, selected)
      await expect(authorizeSurveySituationalImage(proof, other, own.child.attempt.id, assetId)).rejects.toThrow()
      await expect(readSurveySituational(proof, other, own.child.attempt.id)).rejects.toThrow()
      for (const item of [common, own]) {
        expect(item.child.attempt.definitionHash).toBe(compiled.definitionHash)
        const frozen = frozenSurveyNativeSituationalRuntime(w.snapshot.units.find(unit => unit.instrumentKey === (item === common ? 'common' : selected))!)
        const row = await db.situationalAttempt.findUniqueOrThrow({ where: { id: item.child.attempt.id } })
        expect(row.compiledRuntimeHash).toBe(frozen.header.compiledRuntimeHash)
        expect(canonicalHash(decryptFrozenSituationalRuntimeSnapshot(row.runtimeSnapshotEncrypted))).toBe(canonicalHash(frozen.snapshot))
      }
      const answers = { ...ordinary, common: {}, [selected]: {}, tail: { reflection: 'o4' } }
      await saveSurveyCheckpoint(proof, { revision: 0, answers })
      expect((await readSurveyCheckpoint(structuredClone(proof))).checkpoint?.answers).toEqual(answers)
      await expect(saveSurveyCheckpoint(proof, { revision: 1, answers: { ...answers, [other]: {} } })).rejects.toThrow()
      expect((await db.surveyWaveAttempt.findUniqueOrThrow({ where: { id: proof.attemptId } })).flowAssignmentCipher).toBe(parent.flowAssignmentCipher)
      participants.push({ proof, arm, selected, other, assignment, common, own, answers })
    }
    expect(draw).toHaveBeenCalledTimes(2)
    expect((await db.surveyWave.findUniqueOrThrow({ where: { id: w.id } })).startsCount).toBe(2)
    expect(await db.surveyExperimentQuotaBucket.count({ where: { waveId: w.id } })).toBe(0)
    for (const p of participants) {
      const foreign = participants.find(other => other.arm !== p.arm)!
      const input = { ...p.proof, submissionId: randomUUID(), answers: p.answers,
        situationalReferences: [p.common.reference, p.own.reference], presentation: { shownBlocks: selectedKeys(p.arm) } }
      await expect(submitResearchFinal({ ...input, situationalReferences: [p.common.reference] })).rejects.toThrow()
      await expect(submitResearchFinal({ ...input, situationalReferences: [...input.situationalReferences, foreign.own.reference] })).rejects.toThrow()
      await expect(submitResearchFinal({ ...input, answers: { ...input.answers, [p.other]: {} } })).rejects.toThrow()
      const done = await submitResearchFinal(input)
      expect(done.status).toBe('COMPLETED')
      expect(await submitResearchFinal(input)).toMatchObject({ receiptId: done.receiptId, idempotent: true })
      const final = await db.surveyWaveFinal.findUniqueOrThrow({ where: { attemptId: p.proof.attemptId } })
      const result = decryptUnifiedRuntimePayload<SurveyComputedFinal>(final.resultsCipher)
      expect(result.executionTrace).toMatchObject({ groupKey: p.arm, variant: p.assignment.variant,
        shownBlocks: selectedKeys(p.arm), skippedInstrumentKeys: [p.other], termination: 'COMPLETE' })
      expect(result.units.find(unit => unit.instrumentKey === p.other)).toMatchObject({ notExecuted: true, rawAnswers: {}, privateScoring: null })
      expect(await readGeneralForOwnAttempt(p.proof)).toMatchObject({ kind: 'DESCRIPTIVE', measurements: [
        { instrumentKey: 'common', metrics: [{ key: 'coordination', value: 5 }] },
        { instrumentKey: p.selected, metrics: [{ key: 'coordination', value: 5 }] },
      ] })
      expect(await db.situationalAttempt.count({ where: { surveyAttemptId: p.proof.attemptId, surveySlotKey: p.other } })).toBe(0)
      expect(await db.situationalRawSubmission.count({ where: { attempt: { surveyAttemptId: p.proof.attemptId, surveySlotKey: p.other } } })).toBe(0)
      expect(await db.situationalAttempt.count({ where: { surveyAttemptId: p.proof.attemptId } })).toBe(2)
      for (const [slotKey, child] of [['common', p.common], [p.selected, p.own]] as const) {
        expect((await readSurveySituational(p.proof, slotKey, child.child.attempt.id)).attempt.id).toBe(child.child.attempt.id)
        expect((await submitSurveySituationalFinal(p.proof, slotKey, child.child.attempt.id, child.payload)).receipt).toEqual(child.reference)
        expect(await db.situationalRawSubmission.count({ where: { attemptId: child.child.attempt.id } })).toBe(1)
      }
    }
    const exported = await source(w.id)
    expect(exported.completeAttempts).toBe(2)
    expect(exported.variantConfigurations?.[0].groups.map(group => group.variantKey)).toEqual(['a', 'b'])
    for (const p of participants) {
      const scores = exported.scores.filter(row => row.attemptId === p.proof.attemptId)
      expect(scores.find(row => row.measurement.instrumentKey === p.other)).toMatchObject({ value: null, missingReason: 'NOT_SHOWN' })
      expect(scores.filter(row => ['common', p.selected].includes(row.measurement.instrumentKey)).map(row => row.value)).toEqual([5, 5])
      const raw = exported.raw.filter(row => row.attemptId === p.proof.attemptId)
      expect(raw.filter(row => row.instrumentKey === p.other).length).toBeGreaterThan(0)
      expect(raw.filter(row => row.instrumentKey === p.other).every(row => row.value === null && row.missingReason === 'NOT_SHOWN')).toBe(true)
      expect(raw.every(row => row.experimentGroup === p.arm && row.variant?.variantKey === p.arm && row.assignmentDigest === canonicalHash(p.assignment))).toBe(true)
    }
    for (const output of [rawLongExport(projectId, exported, w.id), exportLong(projectId, exported.scores)]) {
      expect(output.csv).toContain('NOT_SHOWN')
      expect(output.csv).toContain('variant_key')
      expect(output.manifest.variantConfigurations?.[0].groups).toHaveLength(2)
      for (const p of participants) expect(output.csv).not.toContain(p.proof.accessCredential)
    }
    expect(draw).toHaveBeenCalledTimes(2)
  }, 30_000)

  it('fails closed on missing or changed assignment without redrawing, then denies revoked and withdrawn native access', async () => {
    const w = await wave(), proof = await w.admit('a'), common = await accepted(proof, 'common')
    const own = await accepted(proof, 'native_a')
    const finalInput = { ...proof, submissionId: randomUUID(), answers: { ...ordinary, common: {}, native_a: {}, tail: { reflection: 'o4' } },
      situationalReferences: [common.reference, own.reference], presentation: { shownBlocks: selectedKeys('a') } }
    const parent = await db.surveyWaveAttempt.findUniqueOrThrow({ where: { id: proof.attemptId } })
    const assignment = decryptUnifiedRuntimePayload<SurveyFlowAssignment>(parent.flowAssignmentCipher!)
    const assertDenied = async () => {
      await expect(startSurveySituational(proof, 'common', ordinary)).rejects.toThrow()
      await expect(readSurveySituational(proof, 'common', common.child.attempt.id)).rejects.toThrow()
      await expect(submitSurveySituationalFinal(proof, 'common', common.child.attempt.id, common.payload)).rejects.toThrow()
      await expect(authorizeSurveySituationalImage(proof, 'common', common.child.attempt.id, assetId)).rejects.toThrow()
      await expect(submitResearchFinal(finalInput)).rejects.toThrow()
      expect(draw).toHaveBeenCalledTimes(1)
      expect(await db.situationalAttempt.count({ where: { surveyAttemptId: proof.attemptId } })).toBe(2)
      expect(await db.situationalRawSubmission.count({ where: { attemptId: common.child.attempt.id } })).toBe(1)
      expect(await db.situationalRawSubmission.count({ where: { attemptId: own.child.attempt.id } })).toBe(1)
      expect(await db.surveyWaveFinal.count({ where: { attemptId: proof.attemptId } })).toBe(0)
    }
    // Corruption fixtures alter only the host assignment. Immutable native facts
    // and the one-time selected content binding are deliberately never rewritten.
    for (const corrupted of [null,
      encryptUnifiedRuntimePayload({ ...assignment, variant: { ...assignment.variant!, probability: 0.9 } }),
      encryptUnifiedRuntimePayload({ ...assignment, groupKey: 'b', variant: surveyVariantProvenance(w.snapshot.flow!, 'b') }),
    ]) {
      await db.surveyWaveAttempt.update({ where: { id: proof.attemptId }, data: { flowAssignmentCipher: corrupted } })
      try {
        await assertDenied()
        await expect(getOwnResearchTask(proof)).rejects.toThrow()
        expect(draw).toHaveBeenCalledTimes(1)
        const unchanged = await db.surveyWaveAttempt.findUniqueOrThrow({ where: { id: proof.attemptId } })
        expect(unchanged.flowAssignmentCipher).toBe(corrupted)
        expect(unchanged.contentBindingCipher).toBe(parent.contentBindingCipher)
        expect(unchanged.contentBindingHash).toBe(parent.contentBindingHash)
      } finally {
        await db.surveyWaveAttempt.update({ where: { id: proof.attemptId }, data: { flowAssignmentCipher: parent.flowAssignmentCipher } })
      }
    }
    expect((await readSurveySituational(proof, 'common', common.child.attempt.id)).attempt.id).toBe(common.child.attempt.id)
    expect((await submitSurveySituationalFinal(proof, 'common', common.child.attempt.id, common.payload)).receipt).toEqual(common.reference)
    const identity = { projectId, researchCode: proof.researchCode, accessCredential: proof.accessCredential }
    expect(await revokeLinkedResearchAccess(identity)).toEqual({ revoked: true })
    await assertDenied()
    await expect(getOwnResearchTask(proof)).rejects.toThrow()
    await expect(readGeneralForOwnAttempt(proof)).rejects.toThrow()
    expect(await withdrawLinkedResearchData(identity)).toMatchObject({ status: 'WITHDRAWN', excludedAttempts: 1 })
    await assertDenied()
    expect(await db.surveyWaveFinal.count({ where: { attemptId: proof.attemptId } })).toBe(0)
    expect((await db.surveyWaveAttempt.findUniqueOrThrow({ where: { id: proof.attemptId } })).status).toBe('WITHDRAWN')
  }, 30_000)
})
