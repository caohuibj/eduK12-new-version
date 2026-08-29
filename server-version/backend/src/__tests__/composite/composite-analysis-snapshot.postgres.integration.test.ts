import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { CognitivePackageAnalysisResult } from '../../modules/cognitive-analysis/cognitive-analysis.types'
import type { CompletionSnapshotExpectation } from '../../modules/composite/composite-analysis-snapshot.service'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { hashScaleDefinition, validateScaleDefinition } from '../../modules/scale/scale-definition'

/**
 * PR8 real PostgreSQL checks. The suite is opt-in so the normal unit-test
 * command never touches a developer database:
 *
 *   PR8_INTEGRATION_DATABASE_URL=postgresql://... npm run test:integration:pr8
 */
const DB_URL = integrationDatabaseUrl('PR8_INTEGRATION_DATABASE_URL')
const suite = DB_URL ? describe : describe.skip

let prisma: PrismaClient
let persistOrGetPackageAnalysisSnapshot: typeof import('../../modules/composite/composite-analysis-snapshot.service')['persistOrGetPackageAnalysisSnapshot']
let readCompletionPackageAnalysisSnapshot: typeof import('../../modules/composite/composite-analysis-snapshot.service')['readCompletionPackageAnalysisSnapshot']
let compositeService: typeof import('../../modules/composite/composite.service')
let cognitiveSessionService: typeof import('../../modules/cognitive/session.service')
let encryptCognitivePayload: typeof import('../../modules/cognitive/cognitive.security')['encryptCognitivePayload']
let getCognitiveRegistryEntry: typeof import('../../modules/cognitive/cognitive.registry')['getCognitiveRegistryEntry']
let freezeAssignmentProfile: typeof import('../../modules/cognitive/profile-freeze')['freezeAssignmentProfile']
let buildFrozenReportPackageSnapshot: typeof import('../../modules/cognitive-analysis/report-package-freeze')['buildFrozenReportPackageSnapshot']
let getAnalysisProtocolDefinition: typeof import('../../modules/cognitive-analysis/analysis-protocol.registry')['getAnalysisProtocolDefinition']
let getReportPackageDefinition: typeof import('../../modules/cognitive-analysis/report-package.registry')['getReportPackageDefinition']
let listCognitiveEvidenceMappingsForTask: typeof import('../../modules/cognitive-analysis/evidence-mapping.registry')['listCognitiveEvidenceMappingsForTask']
let userId: string
let assessmentId: string
let attemptId: string
const createdCompositeAssessmentIds: string[] = []
const createdCourseIds: string[] = []
const createdAssignmentIds: string[] = []
const createdScaleIds: string[] = []
const createdConfigIds: string[] = []

const baseConfigs: Record<string, Record<string, unknown>> = {
  reaction: {
    totalTrials: 20,
    foreperiodMinMs: 700,
    foreperiodMaxMs: 1500,
    timeoutMs: 2000,
    readyDurationMs: 1000,
    report: { reportVersion: '1.0.0', referenceMode: 'none' },
  },
  cpt: {
    totalTrials: 180,
    targetRatio: 0.2,
    blockCount: 3,
    stimulusMs: 500,
    isiMs: 1000,
    validRtFloorMs: 100,
    perseverationRtMs: 100,
    report: { reportVersion: '1.0.0', referenceMode: 'none' },
  },
  patterncompare: {
    durationSec: 60,
    trialTimeoutMs: 2500,
    isiMs: 250,
    validRtFloorMs: 150,
    stimulusSetVersion: 'geometric-v1.0.0',
    report: { reportVersion: '1.0.0', referenceMode: 'none' },
  },
}

const makeAnalysis = (): CognitivePackageAnalysisResult => ({
  packageKey: 'attention_stability_v1',
  packageVersion: '1.0.0',
  analysisProtocolKey: 'attention_stability_v1',
  analysisProtocolVersion: '1.0.0',
  profile: 'standard',
  analysisVersion: 'cognitive-evidence-domain-v1.0.1',
  reportSchemaVersion: 'cognitive-package-analysis-v1',
  qualitySummary: { interpretableModules: 0, excludedModules: [], warnings: [] },
  evidence: [],
  cognitiveDomains: [],
  crossSourceFindings: [],
  recommendations: [],
  limitations: [],
  provenance: {
    attemptId,
    assessmentId,
    packageKey: 'attention_stability_v1',
    packageVersion: '1.0.0',
    packageSnapshotVersion: '1',
    analysisProtocolKey: 'attention_stability_v1',
    analysisProtocolVersion: '1.0.0',
    analysisProtocolSnapshotVersion: '1',
    profile: 'standard',
    packageReportDefinitionVersion: 'report-package-v1',
    domainDefinitionVersion: '1.0.0',
    evidenceMappingVersion: '1.0.0',
    recommendationRuleVersion: '1.0.0',
  },
})

const expectation = (): CompletionSnapshotExpectation => ({
  attemptId,
  assessmentId,
  packageKey: 'attention_stability_v1',
  packageVersion: '1.0.0',
  profile: 'standard',
  packageSnapshotVersion: '1',
  analysisProtocolKey: 'attention_stability_v1',
  analysisProtocolVersion: '1.0.0',
  analysisProtocolSnapshotVersion: '1',
  packageReportDefinitionVersion: 'report-package-v1',
  domainDefinitionVersion: '1.0.0',
  evidenceMappingVersion: '1.0.0',
  recommendationRuleVersion: '1.0.0',
})

const persist = (input: {
  analysis: CognitivePackageAnalysisResult
  inputFingerprint: string
  generationReason: 'COMPLETION' | 'REANALYSIS'
  generatedBy?: string | null
}) => persistOrGetPackageAnalysisSnapshot(prisma as any, {
  attemptId,
  ...input,
})

const createCourseWithMembership = async (suffix: string) => {
  const course = await prisma.course.create({
    data: {
      title: `PR8 completion course ${suffix}`,
      courseCode: `PR8-${suffix}`,
      status: 'PUBLISHED',
      creatorId: userId,
    },
  })
  createdCourseIds.push(course.id)
  await prisma.courseStudent.create({
    data: { courseId: course.id, studentId: userId, status: 'ACTIVE' },
  })
  return course.id
}

const getOrCreateConfig = async (slot: any) => {
  const existing = await prisma.cognitiveTestConfig.findUnique({
    where: { testType_configVersion: { testType: slot.testType, configVersion: slot.configVersion } },
  })
  if (existing) return existing
  const created = await prisma.cognitiveTestConfig.create({
    data: {
      testType: slot.testType,
      configVersion: slot.configVersion,
      name: `PR8 ${slot.testType}`,
      config: baseConfigs[slot.testType] ?? {},
      status: 'PUBLISHED',
      engineVersion: slot.engineVersion,
      scoringVersion: slot.scoringVersion,
      publishedAt: new Date(),
    },
  })
  createdConfigIds.push(created.id)
  return created
}

const createPackageCompletionFixture = async (malformedSnapshot = false) => {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const courseId = await createCourseWithMembership(suffix)
  const packageDefinition = getReportPackageDefinition('attention_stability_v1', '1.0.0')
  if (!packageDefinition) throw new Error('PR8 package fixture definition missing')
  const protocol = getAnalysisProtocolDefinition(
    packageDefinition.analysisProtocolKey,
    packageDefinition.analysisProtocolVersion,
  )
  if (!protocol) throw new Error('PR8 package fixture protocol missing')

  const assignments = [] as Array<{ slot: any; entry: any; assignment: any }>
  for (const slot of protocol.cognitiveSlots) {
    const entry = getCognitiveRegistryEntry(slot.testType, slot.engineVersion, slot.scoringVersion)
    if (!entry) throw new Error(`PR8 package fixture registry entry missing: ${slot.testType}`)
    const freeze = freezeAssignmentProfile({
      entry,
      baseConfig: baseConfigs[slot.testType],
      profile: 'standard',
    })
    const config = await getOrCreateConfig(slot)
    const assignment = await prisma.cognitiveAssignment.create({
      data: {
        courseId,
        configId: config.id,
        createdBy: userId,
        title: `PR8 ${slot.key}`,
        status: 'PUBLISHED',
        maxAttempts: 2,
        publishedAt: new Date(),
        listedStandalone: false,
        profile: 'standard',
        profileDefinitionVersion: freeze.profileDefinitionVersion,
        resolvedConfigSnapshotEncrypted: freeze.resolvedConfigSnapshotEncrypted,
        resolvedConfigHash: freeze.resolvedConfigHash,
        resolvedReportSnapshotEncrypted: freeze.resolvedReportSnapshotEncrypted,
      },
    })
    createdAssignmentIds.push(assignment.id)
    assignments.push({ slot, entry, assignment: { ...assignment, config } })
  }

  const packageItems = assignments.map(({ slot, assignment }) => ({
    id: `fixture-item-${slot.key}-${suffix}`,
    type: 'COGNITIVE',
    position: slot.position,
    required: true,
    cognitiveAssignment: {
      id: assignment.id,
      profile: assignment.profile,
      profileDefinitionVersion: assignment.profileDefinitionVersion,
      resolvedConfigSnapshotEncrypted: assignment.resolvedConfigSnapshotEncrypted,
      resolvedConfigHash: assignment.resolvedConfigHash,
      resolvedReportSnapshotEncrypted: assignment.resolvedReportSnapshotEncrypted,
      config: {
        testType: assignment.config.testType,
        configVersion: assignment.config.configVersion,
        engineVersion: assignment.config.engineVersion,
        scoringVersion: assignment.config.scoringVersion,
        // The built-in report packages are intentionally still DRAFT in this
        // branch. This fixture represents the already-frozen package snapshot
        // that PR8 consumes after the publish gate, without mutating the
        // developer's existing task-config rows.
        status: 'PUBLISHED',
      },
    },
  }))
  const packageSnapshot = buildFrozenReportPackageSnapshot(packageDefinition, protocol, packageItems)
  const composite = await prisma.compositeAssessment.create({
    data: {
      code: `PR8-PACKAGE-${suffix}`,
      name: 'PR8 real completion package fixture',
      status: 'PUBLISHED',
      courseId,
      createdBy: userId,
      maxAttempts: 1,
      publishedAt: new Date(),
      analysisProtocolKey: packageDefinition.analysisProtocolKey,
      analysisProtocolVersion: packageDefinition.analysisProtocolVersion,
      reportPackageKey: packageDefinition.key,
      reportPackageVersion: packageDefinition.version,
      reportPackageProfile: 'standard',
      reportPackageSnapshotEncrypted: malformedSnapshot
        ? encryptCognitivePayload({ malformed: true })
        : encryptCognitivePayload(packageSnapshot),
    },
  })
  createdCompositeAssessmentIds.push(composite.id)
  const itemRows = []
  for (const item of packageItems) {
    const row = await prisma.compositeAssessmentItem.create({
      data: {
        compositeAssessmentId: composite.id,
        type: 'COGNITIVE',
        position: item.position,
        required: true,
        cognitiveAssignmentId: item.cognitiveAssignment.id,
      },
    })
    itemRows.push(row)
  }
  const started = await compositeService.startUserAttempt(userId, composite.id)
  const sessions = await prisma.cognitiveSession.findMany({
    where: { compositeAttemptId: started.attempt.id },
    orderBy: { attemptNo: 'asc' },
  })
  return {
    compositeId: composite.id,
    attemptId: started.attempt.id,
    itemRows,
    sessions,
  }
}

const metricsForSession = (session: any) => {
  const entry = getCognitiveRegistryEntry(session.testType, session.engineVersion, session.scoringVersion)
  if (!entry) throw new Error(`PR8 session registry entry missing: ${session.testType}`)
  const metrics: Record<string, unknown> = {}
  for (const mapping of listCognitiveEvidenceMappingsForTask(
    session.testType,
    session.engineVersion,
    session.scoringVersion,
    '1.0.0',
  )) {
    const definition = entry.metricDefinitions[mapping.metricKey]
    if (!definition) throw new Error(`PR8 session metric fixture missing: ${mapping.metricKey}`)
    if (definition.valueType === 'object') metrics[mapping.metricKey] = { fixture: 1 }
    else if (definition.valueType === 'array') metrics[mapping.metricKey] = [1, null]
    else if (definition.valueType === 'integer') metrics[mapping.metricKey] = 1
    else metrics[mapping.metricKey] = 1.25
  }
  return metrics
}

const markSessionCompleted = async (session: any) => {
  await prisma.cognitiveSession.update({
    where: { id: session.id },
    data: {
      status: 'COMPLETED',
      finishedAt: new Date(),
      scoreEncrypted: encryptCognitivePayload(1),
      metricsEncrypted: encryptCognitivePayload(metricsForSession(session)),
      qualityFlagsEncrypted: encryptCognitivePayload({ interpretable: true }),
    },
  })
}

const createScaleAndFormCompletionFixture = async () => {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const courseId = await createCourseWithMembership(suffix)
  const scaleDefinition = {
    schemaVersion: 2,
    respondentType: 'participant_self_report',
    source: { title: 'PR8 fixture scale' },
    license: { status: 'self_authored', redistribution: 'allowed' },
    display: { randomizeItems: false },
    responseSets: [{
      key: 'likert',
      options: [1, 2, 3, 4, 5].map((value) => ({ value, label: String(value), score: value })),
    }],
    items: [{
      itemCode: 'PR8-1',
      content: 'PR8 item',
      type: 'single',
      required: true,
      sortOrder: 0,
      responseSetKey: 'likert',
      randomizeOptions: false,
    }],
    scoring: {
      scoringVersion: '1.0.0',
      itemRules: [{ itemCode: 'PR8-1', transform: { type: 'identity' } }],
      defaultMissingPolicy: { type: 'complete_required' },
      scores: [{
        key: 'total',
        type: 'total',
        label: 'Total',
        direction: 'higher_is_better',
        canonical: true,
        source: { type: 'items', items: [{ itemCode: 'PR8-1', weight: 1 }], aggregation: 'sum' },
      }],
    },
    report: {
      reportVersion: '1.0.0',
      primaryScoreKeys: ['total'],
      scoreOrder: ['total'],
      interpretations: [{
        scoreKey: 'total',
        headline: 'Total score',
        summary: 'PR8 integration fixture',
        bands: [],
        guidance: [],
      }],
      limitations: [],
      disclaimer: 'PR8 integration fixture only',
    },
    referencePolicy: { type: 'none' },
  }
  const validatedScale = validateScaleDefinition(scaleDefinition, { instrumentClass: 'CUSTOM_DESCRIPTIVE' })
  if (!validatedScale.definition || validatedScale.issues.some((issue) => issue.severity === 'error')) {
    throw new Error(`PR8 fixture scale definition is invalid: ${validatedScale.issues.map((issue) => issue.message).join('; ')}`)
  }
  const frozenScaleDefinition = validatedScale.definition
  const scale = await prisma.scale.create({
    data: {
      code: `PR8-SCALE-${suffix}`,
      name: 'PR8 scale fixture',
      status: 'PUBLISHED',
      visibility: 'COURSE',
      instrumentClass: 'CUSTOM_DESCRIPTIVE',
      instrumentVersion: '2.0.0',
      definition: frozenScaleDefinition,
      definitionHash: hashScaleDefinition(frozenScaleDefinition),
      itemCount: frozenScaleDefinition.items.length,
      dimensionCount: 0,
      creatorId: userId,
    },
  })
  createdScaleIds.push(scale.id)
  const composite = await prisma.compositeAssessment.create({
    data: {
      code: `PR8-COLLECTION-${suffix}`,
      name: 'PR8 scale/form completion fixture',
      status: 'PUBLISHED',
      courseId,
      createdBy: userId,
      publishedAt: new Date(),
    },
  })
  createdCompositeAssessmentIds.push(composite.id)
  const scaleItemRow = await prisma.compositeAssessmentItem.create({
    data: {
      compositeAssessmentId: composite.id,
      type: 'SCALE',
      position: 0,
      required: true,
      scaleId: scale.id,
    },
  })
  const formItemRow = await prisma.compositeAssessmentItem.create({
    data: {
      compositeAssessmentId: composite.id,
      type: 'FORM',
      position: 1,
      required: true,
      formType: 'text',
      formLabel: 'PR8 background',
    },
  })
  const started = await compositeService.startUserAttempt(userId, composite.id)
  return {
    attemptId: started.attempt.id,
    scaleItemId: scaleItemRow.id,
    scaleQuestionId: 'PR8-1',
    formItemId: formItemRow.id,
  }
}

suite('PR8 package analysis snapshot PostgreSQL integration', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    process.env.COGNITIVE_MODULE_ENABLED = 'true'
    const snapshotService = await import('../../modules/composite/composite-analysis-snapshot.service')
    persistOrGetPackageAnalysisSnapshot = snapshotService.persistOrGetPackageAnalysisSnapshot
    readCompletionPackageAnalysisSnapshot = snapshotService.readCompletionPackageAnalysisSnapshot
    compositeService = await import('../../modules/composite/composite.service')
    cognitiveSessionService = await import('../../modules/cognitive/session.service')
    const cognitiveSecurity = await import('../../modules/cognitive/cognitive.security')
    const cognitiveRegistry = await import('../../modules/cognitive/cognitive.registry')
    const profileFreeze = await import('../../modules/cognitive/profile-freeze')
    const analysisRegistry = await import('../../modules/cognitive-analysis')
    encryptCognitivePayload = cognitiveSecurity.encryptCognitivePayload
    getCognitiveRegistryEntry = cognitiveRegistry.getCognitiveRegistryEntry
    freezeAssignmentProfile = profileFreeze.freezeAssignmentProfile
    buildFrozenReportPackageSnapshot = analysisRegistry.buildFrozenReportPackageSnapshot
    getAnalysisProtocolDefinition = analysisRegistry.getAnalysisProtocolDefinition
    getReportPackageDefinition = analysisRegistry.getReportPackageDefinition
    listCognitiveEvidenceMappingsForTask = analysisRegistry.listCognitiveEvidenceMappingsForTask
    const db = await import('../../config/database')
    prisma = db.prisma

    const suffix = Date.now().toString(36)
    const user = await prisma.user.create({
      data: { username: `pr8snapshot${suffix}`, passwordHash: 'test-only', role: 'ADMIN' },
    })
    userId = user.id
    const assessment = await prisma.compositeAssessment.create({
      data: {
        code: `PR8-${suffix}`,
        name: 'PR8 snapshot integration fixture',
        createdBy: userId,
      },
    })
    assessmentId = assessment.id
    createdCompositeAssessmentIds.push(assessment.id)
    const attempt = await prisma.compositeAssessmentAttempt.create({
      data: {
        compositeAssessmentId: assessmentId,
        userId,
        participantKey: `pr8-participant-${suffix}`,
      },
    })
    attemptId = attempt.id
  })

  beforeEach(async () => {
    await prisma.compositeAnalysisSnapshot.deleteMany({ where: { attemptId } })
    await prisma.compositeAssessmentAttempt.update({
      where: { id: attemptId },
      data: { status: 'IN_PROGRESS', progress: 0, completedItems: 0, completedAt: null },
    })
  })

  afterAll(async () => {
    if (!prisma) return
    try {
      const fixtureAttempts = createdCompositeAssessmentIds.length
        ? await prisma.compositeAssessmentAttempt.findMany({
            where: { compositeAssessmentId: { in: createdCompositeAssessmentIds } },
            select: { id: true },
          })
        : []
      const fixtureAttemptIds = fixtureAttempts.map((attempt) => attempt.id)
      if (fixtureAttemptIds.length) {
        await prisma.assessment.deleteMany({ where: { compositeAttemptId: { in: fixtureAttemptIds } } })
        await prisma.cognitiveSession.deleteMany({ where: { compositeAttemptId: { in: fixtureAttemptIds } } })
        await prisma.compositeAssessmentAttempt.deleteMany({ where: { id: { in: fixtureAttemptIds } } })
      }
      if (createdCompositeAssessmentIds.length) {
        await prisma.compositeAssessment.deleteMany({ where: { id: { in: createdCompositeAssessmentIds } } })
      }
      if (createdAssignmentIds.length) {
        await prisma.cognitiveAssignment.deleteMany({ where: { id: { in: createdAssignmentIds } } })
      }
      if (createdScaleIds.length) {
        await prisma.scale.deleteMany({ where: { id: { in: createdScaleIds } } })
      }
      if (createdCourseIds.length) {
        await prisma.courseStudent.deleteMany({ where: { courseId: { in: createdCourseIds } } })
        await prisma.course.deleteMany({ where: { id: { in: createdCourseIds } } })
      }
      if (createdConfigIds.length) {
        await prisma.cognitiveTestConfig.deleteMany({ where: { id: { in: createdConfigIds } } })
      }
      const [remainingAssessments, remainingAssignments, remainingScales, remainingCourses] = await prisma.$transaction([
        prisma.compositeAssessment.count({ where: { id: { in: createdCompositeAssessmentIds } } }),
        prisma.cognitiveAssignment.count({ where: { id: { in: createdAssignmentIds } } }),
        prisma.scale.count({ where: { id: { in: createdScaleIds } } }),
        prisma.course.count({ where: { id: { in: createdCourseIds } } }),
      ])
      if (userId) await prisma.user.delete({ where: { id: userId } })
      const remainingUsers = userId ? await prisma.user.count({ where: { id: userId } }) : 0
      expect({ remainingAssessments, remainingAssignments, remainingScales, remainingCourses, remainingUsers })
        .toEqual({ remainingAssessments: 0, remainingAssignments: 0, remainingScales: 0, remainingCourses: 0, remainingUsers: 0 })
    } finally {
      await prisma.$disconnect()
    }
  })

  it('enforces the unique tuple and preserves immutable attribution', async () => {
    const analysis = makeAnalysis()
    const first = await persist({
      analysis,
      inputFingerprint: 'a'.repeat(64),
      generationReason: 'COMPLETION',
    })
    const retry = await persist({
      analysis,
      inputFingerprint: 'a'.repeat(64),
      generationReason: 'REANALYSIS',
      generatedBy: userId,
    })
    const changedInput = await persist({
      analysis,
      inputFingerprint: 'b'.repeat(64),
      generationReason: 'REANALYSIS',
      generatedBy: userId,
    })

    expect(first).toMatchObject({ created: true, row: { generationReason: 'COMPLETION' } })
    expect(retry).toMatchObject({ created: false, row: { id: first.row.id, generationReason: 'COMPLETION', generatedBy: null } })
    expect(changedInput).toMatchObject({ created: true, row: { generationReason: 'REANALYSIS', generatedBy: userId } })
    expect(await prisma.compositeAnalysisSnapshot.count({ where: { attemptId } })).toBe(2)
  })

  it('rolls back the snapshot when the enclosing completion transaction fails', async () => {
    const before = await prisma.compositeAnalysisSnapshot.count({ where: { attemptId } })
    await expect(prisma.$transaction(async (tx) => {
      await persistOrGetPackageAnalysisSnapshot(tx as any, {
        attemptId,
        analysis: makeAnalysis(),
        inputFingerprint: 'c'.repeat(64),
        generationReason: 'COMPLETION',
      })
      await tx.compositeAssessmentAttempt.update({
        where: { id: attemptId },
        data: { status: 'COMPLETED', progress: 100, completedItems: 1 },
      })
      throw new Error('forced PR8 transaction rollback')
    })).rejects.toThrow('forced PR8 transaction rollback')

    expect(await prisma.compositeAnalysisSnapshot.count({ where: { attemptId } })).toBe(before)
    expect((await prisma.compositeAssessmentAttempt.findUnique({ where: { id: attemptId } }))?.status)
      .toBe('IN_PROGRESS')
  })

  it('serializes two real transactions on the Attempt and creates one row', async () => {
    const results = await Promise.all([1, 2].map(() => prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "composite_assessment_attempts" WHERE "id" = ${attemptId} FOR UPDATE`
      return persistOrGetPackageAnalysisSnapshot(tx as any, {
        attemptId,
        analysis: makeAnalysis(),
        inputFingerprint: 'd'.repeat(64),
        generationReason: 'COMPLETION',
      })
    })))

    expect(results.filter((result) => result.created)).toHaveLength(1)
    expect(results.filter((result) => !result.created)).toHaveLength(1)
    expect(await prisma.compositeAnalysisSnapshot.count({ where: { attemptId } })).toBe(1)
  })

  it('reads the encrypted completion payload with exact Attempt provenance', async () => {
    const analysis = makeAnalysis()
    const persisted = await persist({
      analysis,
      inputFingerprint: 'e'.repeat(64),
      generationReason: 'COMPLETION',
    })
    const snapshot = await readCompletionPackageAnalysisSnapshot(
      prisma as any,
      attemptId,
      expectation(),
    )

    expect(snapshot?.id).toBe(persisted.row.id)
    expect(snapshot?.payload).toEqual(analysis)
    expect(snapshot).not.toHaveProperty('payloadEncrypted')
  })

  it('finalizes a package through the production completion path after a Session restart', async () => {
    const fixture = await createPackageCompletionFixture()
    const originalReaction = fixture.sessions.find((session) => session.testType === 'reaction')
    if (!originalReaction) throw new Error('PR8 package fixture reaction Session missing')

    await cognitiveSessionService.restartSession(userId, originalReaction.id)
    const restartedReaction = await prisma.cognitiveSession.findFirst({
      where: {
        compositeAttemptId: fixture.attemptId,
        compositeItemId: originalReaction.compositeItemId,
        status: 'IN_PROGRESS',
      },
      orderBy: { attemptNo: 'desc' },
    })
    expect(restartedReaction).toMatchObject({
      compositeAttemptId: fixture.attemptId,
      compositeItemId: originalReaction.compositeItemId,
      participantKey: originalReaction.participantKey,
      attemptNo: 2,
    })
    if (!restartedReaction) throw new Error('PR8 restarted reaction Session missing')

    for (const session of fixture.sessions) {
      await markSessionCompleted(session.testType === 'reaction' ? restartedReaction : session)
    }

    const state = await compositeService.getAttemptState(fixture.attemptId, { userId })
    expect(state).toMatchObject({ status: 'COMPLETED', progress: 100, completedItems: 3, totalItems: 3 })
    expect(await prisma.compositeAnalysisSnapshot.count({ where: { attemptId: fixture.attemptId } })).toBe(1)
    expect((await prisma.compositeAssessmentAttempt.findUnique({ where: { id: fixture.attemptId } }))?.status)
      .toBe('COMPLETED')
  })

  it('rolls back live package completion when analysis cannot read the frozen snapshot', async () => {
    const fixture = await createPackageCompletionFixture(true)
    for (const session of fixture.sessions) await markSessionCompleted(session)

    await expect(compositeService.getAttemptState(fixture.attemptId, { userId }))
      .rejects.toThrow('报告包')
    expect((await prisma.compositeAssessmentAttempt.findUnique({ where: { id: fixture.attemptId } }))?.status)
      .toBe('IN_PROGRESS')
    expect(await prisma.compositeAnalysisSnapshot.count({ where: { attemptId: fixture.attemptId } })).toBe(0)
  })

  it('finalizes a collection-only Attempt through the real scale and form completion paths', async () => {
    const fixture = await createScaleAndFormCompletionFixture()

    const afterAnswer = await compositeService.saveScaleAnswer(
      fixture.attemptId,
      fixture.scaleItemId,
      { itemCode: fixture.scaleQuestionId, responseValue: 3 },
      { userId },
    )
    expect(afterAnswer.status).toBe('IN_PROGRESS')

    const afterScale = await compositeService.completeScale(
      fixture.attemptId,
      fixture.scaleItemId,
      { userId },
    )
    expect(afterScale.status).toBe('IN_PROGRESS')

    const completed = await compositeService.saveFormAnswer(
      fixture.attemptId,
      fixture.formItemId,
      'fixture answer',
      { userId },
    )
    expect(completed).toMatchObject({ status: 'COMPLETED', progress: 100, completedItems: 2, totalItems: 2 })
    expect(await prisma.compositeAnalysisSnapshot.count({ where: { attemptId: fixture.attemptId } })).toBe(0)
  })
})
