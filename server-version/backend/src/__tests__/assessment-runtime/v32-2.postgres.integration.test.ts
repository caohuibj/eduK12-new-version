import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Prisma, PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { hashScaleDefinition, type ScaleDefinitionV2 } from '../../modules/scale/scale-definition'
import { ADEXI_V2_DEFINITION } from '../../modules/scale/packages/adexi-v2'
import { gonogoSequence } from '../../modules/cognitive/randomization'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
import { createFrozenScaleRuntimeSnapshot, encryptFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { encryptFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import { freezeCompositeActiveSlotSet, freezeQuestionnaireActiveSlotSet, formSectionIdentityHash } from '../../modules/assessment-runtime/attempt-runtime'
import { decryptUnifiedRuntimePayload, encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { createCanonicalUnitResultEnvelope, parseCanonicalUnitResultEnvelope, type CanonicalUnitResultCoreV1 } from '../../modules/assessment-runtime/unit-result'
import { createFormSectionCollectionFacts } from '../../modules/assessment-runtime/form-facts'
import { decryptField } from '../../utils/encryption'

const databaseUrl = integrationDatabaseUrl('V32_2_INTEGRATION_DATABASE_URL')
const suite = databaseUrl ? describe : describe.skip

let db: PrismaClient | null = null
let finalizeQuestionnaireAttemptUnifiedIfReady: typeof import('../../modules/assessment-runtime/unified-aggregate-finalizer.service')['finalizeQuestionnaireAttemptUnifiedIfReady']
let finalizeCompositeAttemptUnifiedIfReady: typeof import('../../modules/assessment-runtime/unified-aggregate-finalizer.service')['finalizeCompositeAttemptUnifiedIfReady']
let mapCompositeSection: typeof import('../../modules/composite/final-submit.service')['mapCompositeSection']
let compositeService: typeof import('../../modules/composite/composite.service')
let submitCognitiveSessionFinal: typeof import('../../modules/cognitive/final-submit.service')['submitCognitiveSessionFinal']
let submitScaleAssessmentFinal: typeof import('../../modules/scale/scale-final-submit.service')['submitScaleAssessmentFinal']
let getCognitiveRegistryEntry: typeof import('../../modules/cognitive/cognitive.registry')['getCognitiveRegistryEntry']
let freezeAssignmentProfile: typeof import('../../modules/cognitive/profile-freeze')['freezeAssignmentProfile']
let buildFrozenReportPackageSnapshot: typeof import('../../modules/cognitive-analysis/report-package-freeze')['buildFrozenReportPackageSnapshot']
let encryptFrozenReportPackageSnapshot: typeof import('../../modules/cognitive-analysis/report-package-freeze')['encryptFrozenReportPackageSnapshot']
let getAnalysisProtocolDefinition: typeof import('../../modules/cognitive-analysis/analysis-protocol.registry')['getAnalysisProtocolDefinition']
let getReportPackageDefinition: typeof import('../../modules/cognitive-analysis/report-package.registry')['getReportPackageDefinition']
let readCognitiveSessionConfig: typeof import('../../modules/cognitive/session.service')['readCognitiveSessionConfig']

type Fixture = {
  userId: string
  questionnaireId: string
  scaleId: string
  questionnaireScaleId: string
  sectionId: string
  formItemId: string
  assessmentId: string
  sectionAttemptId: string
  parentId: string
  scaleCode: string
  runtime: ReturnType<typeof createFrozenScaleRuntimeSnapshot>
  sectionDefinition: Record<string, unknown>
  sectionDefinitionHash: string
}

type CompositeFixture = {
  userId: string
  compositeId: string
  sectionId: string
  formItemId: string
  attemptId: string
  sectionAttemptId: string
  sectionDefinitionHash: string
}

type CompositePackageFixture = {
  userId: string
  courseId: string
  compositeId: string
  attemptId: string
  cognitiveItemId: string
  scaleItemId: string
  cognitiveAssignmentId: string
  cognitiveConfigId: string
  cognitiveSessionId: string
  scaleId: string
  scaleAssessmentId: string
  cognitiveDefinitionHash: string
  scaleDefinitionHash: string
}

const scaleDefinition = (): ScaleDefinitionV2 => ({
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  source: { title: 'V32-2 integration fixture', citation: 'v32-2.postgres.integration.test' },
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
    itemCode: 'v32-2-item-1',
    content: 'V32-2 fixture item',
    type: 'single',
    required: true,
    sortOrder: 0,
    responseSetKey: 'default',
    randomizeOptions: false,
  }],
  scoring: {
    scoringVersion: '2.0.0',
    itemRules: [{ itemCode: 'v32-2-item-1', transform: { type: 'identity' } }],
    defaultMissingPolicy: { type: 'complete_required' },
    scores: [{
      key: 'total',
      type: 'total',
      label: '总分',
      direction: 'descriptive',
      canonical: true,
      displayPrecision: 2,
      source: { type: 'items', items: [{ itemCode: 'v32-2-item-1', weight: 1 }], aggregation: 'sum' },
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
      summary: 'V32-2 fixture result',
      bands: [],
      guidance: [],
    }],
    limitations: [],
    disclaimer: 'V32-2 fixture only.',
  },
  referencePolicy: { type: 'none' },
})

const makeSectionDefinition = (input: { sectionId: string; itemId: string }) => ({
  id: input.sectionId,
  title: 'V32-2 form section',
  description: null,
  position: 1,
  contextSection: false,
  items: [{
    id: input.itemId,
    type: 'text_input',
    label: '年级',
    placeholder: null,
    required: true,
    options: null,
    contextKey: null,
    position: 0,
    sectionPosition: 0,
  }],
})

const createFixture = async (): Promise<Fixture> => {
  if (!db) throw new Error('V32-2 database is not connected')
  const suffix = randomUUID()
  const ids = {
    userId: `v32-2-user-${suffix}`,
    questionnaireId: `v32-2-questionnaire-${suffix}`,
    scaleId: `v32-2-scale-${suffix}`,
    questionnaireScaleId: `v32-2-questionnaire-scale-${suffix}`,
    sectionId: `v32-2-section-${suffix}`,
    formItemId: `v32-2-form-item-${suffix}`,
    assessmentId: `v32-2-assessment-${suffix}`,
    sectionAttemptId: `v32-2-section-attempt-${suffix}`,
    parentId: `v32-2-parent-${suffix}`,
  }
  const scaleCode = `V32-2-FIXTURE-SCALE-${suffix}`
  const definition = scaleDefinition()
  const runtime = createFrozenScaleRuntimeSnapshot({
    instrumentKey: scaleCode,
    instrumentVersion: '2.0.0',
    definition,
  })
  const sectionDefinition = makeSectionDefinition({ sectionId: ids.sectionId, itemId: ids.formItemId })
  const sectionDefinitionHash = formSectionIdentityHash(sectionDefinition)

  await db.user.create({ data: { id: ids.userId, username: `v32-2-${suffix}`, passwordHash: 'v32-2-fixture-only' } })
  await db.scale.create({
    data: {
      id: ids.scaleId,
      code: scaleCode,
      name: 'V32-2 fixture scale',
      creatorId: ids.userId,
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      instrumentClass: 'CUSTOM_DESCRIPTIVE',
      instrumentVersion: '2.0.0',
      definition: definition as Prisma.InputJsonValue,
      definitionHash: hashScaleDefinition(definition),
      itemCount: 1,
      dimensionCount: 1,
    },
  })
  await db.questionnaire.create({
    data: {
      id: ids.questionnaireId,
      code: `v32-2-${suffix}`,
      name: 'V32-2 fixture questionnaire',
      type: 'GENERAL',
      status: 'PUBLISHED',
      creatorId: ids.userId,
    },
  })
  await db.questionnaireScale.create({
    data: {
      id: ids.questionnaireScaleId,
      questionnaireId: ids.questionnaireId,
      scaleId: ids.scaleId,
      position: 0,
    },
  })
  await db.questionnaireFormSection.create({
    data: {
      id: ids.sectionId,
      questionnaireId: ids.questionnaireId,
      title: sectionDefinition.title as string,
      position: 1,
      contextSection: false,
    },
  })
  await db.questionnaireFormItem.create({
    data: {
      id: ids.formItemId,
      questionnaireId: ids.questionnaireId,
      sectionId: ids.sectionId,
      sectionPosition: 0,
      type: 'text_input',
      label: '年级',
      position: 0,
      required: true,
    },
  })
  await db.questionnaireAssessment.create({
    data: {
      id: ids.parentId,
      questionnaireId: ids.questionnaireId,
      userId: ids.userId,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      runtimeGeneration: 'UNIFIED_V1',
      attemptEpoch: 1,
      progress: 0,
    },
  })
  await db.assessment.create({
    data: {
      id: ids.assessmentId,
      scaleId: ids.scaleId,
      userId: ids.userId,
      questionnaireAssessmentId: ids.parentId,
      status: 'COMPLETED',
      deliveryMode: 'FINAL_ONLY',
      runtimeGeneration: 'UNIFIED_V1',
      attemptEpoch: 1,
      runtimeSnapshotEncrypted: encryptFrozenScaleRuntimeSnapshot(runtime),
      compiledRuntimeHash: runtime.compiledRuntime.compiledRuntimeHash,
      progress: 100,
    },
  })
  await db.questionnaireFormSectionAttempt.create({
    data: {
      id: ids.sectionAttemptId,
      questionnaireAssessmentId: ids.parentId,
      sectionId: ids.sectionId,
      status: 'COMPLETED',
      attemptEpoch: 1,
    },
  })
  const slotSet = freezeQuestionnaireActiveSlotSet({
    attemptEpoch: 1,
    scales: [{
      questionnaireScaleId: ids.questionnaireScaleId,
      code: scaleCode,
      instrumentVersion: '2.0.0',
      sourceDefinitionHash: runtime.sourceDefinitionHash,
      compiledRuntimeHash: runtime.compiledRuntime.compiledRuntimeHash,
    }],
    formSections: [{ sectionId: ids.sectionId, definitionHash: sectionDefinitionHash }],
  })
  await db.questionnaireAssessment.update({
    where: { id: ids.parentId },
    data: {
      frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slotSet),
      frozenActiveSlotSetHash: slotSet.snapshotHash,
    },
  })
  return { ...ids, scaleCode, runtime, sectionDefinition, sectionDefinitionHash }
}

const canonicalScaleEnvelope = (fixture: Fixture) => {
  const core: CanonicalUnitResultCoreV1 = {
    schemaVersion: 1,
    unitType: 'SCALE',
    instrumentKey: fixture.runtime.instrumentKey,
    instrumentVersion: fixture.runtime.instrumentVersion,
    sourceDefinitionHash: fixture.runtime.sourceDefinitionHash,
    compilerVersion: fixture.runtime.compiledRuntime.compilerVersion,
    compiledRuntimeHash: fixture.runtime.compiledRuntime.compiledRuntimeHash,
    scorerKey: fixture.runtime.compiledRuntime.scorerKey ?? 'scale.default',
    scorerVersion: fixture.runtime.compiledRuntime.scorerVersion,
    quality: { status: 'interpretable', flags: [] },
    metrics: [{ key: 'total', value: 1, unit: 'score', quality: 'calculated' }],
    facts: [],
    references: [],
    contextHash: null,
    scientificProvenance: {
      instrumentKey: fixture.runtime.instrumentKey,
      instrumentVersion: fixture.runtime.instrumentVersion,
    },
  }
  return createCanonicalUnitResultEnvelope({
    core,
    completedAt: new Date('2026-09-01T00:00:00.000Z'),
    persistenceProvenance: {
      sourceType: 'ASSESSMENT',
      sourceAttemptId: fixture.assessmentId,
      sourceSubmissionId: 'v32-2-scale-submission',
    },
  })
}

const addScaleSnapshot = async (fixture: Fixture, encrypted: string) => {
  if (!db) throw new Error('V32-2 database is not connected')
  await db.assessmentUnitSnapshot.create({
    data: {
      questionnaireAssessmentId: fixture.parentId,
      attemptEpoch: 1,
      slotKey: `scale:${fixture.questionnaireScaleId}`,
      unitType: 'SCALE',
      terminalState: 'COMPLETED',
      payloadKind: 'UNIT_RESULT',
      sourceType: 'ASSESSMENT',
      sourceAttemptId: fixture.assessmentId,
      sourceSubmissionId: 'v32-2-scale-submission',
      sourceDefinitionHash: fixture.runtime.sourceDefinitionHash,
      compiledRuntimeHash: fixture.runtime.compiledRuntime.compiledRuntimeHash,
      canonicalResultEncrypted: encrypted,
      completedAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  })
}

const addFormSnapshot = async (fixture: Fixture) => {
  if (!db) throw new Error('V32-2 database is not connected')
  const facts = createFormSectionCollectionFacts({
    sectionKey: fixture.sectionId,
    items: [{ key: fixture.formItemId, label: '年级', value: '三年级' }],
  })
  await db.assessmentUnitSnapshot.create({
    data: {
      questionnaireAssessmentId: fixture.parentId,
      attemptEpoch: 1,
      slotKey: `form-section:${fixture.sectionId}`,
      unitType: 'FORM_SECTION',
      terminalState: 'COMPLETED',
      payloadKind: 'COLLECTION_FACTS',
      sourceType: 'QUESTIONNAIRE_FORM_SECTION',
      sourceAttemptId: fixture.sectionAttemptId,
      sourceSubmissionId: 'v32-2-form-submission',
      sourceDefinitionHash: fixture.sectionDefinitionHash,
      collectionFactsEncrypted: encryptUnifiedRuntimePayload(facts),
      completedAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  })
}

const destroyFixture = async (fixture: Fixture) => {
  if (!db) return
  await db.assessmentUnitSnapshot.deleteMany({ where: { questionnaireAssessmentId: fixture.parentId } })
  await db.assessment.deleteMany({ where: { questionnaireAssessmentId: fixture.parentId } })
  await db.questionnaireFormSectionAttempt.deleteMany({ where: { questionnaireAssessmentId: fixture.parentId } })
  await db.questionnaireFormAnswer.deleteMany({ where: { questionnaireAssessmentId: fixture.parentId } })
  await db.questionnaireAssessment.deleteMany({ where: { id: fixture.parentId } })
  await db.questionnaire.deleteMany({ where: { id: fixture.questionnaireId } })
  await db.scale.deleteMany({ where: { id: fixture.scaleId } })
  await db.user.deleteMany({ where: { id: fixture.userId } })
}

const createCompositeFixture = async (): Promise<CompositeFixture> => {
  if (!db) throw new Error('V32-2 database is not connected')
  const suffix = randomUUID()
  const ids = {
    userId: `v32-2-composite-user-${suffix}`,
    compositeId: `v32-2-composite-${suffix}`,
    sectionId: `v32-2-composite-section-${suffix}`,
    formItemId: `v32-2-composite-form-item-${suffix}`,
    attemptId: `v32-2-composite-attempt-${suffix}`,
    sectionAttemptId: `v32-2-composite-section-attempt-${suffix}`,
  }
  await db.user.create({ data: { id: ids.userId, username: `v32-2-composite-${suffix}`, passwordHash: 'v32-2-fixture-only' } })
  await db.compositeAssessment.create({
    data: {
      id: ids.compositeId,
      code: `v32-2-composite-${suffix}`,
      name: 'V32-2 composite fixture',
      status: 'PUBLISHED',
      createdBy: ids.userId,
    },
  })
  await db.compositeFormSection.create({
    data: {
      id: ids.sectionId,
      compositeAssessmentId: ids.compositeId,
      title: 'V32-2 composite form section',
      position: 0,
      contextSection: false,
    },
  })
  await db.compositeAssessmentItem.create({
    data: {
      id: ids.formItemId,
      compositeAssessmentId: ids.compositeId,
      type: 'FORM',
      position: 0,
      required: true,
      formType: 'text_input',
      formLabel: '年级',
      formSectionId: ids.sectionId,
      formSectionPosition: 0,
    },
  })
  await db.compositeAssessmentAttempt.create({
    data: {
      id: ids.attemptId,
      compositeAssessmentId: ids.compositeId,
      userId: ids.userId,
      participantKey: `v32-2-composite-participant-${suffix}`,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      runtimeGeneration: 'UNIFIED_V1',
      attemptEpoch: 1,
      progress: 0,
      completedItems: 0,
    },
  })
  await db.compositeFormSectionAttempt.create({
    data: {
      id: ids.sectionAttemptId,
      attemptId: ids.attemptId,
      sectionId: ids.sectionId,
      status: 'COMPLETED',
      attemptEpoch: 1,
    },
  })
  const storedSection = await db.compositeFormSection.findUnique({ where: { id: ids.sectionId }, include: { items: true } })
  if (!storedSection) throw new Error('V32-2 composite section is missing')
  const sectionDefinitionHash = formSectionIdentityHash(mapCompositeSection(storedSection))
  const slotSet = freezeCompositeActiveSlotSet({ attemptEpoch: 1, scales: [], cognitive: [], formSections: [{ sectionId: ids.sectionId, definitionHash: sectionDefinitionHash }] })
  await db.compositeAssessmentAttempt.update({
    where: { id: ids.attemptId },
    data: {
      frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slotSet),
      frozenActiveSlotSetHash: slotSet.snapshotHash,
    },
  })
  const facts = createFormSectionCollectionFacts({ sectionKey: ids.sectionId, items: [{ key: ids.formItemId, label: '年级', value: '三年级' }] })
  await db.assessmentUnitSnapshot.create({
    data: {
      compositeAttemptId: ids.attemptId,
      attemptEpoch: 1,
      slotKey: `form-section:${ids.sectionId}`,
      unitType: 'FORM_SECTION',
      terminalState: 'COMPLETED',
      payloadKind: 'COLLECTION_FACTS',
      sourceType: 'COMPOSITE_FORM_SECTION',
      sourceAttemptId: ids.sectionAttemptId,
      sourceSubmissionId: `v32-2-composite-form-${suffix}`,
      sourceDefinitionHash: sectionDefinitionHash,
      collectionFactsEncrypted: encryptUnifiedRuntimePayload(facts),
      completedAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  })
  return { ...ids, sectionDefinitionHash }
}

const destroyCompositeFixture = async (fixture: CompositeFixture) => {
  if (!db) return
  await db.assessmentUnitSnapshot.deleteMany({ where: { compositeAttemptId: fixture.attemptId } })
  await db.compositeAssessmentAttempt.deleteMany({ where: { id: fixture.attemptId } })
  await db.compositeAssessment.deleteMany({ where: { id: fixture.compositeId } })
  await db.user.deleteMany({ where: { id: fixture.userId } })
}

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

const destroyCompositePackageFixture = async (fixture: CompositePackageFixture) => {
  if (!db) return
  await db.assessmentUnitSnapshot.deleteMany({ where: { compositeAttemptId: fixture.attemptId } })
  await db.compositeAnalysisSnapshot.deleteMany({ where: { attemptId: fixture.attemptId } })
  await db.assessment.deleteMany({ where: { compositeAttemptId: fixture.attemptId } })
  await db.cognitiveSession.deleteMany({ where: { compositeAttemptId: fixture.attemptId } })
  await db.compositeAssessmentAttempt.deleteMany({ where: { id: fixture.attemptId } })
  await db.compositeAssessment.deleteMany({ where: { id: fixture.compositeId } })
  await db.cognitiveAssignment.deleteMany({ where: { id: fixture.cognitiveAssignmentId } })
  await db.scale.deleteMany({ where: { id: fixture.scaleId } })
  await db.courseStudent.deleteMany({ where: { courseId: fixture.courseId } })
  await db.course.deleteMany({ where: { id: fixture.courseId } })
  await db.cognitiveTestConfig.deleteMany({ where: { id: fixture.cognitiveConfigId } })
  await db.user.deleteMany({ where: { id: fixture.userId } })
}

const createCompositePackageFixture = async (): Promise<CompositePackageFixture> => {
  if (!db) throw new Error('V32-2 database is not connected')
  if (!compositeService || !getCognitiveRegistryEntry || !freezeAssignmentProfile || !buildFrozenReportPackageSnapshot || !encryptFrozenReportPackageSnapshot || !getAnalysisProtocolDefinition || !getReportPackageDefinition || !readCognitiveSessionConfig) {
    throw new Error('V32-2 package fixture dependencies are not loaded')
  }

  const suffix = randomUUID()
  const ids = {
    userId: `v32-2-package-user-${suffix}`,
    courseId: `v32-2-package-course-${suffix}`,
    compositeId: `v32-2-package-composite-${suffix}`,
    cognitiveItemId: `v32-2-package-cognitive-item-${suffix}`,
    scaleItemId: `v32-2-package-scale-item-${suffix}`,
    cognitiveAssignmentId: `v32-2-package-assignment-${suffix}`,
    cognitiveConfigId: `v32-2-package-config-${suffix}`,
    scaleId: `v32-2-package-scale-${suffix}`,
  }
  const packageDefinition = getReportPackageDefinition('inhibitory_control_multisource_v1', '1.0.0')
  if (!packageDefinition) throw new Error('V32-2 report package definition is missing')
  const protocol = getAnalysisProtocolDefinition(packageDefinition.analysisProtocolKey, packageDefinition.analysisProtocolVersion)
  if (!protocol) throw new Error('V32-2 report package protocol is missing')
  const entry = getCognitiveRegistryEntry('gonogo', '1.0.0', '1.0.0')
  if (!entry) throw new Error('V32-2 Go/No-Go registry entry is missing')

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
  const scaleDefinitionHash = hashScaleDefinition(ADEXI_V2_DEFINITION)

  await db.user.create({ data: { id: ids.userId, username: `v32-2-package-${suffix}`, passwordHash: 'v32-2-fixture-only' } })
  await db.course.create({
    data: {
      id: ids.courseId,
      title: 'V32-2 package fixture course',
      courseCode: `V32-2-PACKAGE-${suffix}`,
      status: 'PUBLISHED',
      creatorId: ids.userId,
    },
  })
  await db.courseStudent.create({ data: { courseId: ids.courseId, studentId: ids.userId, status: 'ACTIVE' } })
  const config = await db.cognitiveTestConfig.create({
    data: {
      id: ids.cognitiveConfigId,
      testType: 'gonogo',
      configVersion: '1.0.0',
      name: 'V32-2 Go/No-Go package fixture',
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
      title: 'V32-2 Go/No-Go package fixture',
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
      code: 'adexi_v1',
      name: 'ADEXI package fixture',
      creatorId: ids.userId,
      status: 'PUBLISHED',
      visibility: 'HIDDEN',
      instrumentClass: 'STANDARD',
      instrumentVersion: '2.0.0',
      definition: ADEXI_V2_DEFINITION as Prisma.InputJsonValue,
      definitionHash: scaleDefinitionHash,
      itemCount: ADEXI_V2_DEFINITION.items.length,
      dimensionCount: ADEXI_V2_DEFINITION.scoring.scores.length,
    },
  })

  const cognitiveItem = {
    id: ids.cognitiveItemId,
    type: 'COGNITIVE' as const,
    position: 0,
    required: true,
    cognitiveAssignment: {
      id: assignment.id,
      profile: 'standard' as const,
      profileDefinitionVersion: freeze.profileDefinitionVersion,
      resolvedConfigSnapshotEncrypted: freeze.resolvedConfigSnapshotEncrypted,
      resolvedConfigHash: freeze.resolvedConfigHash,
      resolvedReportSnapshotEncrypted: freeze.resolvedReportSnapshotEncrypted,
      config: {
        testType: config.testType,
        configVersion: config.configVersion,
        engineVersion: config.engineVersion,
        scoringVersion: config.scoringVersion,
        status: 'PUBLISHED',
      },
    },
  }
  const scaleItem = {
    id: ids.scaleItemId,
    type: 'SCALE' as const,
    position: 1,
    required: true,
    scaleId: ids.scaleId,
    scale: {
      id: ids.scaleId,
      code: 'adexi_v1',
      name: 'ADEXI package fixture',
      status: 'PUBLISHED',
      visibility: 'HIDDEN',
      instrumentClass: 'STANDARD' as const,
      instrumentVersion: '2.0.0',
      definition: ADEXI_V2_DEFINITION,
    },
  }
  const packageSnapshot = buildFrozenReportPackageSnapshot(packageDefinition, protocol, [cognitiveItem, scaleItem])
  await db.compositeAssessment.create({
    data: {
      id: ids.compositeId,
      code: `V32-2-PACKAGE-${suffix}`,
      name: 'V32-2 Unified Composite report package fixture',
      status: 'PUBLISHED',
      courseId: ids.courseId,
      createdBy: ids.userId,
      maxAttempts: 1,
      analysisProtocolKey: packageDefinition.analysisProtocolKey,
      analysisProtocolVersion: packageDefinition.analysisProtocolVersion,
      reportPackageKey: packageDefinition.key,
      reportPackageVersion: packageDefinition.version,
      reportPackageProfile: 'standard',
      reportPackageSnapshotEncrypted: encryptFrozenReportPackageSnapshot(packageSnapshot),
      publishedAt: new Date(),
    },
  })
  await db.compositeAssessmentItem.create({
    data: {
      id: ids.cognitiveItemId,
      compositeAssessmentId: ids.compositeId,
      type: 'COGNITIVE',
      position: 0,
      required: true,
      cognitiveAssignmentId: assignment.id,
    },
  })
  await db.compositeAssessmentItem.create({
    data: {
      id: ids.scaleItemId,
      compositeAssessmentId: ids.compositeId,
      type: 'SCALE',
      position: 1,
      required: true,
      scaleId: ids.scaleId,
    },
  })

  const started = await compositeService.startUserAttempt(ids.userId, ids.compositeId)
  const session = await db.cognitiveSession.findFirst({
    where: { compositeAttemptId: started.attempt.id, compositeItemId: ids.cognitiveItemId, status: 'IN_PROGRESS' },
  })
  const assessment = await db.assessment.findFirst({
    where: { compositeAttemptId: started.attempt.id, compositeItemId: ids.scaleItemId, status: 'IN_PROGRESS' },
  })
  if (!session || !assessment) throw new Error('V32-2 package child records are missing')
  const stored = readCognitiveSessionConfig(session.configSnapshotEncrypted)
  if (!stored.snapshot) throw new Error('V32-2 package Cognitive session snapshot is missing')
  if (stored.snapshot.configHash !== freeze.resolvedConfigHash) throw new Error('V32-2 package config hash fixture mismatch')
  return {
    ...ids,
    attemptId: started.attempt.id,
    cognitiveSessionId: session.id,
    scaleAssessmentId: assessment.id,
    cognitiveDefinitionHash: freeze.resolvedConfigHash,
    scaleDefinitionHash,
  }
}

suite('V32-2 closed aggregate PostgreSQL integration', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } })
    await db.$connect()
    finalizeQuestionnaireAttemptUnifiedIfReady = (await import('../../modules/assessment-runtime/unified-aggregate-finalizer.service')).finalizeQuestionnaireAttemptUnifiedIfReady
    finalizeCompositeAttemptUnifiedIfReady = (await import('../../modules/assessment-runtime/unified-aggregate-finalizer.service')).finalizeCompositeAttemptUnifiedIfReady
    mapCompositeSection = (await import('../../modules/composite/final-submit.service')).mapCompositeSection
    compositeService = await import('../../modules/composite/composite.service')
    submitCognitiveSessionFinal = (await import('../../modules/cognitive/final-submit.service')).submitCognitiveSessionFinal
    submitScaleAssessmentFinal = (await import('../../modules/scale/scale-final-submit.service')).submitScaleAssessmentFinal
    getCognitiveRegistryEntry = (await import('../../modules/cognitive/cognitive.registry')).getCognitiveRegistryEntry
    freezeAssignmentProfile = (await import('../../modules/cognitive/profile-freeze')).freezeAssignmentProfile
    const reportPackageFreeze = await import('../../modules/cognitive-analysis/report-package-freeze')
    buildFrozenReportPackageSnapshot = reportPackageFreeze.buildFrozenReportPackageSnapshot
    encryptFrozenReportPackageSnapshot = reportPackageFreeze.encryptFrozenReportPackageSnapshot
    getAnalysisProtocolDefinition = (await import('../../modules/cognitive-analysis/analysis-protocol.registry')).getAnalysisProtocolDefinition
    getReportPackageDefinition = (await import('../../modules/cognitive-analysis/report-package.registry')).getReportPackageDefinition
    readCognitiveSessionConfig = (await import('../../modules/cognitive/session.service')).readCognitiveSessionConfig
  })

  afterAll(async () => {
    await db?.$disconnect()
    db = null
  })

  it('uses headers for incomplete progress without decrypting completed payloads', async () => {
    const fixture = await createFixture()
    try {
      await addScaleSnapshot(fixture, 'not-a-unified-encrypted-payload')
      const result = await finalizeQuestionnaireAttemptUnifiedIfReady(fixture.parentId)
      expect(result).toMatchObject({ status: 'IN_PROGRESS', progress: 50, completedAt: null })
      expect(await db!.questionnaireAssessment.findUnique({ where: { id: fixture.parentId }, select: { status: true, progress: true } })).toEqual({ status: 'IN_PROGRESS', progress: 50 })
    } finally {
      await destroyFixture(fixture)
    }
  }, 30_000)

  it('converges Questionnaire completion through one CAS and stores only a collection report', async () => {
    const fixture = await createFixture()
    try {
      await addScaleSnapshot(fixture, encryptUnifiedRuntimePayload(canonicalScaleEnvelope(fixture)))
      await addFormSnapshot(fixture)
      const outcomes = await Promise.all([
        finalizeQuestionnaireAttemptUnifiedIfReady(fixture.parentId),
        finalizeQuestionnaireAttemptUnifiedIfReady(fixture.parentId),
      ])
      expect(outcomes).toHaveLength(2)
      expect(outcomes.every((outcome) => outcome?.status === 'COMPLETED')).toBe(true)

      const row = await db!.questionnaireAssessment.findUnique({
        where: { id: fixture.parentId },
        select: { status: true, progress: true, completedScales: true, completedForms: true, aggregateReport: true, aggregateReportEncrypted: true, aggregateInputHash: true },
      })
      expect(row).toMatchObject({
        status: 'COMPLETED',
        progress: 100,
        completedScales: 1,
        completedForms: 1,
        aggregateReport: null,
        aggregateInputHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
      expect(row?.aggregateReportEncrypted).toEqual(expect.any(String))
      const report = decryptField<Record<string, unknown>>(row!.aggregateReportEncrypted!)
      expect(report).toMatchObject({
        reportDefinitionVersion: 'collection-only-v2',
        totalDimensions: 1,
      })
      expect((report as any).scaleReports[0]).toMatchObject({ scaleId: fixture.scaleId, result: null, scores: [{ key: 'total', value: 1 }] })
      expect((report as any).scaleReports[0].itemScores).toBeUndefined()
      expect((report as any).backgroundValues).toMatchObject([{ itemId: fixture.formItemId, value: '三年级' }])

      const replay = await finalizeQuestionnaireAttemptUnifiedIfReady(fixture.parentId)
      expect(replay).toMatchObject({ status: 'COMPLETED', progress: 100 })
      expect(await db!.assessmentUnitSnapshot.count({ where: { questionnaireAssessmentId: fixture.parentId } })).toBe(2)
    } finally {
      await destroyFixture(fixture)
    }
  }, 30_000)

  it('converges a Composite collection aggregate from facts without reading raw form answers', async () => {
    const fixture = await createCompositeFixture()
    try {
      const outcomes = await Promise.all([
        finalizeCompositeAttemptUnifiedIfReady(fixture.attemptId),
        finalizeCompositeAttemptUnifiedIfReady(fixture.attemptId),
      ])
      expect(outcomes.every((outcome) => outcome?.status === 'COMPLETED')).toBe(true)
      const row = await db!.compositeAssessmentAttempt.findUnique({
        where: { id: fixture.attemptId },
        select: { status: true, progress: true, completedItems: true, aggregateInputHash: true },
      })
      expect(row).toMatchObject({
        status: 'COMPLETED',
        progress: 100,
        completedItems: 1,
        aggregateInputHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
      const state = await (await import('../../modules/composite/composite.service')).getAttemptState(fixture.attemptId, { userId: fixture.userId })
      expect(state).toMatchObject({ status: 'COMPLETED', progress: 100, completedItems: 1, currentIndex: 1, currentItem: null })
      expect(await db!.compositeAnalysisSnapshot.count({ where: { attemptId: fixture.attemptId } })).toBe(0)
    } finally {
      await destroyCompositeFixture(fixture)
    }
  }, 30_000)

  it('finalizes a real Unified Cognitive plus Scale report package and rejects config provenance mismatches', async () => {
    const fixture = await createCompositePackageFixture()
    const mismatchHash = 'f'.repeat(64)
    try {
      const session = await db!.cognitiveSession.findUnique({ where: { id: fixture.cognitiveSessionId } })
      if (!session) throw new Error('V32-2 package Cognitive session is missing')

      await db!.cognitiveAssignment.update({
        where: { id: fixture.cognitiveAssignmentId },
        data: { resolvedConfigHash: mismatchHash },
      })
      await expect(submitCognitiveSessionFinal(fixture.userId, {
        sessionId: fixture.cognitiveSessionId,
        submissionId: `v32-2-package-config-mismatch-${randomUUID()}`,
        attemptEpoch: 1,
        definitionHash: fixture.cognitiveDefinitionHash,
        contextSnapshotHash: null,
        trials: gonogoTrials(session.randomSeed),
      })).rejects.toMatchObject({ code: 'DEFINITION_MISMATCH', statusCode: 409 })
      expect(await db!.cognitiveSession.findUnique({ where: { id: fixture.cognitiveSessionId }, select: { status: true, submissionId: true } }))
        .toEqual({ status: 'IN_PROGRESS', submissionId: null })
      expect(await db!.cognitiveRawSubmission.count({ where: { sessionId: fixture.cognitiveSessionId } })).toBe(0)

      await db!.cognitiveAssignment.update({
        where: { id: fixture.cognitiveAssignmentId },
        data: { resolvedConfigHash: fixture.cognitiveDefinitionHash },
      })
      const cognitiveSubmitted = await submitCognitiveSessionFinal(fixture.userId, {
        sessionId: fixture.cognitiveSessionId,
        submissionId: `v32-2-package-cognitive-${randomUUID()}`,
        attemptEpoch: 1,
        definitionHash: fixture.cognitiveDefinitionHash,
        contextSnapshotHash: null,
        trials: gonogoTrials(session.randomSeed),
      })
      expect(cognitiveSubmitted).toMatchObject({ replayed: false, response: { status: 'COMPLETED' } })

      const cognitiveSnapshot = await db!.assessmentUnitSnapshot.findFirst({
        where: { compositeAttemptId: fixture.attemptId, slotKey: `cognitive:${fixture.cognitiveItemId}` },
      })
      if (!cognitiveSnapshot?.canonicalResultEncrypted) throw new Error('V32-2 Cognitive canonical snapshot is missing')
      const canonical = parseCanonicalUnitResultEnvelope(
        decryptUnifiedRuntimePayload<unknown>(cognitiveSnapshot.canonicalResultEncrypted),
      )
      expect(canonical.core.scientificProvenance.resolvedConfigHash).toBe(fixture.cognitiveDefinitionHash)

      const forged = createCanonicalUnitResultEnvelope({
        core: {
          ...canonical.core,
          scientificProvenance: {
            ...canonical.core.scientificProvenance,
            resolvedConfigHash: mismatchHash,
          },
        },
        completedAt: canonical.completedAt,
        persistenceProvenance: canonical.persistenceProvenance,
      })
      await db!.assessmentUnitSnapshot.update({
        where: { id: cognitiveSnapshot.id },
        data: { canonicalResultEncrypted: encryptUnifiedRuntimePayload(forged) },
      })

      await expect(submitScaleAssessmentFinal({
        assessmentId: fixture.scaleAssessmentId,
        submissionId: `v32-2-package-scale-${randomUUID()}`,
        attemptEpoch: 1,
        definitionHash: fixture.scaleDefinitionHash,
        contextSnapshotHash: null,
        answers: ADEXI_V2_DEFINITION.items.map((item) => ({ itemCode: item.itemCode, responseValue: 'never' })),
        userId: fixture.userId,
      })).rejects.toMatchObject({ code: 'DEFINITION_MISMATCH', statusCode: 409 })

      expect(await db!.assessment.findUnique({ where: { id: fixture.scaleAssessmentId }, select: { status: true, submissionId: true } }))
        .toMatchObject({ status: 'COMPLETED', submissionId: expect.any(String) })
      expect(await db!.compositeAssessmentAttempt.findUnique({
        where: { id: fixture.attemptId },
        select: { status: true, progress: true, completedItems: true },
      })).toEqual({ status: 'IN_PROGRESS', progress: 50, completedItems: 1 })
      expect(await db!.compositeAnalysisSnapshot.count({ where: { attemptId: fixture.attemptId } })).toBe(0)

      await db!.assessmentUnitSnapshot.update({
        where: { id: cognitiveSnapshot.id },
        data: { canonicalResultEncrypted: encryptUnifiedRuntimePayload(canonical) },
      })
      const recovered = await finalizeCompositeAttemptUnifiedIfReady(fixture.attemptId)
      expect(recovered).toMatchObject({ status: 'COMPLETED', progress: 100 })
      expect(await db!.compositeAssessmentAttempt.findUnique({
        where: { id: fixture.attemptId },
        select: { status: true, progress: true, completedItems: true, aggregateInputHash: true, compiledBundleRuntimeHash: true },
      })).toMatchObject({
        status: 'COMPLETED',
        progress: 100,
        completedItems: 2,
        aggregateInputHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        compiledBundleRuntimeHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
      expect(await db!.compositeAnalysisSnapshot.findMany({
        where: { attemptId: fixture.attemptId },
        select: { packageKey: true, packageVersion: true, runtimeGeneration: true, attemptEpoch: true, hashScheme: true },
      })).toEqual([{
        packageKey: 'inhibitory_control_multisource_v1',
        packageVersion: '1.0.0',
        runtimeGeneration: 'UNIFIED_V1',
        attemptEpoch: 1,
        hashScheme: 'CANONICAL_JSON_SHA256_V1',
      }])
    } finally {
      await destroyCompositePackageFixture(fixture)
    }
  }, 60_000)
})
