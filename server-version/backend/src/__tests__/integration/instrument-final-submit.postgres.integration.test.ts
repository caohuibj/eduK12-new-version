import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Prisma, type PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
import { canonicalJsonBytes } from '../../modules/assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { decryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
import { hashScaleDefinition, type ScaleDefinitionV2 } from '../../modules/scale/scale-definition'
import { createRecoveryCredential } from '../../services/anonymousAccess'
import { resetRuntimeObservabilityForTests, runtimeMetricLines } from '../../services/runtimeObservability'

/**
 * Final-only instrument contract coverage on real PostgreSQL.
 *
 * The suite is opt-in and is deliberately configured with connection_limit=2
 * so the parent/child lock order is exercised with the smallest useful pool.
 * Every fixture is prefixed and deleted by this file only.
 */
const configuredUrl = integrationDatabaseUrl(
  'INSTRUMENT_FINAL_INTEGRATION_DATABASE_URL',
  'PR38_INTEGRATION_DATABASE_URL',
)
const DB_URL = configuredUrl
  ? /[?&]connection_limit=/.test(configuredUrl)
    ? configuredUrl
    : `${configuredUrl}${configuredUrl.includes('?') ? '&' : '?'}connection_limit=2`
  : undefined
const suite = DB_URL ? describe : describe.skip

type ObservedPrismaCall = {
  model?: string
  action: string
  durationMs: number
}

let prisma: PrismaClient
let submitScaleAssessmentFinal: typeof import('../../modules/scale/scale-final-submit.service')['submitScaleAssessmentFinal']
let restartStandaloneScaleAssessment: typeof import('../../modules/scale/scale-final-submit.service')['restartStandaloneScaleAssessment']
let submitCognitiveSessionFinal: typeof import('../../modules/cognitive/final-submit.service')['submitCognitiveSessionFinal']
let submitCognitiveSessionFinalForPublic: typeof import('../../modules/cognitive/final-submit.service')['submitCognitiveSessionFinalForPublic']
let createCognitiveSessionConfigSnapshot: typeof import('../../modules/cognitive/session.service')['createCognitiveSessionConfigSnapshot']
let createUnifiedCognitiveSessionConfigSnapshot: typeof import('../../modules/cognitive/session.service')['createUnifiedCognitiveSessionConfigSnapshot']
let readCognitiveSessionConfig: typeof import('../../modules/cognitive/session.service')['readCognitiveSessionConfig']
let ensureQuestionnaireFormSections: typeof import('../../services/questionnaire-form-section.service')['ensureQuestionnaireFormSections']
let listQuestionnaireFormSections: typeof import('../../services/questionnaire-form-section.service')['listQuestionnaireFormSections']
let submitQuestionnaireFormSectionFinalForUser: typeof import('../../services/questionnaire-form-section.service')['submitQuestionnaireFormSectionFinalForUser']
let submitQuestionnaireFormSectionFinalForPublic: typeof import('../../services/questionnaire-form-section.service')['submitQuestionnaireFormSectionFinalForPublic']
let listCompositeFormSections: typeof import('../../modules/composite/final-submit.service')['listCompositeFormSections']
let compositeFormSectionDefinitionHash: typeof import('../../modules/composite/final-submit.service')['compositeFormSectionDefinitionHash']
let submitCompositeFormSectionFinal: typeof import('../../modules/composite/final-submit.service')['submitCompositeFormSectionFinal']

let userId = ''
let fakeConfigId = ''
const createdScaleIds: string[] = []
const createdAssessmentIds: string[] = []
const createdQuestionnaireIds: string[] = []
const createdQuestionnaireAssessmentIds: string[] = []
const createdCompositeIds: string[] = []
const createdCompositeAttemptIds: string[] = []
const createdSessionIds: string[] = []
let observedPrismaCalls: ObservedPrismaCall[] = []

const withObserved = async <T>(operation: () => Promise<T>) => {
  observedPrismaCalls = []
  resetRuntimeObservabilityForTests()
  const startedAt = process.hrtime.bigint()
  const value = await operation()
  return {
    value,
    calls: [...observedPrismaCalls],
    elapsedMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
  }
}

const expectInstrumentError = async (operation: () => Promise<unknown>, code: string) => {
  try {
    await operation()
    throw new Error(`expected ${code}`)
  } catch (error: any) {
    expect(error.code).toBe(code)
    return error
  }
}

const scaleDefinitionFor = (size: number, prefix: string): ScaleDefinitionV2 => {
  const itemCodes = Array.from({ length: size }, (_, index) => `${prefix}-${index + 1}`)
  return {
    schemaVersion: 2,
    respondentType: 'participant_self_report',
    source: { title: 'Final submit integration fixture', citation: 'instrument-final-submit.postgres.integration.test' },
    license: { status: 'self_authored', redistribution: 'allowed' },
    display: { randomizeItems: false },
    responseSets: [{
      key: 'default',
      options: [
        { value: 'no', label: '否', score: 0 },
        { value: 'yes', label: '是', score: 1 },
      ],
    }],
    items: itemCodes.map((itemCode, sortOrder) => ({
      itemCode,
      content: `Integration item ${sortOrder + 1}`,
      type: 'single',
      required: true,
      sortOrder,
      responseSetKey: 'default',
      randomizeOptions: false,
    })),
    scoring: {
      scoringVersion: '2.0.0',
      itemRules: itemCodes.map((itemCode) => ({ itemCode, transform: { type: 'identity' as const } })),
      defaultMissingPolicy: { type: 'complete_required' },
      scores: [{
        key: 'total',
        type: 'total',
        label: '总分',
        direction: 'descriptive',
        canonical: true,
        displayPrecision: 2,
        source: { type: 'items', items: itemCodes.map((itemCode) => ({ itemCode, weight: 1 })), aggregation: 'sum' },
      }],
    },
    report: {
      reportVersion: '2.0.0',
      primaryScoreKeys: ['total'],
      scoreOrder: ['total'],
      interpretations: [{
        scoreKey: 'total',
        headline: '总分',
        source: { type: 'score_only' },
        summary: '这是一个真实 PostgreSQL 集成测试结果。',
        bands: [],
        guidance: [],
      }],
      limitations: [],
      disclaimer: 'Integration fixture only.',
    },
    referencePolicy: { type: 'none' },
  }
}

const createScaleFixture = async (size: number, suffix = randomUUID().slice(0, 8)) => {
  const definition = scaleDefinitionFor(size, `FINAL-SCALE-${size}-${suffix}`)
  const scale = await prisma.scale.create({
    data: {
      code: `FINAL-SCALE-${size}-${suffix}`,
      name: `Final submit scale ${size}`,
      creatorId: userId,
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      instrumentClass: 'CUSTOM_DESCRIPTIVE',
      instrumentVersion: '2.0.0',
      definition: definition as unknown as Prisma.InputJsonValue,
      definitionHash: hashScaleDefinition(definition),
      itemCount: size,
      dimensionCount: 1,
    },
  })
  createdScaleIds.push(scale.id)
  const assessment = await prisma.assessment.create({
    data: {
      scaleId: scale.id,
      userId,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      attemptEpoch: 1,
      progress: 0,
    },
  })
  createdAssessmentIds.push(assessment.id)
  const answers = definition.items.map((item) => ({ itemCode: item.itemCode, responseValue: 'yes' as const }))
  return {
    scale,
    assessment,
    definition,
    input: {
      assessmentId: assessment.id,
      submissionId: `scale-submission-${randomUUID()}`,
      attemptEpoch: 1,
      definitionHash: hashScaleDefinition(definition),
      contextSnapshotHash: null,
      answers,
      userId,
    },
  }
}

const createCognitiveFixture = async (trialCount: number, anonymous = false) => {
  const config = await prisma.cognitiveTestConfig.findUnique({ where: { id: fakeConfigId } })
  if (!config) throw new Error('fake cognitive config fixture is missing')
  const resolvedConfig = {
    trialCount,
    trialDurationMs: 1000,
    allowPractice: false,
    maxRtMs: 60000,
  }
  const configSnapshotEncrypted = createCognitiveSessionConfigSnapshot({
    testType: config.testType,
    configVersion: config.configVersion,
    engineVersion: config.engineVersion,
    scoringVersion: config.scoringVersion,
    config: resolvedConfig,
  })
  const snapshot = readCognitiveSessionConfig(configSnapshotEncrypted).snapshot
  if (!snapshot) throw new Error('final cognitive fixture did not create a snapshot')
  const credential = anonymous ? createRecoveryCredential() : null
  const session = await prisma.cognitiveSession.create({
    data: {
      userId: anonymous ? null : userId,
      participantKey: credential?.participantKey ?? `instrument-final-user-${randomUUID()}`,
      recoveryTokenHash: credential?.hash ?? null,
      anonymousCode: credential?.anonymousCode ?? null,
      configId: config.id,
      testType: config.testType,
      attemptNo: 1,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      configVersion: config.configVersion,
      configSnapshotEncrypted,
      engineVersion: config.engineVersion,
      scoringVersion: config.scoringVersion,
      randomSeed: `instrument-final-seed-${randomUUID()}`,
    },
  })
  createdSessionIds.push(session.id)
  const trials = Array.from({ length: trialCount }, (_, trialIndex) => createTrialEnvelope({
    trialIndex,
    phase: 'test',
    payload: { correct: trialIndex % 2 === 0, rtMs: 400 + trialIndex },
    startedAtPerfMs: trialIndex * 1000,
    endedAtPerfMs: trialIndex * 1000 + 400,
  }))
  const input = {
    sessionId: session.id,
    submissionId: `cognitive-submission-${randomUUID()}`,
    attemptEpoch: 1,
    definitionHash: snapshot.configHash,
    contextSnapshotHash: null,
    trials,
  }
  return { session, input, credential }
}

const createUnifiedCognitiveFixture = async (trialCount: number, anonymous = false) => {
  const config = await prisma.cognitiveTestConfig.findUnique({ where: { id: fakeConfigId } })
  if (!config) throw new Error('fake cognitive config fixture is missing')
  const resolvedConfig = {
    trialCount,
    trialDurationMs: 1000,
    allowPractice: false,
    maxRtMs: 60000,
  }
  const unifiedSnapshot = await createUnifiedCognitiveSessionConfigSnapshot({
    testType: config.testType,
    configVersion: config.configVersion,
    engineVersion: config.engineVersion,
    scoringVersion: config.scoringVersion,
    config: resolvedConfig,
    db: prisma as any,
  })
  const snapshot = readCognitiveSessionConfig(unifiedSnapshot.encrypted).snapshot
  if (!snapshot || snapshot.runtimeGeneration !== 'UNIFIED_V1') {
    throw new Error('unified cognitive fixture did not create a unified snapshot')
  }
  const credential = anonymous ? createRecoveryCredential() : null
  const session = await prisma.cognitiveSession.create({
    data: {
      userId: anonymous ? null : userId,
      participantKey: credential?.participantKey ?? ('unified-instrument-final-user-' + randomUUID()),
      recoveryTokenHash: credential?.hash ?? null,
      anonymousCode: credential?.anonymousCode ?? null,
      configId: config.id,
      testType: config.testType,
      attemptNo: 1,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      configVersion: config.configVersion,
      configSnapshotEncrypted: unifiedSnapshot.encrypted,
      engineVersion: config.engineVersion,
      scoringVersion: config.scoringVersion,
      randomSeed: 'unified-instrument-final-seed-' + randomUUID(),
      runtimeGeneration: 'UNIFIED_V1',
      compiledRuntimeHash: unifiedSnapshot.compiledRuntime.compiledRuntimeHash,
    },
  })
  createdSessionIds.push(session.id)
  const trials = Array.from({ length: trialCount }, (_, trialIndex) => createTrialEnvelope({
    trialIndex,
    phase: 'test',
    payload: { correct: trialIndex % 2 === 0, rtMs: 400 + trialIndex },
    startedAtPerfMs: trialIndex * 1000,
    endedAtPerfMs: trialIndex * 1000 + 400,
  }))
  return {
    session,
    input: {
      sessionId: session.id,
      submissionId: 'unified-cognitive-submission-' + randomUUID(),
      attemptEpoch: 1,
      definitionHash: snapshot.configHash,
      contextSnapshotHash: null,
      trials,
    },
    credential,
  }
}

const createQuestionnaireFixture = async (sectionSizes: number[], anonymous = false) => {
  const suffix = randomUUID().slice(0, 8)
  const questionnaire = await prisma.questionnaire.create({
    data: {
      code: `FINAL-QUESTIONNAIRE-${suffix}`,
      name: 'Final submit questionnaire fixture',
      creatorId: userId,
      type: 'COURSE',
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
    },
  })
  createdQuestionnaireIds.push(questionnaire.id)
  let itemPosition = 0
  for (const [sectionIndex, size] of sectionSizes.entries()) {
    const section = await prisma.questionnaireFormSection.create({
      data: {
        questionnaireId: questionnaire.id,
        title: `区段 ${sectionIndex + 1}`,
        position: sectionIndex,
        contextSection: false,
      },
    })
    for (let itemIndex = 0; itemIndex < size; itemIndex += 1) {
      await prisma.questionnaireFormItem.create({
        data: {
          questionnaireId: questionnaire.id,
          sectionId: section.id,
          sectionPosition: itemIndex,
          type: 'text_input',
          label: `字段 ${sectionIndex + 1}-${itemIndex + 1}`,
          required: true,
          position: itemPosition,
        },
      })
      itemPosition += 1
    }
  }
  const credentialHash = anonymous ? `resume-${randomUUID()}-hash` : null
  const assessment = await prisma.questionnaireAssessment.create({
    data: {
      questionnaireId: questionnaire.id,
      userId: anonymous ? null : userId,
      sessionId: anonymous ? `public-session-${randomUUID()}` : null,
      resumeTokenHash: credentialHash,
      resumeTokenExpiresAt: anonymous ? new Date(Date.now() + 60 * 60 * 1000) : null,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      attemptEpoch: 1,
      progress: 0,
    },
  })
  createdQuestionnaireAssessmentIds.push(assessment.id)
  await ensureQuestionnaireFormSections(questionnaire.id)
  const sections = await listQuestionnaireFormSections(questionnaire.id)
  return { questionnaire, assessment, sections, credentialHash }
}

const createCompositeFixture = async () => {
  const suffix = randomUUID().slice(0, 8)
  const composite = await prisma.compositeAssessment.create({
    data: {
      code: `FINAL-COMPOSITE-${suffix}`,
      name: 'Final submit composite fixture',
      status: 'PUBLISHED',
      createdBy: userId,
      publicEnabled: true,
      maxAttempts: 3,
    },
  })
  createdCompositeIds.push(composite.id)
  const section = await prisma.compositeFormSection.create({
    data: { compositeAssessmentId: composite.id, title: '综合表单', position: 0, contextSection: false },
  })
  const item = await prisma.compositeAssessmentItem.create({
    data: {
      compositeAssessmentId: composite.id,
      type: 'FORM',
      position: 0,
      formType: 'text_input',
      formLabel: '综合字段',
      required: true,
      formSectionId: section.id,
      formSectionPosition: 0,
    },
  })
  const definitions = await listCompositeFormSections(composite.id)
  const definition = definitions.find((candidate) => candidate.id === section.id)
  if (!definition) throw new Error('composite section fixture is missing')
  const userAttempt = await prisma.compositeAssessmentAttempt.create({
    data: {
      compositeAssessmentId: composite.id,
      userId,
      participantKey: `instrument-final-composite-user-${suffix}`,
      attemptNo: 1,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      attemptEpoch: 1,
      progress: 0,
      completedItems: 0,
    },
  })
  const credential = createRecoveryCredential()
  const publicAttempt = await prisma.compositeAssessmentAttempt.create({
    data: {
      compositeAssessmentId: composite.id,
      userId: null,
      participantKey: credential.participantKey,
      recoveryTokenHash: credential.hash,
      anonymousCode: credential.anonymousCode,
      attemptNo: 1,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      attemptEpoch: 1,
      progress: 0,
      completedItems: 0,
    },
  })
  createdCompositeAttemptIds.push(userAttempt.id, publicAttempt.id)
  return {
    composite,
    item,
    section,
    definition,
    userAttempt,
    publicAttempt,
    credential,
  }
}

suite('instrument final submit (real PostgreSQL)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    const database = await import('../../config/database')
    prisma = database.prisma
    const scaleModule = await import('../../modules/scale/scale-final-submit.service')
    submitScaleAssessmentFinal = scaleModule.submitScaleAssessmentFinal
    restartStandaloneScaleAssessment = scaleModule.restartStandaloneScaleAssessment
    const cognitiveModule = await import('../../modules/cognitive/final-submit.service')
    submitCognitiveSessionFinal = cognitiveModule.submitCognitiveSessionFinal
    submitCognitiveSessionFinalForPublic = cognitiveModule.submitCognitiveSessionFinalForPublic
    const cognitiveSessionModule = await import('../../modules/cognitive/session.service')
    createCognitiveSessionConfigSnapshot = cognitiveSessionModule.createCognitiveSessionConfigSnapshot
    createUnifiedCognitiveSessionConfigSnapshot = cognitiveSessionModule.createUnifiedCognitiveSessionConfigSnapshot
    readCognitiveSessionConfig = cognitiveSessionModule.readCognitiveSessionConfig
    const questionnaireModule = await import('../../services/questionnaire-form-section.service')
    ensureQuestionnaireFormSections = questionnaireModule.ensureQuestionnaireFormSections
    listQuestionnaireFormSections = questionnaireModule.listQuestionnaireFormSections
    submitQuestionnaireFormSectionFinalForUser = questionnaireModule.submitQuestionnaireFormSectionFinalForUser
    submitQuestionnaireFormSectionFinalForPublic = questionnaireModule.submitQuestionnaireFormSectionFinalForPublic
    const compositeModule = await import('../../modules/composite/final-submit.service')
    listCompositeFormSections = compositeModule.listCompositeFormSections
    compositeFormSectionDefinitionHash = compositeModule.compositeFormSectionDefinitionHash
    submitCompositeFormSectionFinal = compositeModule.submitCompositeFormSectionFinal

    prisma.$use(async (params, next) => {
      const startedAt = process.hrtime.bigint()
      try {
        return await next(params)
      } finally {
        observedPrismaCalls.push({
          model: params.model,
          action: params.action,
          durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
        })
      }
    })

    const user = await prisma.user.create({
      data: { username: `instrument-final-${randomUUID()}`, passwordHash: 'test-only', role: 'STUDENT' },
    })
    userId = user.id
    const fakeConfig = await prisma.cognitiveTestConfig.findUnique({ where: { testType_configVersion: { testType: 'fake', configVersion: '1.0.0' } } })
    if (!fakeConfig) throw new Error('seeded fake cognitive config is required')
    fakeConfigId = fakeConfig.id
  }, 90_000) // Cold imports span all instrument runtimes; keep this outside operation budgets.

  afterAll(async () => {
    try {
      if (createdSessionIds.length) await prisma.cognitiveSession.deleteMany({ where: { id: { in: createdSessionIds } } })
      if (createdCompositeAttemptIds.length) await prisma.compositeAssessmentAttempt.deleteMany({ where: { id: { in: createdCompositeAttemptIds } } })
      if (createdCompositeIds.length) await prisma.compositeAssessment.deleteMany({ where: { id: { in: createdCompositeIds } } })
      if (createdQuestionnaireAssessmentIds.length) await prisma.questionnaireAssessment.deleteMany({ where: { id: { in: createdQuestionnaireAssessmentIds } } })
      if (createdQuestionnaireIds.length) await prisma.questionnaire.deleteMany({ where: { id: { in: createdQuestionnaireIds } } })
      if (createdAssessmentIds.length) await prisma.assessment.deleteMany({ where: { id: { in: createdAssessmentIds } } })
      if (createdScaleIds.length) await prisma.scale.deleteMany({ where: { id: { in: createdScaleIds } } })
      if (userId) await prisma.user.delete({ where: { id: userId } })
    } finally {
      await prisma?.$disconnect()
    }
  })

  it('submits scale answers as one final mutation for sizes 1, 5, and 10', async () => {
    const fixtures = []
    for (const size of [1, 5, 10]) fixtures.push(await createScaleFixture(size))

    for (const fixture of fixtures) {
      const observed = await withObserved(() => submitScaleAssessmentFinal(fixture.input))
      expect(observed.value.replayed).toBe(false)
      expect(observed.elapsedMs).toBeGreaterThanOrEqual(0)
      expect(observed.calls.filter((call) => call.model === 'Assessment' && call.action === 'updateMany')).toHaveLength(1)
      expect(observed.calls.filter((call) => call.model === 'Assessment' && call.action === 'upsert')).toHaveLength(0)

      const row = await prisma.assessment.findUnique({ where: { id: fixture.assessment.id } })
      expect(row).toMatchObject({ status: 'COMPLETED', deliveryMode: 'FINAL_ONLY', submissionId: fixture.input.submissionId, progress: 100 })
    }

    const replayed = await submitScaleAssessmentFinal(fixtures[0].input)
    expect(replayed.replayed).toBe(true)
    await expectInstrumentError(
      () => submitScaleAssessmentFinal({ ...fixtures[0].input, answers: [{ ...fixtures[0].input.answers[0], responseValue: 'no' }] }),
      'SUBMISSION_PAYLOAD_CONFLICT',
    )

    const stale = await createScaleFixture(1)
    await expectInstrumentError(() => submitScaleAssessmentFinal({ ...stale.input, attemptEpoch: 2 }), 'STALE_ATTEMPT')
    await expectInstrumentError(() => submitScaleAssessmentFinal({ ...stale.input, definitionHash: '0'.repeat(64) }), 'DEFINITION_MISMATCH')

    const legacy = await createScaleFixture(1)
    await prisma.assessment.update({ where: { id: legacy.assessment.id }, data: { deliveryMode: 'LEGACY' } })
    await expectInstrumentError(() => submitScaleAssessmentFinal(legacy.input), 'LEGACY_WRITE_DISABLED')

    const restarted = await restartStandaloneScaleAssessment(stale.assessment.id, userId)
    const oldRow = await prisma.assessment.findUnique({ where: { id: stale.assessment.id }, select: { status: true, attemptEpoch: true } })
    expect(oldRow).toMatchObject({ status: 'ABANDONED', attemptEpoch: 1 })
    expect(restarted.assessment).toMatchObject({ status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', attemptEpoch: 2 })
    createdAssessmentIds.push(restarted.assessment.id)
  })

  it('creates one cognitive trial mutation for 1, 5, 10, and 100 trials', async () => {
    for (const size of [1, 5, 10, 100]) {
      const fixture = await createCognitiveFixture(size)
      const observed = await withObserved(() => submitCognitiveSessionFinal(userId, fixture.input))
      expect(observed.value.replayed).toBe(false)
      expect(observed.calls.filter((call) => call.model === 'CognitiveTrial' && call.action === 'createMany')).toHaveLength(1)
      expect(observed.calls.filter((call) => call.model === 'CognitiveTrial' && call.action === 'create')).toHaveLength(0)
      expect(observed.calls.filter((call) => call.model === 'CognitiveSession' && call.action === 'updateMany')).toHaveLength(1)
      expect(runtimeMetricLines().some((line) => line.startsWith('ptool_serializable_attempts_total{'))).toBe(false)

      const [row, trials] = await Promise.all([
        prisma.cognitiveSession.findUnique({ where: { id: fixture.session.id } }),
        prisma.cognitiveTrial.findMany({ where: { sessionId: fixture.session.id }, orderBy: { trialIndex: 'asc' } }),
      ])
      expect(row).toMatchObject({ status: 'COMPLETED', deliveryMode: 'FINAL_ONLY', submissionId: fixture.input.submissionId, attemptNo: 1 })
      expect(trials).toHaveLength(size)
    }

    const replayFixture = await createCognitiveFixture(5)
    await submitCognitiveSessionFinal(userId, replayFixture.input)
    const replay = await withObserved(() => submitCognitiveSessionFinal(userId, replayFixture.input))
    expect(replay.value.replayed).toBe(true)
    expect(replay.calls.filter((call) => call.model === 'CognitiveTrial' && call.action === 'createMany')).toHaveLength(0)
  })

  it('persists authenticated unified provenance durably and binds it to replay identity', async () => {
    const provenance = {
      schemaVersion: 1 as const,
      deviceClass: 'PHONE' as const,
      administrationMode: 'TOUCH' as const,
    }
    const fixture = await createUnifiedCognitiveFixture(2)
    const first = await withObserved(() => submitCognitiveSessionFinal(userId, {
      ...fixture.input,
      administrationProvenance: provenance,
    }))
    expect(first.value.replayed).toBe(false)
    expect(first.calls.filter((call) => call.model === 'CognitiveRawSubmission' && call.action === 'create')).toHaveLength(1)
    expect(first.calls.filter((call) => call.model === 'CognitiveTrial')).toHaveLength(0)

    const [raw, row] = await Promise.all([
      prisma.cognitiveRawSubmission.findUnique({
        where: {
          sessionId_attemptEpoch: {
            sessionId: fixture.session.id,
            attemptEpoch: 1,
          },
        },
      }),
      prisma.cognitiveSession.findUnique({
        where: { id: fixture.session.id },
        select: { resultSnapshotEncrypted: true, submissionPayloadHash: true },
      }),
    ])
    expect(raw).not.toBeNull()
    expect(row?.resultSnapshotEncrypted).toBeTruthy()
    const rawPayload = decryptUnifiedRuntimePayload<any>(raw!.payloadEncrypted)
    expect(rawPayload.administrationProvenance).toEqual(provenance)
    expect(rawPayload.trials).toHaveLength(2)
    expect(rawPayload.trials.every((trial: any) => !Object.prototype.hasOwnProperty.call(trial, 'administrationProvenance'))).toBe(true)

    const resultSnapshot = decryptCognitivePayload<any>(row!.resultSnapshotEncrypted!)
    expect(resultSnapshot).not.toHaveProperty('administrationProvenance')
    expect(resultSnapshot.metrics).toBeDefined()
    expect(resultSnapshot.quality).toBeDefined()
    expect(resultSnapshot.report).toBeDefined()
    expect(row?.submissionPayloadHash).toBe(first.value.payloadHash)

    const replay = await submitCognitiveSessionFinal(userId, {
      ...fixture.input,
      administrationProvenance: provenance,
    })
    expect(replay.replayed).toBe(true)

    await expectInstrumentError(
      () => submitCognitiveSessionFinal(userId, {
        ...fixture.input,
        administrationProvenance: { ...provenance, administrationMode: 'KEYBOARD_MOUSE' },
      }),
      'SUBMISSION_PAYLOAD_CONFLICT',
    )
    expect(await prisma.cognitiveRawSubmission.count({
      where: { sessionId: fixture.session.id },
    })).toBe(1)
  })

  it('keeps the historical trials-only hash shape when unified provenance is absent', async () => {
    const fixture = await createUnifiedCognitiveFixture(1)
    const result = await submitCognitiveSessionFinal(userId, fixture.input)
    const expectedHash = createHash('sha256')
      .update(canonicalJsonBytes({ trials: fixture.input.trials }))
      .digest('hex')
    expect(result.replayed).toBe(false)
    expect(result.payloadHash).toBe(expectedHash)

    const raw = await prisma.cognitiveRawSubmission.findUnique({
      where: {
        sessionId_attemptEpoch: {
          sessionId: fixture.session.id,
          attemptEpoch: 1,
        },
      },
    })
    const rawPayload = decryptUnifiedRuntimePayload<any>(raw!.payloadEncrypted)
    expect(Object.prototype.hasOwnProperty.call(rawPayload, 'administrationProvenance')).toBe(false)
  })

  it('persists public unified provenance through the recovery final path', async () => {
    const provenance = {
      schemaVersion: 1 as const,
      deviceClass: 'DESKTOP_LAPTOP' as const,
      administrationMode: 'KEYBOARD_MOUSE' as const,
    }
    const fixture = await createUnifiedCognitiveFixture(1, true)
    if (!fixture.credential) throw new Error('anonymous fixture credential is missing')
    const result = await submitCognitiveSessionFinalForPublic({
      ...fixture.input,
      administrationProvenance: provenance,
    }, fixture.credential.hash)
    expect(result.replayed).toBe(false)

    const [raw, row] = await Promise.all([
      prisma.cognitiveRawSubmission.findUnique({
        where: {
          sessionId_attemptEpoch: {
            sessionId: fixture.session.id,
            attemptEpoch: 1,
          },
        },
      }),
      prisma.cognitiveSession.findUnique({
        where: { id: fixture.session.id },
        select: { userId: true, status: true },
      }),
    ])
    expect(row).toMatchObject({ userId: null, status: 'COMPLETED' })
    expect(decryptUnifiedRuntimePayload<any>(raw!.payloadEncrypted).administrationProvenance).toEqual(provenance)
  })

  it('rejects over-limit unified cognitive FINAL payloads consistently for authenticated and public callers', async () => {
    const authenticatedFixture = await createUnifiedCognitiveFixture(3)
    const anonymousFixture = await createUnifiedCognitiveFixture(3, true)
    if (!anonymousFixture.credential) throw new Error('anonymous fixture credential is missing')

    const overLimit = (fixture: Awaited<ReturnType<typeof createUnifiedCognitiveFixture>>) => ({
      ...fixture.input,
      trials: [
        ...fixture.input.trials,
        {
          ...fixture.input.trials[0],
          trialIndex: 3,
          payload: { correct: 'not-a-boolean' },
        },
      ],
    })

    const authenticated = await withObserved(() => expectInstrumentError(
      () => submitCognitiveSessionFinal(userId, overLimit(authenticatedFixture)),
      'SUBMISSION_PAYLOAD_CONFLICT',
    ))
    const publicSubmission = await withObserved(() => expectInstrumentError(
      () => submitCognitiveSessionFinalForPublic(overLimit(anonymousFixture), anonymousFixture.credential!.hash),
      'SUBMISSION_PAYLOAD_CONFLICT',
    ))

    expect(authenticated.value.message).toContain('submitted trial count exceeds maximum allowed trial count (3)')
    expect(publicSubmission.value.message).toContain('submitted trial count exceeds maximum allowed trial count (3)')
    expect(authenticated.value.message).toBe(publicSubmission.value.message)
    for (const observed of [authenticated, publicSubmission]) {
      const unexpectedMutations = observed.calls.filter((call) => (
        call.action === 'create'
        || call.action === 'createMany'
        || call.action === 'update'
        || call.action === 'updateMany'
        || call.action === 'upsert'
      ) && !(call.model === 'CognitiveSession' && call.action === 'updateMany'))
      expect(unexpectedMutations).toEqual([])
      expect(observed.calls.filter((call) => call.model === 'CognitiveRawSubmission')).toHaveLength(0)
      expect(observed.calls.filter((call) => call.model === 'CognitiveTrial')).toHaveLength(0)
    }
  })

  it('accepts anonymous cognitive final submit with only the recovery credential', async () => {
    const fixture = await createCognitiveFixture(1, true)
    if (!fixture.credential) throw new Error('anonymous fixture credential is missing')
    const result = await submitCognitiveSessionFinalForPublic(fixture.input, fixture.credential.hash)
    expect(result.replayed).toBe(false)
    const row = await prisma.cognitiveSession.findUnique({ where: { id: fixture.session.id }, select: { userId: true, status: true, submissionId: true } })
    expect(row).toMatchObject({ userId: null, status: 'COMPLETED', submissionId: fixture.input.submissionId })
  })

  it('bulk-submits form sections of 1, 5, and 10 fields and completes the parent by units', async () => {
    const fixture = await createQuestionnaireFixture([1, 5, 10])
    for (const section of fixture.sections) {
      const answers = section.items.map((item) => ({ formItemId: item.id, value: `answer-${item.id}` }))
      const observed = await withObserved(() => submitQuestionnaireFormSectionFinalForUser(fixture.assessment.id, userId, {
        sectionId: section.id,
        submissionId: `questionnaire-section-${section.id}-${randomUUID()}`,
        attemptEpoch: 1,
        definitionHash: section.definitionHash,
        contextSnapshotHash: null,
        answers,
      }))
      expect(observed.value.replayed).toBe(false)
      expect(observed.calls.filter((call) => call.action === 'executeRaw')).toHaveLength(1)
      expect(observed.calls.filter((call) => call.model === 'QuestionnaireFormAnswer' && call.action === 'upsert')).toHaveLength(0)
      expect(observed.elapsedMs).toBeGreaterThanOrEqual(0)
    }
    const parent = await prisma.questionnaireAssessment.findUnique({ where: { id: fixture.assessment.id }, select: { status: true, progress: true, completedForms: true } })
    expect(parent).toMatchObject({ status: 'COMPLETED', progress: 100, completedForms: 3 })
  })

  it('supports anonymous Questionnaire final submit and preserves the replay contract', async () => {
    const fixture = await createQuestionnaireFixture([1], true)
    const section = fixture.sections[0]
    const input = {
      sectionId: section.id,
      submissionId: `public-questionnaire-${randomUUID()}`,
      attemptEpoch: 1,
      definitionHash: section.definitionHash,
      contextSnapshotHash: null,
      answers: [{ formItemId: section.items[0].id, value: 'anonymous answer' }],
    }
    const first = await submitQuestionnaireFormSectionFinalForPublic(fixture.assessment.sessionId!, input, fixture.credentialHash!)
    const replay = await submitQuestionnaireFormSectionFinalForPublic(fixture.assessment.sessionId!, input, fixture.credentialHash!)
    expect(first.replayed).toBe(false)
    expect(replay.replayed).toBe(true)
    await expectInstrumentError(
      () => submitQuestionnaireFormSectionFinalForPublic(fixture.assessment.sessionId!, { ...input, answers: [{ ...input.answers[0], value: 'changed' }] }, fixture.credentialHash!),
      'SUBMISSION_PAYLOAD_CONFLICT',
    )
  })

  it('serializes concurrent final scale replay on the assessment row without Serializable retries', async () => {
    const fixture = await createScaleFixture(5)
    resetRuntimeObservabilityForTests()
    const [first, second] = await Promise.all([
      submitScaleAssessmentFinal(fixture.input),
      submitScaleAssessmentFinal(fixture.input),
    ])
    expect([first.replayed, second.replayed].sort()).toEqual([false, true])
    expect(runtimeMetricLines().some((line) => line.startsWith('ptool_serializable_attempts_total{'))).toBe(false)
    expect(await prisma.assessment.count({ where: { id: fixture.assessment.id, status: 'COMPLETED' } })).toBe(1)
  })

  it('accepts authenticated and anonymous Composite form-section submissions', async () => {
    const fixture = await createCompositeFixture()
    const definitionHash = compositeFormSectionDefinitionHash(fixture.definition)
    const answer = (value: string) => [{ formItemId: fixture.item.id, value }]
    const authenticated = await submitCompositeFormSectionFinal({
      attemptId: fixture.userAttempt.id,
      sectionId: fixture.section.id,
      submissionId: `composite-user-${randomUUID()}`,
      attemptEpoch: 1,
      definitionHash,
      contextSnapshotHash: null,
      answers: answer('user answer'),
      userId,
    })
    const anonymous = await submitCompositeFormSectionFinal({
      attemptId: fixture.publicAttempt.id,
      sectionId: fixture.section.id,
      submissionId: `composite-public-${randomUUID()}`,
      attemptEpoch: 1,
      definitionHash,
      contextSnapshotHash: null,
      answers: answer('public answer'),
      userId: null,
      recoveryTokenHash: fixture.credential.hash,
    })
    expect(authenticated.replayed).toBe(false)
    expect(anonymous.replayed).toBe(false)
    const attempts = await prisma.compositeAssessmentAttempt.findMany({
      where: { id: { in: [fixture.userAttempt.id, fixture.publicAttempt.id] } },
      select: { status: true, progress: true, completedItems: true },
    })
    expect(attempts).toHaveLength(2)
    expect(attempts.every((attempt) => attempt.status === 'COMPLETED' && attempt.progress === 100 && attempt.completedItems === 1)).toBe(true)
  })

  it('serializes concurrent Questionnaire sections and still uses the parent terminal predicate', async () => {
    const fixture = await createQuestionnaireFixture([1, 1])
    const submissions = fixture.sections.map((section) => submitQuestionnaireFormSectionFinalForUser(fixture.assessment.id, userId, {
      sectionId: section.id,
      submissionId: `race-section-${section.id}-${randomUUID()}`,
      attemptEpoch: 1,
      definitionHash: section.definitionHash,
      contextSnapshotHash: null,
      answers: [{ formItemId: section.items[0].id, value: `race-${section.id}` }],
    }))
    const results = await Promise.all(submissions)
    expect(results.every((result) => result.replayed === false)).toBe(true)
    const parent = await prisma.questionnaireAssessment.findUnique({ where: { id: fixture.assessment.id }, select: { status: true, progress: true, completedForms: true } })
    expect(parent).toMatchObject({ status: 'COMPLETED', progress: 100, completedForms: 2 })
  })
})
