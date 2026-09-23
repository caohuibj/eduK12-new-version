import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Prisma, PrismaClient } from '@prisma/client'
import type { SituationPackageV1 } from '../../modules/situational/situation-package.registry'
import type { SituationDefinitionV1 } from '../../modules/situational/situation-definition'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import { scoreSituational } from '../../modules/situational/situation-scoring'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { hashScaleDefinition, type ScaleDefinitionV2 } from '../../modules/scale/scale-definition'
import { gonogoSequence } from '../../modules/cognitive/randomization'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
import { freezeAssignmentProfile } from '../../modules/cognitive/profile-freeze'
import { compositeItemSlotKey, decryptFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import { decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { parseCanonicalUnitResultEnvelope } from '../../modules/assessment-runtime/unit-result'
import { aggregateFinalizationAdmission } from '../../services/aggregateFinalizationAdmission'
import { unitSubmitAdmission } from '../../services/unitSubmitAdmission'

const databaseUrl = integrationDatabaseUrl(
  'SITUATIONAL_BUNDLE_INTEGRATION_DATABASE_URL',
  'V32_3_INTEGRATION_DATABASE_URL',
)
const suite = databaseUrl ? describe : describe.skip

const dynamicPackages = new Map<string, SituationPackageV1>()

const buildSceneCountPackage = (sceneCount: number): SituationPackageV1 => {
  const situationPackage = JSON.parse(JSON.stringify(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE)) as SituationPackageV1
  const definition = situationPackage.definition as SituationDefinitionV1
  const template = definition.scenes[0]!
  const scenes = Array.from({ length: sceneCount }, (_, index) => ({
    ...template,
    sceneKey: `AS-${String(index + 1).padStart(3, '0')}`,
    sortOrder: index,
    title: `characterization scene ${index + 1}`,
  }))
  definition.scenes = scenes
  definition.scoring.choiceScores = scenes.flatMap((scene) => {
    const channel = scene.channels.find((candidate) => candidate.channelKey === 'behavior')
    if (!channel || channel.responseType !== 'SINGLE_CHOICE') throw new Error('characterization channel missing')
    return channel.options.map((option) => ({
      sceneKey: scene.sceneKey,
      channelKey: channel.channelKey,
      optionKey: option.optionKey,
      contribution: option.optionKey === 'A' ? 1.5 : option.optionKey === 'B' ? 0.5 : option.optionKey === 'C' ? -0.5 : -1.5,
    }))
  })
  const responses = scenes.map((scene) => ({ sceneKey: scene.sceneKey, channelKey: 'behavior' as const, responseValue: 'A' }))
  const expected = scoreSituational(definition, responses)
  situationPackage.key = `sjt-assertiveness-characterization-${sceneCount}`
  situationPackage.goldenCases = [{
    name: `all-strongest-${sceneCount}`,
    responses,
    expected: {
      quality: expected.quality.status,
      metrics: Object.fromEntries(expected.metrics.map((metric) => [metric.key, metric.value])),
      metricKeys: expected.metrics.map((metric) => metric.key),
    },
  }]
  return situationPackage
}

for (const sceneCount of [10, 30, 60]) {
  const situationPackage = buildSceneCountPackage(sceneCount)
  dynamicPackages.set(`${situationPackage.key}@${situationPackage.instrumentVersion}`, situationPackage)
}

let db: PrismaClient | null = null
let compositeService: typeof import('../../modules/composite/composite.service')
let submitSituationalAttemptFinal: typeof import('../../modules/situational/situational-final-submit.service')['submitSituationalAttemptFinal']
let loadEmbeddedSituationalAttemptRuntime: typeof import('../../modules/situational/situational-runtime.service')['loadEmbeddedSituationalAttemptRuntime']
let submitScaleAssessmentFinal: typeof import('../../modules/scale/scale-final-submit.service')['submitScaleAssessmentFinal']
let submitCognitiveSessionFinal: typeof import('../../modules/cognitive/final-submit.service')['submitCognitiveSessionFinal']
let getCognitiveRegistryEntry: typeof import('../../modules/cognitive/cognitive.registry')['getCognitiveRegistryEntry']

const createdCompositeIds: string[] = []
const createdAttemptIds: string[] = []
const createdCourseIds: string[] = []
const createdUserIds: string[] = []

const createUser = async (label: string): Promise<string> => {
  if (!db) throw new Error('Situational Bundle database is not connected')
  const suffix = `${label}-${randomUUID()}`
  const id = `situational-bundle-user-${suffix}`
  await db.user.create({
    data: { id, username: `situational-bundle-${suffix}`, passwordHash: 'situational-bundle-fixture-only' },
  })
  createdUserIds.push(id)
  return id
}

const createCompositeFixture = async (input: {
  userId?: string
  instrumentKey?: string
  instrumentVersion?: string
}) => {
  if (!db) throw new Error('Situational Bundle database is not connected')
  const userId = input.userId ?? await createUser('lifecycle')
  const suffix = randomUUID()
  const course = await db.course.create({
    data: {
      title: `Situational Bundle course ${suffix}`,
      courseCode: `SITUATIONAL-BUNDLE-${suffix}`,
      status: 'PUBLISHED',
      creatorId: userId,
    },
  })
  createdCourseIds.push(course.id)
  await db.courseStudent.create({
    data: { courseId: course.id, studentId: userId, status: 'ACTIVE' },
  })
  const composite = await db.compositeAssessment.create({
    data: {
      code: `SITUATIONAL-BUNDLE-${suffix}`,
      name: 'Situational Bundle integration fixture',
      status: 'PUBLISHED',
      courseId: course.id,
      createdBy: userId,
      maxAttempts: 1,
      publishedAt: new Date(),
    },
  })
  createdCompositeIds.push(composite.id)
  const item = await db.compositeAssessmentItem.create({
    data: {
      compositeAssessmentId: composite.id,
      type: 'SITUATIONAL',
      position: 0,
      required: true,
      situationalInstrumentKey: input.instrumentKey ?? SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key,
      situationalInstrumentVersion: input.instrumentVersion ?? SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
    },
  })
  return { userId, compositeId: composite.id, itemId: item.id }
}

const readEmbeddedChild = async (compositeAttemptId: string, compositeItemId: string) => {
  if (!db) throw new Error('Situational Bundle database is not connected')
  const child = await db.situationalAttempt.findUnique({
    where: { compositeAttemptId_compositeItemId: { compositeAttemptId, compositeItemId } },
  })
  if (!child) throw new Error('embedded Situational child is missing')
  return child
}

const finalInput = (fixture: { userId: string; itemId: string }, parentId: string, child: any, responses: any[], submissionId = `situational-bundle-${randomUUID()}`) => ({
  attemptId: child.id,
  userId: fixture.userId,
  submissionId,
  attemptEpoch: child.attemptEpoch,
  definitionHash: child.definitionHash,
  instrumentVersion: child.instrumentVersion,
  compiledRuntimeHash: child.compiledRuntimeHash,
  scoringVersion: child.scoringVersion,
  responses,
  embedded: {
    compositeAttemptId: parentId,
    compositeItemId: fixture.itemId,
    compositeSlotKey: compositeItemSlotKey(fixture.itemId, 'SITUATIONAL'),
    userId: fixture.userId,
  },
})

const assertivenessResponses = [
  { sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'A' },
  { sceneKey: 'AS-02', channelKey: 'behavior', responseValue: 'B' },
]

const waitForGateState = async (predicate: () => boolean, label: string): Promise<void> => {
  const deadline = Date.now() + 5_000
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const holdAggregateCapacity = async () => {
  const { maxConcurrent } = aggregateFinalizationAdmission.getStats().options
  const releases: Array<() => void> = []
  const holders = Array.from({ length: maxConcurrent }, () => (
    aggregateFinalizationAdmission.run(() => new Promise<void>((resolve) => { releases.push(resolve) }))
  ))
  await waitForGateState(
    () => aggregateFinalizationAdmission.getStats().active === maxConcurrent && releases.length === maxConcurrent,
    'aggregate active capacity',
  )
  return { holders, releases }
}

const conflictingAssertivenessResponses = [
  { sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'B' },
  { sceneKey: 'AS-02', channelKey: 'behavior', responseValue: 'A' },
]

const gonogoTrials = (randomSeed: string) => gonogoSequence(randomSeed, 120, 0.25).map((trialType, trialIndex) => createTrialEnvelope({
  trialIndex,
  phase: 'test',
  startedAtPerfMs: trialIndex * 1000,
  endedAtPerfMs: trialIndex * 1000 + 300,
  payload: {
    trialType,
    responded: trialType === 'go',
    rtMs: trialType === 'go' ? 300 : null,
    interrupted: false,
  },
}))

const MIXED_SCALE_DEFINITION: ScaleDefinitionV2 = {
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  source: { title: 'Situational Bundle mixed fixture', citation: 'situational-bundle.postgres.integration.test' },
  license: { status: 'self_authored', redistribution: 'allowed' },
  display: { randomizeItems: false },
  responseSets: [{
    key: 'default',
    options: [
      { value: 'no', label: '否', score: 0 },
      { value: 'yes', label: '是', score: 1 },
    ],
  }],
  items: [{
    itemCode: 'mixed-scale-item-1',
    content: 'Situational Bundle mixed fixture item',
    type: 'single',
    required: true,
    sortOrder: 0,
    responseSetKey: 'default',
    randomizeOptions: false,
  }],
  scoring: {
    scoringVersion: '2.0.0',
    itemRules: [{ itemCode: 'mixed-scale-item-1', transform: { type: 'identity' } }],
    defaultMissingPolicy: { type: 'complete_required' },
    scores: [{
      key: 'total',
      type: 'total',
      label: '总分',
      direction: 'descriptive',
      canonical: true,
      displayPrecision: 2,
      source: { type: 'items', items: [{ itemCode: 'mixed-scale-item-1', weight: 1 }], aggregation: 'sum' },
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
      summary: 'Situational Bundle mixed fixture result',
      bands: [],
      guidance: [],
    }],
    limitations: [],
    disclaimer: 'Situational Bundle mixed fixture only.',
  },
  referencePolicy: { type: 'none' },
}

type MixedFixture = {
  userId: string
  courseId: string
  compositeId: string
  attemptId: string
  cognitiveItemId: string
  scaleItemId: string
  situationalItemId: string
  cognitiveAssignmentId: string
  cognitiveConfigId: string
  cognitiveConfigOwned: boolean
  scaleId: string
  cognitiveSessionId: string
  scaleAssessmentId: string
  situationalAttemptId: string
  cognitiveDefinitionHash: string
  scaleDefinitionHash: string
}

const createMixedFixture = async (): Promise<MixedFixture> => {
  if (!db || !getCognitiveRegistryEntry) throw new Error('Situational Bundle database is not connected')
  const suffix = randomUUID()
  const ids = {
    userId: `situational-bundle-mixed-user-${suffix}`,
    courseId: `situational-bundle-mixed-course-${suffix}`,
    compositeId: `situational-bundle-mixed-composite-${suffix}`,
    cognitiveItemId: `situational-bundle-mixed-cognitive-item-${suffix}`,
    scaleItemId: `situational-bundle-mixed-scale-item-${suffix}`,
    situationalItemId: `situational-bundle-mixed-situational-item-${suffix}`,
    cognitiveAssignmentId: `situational-bundle-mixed-assignment-${suffix}`,
    cognitiveConfigId: `situational-bundle-mixed-config-${suffix}`,
    scaleId: `situational-bundle-mixed-scale-${suffix}`,
  }
  const entry = getCognitiveRegistryEntry('gonogo', '1.0.0', '1.0.0')
  if (!entry) throw new Error('Situational Bundle Go/No-Go registry entry is missing')
  const freeze = freezeAssignmentProfile({
    entry,
    profile: 'standard',
    baseConfig: {
      totalTrials: 120,
      nogoRatio: 0.25,
      stimulusMs: 800,
      isiMs: 500,
      validRtFloorMs: 100,
      report: { reportVersion: '1.0.0', referenceMode: 'none' },
    },
  })
  const scaleDefinitionHash = hashScaleDefinition(MIXED_SCALE_DEFINITION)

  await db.user.create({ data: { id: ids.userId, username: `situational-bundle-mixed-${suffix}`, passwordHash: 'situational-bundle-fixture-only' } })
  await db.course.create({
    data: {
      id: ids.courseId,
      title: 'Situational Bundle mixed fixture course',
      courseCode: `SITUATIONAL-BUNDLE-MIXED-${suffix}`,
      status: 'PUBLISHED',
      creatorId: ids.userId,
    },
  })
  await db.courseStudent.create({ data: { courseId: ids.courseId, studentId: ids.userId, status: 'ACTIVE' } })
  const existingConfig = await db.cognitiveTestConfig.findUnique({
    where: { testType_configVersion: { testType: 'gonogo', configVersion: '1.0.0' } },
  })
  const config = existingConfig ?? await db.cognitiveTestConfig.create({
    data: {
      id: ids.cognitiveConfigId,
      testType: 'gonogo',
      configVersion: '1.0.0',
      name: 'Situational Bundle mixed Go/No-Go fixture',
      config: freeze.resolvedConfig as Prisma.InputJsonValue,
      status: 'PUBLISHED',
      engineVersion: '1.0.0',
      scoringVersion: '1.0.0',
      accessPolicy: 'OPEN',
      publishedAt: new Date(),
    },
  })
  const assignment = await db.cognitiveAssignment.create({
    data: {
      id: ids.cognitiveAssignmentId,
      courseId: ids.courseId,
      configId: config.id,
      createdBy: ids.userId,
      title: 'Situational Bundle mixed Go/No-Go fixture',
      status: 'PUBLISHED',
      maxAttempts: 1,
      required: true,
      listedStandalone: false,
      profile: freeze.profile,
      profileDefinitionVersion: freeze.profileDefinitionVersion,
      resolvedConfigSnapshotEncrypted: freeze.resolvedConfigSnapshotEncrypted,
      resolvedConfigHash: freeze.resolvedConfigHash,
      resolvedReportSnapshotEncrypted: freeze.resolvedReportSnapshotEncrypted,
      publishedAt: new Date(),
    },
  })
  await db.scale.create({
    data: {
      id: ids.scaleId,
      code: `SITUATIONAL-BUNDLE-MIXED-SCALE-${suffix}`,
      name: 'Situational Bundle mixed Scale fixture',
      creatorId: ids.userId,
      status: 'PUBLISHED',
      visibility: 'HIDDEN',
      instrumentClass: 'CUSTOM_DESCRIPTIVE',
      instrumentVersion: '2.0.0',
      definition: MIXED_SCALE_DEFINITION as Prisma.InputJsonValue,
      definitionHash: scaleDefinitionHash,
      itemCount: MIXED_SCALE_DEFINITION.items.length,
      dimensionCount: MIXED_SCALE_DEFINITION.scoring.scores.length,
    },
  })
  const composite = await db.compositeAssessment.create({
    data: {
      id: ids.compositeId,
      code: `SITUATIONAL-BUNDLE-MIXED-${suffix}`,
      name: 'Situational Bundle mixed-unit fixture',
      status: 'PUBLISHED',
      courseId: ids.courseId,
      createdBy: ids.userId,
      maxAttempts: 1,
      publishedAt: new Date(),
    },
  })
  await db.compositeAssessmentItem.createMany({
    data: [
      {
        id: ids.cognitiveItemId,
        compositeAssessmentId: composite.id,
        type: 'COGNITIVE',
        position: 0,
        required: true,
        cognitiveAssignmentId: assignment.id,
      },
      {
        id: ids.scaleItemId,
        compositeAssessmentId: composite.id,
        type: 'SCALE',
        position: 1,
        required: true,
        scaleId: ids.scaleId,
      },
      {
        id: ids.situationalItemId,
        compositeAssessmentId: composite.id,
        type: 'SITUATIONAL',
        position: 2,
        required: true,
        situationalInstrumentKey: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key,
        situationalInstrumentVersion: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
      },
    ],
  })

  const started = await compositeService.startUserAttempt(ids.userId, composite.id)
  const cognitiveSession = await db.cognitiveSession.findFirst({
    where: { compositeAttemptId: started.attempt.id, compositeItemId: ids.cognitiveItemId, status: 'IN_PROGRESS' },
  })
  const scaleAssessment = await db.assessment.findFirst({
    where: { compositeAttemptId: started.attempt.id, compositeItemId: ids.scaleItemId, status: 'IN_PROGRESS' },
  })
  const situationalAttempt = await db.situationalAttempt.findUnique({
    where: { compositeAttemptId_compositeItemId: { compositeAttemptId: started.attempt.id, compositeItemId: ids.situationalItemId } },
  })
  if (!cognitiveSession || !scaleAssessment || !situationalAttempt) throw new Error('Situational Bundle mixed child records are missing')
  return {
    ...ids,
    attemptId: started.attempt.id,
    cognitiveSessionId: cognitiveSession.id,
    scaleAssessmentId: scaleAssessment.id,
    situationalAttemptId: situationalAttempt.id,
    cognitiveDefinitionHash: freeze.resolvedConfigHash,
    scaleDefinitionHash,
    cognitiveConfigOwned: !existingConfig,
  }
}

const destroyMixedFixture = async (fixture: MixedFixture) => {
  if (!db) return
  await db.assessmentUnitSnapshot.deleteMany({ where: { compositeAttemptId: fixture.attemptId } })
  await db.situationalRawSubmission.deleteMany({ where: { attempt: { compositeAttemptId: fixture.attemptId } } })
  await db.situationalAttempt.deleteMany({ where: { compositeAttemptId: fixture.attemptId } })
  await db.assessment.deleteMany({ where: { compositeAttemptId: fixture.attemptId } })
  await db.cognitiveRawSubmission.deleteMany({ where: { session: { compositeAttemptId: fixture.attemptId } } })
  await db.cognitiveSession.deleteMany({ where: { compositeAttemptId: fixture.attemptId } })
  await db.compositeAssessmentAttempt.deleteMany({ where: { id: fixture.attemptId } })
  await db.compositeAssessment.deleteMany({ where: { id: fixture.compositeId } })
  await db.cognitiveAssignment.deleteMany({ where: { id: fixture.cognitiveAssignmentId } })
  await db.scale.deleteMany({ where: { id: fixture.scaleId } })
  await db.courseStudent.deleteMany({ where: { courseId: fixture.courseId } })
  await db.course.deleteMany({ where: { id: fixture.courseId } })
  if (fixture.cognitiveConfigOwned) await db.cognitiveTestConfig.deleteMany({ where: { id: fixture.cognitiveConfigId } })
  await db.user.deleteMany({ where: { id: fixture.userId } })
}

suite('Situational Bundle PostgreSQL integration', () => {
  beforeAll(async () => {
    vi.doMock('../../modules/situational/situation-package.registry', async () => {
      const actual = await vi.importActual<typeof import('../../modules/situational/situation-package.registry')>('../../modules/situational/situation-package.registry')
      return {
        ...actual,
        getSituationPackage: (key: string, version: string) => (
          dynamicPackages.get(`${key}@${version}`) ?? actual.getSituationPackage(key, version)
        ),
        listSituationPackages: () => [...actual.listSituationPackages(), ...dynamicPackages.values()],
      }
    })
    process.env.DATABASE_URL = databaseUrl!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } })
    await db.$connect()
    compositeService = await import('../../modules/composite/composite.service')
    submitSituationalAttemptFinal = (await import('../../modules/situational/situational-final-submit.service')).submitSituationalAttemptFinal
    loadEmbeddedSituationalAttemptRuntime = (await import('../../modules/situational/situational-runtime.service')).loadEmbeddedSituationalAttemptRuntime
    submitScaleAssessmentFinal = (await import('../../modules/scale/scale-final-submit.service')).submitScaleAssessmentFinal
    submitCognitiveSessionFinal = (await import('../../modules/cognitive/final-submit.service')).submitCognitiveSessionFinal
    getCognitiveRegistryEntry = (await import('../../modules/cognitive/cognitive.registry')).getCognitiveRegistryEntry
  }, 120_000)

  afterAll(async () => {
    if (!db) return
    await db.assessmentUnitSnapshot.deleteMany({ where: { compositeAttemptId: { in: createdAttemptIds } } })
    await db.situationalRawSubmission.deleteMany({ where: { attempt: { compositeAttemptId: { in: createdAttemptIds } } } })
    await db.situationalAttempt.deleteMany({ where: { compositeAttemptId: { in: createdAttemptIds } } })
    await db.compositeAssessmentAttempt.deleteMany({ where: { id: { in: createdAttemptIds } } })
    await db.compositeAssessment.deleteMany({ where: { id: { in: createdCompositeIds } } })
    await db.courseStudent.deleteMany({ where: { courseId: { in: createdCourseIds } } })
    await db.course.deleteMany({ where: { id: { in: createdCourseIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
    await db.$disconnect()
    db = null
  })

  it('freezes one embedded slot, persists one canonical snapshot, finalizes the parent, and replays', async () => {
    const fixture = await createCompositeFixture({})
    const started = await compositeService.startUserAttempt(fixture.userId, fixture.compositeId)
    const parentId = started.attempt.id
    createdAttemptIds.push(parentId)
    const child = await readEmbeddedChild(parentId, fixture.itemId)
    const slotKey = compositeItemSlotKey(fixture.itemId, 'SITUATIONAL')

    expect(started.attempt.currentItem).toMatchObject({
      type: 'SITUATIONAL',
      id: fixture.itemId,
      situationalAttemptId: child.id,
    })
    const parent = await db!.compositeAssessmentAttempt.findUnique({
      where: { id: parentId },
      select: { frozenActiveSlotSetEncrypted: true, frozenActiveSlotSetHash: true },
    })
    const frozen = decryptFrozenActiveSlotSet(parent!.frozenActiveSlotSetEncrypted!)
    expect(frozen.slots).toHaveLength(1)
    expect(frozen.slots[0]).toMatchObject({
      slotKey,
      unitType: 'SITUATIONAL',
      runtimeIdentity: {
        instrumentKey: child.instrumentKey,
        instrumentVersion: child.instrumentVersion,
        definitionHash: child.definitionHash,
        compiledRuntimeHash: child.compiledRuntimeHash,
        scorerKey: child.scorerKey,
        scoringVersion: child.scoringVersion,
        runtimeGeneration: 'UNIFIED_V1',
        deliveryMode: 'FINAL_ONLY',
      },
    })
    expect(frozen.snapshotHash).toBe(parent!.frozenActiveSlotSetHash)

    await expect(loadEmbeddedSituationalAttemptRuntime(child.id, {
      compositeAttemptId: parentId,
      compositeItemId: fixture.itemId,
      compositeSlotKey: slotKey,
      userId: fixture.userId,
    })).resolves.toMatchObject({ row: { id: child.id } })

    const input = finalInput(fixture, parentId, child, assertivenessResponses)
    await expect(loadEmbeddedSituationalAttemptRuntime(child.id, input.embedded)).resolves.toMatchObject({ row: { id: child.id } })
    const submitted = await submitSituationalAttemptFinal(input)
    expect(submitted).toMatchObject({ replayed: false, attempt: { status: 'COMPLETED' } })

    const parentAfter = await db!.compositeAssessmentAttempt.findUnique({ where: { id: parentId }, select: { status: true, progress: true, completedItems: true } })
    expect(parentAfter).toEqual({ status: 'COMPLETED', progress: 100, completedItems: 1 })
    expect(await db!.situationalRawSubmission.count({ where: { attemptId: child.id } })).toBe(1)
    const snapshot = await db!.assessmentUnitSnapshot.findUnique({
      where: { compositeAttemptId_attemptEpoch_slotKey: { compositeAttemptId: parentId, attemptEpoch: 1, slotKey } },
    })
    expect(snapshot).toMatchObject({
      unitType: 'SITUATIONAL',
      payloadKind: 'UNIT_RESULT',
      sourceType: 'SITUATIONAL_ATTEMPT',
      sourceAttemptId: child.id,
      sourceSubmissionId: input.submissionId,
      canonicalResultEncrypted: expect.any(String),
    })
    const canonical = parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload<unknown>(snapshot!.canonicalResultEncrypted!))
    expect(canonical.core.unitType).toBe('SITUATIONAL')
    expect(canonical.core.metrics.map((metric) => metric.key)).toEqual(['bfi2.assertiveness.behavior'])
    expect(JSON.stringify(canonical)).not.toMatch(/sceneKey|optionKey|responseTime|choiceScores|percentile/i)

    const completedState = await compositeService.getAttemptState(parentId, { userId: fixture.userId })
    expect(completedState).toMatchObject({ status: 'COMPLETED', progress: 100, completedItems: 1, currentItem: null })

    const reportRow = await db!.compositeAssessmentAttempt.findUnique({
      where: { id: parentId },
      include: {
        compositeAssessment: { include: { items: true, formSections: { include: { items: true } } } },
        scaleAssessments: { include: { scale: true } },
        cognitiveSessions: true,
        formAnswers: true,
        formSectionAttempts: true,
        situationalAttempts: true,
      },
    })
    const report = compositeService.buildCompositeReport(reportRow)
    expect(report.unitReports[0]).toMatchObject({
      type: 'SITUATIONAL',
      kind: 'situational',
      instrumentKey: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key,
      metrics: [{ key: 'bfi2.assertiveness.behavior' }],
    })
    expect(JSON.stringify(report.unitReports[0])).not.toMatch(/sceneKey|optionKey|responseTime|choiceScores|percentile/i)

    const replayed = await submitSituationalAttemptFinal(input)
    expect(replayed.replayed).toBe(true)
    expect(await db!.situationalRawSubmission.count({ where: { attemptId: child.id } })).toBe(1)
    expect(await db!.assessmentUnitSnapshot.count({ where: { compositeAttemptId: parentId, slotKey } })).toBe(1)
  }, 30_000)

  it('releases UNIT admission before waiting for embedded parent aggregate', async () => {
    const fixture = await createCompositeFixture({})
    const started = await compositeService.startUserAttempt(fixture.userId, fixture.compositeId)
    const parentId = started.attempt.id
    createdAttemptIds.push(parentId)
    const child = await readEmbeddedChild(parentId, fixture.itemId)
    const input = finalInput(fixture, parentId, child, assertivenessResponses, `situational-bundle-unit-release-${randomUUID()}`)
    const held = await holdAggregateCapacity()
    let submitted: Promise<Awaited<ReturnType<typeof submitSituationalAttemptFinal>>> | null = null
    try {
      submitted = submitSituationalAttemptFinal(input)
      await waitForGateState(() => aggregateFinalizationAdmission.getStats().queued === 1, 'queued parent aggregate')
      expect(unitSubmitAdmission.getStats()).toMatchObject({ active: 0, queued: 0 })
      expect(await db!.situationalAttempt.findUnique({ where: { id: child.id }, select: { status: true } }))
        .toEqual({ status: 'COMPLETED' })
      held.releases.forEach((release) => release())
      await Promise.all(held.holders)
      await expect(submitted).resolves.toMatchObject({ replayed: false, attempt: { status: 'COMPLETED' } })
      expect(await db!.compositeAssessmentAttempt.findUnique({ where: { id: parentId }, select: { status: true } }))
        .toEqual({ status: 'COMPLETED' })
    } finally {
      held.releases.forEach((release) => release())
      await Promise.allSettled(held.holders)
      if (submitted) await Promise.allSettled([submitted])
      await waitForGateState(
        () => aggregateFinalizationAdmission.getStats().active === 0 && aggregateFinalizationAdmission.getStats().queued === 0,
        'aggregate gate drain',
      )
    }
  }, 60_000)

  it('repairs the parent on legal replay after aggregate queue-full without duplicating child evidence', async () => {
    const fixture = await createCompositeFixture({})
    const started = await compositeService.startUserAttempt(fixture.userId, fixture.compositeId)
    const parentId = started.attempt.id
    createdAttemptIds.push(parentId)
    const child = await readEmbeddedChild(parentId, fixture.itemId)
    const slotKey = compositeItemSlotKey(fixture.itemId, 'SITUATIONAL')
    const input = finalInput(fixture, parentId, child, assertivenessResponses, `situational-bundle-recovery-${randomUUID()}`)
    const held = await holdAggregateCapacity()
    const maxQueue = aggregateFinalizationAdmission.getStats().options.maxQueue
    const fillers = Array.from({ length: maxQueue }, () => aggregateFinalizationAdmission.run(async () => undefined))
    try {
      await waitForGateState(() => aggregateFinalizationAdmission.getStats().queued === maxQueue, 'full aggregate queue')
      const rejected = await submitSituationalAttemptFinal(input).catch((error) => error)
      expect(rejected).toMatchObject({ code: 'COMPLETION_BUSY' })
      expect(unitSubmitAdmission.getStats()).toMatchObject({ active: 0, queued: 0 })
      expect(await db!.situationalAttempt.findUnique({ where: { id: child.id }, select: { status: true, submissionId: true } }))
        .toEqual({ status: 'COMPLETED', submissionId: input.submissionId })
      expect(await db!.situationalRawSubmission.count({ where: { attemptId: child.id } })).toBe(1)
      expect(await db!.assessmentUnitSnapshot.count({ where: { compositeAttemptId: parentId, slotKey } })).toBe(1)
      expect(await db!.compositeAssessmentAttempt.findUnique({ where: { id: parentId }, select: { status: true } }))
        .toEqual({ status: 'IN_PROGRESS' })
    } finally {
      held.releases.forEach((release) => release())
      await Promise.allSettled([...held.holders, ...fillers])
      await waitForGateState(
        () => aggregateFinalizationAdmission.getStats().active === 0 && aggregateFinalizationAdmission.getStats().queued === 0,
        'aggregate gate recovery drain',
      )
    }

    const replayed = await submitSituationalAttemptFinal(input)
    expect(replayed).toMatchObject({ replayed: true, attempt: { status: 'COMPLETED' } })
    expect(await db!.compositeAssessmentAttempt.findUnique({ where: { id: parentId }, select: { status: true, progress: true, completedItems: true } }))
      .toEqual({ status: 'COMPLETED', progress: 100, completedItems: 1 })
    expect(await db!.situationalRawSubmission.count({ where: { attemptId: child.id } })).toBe(1)
    expect(await db!.assessmentUnitSnapshot.count({ where: { compositeAttemptId: parentId, slotKey } })).toBe(1)
  }, 60_000)

  it('admits exact PUBLISHED Situational packages and rejects missing or RETIRED identities before creating a Bundle attempt', async () => {
    const retiredPackage = JSON.parse(JSON.stringify(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE)) as SituationPackageV1
    retiredPackage.key = `sjt-retired-bundle-fixture-${randomUUID()}`
    retiredPackage.releaseStatus = 'RETIRED'
    dynamicPackages.set(`${retiredPackage.key}@${retiredPackage.instrumentVersion}`, retiredPackage)
    try {
      const rejectedCases = [
        { instrumentKey: 'sjt-missing-bundle-fixture', instrumentVersion: '1.0.0' },
        { instrumentKey: retiredPackage.key, instrumentVersion: retiredPackage.instrumentVersion },
      ]
      for (const input of rejectedCases) {
        const fixture = await createCompositeFixture(input)
        await expect(compositeService.startUserAttempt(fixture.userId, fixture.compositeId))
          .rejects.toMatchObject({ statusCode: 400 })
      }

      const publishedFixture = await createCompositeFixture({
        instrumentKey: 'sjt-responsibility-golden',
        instrumentVersion: '1.0.0',
      })
      const started = await compositeService.startUserAttempt(publishedFixture.userId, publishedFixture.compositeId)
      createdAttemptIds.push(started.attempt.id)
      expect(started.attempt.id).toBeTruthy()
    } finally {
      dynamicPackages.delete(`${retiredPackage.key}@${retiredPackage.instrumentVersion}`)
    }
  }, 30_000)

  it('converges concurrent identical FINALs and rejects a conflicting retry without duplicate Bundle evidence', async () => {
    const concurrentFixture = await createCompositeFixture({})
    const concurrentStarted = await compositeService.startUserAttempt(
      concurrentFixture.userId,
      concurrentFixture.compositeId,
    )
    const concurrentParentId = concurrentStarted.attempt.id
    createdAttemptIds.push(concurrentParentId)
    const concurrentChild = await readEmbeddedChild(concurrentParentId, concurrentFixture.itemId)
    const concurrentInput = finalInput(
      concurrentFixture,
      concurrentParentId,
      concurrentChild,
      assertivenessResponses,
      `situational-bundle-concurrent-${randomUUID()}`,
    )
    const concurrentOutcomes = await Promise.all([
      submitSituationalAttemptFinal(concurrentInput),
      submitSituationalAttemptFinal(concurrentInput),
    ])
    expect(concurrentOutcomes.map((outcome) => outcome.replayed).sort()).toEqual([false, true])
    expect(await db!.situationalRawSubmission.count({ where: { attemptId: concurrentChild.id } })).toBe(1)
    expect(await db!.assessmentUnitSnapshot.count({ where: { compositeAttemptId: concurrentParentId } })).toBe(1)
    expect(await db!.compositeAssessmentAttempt.findUnique({
      where: { id: concurrentParentId },
      select: { status: true, completedItems: true },
    })).toEqual({ status: 'COMPLETED', completedItems: 1 })

    const conflictFixture = await createCompositeFixture({})
    const conflictStarted = await compositeService.startUserAttempt(
      conflictFixture.userId,
      conflictFixture.compositeId,
    )
    const conflictParentId = conflictStarted.attempt.id
    createdAttemptIds.push(conflictParentId)
    const conflictChild = await readEmbeddedChild(conflictParentId, conflictFixture.itemId)
    const conflictSubmissionId = `situational-bundle-conflict-${randomUUID()}`
    const accepted = await submitSituationalAttemptFinal(finalInput(
      conflictFixture,
      conflictParentId,
      conflictChild,
      assertivenessResponses,
      conflictSubmissionId,
    ))
    expect(accepted.replayed).toBe(false)
    await expect(submitSituationalAttemptFinal(finalInput(
      conflictFixture,
      conflictParentId,
      conflictChild,
      conflictingAssertivenessResponses,
      conflictSubmissionId,
    ))).rejects.toMatchObject({ code: 'SUBMISSION_PAYLOAD_CONFLICT', statusCode: 409 })
    expect(await db!.situationalRawSubmission.count({ where: { attemptId: conflictChild.id } })).toBe(1)
    expect(await db!.assessmentUnitSnapshot.count({ where: { compositeAttemptId: conflictParentId } })).toBe(1)
    expect(await db!.compositeAssessmentAttempt.findUnique({
      where: { id: conflictParentId },
      select: { status: true, completedItems: true },
    })).toEqual({ status: 'COMPLETED', completedItems: 1 })
  }, 60_000)

  it('completes a mixed Scale + Cognitive + Situational parent through one unified lifecycle', async () => {
    const fixture = await createMixedFixture()
    try {
      const scaleSubmitted = await submitScaleAssessmentFinal({
        assessmentId: fixture.scaleAssessmentId,
        submissionId: `situational-bundle-mixed-scale-${randomUUID()}`,
        attemptEpoch: 1,
        definitionHash: fixture.scaleDefinitionHash,
        contextSnapshotHash: null,
        answers: MIXED_SCALE_DEFINITION.items.map((item) => ({ itemCode: item.itemCode, responseValue: 'yes' })),
        userId: fixture.userId,
      })
      expect(scaleSubmitted).toMatchObject({ replayed: false, assessment: { status: 'COMPLETED' } })
      expect(await db!.compositeAssessmentAttempt.findUnique({ where: { id: fixture.attemptId }, select: { status: true } }))
        .toEqual({ status: 'IN_PROGRESS' })

      const child = await db!.situationalAttempt.findUnique({ where: { id: fixture.situationalAttemptId } })
      if (!child) throw new Error('mixed Situational child is missing')
      const situationalSubmitted = await submitSituationalAttemptFinal(
        finalInput(
          { userId: fixture.userId, itemId: fixture.situationalItemId },
          fixture.attemptId,
          child,
          assertivenessResponses,
          `situational-bundle-mixed-situational-${randomUUID()}`,
        ),
      )
      expect(situationalSubmitted).toMatchObject({ replayed: false, attempt: { status: 'COMPLETED' } })
      expect(await db!.compositeAssessmentAttempt.findUnique({ where: { id: fixture.attemptId }, select: { status: true } }))
        .toEqual({ status: 'IN_PROGRESS' })

      const cognitiveSession = await db!.cognitiveSession.findUnique({ where: { id: fixture.cognitiveSessionId } })
      if (!cognitiveSession) throw new Error('mixed Cognitive session is missing')
      const cognitiveSubmitted = await submitCognitiveSessionFinal(fixture.userId, {
        sessionId: cognitiveSession.id,
        submissionId: `situational-bundle-mixed-cognitive-${randomUUID()}`,
        attemptEpoch: 1,
        definitionHash: fixture.cognitiveDefinitionHash,
        contextSnapshotHash: null,
        trials: gonogoTrials(cognitiveSession.randomSeed),
      })
      expect(cognitiveSubmitted).toMatchObject({ replayed: false, response: { status: 'COMPLETED' } })
      const reconciled = await compositeService.getAttemptState(fixture.attemptId, { userId: fixture.userId })
      expect(reconciled).toMatchObject({ status: 'COMPLETED', progress: 100, completedItems: 3, currentItem: null })

      const parent = await db!.compositeAssessmentAttempt.findUnique({
        where: { id: fixture.attemptId },
        select: { status: true, progress: true, completedItems: true, aggregateInputHash: true },
      })
      expect(parent).toMatchObject({
        status: 'COMPLETED',
        progress: 100,
        completedItems: 3,
        aggregateInputHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
      expect(await db!.assessment.count({ where: { compositeAttemptId: fixture.attemptId, status: 'COMPLETED' } })).toBe(1)
      expect(await db!.cognitiveSession.count({ where: { compositeAttemptId: fixture.attemptId, status: 'COMPLETED' } })).toBe(1)
      expect(await db!.situationalAttempt.count({ where: { compositeAttemptId: fixture.attemptId, status: 'COMPLETED' } })).toBe(1)
      expect(await db!.situationalRawSubmission.count({ where: { attemptId: fixture.situationalAttemptId } })).toBe(1)
      expect(await db!.assessmentUnitSnapshot.count({ where: { compositeAttemptId: fixture.attemptId, attemptEpoch: 1 } })).toBe(3)

      const reportRow = await db!.compositeAssessmentAttempt.findUnique({
        where: { id: fixture.attemptId },
        include: {
          compositeAssessment: {
            include: {
              items: { include: { scale: true, cognitiveAssignment: { include: { config: true } } } },
              formSections: { include: { items: true } },
            },
          },
          scaleAssessments: { include: { scale: true } },
          cognitiveSessions: true,
          formAnswers: true,
          formSectionAttempts: true,
          situationalAttempts: true,
        },
      })
      const report = compositeService.buildCompositeReport(reportRow)
      expect(report.unitReports.map((unit: { type: string }) => unit.type)).toEqual(['COGNITIVE', 'SCALE', 'SITUATIONAL'])
      expect(report.unitReports.find((unit: { type: string }) => unit.type === 'SITUATIONAL')).toMatchObject({
        kind: 'situational',
        metrics: [{ key: 'bfi2.assertiveness.behavior' }],
      })
      expect(JSON.stringify(report.unitReports)).not.toMatch(/sceneKey|optionKey|responseTime|choiceScores|percentile/i)
    } finally {
      await destroyMixedFixture(fixture)
    }
  }, 60_000)

  it('rejects cross-user and stale slot bindings before changing the parent or child', async () => {
    const fixture = await createCompositeFixture({})
    const otherUserId = await createUser('other')
    const started = await compositeService.startUserAttempt(fixture.userId, fixture.compositeId)
    const parentId = started.attempt.id
    createdAttemptIds.push(parentId)
    const child = await readEmbeddedChild(parentId, fixture.itemId)
    const slotKey = compositeItemSlotKey(fixture.itemId, 'SITUATIONAL')

    const validInput = finalInput(fixture, parentId, child, assertivenessResponses)
    await expect(submitSituationalAttemptFinal({
      ...validInput,
      definitionHash: '0'.repeat(64),
    })).rejects.toMatchObject({ code: 'DEFINITION_MISMATCH', statusCode: 409 })
    await expect(submitSituationalAttemptFinal({
      ...validInput,
      compiledRuntimeHash: '0'.repeat(64),
    })).rejects.toMatchObject({ code: 'DEFINITION_MISMATCH', statusCode: 409 })
    await expect(submitSituationalAttemptFinal({
      ...validInput,
      scoringVersion: 'situational-scoring-stale',
    })).rejects.toMatchObject({ code: 'DEFINITION_MISMATCH', statusCode: 409 })
    await expect(loadEmbeddedSituationalAttemptRuntime(child.id, {
      compositeAttemptId: parentId,
      compositeItemId: fixture.itemId,
      compositeSlotKey: slotKey,
      userId: otherUserId,
    })).rejects.toMatchObject({ code: 'STALE_ATTEMPT', statusCode: 403 })
    await expect(submitSituationalAttemptFinal({
      ...finalInput(fixture, parentId, child, assertivenessResponses),
      embedded: { compositeAttemptId: parentId, compositeItemId: fixture.itemId, compositeSlotKey: 'situational:stale-slot' },
    })).rejects.toMatchObject({ code: 'STALE_ATTEMPT', statusCode: 409 })
    expect(await db!.situationalAttempt.findUnique({ where: { id: child.id }, select: { status: true, submissionId: true } }))
      .toEqual({ status: 'IN_PROGRESS', submissionId: null })
    expect(await db!.compositeAssessmentAttempt.findUnique({ where: { id: parentId }, select: { status: true, progress: true } }))
      .toEqual({ status: 'IN_PROGRESS', progress: 0 })
  }, 30_000)

  it.each([10, 30, 60])('completes one embedded FINAL with %s scenes and one raw/canonical terminal fact', async (sceneCount) => {
    const situationPackage = dynamicPackages.get(`sjt-assertiveness-characterization-${sceneCount}@1.0.0`)
    if (!situationPackage) throw new Error(`missing characterization package ${sceneCount}`)
    const fixture = await createCompositeFixture({ instrumentKey: situationPackage.key, instrumentVersion: situationPackage.instrumentVersion })
    const started = await compositeService.startUserAttempt(fixture.userId, fixture.compositeId)
    const parentId = started.attempt.id
    createdAttemptIds.push(parentId)
    const child = await readEmbeddedChild(parentId, fixture.itemId)
    const responses = situationPackage.definition.scenes.map((scene) => ({
      sceneKey: scene.sceneKey,
      channelKey: 'behavior' as const,
      responseValue: 'A',
    }))
    const input = finalInput(fixture, parentId, child, responses)
    const submitted = await submitSituationalAttemptFinal(input)
    expect(submitted.replayed).toBe(false)
    expect(submitted.attempt.status).toBe('COMPLETED')
    expect(await db!.compositeAssessmentAttempt.findUnique({ where: { id: parentId }, select: { status: true, progress: true, completedItems: true } }))
      .toEqual({ status: 'COMPLETED', progress: 100, completedItems: 1 })
    expect(await db!.situationalRawSubmission.count({ where: { attemptId: child.id } })).toBe(1)
    expect(await db!.situationalRawSubmission.findUnique({ where: { attemptId: child.id }, select: { responseCount: true } }))
      .toEqual({ responseCount: sceneCount })
    expect(await db!.assessmentUnitSnapshot.count({ where: { compositeAttemptId: parentId, sourceAttemptId: child.id } })).toBe(1)
    expect(await db!.assessmentUnitSnapshot.count({ where: { compositeAttemptId: parentId, attemptEpoch: 1 } })).toBe(1)
  }, 30_000)
})
