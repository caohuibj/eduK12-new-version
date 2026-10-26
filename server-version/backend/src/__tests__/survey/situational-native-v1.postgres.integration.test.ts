import {grantGovernedCatalogFixture,revokeGovernedCatalogFixture} from '../fixtures/governed-catalog'
import { randomBytes, randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { decryptFrozenSituationalRuntimeSnapshot } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { parseCanonicalUnitResultEnvelope } from '../../modules/assessment-runtime/unit-result'
import type { SituationalScientificDeclarationV1 } from '../../modules/situational/onboarding/scientific-schema'
import { scoreSituationalModel } from '../../modules/situational/situation-model-resolver'
import { validateSituationPackage, type SituationPackageV1 } from '../../modules/situational/situation-package'
import { getSituationPackage, listSituationPackages } from '../../modules/situational/situation-package.registry'
import { submitSituationalAttemptFinal } from '../../modules/situational/situational-final-submit.service'
import { situationalLegacyFinalSubmitSchema } from '../../modules/situational/situational-final-submit.schema'
import { parseSituationalRawSubmissionPayload, SITUATIONAL_RAW_ENCODING_VERSION } from '../../modules/situational/situational-raw-submission'
import { startSituationalAttempt } from '../../modules/situational/situational-runtime.service'
import { loadSurveySource } from '../../modules/survey/analytics.source'
import { importCatalogDraft } from '../../modules/survey/builder.service'
import { grantCatalogSource } from '../../modules/survey/catalog.service'
import { bindSurveyAttemptContent } from '../../modules/survey/content-binding.service'
import type { SurveyComputedFinal } from '../../modules/survey/final.compute'
import { readGeneralForOwnAttempt, submitResearchFinal } from '../../modules/survey/final.service'
import { hashResearchCredential } from '../../modules/survey/identity.service'
import { disclosedSurveyConsent, hasSurveyStagedSituationalNotice, SURVEY_LINEAR_SJT_NOTICE } from '../../modules/survey/measurement.notice'
import { freezeResearchWaveDraft, type ResearchFrozenPublication } from '../../modules/survey/publication.service'
import { compileSurveyNativeSituationalHeader, surveyNativeSituationalRequiresStageNotice } from '../../modules/survey/situational-native.definition'
import { readSurveySituational, startSurveySituational, submitSurveySituationalFinal } from '../../modules/survey/situational-native.service'
import { getOwnResearchTask } from '../../modules/survey/task.public'
import { prepareCanonicalSubmission } from '../../services/instrumentFinalSubmit'
import { createSjtNativeStagedPackage, sjtNativeStagedTemplate } from '../fixtures/sjt-native-staged.fixture'
import { compileSjtNativeV1Fixture, createSjtNativeV1FinalFixture, createSjtNativeV1ScientificDeclaration } from '../fixtures/sjt-native-v1.fixture'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

// Only this newly authored synthetic identity is injected. Production registry
// packages, licenses, scientific declarations, admission and scorers stay real.
// This is a test registry seam, not proof of actual registry authorization.
const registry = vi.hoisted(() => ({
  pkg: undefined as SituationPackageV1 | undefined,
  scientific: undefined as SituationalScientificDeclarationV1 | undefined,
}))
vi.mock('../../modules/situational/situation-package.registry', async importOriginal => {
  const actual = await importOriginal<typeof import('../../modules/situational/situation-package.registry')>()
  return {
    ...actual,
    getSituationPackage: (key: string, version: string) =>
      registry.pkg?.key === key && registry.pkg.instrumentVersion === version
        ? structuredClone(registry.pkg) : actual.getSituationPackage(key, version),
    hasSituationPackage: (key: string, version: string) =>
      registry.pkg?.key === key && registry.pkg.instrumentVersion === version
        || actual.hasSituationPackage(key, version),
    listSituationPackages: () => [...actual.listSituationPackages(), ...(registry.pkg ? [structuredClone(registry.pkg)] : [])],
  }
})
vi.mock('../../modules/situational/onboarding/scientific-registry', async importOriginal => {
  const actual = await importOriginal<typeof import('../../modules/situational/onboarding/scientific-registry')>()
  return {
    ...actual,
    getSituationalScientificDeclaration: (key: string, version: string) =>
      registry.pkg?.key === key && registry.pkg.instrumentVersion === version
        ? structuredClone(registry.scientific) : actual.getSituationalScientificDeclaration(key, version),
  }
})

const compiled = compileSjtNativeV1Fixture('synthetic-native-v1-' + randomUUID())
registry.pkg = { ...compiled.package, releaseStatus: 'PUBLISHED' }
registry.scientific = createSjtNativeV1ScientificDeclaration()

describe('Original synthetic V1 package contract, not an actual registry release', () => {
  it('validates the independent V1 scalar definition and its hand-calculated golden cases', () => {
    const original = createSjtNativeStagedPackage()
    const originalHash = canonicalHash(original)
    expect(compiled.package.releaseStatus).toBe('DRAFT')
    expect(compiled.package.definition.schemaVersion).toBe(1)
    expect(compiled.package.definition.scoring).not.toHaveProperty('model')
    expect(compiled.package.definition.scoring.choiceScores).toHaveLength(4)
    expect(compiled.package.definition.scenes.map(scene => scene.stimulus)).toEqual(
      sjtNativeStagedTemplate.nodes.map(node => ({ type: 'TEXT_V1', text: node.stimulus })))
    expect(compiled.package.definition.source.citation).toBe(original.definition.source.citation)
    expect(compiled.package.definition.license).toMatchObject({ status: 'self_authored', redistribution: 'allowed' })
    expect(compiled.package.definition.license).toEqual(original.definition.license)
    expect(compiled.package.goldenCases).toHaveLength(5)
    expect(validateSituationPackage(compiled.package)).toMatchObject({ valid: true, definitionHash: compiled.definitionHash })
    for (const golden of compiled.package.goldenCases) {
      const result = scoreSituationalModel(compiled.package.definition, golden.responses)
      expect(result.quality.status).toBe(golden.expected.quality)
      expect(result.metrics.map(metric => metric.key)).toEqual(golden.expected.metricKeys)
      expect(Object.fromEntries(result.metrics.map(metric => [metric.key, metric.value]))).toEqual(golden.expected.metrics)
    }
    expect(canonicalHash(original)).toBe(originalHash)
    expect(createSjtNativeV1FinalFixture().finalInput).not.toHaveProperty('researchCapture')
  })

  it('adds only the synthetic identity and keeps all actual registry packages and rights untouched', async () => {
    const actual = await vi.importActual<typeof import('../../modules/situational/situation-package.registry')>(
      '../../modules/situational/situation-package.registry')
    expect(actual.getSituationPackage(compiled.package.key, compiled.package.instrumentVersion)).toBeUndefined()
    expect(listSituationPackages().filter(pkg => pkg.key !== compiled.package.key)).toEqual(actual.listSituationPackages())
    for (const pkg of actual.listSituationPackages()) {
      expect(getSituationPackage(pkg.key, pkg.instrumentVersion)).toEqual(pkg)
    }
    const header = compileSurveyNativeSituationalHeader(registry.pkg!)
    expect(header).toMatchObject({ definitionHash: compiled.definitionHash, scientificContext: {
      scientificMaturity: 'PILOT', scope: { use: 'Software contract testing only' },
    } })
    expect(surveyNativeSituationalRequiresStageNotice(compiled.package.definition)).toBe(false)
    expect(() => compileSurveyNativeSituationalHeader(compiled.package)).toThrow()
  })

  it('does not widen V1 admission to unsupported media, assignment, stimulus variants or a hidden parent flow', () => {
    const media = structuredClone(registry.pkg!)
    media.definition.scenes[0].stimulus = {
      type: 'IMAGE', text: 'Synthetic text fallback', altText: 'Synthetic image',
      asset: { assetId: randomUUID(), contentHash: 'a'.repeat(64), mimeType: 'image/png' },
    }
    expect(validateSituationPackage(media).valid).toBe(true)
    expect(() => compileSurveyNativeSituationalHeader(media)).not.toThrow()
    // Header compilation alone grants no image publication or delivery rights;
    // those require the exact source/publication/child pins tested separately.
    const comic=structuredClone(registry.pkg!)
    comic.definition.scenes[0].stimulus={type:'COMIC_PANELS',panels:[]} as never
    expect(() => compileSurveyNativeSituationalHeader(comic)).toThrow()
    for (const extension of [
      { researchAssignment: { assignmentVersion: 'synthetic-unadmitted', groups: [] } },
      { flow: { strategy: 'BRANCHING_DAG_V1', entryNodeKey: 'hidden', nodes: [] } },
    ]) {
      const altered = { ...registry.pkg!, definition: { ...compiled.package.definition, ...extension } }
      expect(() => compileSurveyNativeSituationalHeader(altered)).toThrow()
    }
    const variants = structuredClone(registry.pkg!)
    Object.assign(variants.definition.scenes[0], { stimulusVariants: [{ variantKey: 'hidden' }] })
    expect(() => compileSurveyNativeSituationalHeader(variants)).toThrow()
  })
})

const url = integrationDatabaseUrl('SURVEY_NATIVE_SJT_TEST_DATABASE_URL')
const suite = url ? describe : describe.skip
suite('Survey native V1 TEXT with real PostgreSQL and synthetic registry only', () => {
  let db: PrismaClient, admin: string, owner: string, participant: string
  let projectId: string, publicId: string, draftId: string, ordinal = 0
  const consentText = 'Synthetic research participation consent; this test contains no real participant information.'

  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64))
    vi.stubEnv('DATA_PSEUDONYM_KEY', 'b'.repeat(64))
    vi.stubEnv('SURVEY_WORKSPACE_ENABLED', 'true')
    vi.stubEnv('SURVEY_PUBLICATION_ENABLED', 'true')
    db = new PrismaClient({ datasources: { db: { url: url! } } })
    await db.$connect()
    const user = async (role: 'ADMIN' | 'STUDENT', accountDomain: 'LEGACY' | 'SURVEY') =>
      (await db.user.create({ data: { username: 'native-v1-' + randomUUID(), passwordHash: 'synthetic-only',
        role, accountDomain, ...(role === 'ADMIN' ? { platformRole: 'SYSTEM_ADMIN' } : {}) } })).id
    admin = await user('ADMIN', 'LEGACY')
    participant = await user('STUDENT', 'LEGACY')
    owner = await user('STUDENT', 'SURVEY')
    await db.adminEntryGrant.create({ data: { id: randomUUID(), userId: admin, entry: 'SURVEY', grantedBy: admin } })
    const login = 'nativev1_' + randomUUID().replace(/-/g, '').slice(0, 22)
    await db.surveyAccount.create({ data: { userId: owner, loginName: login, normalizedLogin: login } })
    await db.surveyResearcherGrant.create({ data: { userId: owner, status: 'ACTIVE', grantedBy: admin } })
    await db.surveyMfaCredential.create({ data: { userId: owner, enabled: true, secretCipher: 'synthetic-only' } })
    const grant = await grantGovernedCatalogFixture(db,admin, owner, { kind: 'SJT',
      sourceId: 'registry:' + compiled.package.key, sourceVersion: compiled.package.instrumentVersion })
    projectId = randomUUID(); publicId = randomUUID()
    await db.surveyProject.create({ data: { id: projectId, publicId, ownerUserId: owner,
      title: 'Synthetic V1 registry contract, not actual registry authorization', status: 'ACTIVE', collectionMode: 'SINGLE_UNLINKED' } })
    draftId = (await importCatalogDraft(owner, projectId, grant.id, {
      requestId: randomUUID(), instrumentKey: 'linear', title: 'Original synthetic V1 TEXT tool',
    })).id
  })
  afterAll(async () => { await db?.$disconnect(); vi.unstubAllEnvs() })

  async function wave() {
    const waveId = randomUUID()
    await db.surveyWave.create({ data: { id: waveId, projectId, ordinal: ++ordinal,
      title: 'Synthetic fixed-linear V1 wave', instrumentIds: [draftId], consentText } })
    return waveId
  }
  const publicationInput = (waveId: string) => ({ actorUserId: owner, projectId, waveId, revision: 0,
    participantFeedback: [{ instrumentId: draftId, feedback: { policyVersion: 'SURVEY_RAW_METRICS_V1' as const,
      mode: 'DESCRIPTIVE' as const, metricKeys: ['coordination'], release: 'AFTER_FINAL' as const } }] })
  async function fixture() {
    const waveId = await wave()
    const published = await freezeResearchWaveDraft(publicationInput(waveId))
    const publication = await db.surveyPublication.findUniqueOrThrow({ where: { id: published.publicationId } })
    const snapshot = publication.compiledSnapshot as unknown as ResearchFrozenPublication
    expect(snapshot.units[0].compiledDefinition).toEqual(compiled.package.definition)
    expect(snapshot.units[0].executionProtocol).toBe('SITUATIONAL_NATIVE_V1')
    expect(snapshot.measurementNotice).toEqual(SURVEY_LINEAR_SJT_NOTICE)
    expect(snapshot).not.toHaveProperty('flow')
    expect(hasSurveyStagedSituationalNotice(snapshot.measurementNotice)).toBe(false)
    expect(disclosedSurveyConsent(consentText, snapshot)).toBe(consentText+'\n\n'+SURVEY_LINEAR_SJT_NOTICE.text)
    await db.surveyWave.update({ where: { id: waveId }, data: { status: 'OPEN',
      opensAt: new Date(Date.now() - 60_000), closesAt: new Date(Date.now() + 3_600_000),
      finishUntil: new Date(Date.now() + 7_200_000) } })
    const attemptId = randomUUID(), accessCredential = randomBytes(32).toString('base64url')
    await db.$transaction(async tx => {
      await tx.surveyWaveAttempt.create({ data: { id: attemptId, projectId, waveId, status: 'STARTED',
        sessionHash: hashResearchCredential(accessCredential) } })
      await tx.surveyConsent.create({ data: { id: randomUUID(), projectId, waveId, attemptId,
        consentVersion: 1, accepted: true } })
      await bindSurveyAttemptContent(tx, { projectId, waveId, attemptId,
        publicationId: published.publicationId, newAttempt: true })
    })
    return { proof: { publicId, attemptId, accessCredential }, waveId, publicationId: published.publicationId }
  }

  it.each(['path-A-A', 'path-B-B'])('shares exact V1 %s scorer, raw, replay, receipt, report and export with standalone Training', async caseName => {
    const f = await fixture()
    const task = await getOwnResearchTask(f.proof)
    expect(task.units[0]).toMatchObject({ instrumentKey: 'linear', executionProtocol: 'SITUATIONAL_NATIVE_V1' })
    expect(JSON.stringify(task)).not.toContain('expertKey')
    const child = await startSurveySituational(f.proof, 'linear')
    expect((await startSurveySituational(f.proof, 'linear')).attempt.id).toBe(child.attempt.id)
    expect((await readSurveySituational(f.proof, 'linear', child.attempt.id)).attempt.id).toBe(child.attempt.id)
    expect(child.instrument).not.toHaveProperty('assignment')
    expect(child.instrument.definition.schemaVersion).toBe(1)
    expect(JSON.stringify(child)).not.toContain('expertKey')
    const golden = createSjtNativeV1FinalFixture(child.attempt.id, caseName, compiled)
    const payload = situationalLegacyFinalSubmitSchema.parse({ ...golden.finalInput,
      submissionId: randomUUID(), compiledRuntimeHash: child.attempt.compiledRuntimeHash })
    expect(payload).not.toHaveProperty('researchCapture')
    const training = await startSituationalAttempt(participant, { instrumentKey: compiled.package.key,
      instrumentVersion: compiled.package.instrumentVersion })
    expect(training.attempt.definitionHash).toBe(child.attempt.definitionHash)
    expect(training.attempt.compiledRuntimeHash).toBe(child.attempt.compiledRuntimeHash)

    // V1's existing shared rule requires both scenes' scalar channels. Neither
    // host may silently accept incomplete observations as an interpretable mean.
    const missingScene = { ...payload, responses: payload.responses.filter(response => response.sceneKey !== 'REVIEW') }
    await expect(submitSurveySituationalFinal(f.proof, 'linear', child.attempt.id, missingScene)).rejects.toThrow(/必答通道/)
    await expect(submitSituationalAttemptFinal({ ...missingScene, attemptId: training.attempt.id,
      userId: participant })).rejects.toThrow(/必答通道/)
    expect(await db.situationalRawSubmission.count({ where: { attemptId: { in: [child.attempt.id, training.attempt.id] } } })).toBe(0)
    expect((await readSurveySituational(f.proof, 'linear', child.attempt.id)).receipt).toBeUndefined()

    const accepted = await submitSurveySituationalFinal(f.proof, 'linear', child.attempt.id, payload)
    const replay = await submitSurveySituationalFinal(f.proof, 'linear', child.attempt.id, payload)
    expect(replay.receipt).toEqual(accepted.receipt)
    expect(accepted.receipt).toBeDefined()
    expect(accepted).not.toHaveProperty('result')
    const trainingResult = await submitSituationalAttemptFinal({ ...payload,
      submissionId: randomUUID(), attemptId: training.attempt.id, userId: participant })
    const stored = await db.situationalAttempt.findUniqueOrThrow({ where: { id: child.attempt.id }, include: { rawSubmission: true } })
    const trainingStored = await db.situationalAttempt.findUniqueOrThrow({ where: { id: training.attempt.id }, include: { rawSubmission: true } })
    const snapshot = decryptFrozenSituationalRuntimeSnapshot(stored.runtimeSnapshotEncrypted)
    const trainingSnapshot = decryptFrozenSituationalRuntimeSnapshot(trainingStored.runtimeSnapshotEncrypted)
    expect(snapshot.definition).toEqual(trainingSnapshot.definition)
    expect(snapshot.scientificContext).toEqual(trainingSnapshot.scientificContext)
    const raw = parseSituationalRawSubmissionPayload(decryptUnifiedRuntimePayload(stored.rawSubmission!.payloadEncrypted))
    expect(raw).toEqual({ schemaVersion: 1, attemptEpoch: 1, responses: golden.responses })
    expect(raw).toEqual(parseSituationalRawSubmissionPayload(decryptUnifiedRuntimePayload(trainingStored.rawSubmission!.payloadEncrypted)))
    expect(raw).not.toHaveProperty('researchCapture')
    const rawHash = prepareCanonicalSubmission({ responses: raw.responses }).hash
    expect(stored.rawSubmission).toMatchObject({ payloadHash: rawHash, responseCount: golden.responses.length,
      attemptEpoch: 1, payloadSchemaVersion: 1, encodingVersion: SITUATIONAL_RAW_ENCODING_VERSION })
    expect(stored.submissionPayloadHash).toBe(rawHash)
    expect(accepted.receipt!.payloadHash).toBe(rawHash)
    expect(trainingStored.submissionPayloadHash).toBe(rawHash)
    expect(decryptUnifiedRuntimePayload(stored.resultEncrypted!)).toEqual(trainingResult.result)
    const canonical = parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload(stored.canonicalResultEncrypted!))
    const trainingCanonical = parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload(trainingStored.canonicalResultEncrypted!))
    expect(canonical.core).toEqual(trainingCanonical.core)
    expect(canonical.resultHash).toBe(canonicalHash(canonical.core))
    expect(canonical.persistenceProvenance).toMatchObject({ sourceType: 'SITUATIONAL_ATTEMPT',
      sourceAttemptId: child.attempt.id, sourceSubmissionId: payload.submissionId })
    expect(await db.situationalRawSubmission.count({ where: { attemptId: child.attempt.id } })).toBe(1)

    await expect(submitResearchFinal({ ...f.proof, submissionId: randomUUID(), answers: { linear: {} },
      situationalReferences: [{ ...accepted.receipt!, payloadHash: 'f'.repeat(64) }] })).rejects.toThrow()
    expect(await db.surveyWaveFinal.count({ where: { attemptId: f.proof.attemptId } })).toBe(0)
    const finalInput = { ...f.proof, submissionId: randomUUID(), answers: { linear: {} },
      situationalReferences: [accepted.receipt!] }
    expect((await submitResearchFinal(finalInput)).status).toBe('COMPLETED')
    expect((await submitResearchFinal(finalInput)).status).toBe('COMPLETED')
    expect(await db.surveyWaveFinal.count({ where: { attemptId: f.proof.attemptId } })).toBe(1)
    expect((await readSurveySituational(f.proof, 'linear', child.attempt.id)).receipt).toEqual(accepted.receipt)
    const parent = await db.surveyWaveFinal.findUniqueOrThrow({ where: { attemptId: f.proof.attemptId } })
    const parentResult = decryptUnifiedRuntimePayload<SurveyComputedFinal>(parent.resultsCipher)
    expect(parentResult.units[0]).toMatchObject({ rawAnswers: {}, nativeReference: accepted.receipt })
    const report = await readGeneralForOwnAttempt(f.proof)
    expect(report.kind).toBe(golden.expected.quality === 'invalid' ? 'GENERAL_ONLY' : 'DESCRIPTIVE')
    const source = await loadSurveySource({ actorUserId: owner, projectId, waveIds: [f.waveId], includeAttendance: false })
    expect(source.scores[0].value).toBe(golden.expected.metrics.coordination)
    expect(source.scores[0].value).toBe(trainingResult.result!.metrics.find(metric => metric.key === 'coordination')!.value)
    expect(JSON.parse(source.raw.find(row => row.itemKey === '__native_raw')!.value as string)).toEqual(raw)
    for (const response of golden.responses) {
      expect(source.raw.find(row => row.itemKey === `${response.sceneKey}:${response.channelKey}`)?.value).toBe(response.responseValue)
    }
    if (caseName === 'path-A-A') {
      // A valid unconditional host flow preserves the whole exact native
      // protocol. Invalid references still fail the actual shared compiler.
      const flowWave = await wave()
      await db.surveyWave.update({ where: { id: flowWave }, data: { flowDefinition: {schemaVersion:1,embeddedData:[],blocks:[{blockKey:'linear',kind:'INSTRUMENT',instrumentKey:'linear'}]} } })
      const frozen=await freezeResearchWaveDraft(publicationInput(flowWave))
      const published=await db.surveyPublication.findUniqueOrThrow({where:{id:frozen.publicationId}})
      expect((published.compiledSnapshot as any).units[0].nativeSituational.definitionHash).toBe(compiled.definitionHash)
      expect((published.compiledSnapshot as any).flow.blocks).toEqual([{blockKey:'linear',kind:'INSTRUMENT',instrumentKey:'linear'}])
      const blockedWave=await wave()
      await db.surveyWave.update({where:{id:blockedWave},data:{flowDefinition:{schemaVersion:1,embeddedData:[],blocks:[{blockKey:'missing',kind:'INSTRUMENT',instrumentKey:'missing'}]}}})
      await expect(freezeResearchWaveDraft(publicationInput(blockedWave))).rejects.toThrow(/Flow/)
      expect((await db.surveyWave.findUniqueOrThrow({where:{id:blockedWave}})).publicationId).toBeNull()
    }
  })
})
