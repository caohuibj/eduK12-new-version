/** Disposable current-main fixtures, invoked only through gate47-seed-fixtures.ts. */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Prisma, type PrismaClient } from '@prisma/client'
import { canonicalHash, canonicalJsonBytes } from '../src/modules/assessment-runtime/canonical'
import {
  encryptFrozenSituationalRuntimeSnapshot,
  freezeSituationalRuntimeAtAttemptStart,
} from '../src/modules/assessment-runtime/situational-runtime-snapshot'
import { getParticipantKey } from '../src/modules/assessment-runtime/participant-key'
import { SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE } from '../src/modules/situational/packages/sjt-anxiety-golden-zh-cn-v1'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from '../src/modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import type { SituationDefinitionV1 } from '../src/modules/situational/situation-definition'
import type { SituationDefinitionV2 } from '../src/modules/situational/situation-branching'
import { scoreSituational } from '../src/modules/situational/situation-scoring'
import { COGNITIVE_SEEDS } from '../prisma/seeds/cognitive'
import { requireCognitiveRegistryEntry } from '../src/modules/cognitive/cognitive.registry'
import { freezeAssignmentProfile, freezeDataForWrite } from '../src/modules/cognitive/profile-freeze'
import { createUnifiedCognitiveSessionConfigSnapshot, readCognitiveSessionConfig } from '../src/modules/cognitive/session.service'
import { createTrialEnvelope } from '../src/modules/cognitive/v2/trial-envelope'
import { cptSequence, nbackSequence } from '../src/modules/cognitive/randomization'
import { createFrozenUnitAdmission, frozenAdmissionPersistence } from '../src/modules/assessment-runtime/admission-snapshot'
import { hashScaleDefinition, type ScaleDefinitionV2 } from '../src/modules/scale/scale-definition'
import { encryptFrozenScaleRuntimeSnapshot, freezeScaleRuntimeAtAttemptStart } from '../src/modules/assessment-runtime/runtime-snapshot'
import { FINAL_SUBMISSION_MAX_BYTES } from '../src/services/instrumentFinalSubmit'
import { finalScaleSubmitSchema } from '../src/services/scale-final-submit.schema'
import { mapQuestionnaireSection } from '../src/modules/assessment-runtime/form-section-definition'
import { ensureQuestionnaireFormSections, listQuestionnaireFormSections } from '../src/services/questionnaire-form-section.service'
import { formSectionIdentityHash, freezeCompositeActiveSlotSet, freezeQuestionnaireActiveSlotSet } from '../src/modules/assessment-runtime/attempt-runtime'
import { compositeItemSlotKey, encryptFrozenActiveSlotSet } from '../src/modules/assessment-runtime/slot-set'
import { listCompositeFormSections } from '../src/modules/composite/final-submit.service'
import { getLocalAssetPath } from '../src/services/assetStorage'
import { hashQuestionnaireResumeToken } from '../src/services/questionnaireResumeTokenService'
import { hashRecoveryToken } from '../src/services/anonymousAccess'
import { createSqlRelationalAssignmentRepository } from '../src/modules/assessment-relational/repository'
import {
  deriveAuthoritativeSituationalTrajectory,
  projectReachableSituationDefinitionForScoring,
} from '../src/modules/situational/situation-trajectory'
import { assertFreshFixturePool, partitionFreshFixturePool } from '../../perf/current-main-v1/fresh-fixture-pool.mjs'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const fixedFrozenAt = new Date('2026-01-01T00:00:00.000Z')

function isolatedOptions() {
  if (process.env.NODE_ENV !== 'test' || process.env.PERF_ISOLATED_TEST_MODE !== '1') {
    throw new Error('current-main fixture seeding requires NODE_ENV=test and PERF_ISOLATED_TEST_MODE=1')
  }
  const url = new URL(process.env.DATABASE_URL || '')
  const expectedDatabase = process.env.PERF_FIXTURE_DB_NAME
  if (!expectedDatabase || decodeURIComponent(url.pathname.slice(1)) !== expectedDatabase) {
    throw new Error('PERF_FIXTURE_DB_NAME must exactly match the isolated DATABASE_URL database')
  }
  if (!process.env.JWT_SECRET || !process.env.DATA_ENCRYPTION_KEY || !process.env.DATA_PSEUDONYM_KEY) {
    throw new Error('isolated runtime secrets must be supplied through environment variables')
  }
  const outDir = resolve(process.env.FIXTURE_OUT_DIR || '/tmp/huisurvey-current-main-fixtures')
  if (!outDir.startsWith('/tmp/')) throw new Error('fixture output must be under /tmp')
  const warmupCount = Number(process.env.PERF_WARMUP_FIXTURES || 2)
  const steadyCount = Number(process.env.PERF_STEADY_FIXTURES || 8)
  const mixedPerClass = Number(process.env.PERF_MIXED_PER_CLASS || 2)
  if (!Number.isInteger(warmupCount) || warmupCount < 1 || !Number.isInteger(steadyCount) || steadyCount < 1
    || !Number.isInteger(mixedPerClass) || mixedPerClass < 1) {
    throw new Error('warmup, steady and mixed fixture counts must be positive integers')
  }
  return { outDir, warmupCount, steadyCount, mixedPerClass }
}

function sceneCountDefinition(sceneCount: number): SituationDefinitionV1 {
  const definition = clone(SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE.definition)
  const template = definition.scenes[0]!
  definition.scenes = Array.from({ length: sceneCount }, (_, index) => ({
    ...template,
    sceneKey: `SC-${String(index + 1).padStart(3, '0')}`,
    title: `Disposable scene ${index + 1}`,
    sortOrder: index,
    stimulus: template.stimulus.type === 'TEXT_V1'
      ? { ...template.stimulus, text: `${template.stimulus.text} (${index + 1})` }
      : template.stimulus,
  }))
  definition.scoring.choiceScores = definition.scenes.flatMap((scene) => {
    const choice = scene.channels.find((channel) => channel.responseType === 'SINGLE_CHOICE')
    if (!choice || choice.responseType !== 'SINGLE_CHOICE') throw new Error('SJT fixture lacks choice channel')
    return choice.options.map((option) => ({
      sceneKey: scene.sceneKey, channelKey: choice.channelKey, optionKey: option.optionKey,
      contribution: option.optionKey === 'A' ? 1 : option.optionKey === 'B' ? 0 : option.optionKey === 'C' ? -0.5 : -1,
    }))
  })
  return definition
}

function branchingDefinition(): SituationDefinitionV2 {
  const source = clone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.definition)
  const decision = source.scenes[0]!.channels[0]!
  if (decision.responseType !== 'SINGLE_CHOICE') throw new Error('branch fixture needs choice channel')
  return {
    ...source,
    schemaVersion: 2,
    sampling: { strategy: 'BRANCH_REACHABLE' },
    flow: {
      strategy: 'BRANCHING_DAG_V1', entryNodeKey: 'node-as-01',
      nodes: [
        { nodeType: 'SCENE', nodeKey: 'node-as-01', sceneKey: 'AS-01', motherSceneKey: 'mother-assertiveness', roundKey: 'round-1', stepKey: 'decision', transition: { type: 'DECISION', channelKey: decision.channelKey, branches: decision.options.map((option, index) => ({ optionKey: option.optionKey, nextNodeKey: index % 2 === 0 ? 'node-as-02' : 'terminal-early' })) } },
        { nodeType: 'SCENE', nodeKey: 'node-as-02', sceneKey: 'AS-02', motherSceneKey: 'mother-assertiveness', roundKey: 'round-2', stepKey: 'follow-up', transition: { type: 'NEXT', nextNodeKey: 'terminal-complete' } },
        { nodeType: 'TERMINAL', nodeKey: 'terminal-early' },
        { nodeType: 'TERMINAL', nodeKey: 'terminal-complete' },
      ],
    },
  }
}

function linearResponses(definition: SituationDefinitionV1) {
  return definition.scenes.flatMap((scene) => ([
    { sceneKey: scene.sceneKey, channelKey: 'appraisal', responseValue: 'A' },
    { sceneKey: scene.sceneKey, channelKey: 'emotion', responseValue: 50 },
  ]))
}

function scaleDefinition(itemCount: number, prefix: string): ScaleDefinitionV2 {
  const codes = Array.from({ length: itemCount }, (_, index) => `${prefix}-${String(index + 1).padStart(5, '0')}`)
  return {
    schemaVersion: 2, respondentType: 'participant_self_report',
    source: { title: 'Disposable performance scale', citation: 'current-main-v1 isolated fixture' },
    license: { status: 'self_authored', redistribution: 'allowed' },
    display: { randomizeItems: false },
    responseSets: [{ key: 'default', options: [
      { value: 'no', label: '否', score: 0 }, { value: 'yes', label: '是', score: 1 },
    ] }],
    items: codes.map((itemCode, sortOrder) => ({
      itemCode, content: `Disposable item ${sortOrder + 1}`, type: 'single', required: true,
      sortOrder, responseSetKey: 'default', randomizeOptions: false,
    })),
    scoring: {
      scoringVersion: '2.0.0',
      itemRules: codes.map((itemCode) => ({ itemCode, transform: { type: 'identity' as const } })),
      defaultMissingPolicy: { type: 'complete_required' },
      scores: [{
        key: 'total', type: 'total', label: '总分', direction: 'descriptive',
        canonical: true, displayPrecision: 2,
        source: { type: 'items', items: codes.map((itemCode) => ({ itemCode, weight: 1 })), aggregation: 'sum' },
      }],
    },
    report: {
      reportVersion: '2.0.0', primaryScoreKeys: ['total'], scoreOrder: ['total'],
      interpretations: [{ scoreKey: 'total', headline: '总分', source: { type: 'score_only' }, summary: 'Disposable performance fixture.', bands: [], guidance: [] }],
      limitations: [], disclaimer: 'Disposable performance fixture only.',
    },
    referencePolicy: { type: 'none' },
  }
}

function maxLegalScaleItemCount(prefix: string): number {
  const payloadBytes = (count: number) => canonicalJsonBytes({
    answers: Array.from({ length: count }, (_, index) => ({
      itemCode: `${prefix}-${String(index + 1).padStart(5, '0')}`, responseValue: 'yes',
    })),
  }).byteLength
  let low = 1
  // The HTTP schema currently caps the answers array at 1000. Keep the
  // boundary anchored to the real schema, then apply the canonical byte cap.
  const schemaMaximum = 1000
  let high = schemaMaximum
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (payloadBytes(middle) <= FINAL_SUBMISSION_MAX_BYTES.scale) low = middle
    else high = middle - 1
  }
  if (low < schemaMaximum && payloadBytes(low + 1) <= FINAL_SUBMISSION_MAX_BYTES.scale) {
    throw new Error('Scale legal item search ceiling was too low')
  }
  const boundaryBody = {
    submissionId: 'perf01-scale-boundary', attemptEpoch: 1,
    definitionHash: 'a'.repeat(64), contextSnapshotHash: null,
    answers: Array.from({ length: low }, (_, index) => ({ itemCode: `${prefix}-${String(index + 1).padStart(5, '0')}`, responseValue: 'yes' })),
  }
  if (!finalScaleSubmitSchema.safeParse(boundaryBody).success) {
    throw new Error('Scale item boundary is rejected by the actual FINAL schema')
  }
  if (low === schemaMaximum && finalScaleSubmitSchema.safeParse({
    ...boundaryBody, answers: [...boundaryBody.answers, boundaryBody.answers[0]],
  }).success) throw new Error('Scale FINAL schema answer limit changed; re-derive the legal boundary')
  return low
}

function cognitiveTrials(testType: 'nback' | 'cpt', seed: string, config: Record<string, unknown>) {
  if (testType === 'nback') {
    return nbackSequence(
      seed, config.nLevels as Array<1 | 2 | 3>, config.trialCountByN as number[],
      config.blockCountByN as number[], config.targetRatio as number,
    ).map((spec, index) => createTrialEnvelope({
      trialIndex: index, phase: 'test',
      payload: {
        blockIndex: spec.blockIndex, nLevel: spec.nLevel, stimulus: spec.stimulus,
        target: spec.target, responded: true, rtMs: spec.target ? 380 + index % 5 * 30 : 420 + index % 5 * 30,
        interrupted: false,
      },
      startedAtPerfMs: index * 2500, endedAtPerfMs: index * 2500 + 420,
    }))
  }
  return cptSequence(seed, config.totalTrials as number, config.targetRatio as number, config.blockCount as number)
    .map((spec, index) => createTrialEnvelope({
      trialIndex: index, phase: 'test',
      payload: {
        blockIndex: spec.blockIndex, stimulus: spec.stimulus, isTarget: spec.isTarget,
        responded: true, rtMs: spec.isTarget ? 360 + index % 5 * 30 : 400 + index % 5 * 30,
        interrupted: false,
      },
      startedAtPerfMs: index * 1500, endedAtPerfMs: index * 1500 + 400,
    }))
}

export async function seedCurrentMainFixtures(db: PrismaClient) {
  const { outDir, warmupCount, steadyCount, mixedPerClass } = isolatedOptions()
  const runId = randomUUID().slice(0, 8)
  const password = randomBytes(24).toString('base64url')
  const passwordHash = await bcrypt.hash(password, 10)

  const groups: Record<string, Array<{ fixtureId: string; instrument: string; method: 'POST'; path: string; body: { submissionId: string; attemptEpoch: number; [key: string]: unknown }; [key: string]: unknown }>> = {}
  const journeyGroups: Record<string, Array<{ fixtureId: string; fixtureClass: string; method: 'GET' | 'POST'; path: string; headers: Record<string, string>; body?: Record<string, unknown>; expectedStatuses: number[]; subjectUserId?: string; expectedAttemptId?: string; mediaAttemptId?: string; expectedContentLength?: number; expectedMimeType?: string; expectedSha256?: string; assetId?: string }>> = {}
  const mixedRequests: typeof groups[string] = []
  const ledger = {
    runId, userIds: [] as string[], situationalAttemptIds: [] as string[],
    cognitiveSessionIds: [] as string[], cognitiveAssignmentIds: [] as string[],
    scaleIds: [] as string[], scaleAssessmentIds: [] as string[],
    questionnaireIds: [] as string[], questionnaireAssessmentIds: [] as string[], formSectionIds: [] as string[],
    storedAssetIds: [] as string[], localAssetPaths: [] as string[],
    compositeIds: [] as string[], compositeAttemptIds: [] as string[],
    episodeIds: [] as string[], relationalAssignmentIds: [] as string[],
    createdAt: new Date().toISOString(),
  }
  const classes = [
    ...([10, 30, 60] as const).map((count) => ({ key: `sjtLinear${count}`, definition: sceneCountDefinition(count), version: '1.0.0', responses: null as ReturnType<typeof linearResponses> | null })),
    { key: 'sjtBranchFull', definition: branchingDefinition(), version: '2.0.0', responses: [
      { sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'A' },
      { sceneKey: 'AS-02', channelKey: 'behavior', responseValue: 'A' },
    ] },
    { key: 'sjtBranchEarly', definition: branchingDefinition(), version: '2.0.0', responses: [
      { sceneKey: 'AS-01', channelKey: 'behavior', responseValue: 'B' },
    ] },
  ]
  for (const cls of classes) {
    const instrumentKey = `perf01-${cls.key}-${runId}`
    const snapshot = freezeSituationalRuntimeAtAttemptStart({
      instrumentKey, instrumentVersion: cls.version, definition: cls.definition, frozenAt: fixedFrozenAt,
    })
    const encrypted = encryptFrozenSituationalRuntimeSnapshot(snapshot)
    const responses = cls.responses || linearResponses(cls.definition as SituationDefinitionV1)
    const trajectory = deriveAuthoritativeSituationalTrajectory(cls.definition, responses)
    if (!trajectory.reachedTerminal) throw new Error(`SJT fixture ${cls.key} has incomplete trajectory`)
    const expectedResult = scoreSituational(
      projectReachableSituationDefinitionForScoring(cls.definition, trajectory), responses,
    )
    const fixturePool = []
    for (let index = 0; index < warmupCount + steadyCount + mixedPerClass; index += 1) {
      // PostgreSQL allows only one active standalone attempt per participant
      // and instrument. A different test-only user makes every fixture fresh.
      const username = `perf01-${runId}-${cls.key}-${index + 1}`
      const user = await db.user.create({ data: {
        username, passwordHash, role: 'STUDENT', nickname: username,
        isActive: true, mustChangePassword: false, teacherApproved: true,
      } })
      ledger.userIds.push(user.id)
      const csrf = randomBytes(32).toString('base64url')
      const token = jwt.sign({
        userId: user.id, username: user.username, role: user.role,
        tokenVersion: user.tokenVersion, mustChangePassword: false,
      }, process.env.JWT_SECRET!, { expiresIn: '7d' })
      const attempt = await db.situationalAttempt.create({ data: {
        userId: user.id, participantKey: getParticipantKey(user.id),
        instrumentKey, instrumentVersion: cls.version, attemptNo: 1,
        status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
        definitionHash: snapshot.definitionHash, compiledRuntimeHash: snapshot.compiledRuntimeHash,
        scorerKey: snapshot.scorerKey, scoringVersion: snapshot.scoringVersion,
        frozenAt: fixedFrozenAt, runtimeSnapshotEncrypted: encrypted, progress: 0,
      } })
      ledger.situationalAttemptIds.push(attempt.id)
      const body = {
        submissionId: `perf01-${cls.key}-${runId}-${String(index + 1).padStart(6, '0')}`,
        attemptEpoch: 1, definitionHash: snapshot.definitionHash,
        instrumentVersion: snapshot.instrumentVersion, compiledRuntimeHash: snapshot.compiledRuntimeHash,
        scoringVersion: snapshot.scoringVersion, responses,
      }
      fixturePool.push({
        fixtureId: `${cls.key}-${String(index + 1).padStart(6, '0')}`,
        instrument: 'situational', fixtureClass: cls.key, method: 'POST' as const,
        path: `/api/situational/attempts/${attempt.id}/submit`, body,
        headers: {
          Cookie: `ptool_session=${encodeURIComponent(token)}; ptool_csrf=${encodeURIComponent(csrf)}`,
          'x-csrf-token': csrf,
          'Content-Type': 'application/json',
        },
        responseCount: responses.length, bodyBytes: Buffer.byteLength(JSON.stringify(body)),
        expected: {
          result: expectedResult,
          scoreSemanticHash: canonicalHash(expectedResult),
          definitionHash: snapshot.definitionHash,
          compiledRuntimeHash: snapshot.compiledRuntimeHash,
        },
      })
    }
    const partition = partitionFreshFixturePool(fixturePool, warmupCount, steadyCount)
    groups[`${cls.key}Warmup`] = partition.warmup
    groups[`${cls.key}Steady`] = partition.steady
    if (cls.key === 'sjtLinear10') {
      const resume = (fixtures: typeof partition.warmup) => fixtures.map((fixture) => ({
        fixtureId: `resume-${fixture.fixtureId}`, fixtureClass: 'sjtResume',
        method: 'GET' as const, path: fixture.path.replace(/\/submit$/, ''),
        headers: fixture.headers as Record<string, string>, expectedStatuses: [200],
        expectedAttemptId: fixture.path.split('/').at(-2),
      }))
      journeyGroups.sjtResumeWarmup = resume(partition.warmup)
      journeyGroups.sjtResumeSteady = resume(partition.steady)
    }
    mixedRequests.push(...fixturePool.slice(warmupCount + steadyCount))
  }

  const startPool = []
  for (let index = 0; index < warmupCount + steadyCount; index += 1) {
    const username = `perf01-${runId}-sjt-start-${index + 1}`
    const user = await db.user.create({ data: {
      username, passwordHash, role: 'STUDENT', nickname: username,
      isActive: true, mustChangePassword: false, teacherApproved: true,
    } })
    ledger.userIds.push(user.id)
    const csrf = randomBytes(32).toString('base64url')
    const token = jwt.sign({
      userId: user.id, username: user.username, role: user.role,
      tokenVersion: user.tokenVersion, mustChangePassword: false,
    }, process.env.JWT_SECRET!, { expiresIn: '7d' })
    startPool.push({
      fixtureId: `sjt-start-${String(index + 1).padStart(5, '0')}`,
      fixtureClass: 'sjtStart', method: 'POST' as const, path: '/api/situational/attempts',
      subjectUserId: user.id,
      headers: {
        Cookie: `ptool_session=${encodeURIComponent(token)}; ptool_csrf=${encodeURIComponent(csrf)}`,
        'x-csrf-token': csrf, 'Content-Type': 'application/json',
      },
      body: {
        instrumentKey: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.key,
        instrumentVersion: SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.instrumentVersion,
      },
      expectedStatuses: [200, 201],
    })
  }
  journeyGroups.sjtStartWarmup = startPool.slice(0, warmupCount)
  journeyGroups.sjtStartSteady = startPool.slice(warmupCount)

  // One self-authored 1x1 PNG, stored only in the isolated local upload root.
  // Multiple frozen attempts reference the same immutable asset identity so
  // the media route measures real authorized byte delivery, not a 404 probe.
  {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/vS8AAAAASUVORK5CYII=', 'base64')
    const sha256 = createHash('sha256').update(png).digest('hex')
    const objectKey = `perf01/${runId}/image.png`
    const localPath = getLocalAssetPath(objectKey)
    if (!localPath.startsWith('/tmp/')) throw new Error('media fixture requires UPLOAD_DIR under /tmp')
    mkdirSync(dirname(localPath), { recursive: true, mode: 0o700 })
    writeFileSync(localPath, png, { mode: 0o600 })
    ledger.localAssetPaths.push(localPath)
    const asset = await db.storedAsset.create({ data: {
      objectKey, provider: 'local', mimeType: 'image/png', sizeBytes: png.length,
      sha256, originalName: 'perf01-image.png', accessScope: 'PRIVATE',
    } })
    ledger.storedAssetIds.push(asset.id)
    const definition = clone(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.definition)
    const original = definition.scenes[0]!.stimulus
    definition.scenes[0]!.stimulus = {
      type: 'IMAGE', text: original.type === 'TEXT_V1' ? original.text : 'Disposable image scene',
      asset: { assetId: asset.id, contentHash: sha256, mimeType: 'image/png' },
      altText: 'Disposable test image',
    }
    const instrumentKey = `perf01-media-${runId}`
    const snapshot = freezeSituationalRuntimeAtAttemptStart({
      instrumentKey, instrumentVersion: '1.0.0', definition, frozenAt: fixedFrozenAt,
    })
    const encrypted = encryptFrozenSituationalRuntimeSnapshot(snapshot)
    const mediaPool = []
    for (let index = 0; index < warmupCount + steadyCount; index += 1) {
      const username = `perf01-${runId}-media-${index + 1}`
      const user = await db.user.create({ data: {
        username, passwordHash, role: 'STUDENT', nickname: username,
        isActive: true, mustChangePassword: false, teacherApproved: true,
      } })
      ledger.userIds.push(user.id)
      const csrf = randomBytes(32).toString('base64url')
      const token = jwt.sign({
        userId: user.id, username: user.username, role: user.role,
        tokenVersion: user.tokenVersion, mustChangePassword: false,
      }, process.env.JWT_SECRET!, { expiresIn: '7d' })
      const attempt = await db.situationalAttempt.create({ data: {
        userId: user.id, participantKey: getParticipantKey(user.id),
        instrumentKey, instrumentVersion: '1.0.0', attemptNo: 1,
        status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
        definitionHash: snapshot.definitionHash, compiledRuntimeHash: snapshot.compiledRuntimeHash,
        scorerKey: snapshot.scorerKey, scoringVersion: snapshot.scoringVersion,
        frozenAt: fixedFrozenAt, runtimeSnapshotEncrypted: encrypted, progress: 0,
      } })
      ledger.situationalAttemptIds.push(attempt.id)
      mediaPool.push({
        fixtureId: `sjt-media-${String(index + 1).padStart(5, '0')}`,
        fixtureClass: 'media', method: 'GET' as const,
        path: `/api/situational/attempts/${attempt.id}/assets/${asset.id}/content`,
        headers: {
          Cookie: `ptool_session=${encodeURIComponent(token)}; ptool_csrf=${encodeURIComponent(csrf)}`,
          'x-csrf-token': csrf,
        },
        expectedStatuses: [200], expectedContentLength: png.length,
        expectedMimeType: 'image/png', expectedSha256: sha256,
        mediaAttemptId: attempt.id, assetId: asset.id,
      })
    }
    journeyGroups.sjtMediaWarmup = mediaPool.slice(0, warmupCount)
    journeyGroups.sjtMediaSteady = mediaPool.slice(warmupCount)
  }

  for (const scaleClass of ['Typical', 'MaxLegal'] as const) {
    const code = `P01-SCALE-${runId}-${scaleClass}`
    const prefix = `P01-${runId}-${scaleClass}`
    const itemCount = scaleClass === 'Typical' ? 25 : maxLegalScaleItemCount(prefix)
    const definition = scaleDefinition(itemCount, prefix)
    const definitionHash = hashScaleDefinition(definition)
    const scale = await db.scale.create({ data: {
      code, name: `Disposable ${scaleClass} ${runId}`, creatorId: ledger.userIds[0]!,
      status: 'PUBLISHED', visibility: 'PUBLIC', instrumentClass: 'CUSTOM_DESCRIPTIVE',
      instrumentVersion: '2.0.0', definition: definition as unknown as Prisma.InputJsonValue,
      definitionHash, itemCount, dimensionCount: 1,
    } })
    ledger.scaleIds.push(scale.id)
    const snapshot = await freezeScaleRuntimeAtAttemptStart(db, {
      instrumentKey: code, instrumentVersion: '2.0.0', definition, frozenAt: fixedFrozenAt,
    })
    const encrypted = encryptFrozenScaleRuntimeSnapshot(snapshot)
    const answers = definition.items.map((item) => ({ itemCode: item.itemCode, responseValue: 'yes' }))
    const count = scaleClass === 'Typical' ? warmupCount + steadyCount + mixedPerClass : 1
    const fixturePool = []
    for (let index = 0; index < count; index += 1) {
      const username = `perf01-${runId}-scale-${scaleClass}-${index + 1}`
      const user = await db.user.create({ data: {
        username, passwordHash, role: 'STUDENT', nickname: username,
        isActive: true, mustChangePassword: false, teacherApproved: true,
      } })
      ledger.userIds.push(user.id)
      const csrf = randomBytes(32).toString('base64url')
      const token = jwt.sign({
        userId: user.id, username: user.username, role: user.role,
        tokenVersion: user.tokenVersion, mustChangePassword: false,
      }, process.env.JWT_SECRET!, { expiresIn: '7d' })
      const admission = createFrozenUnitAdmission({
        attemptEpoch: 1,
        scale: { id: scale.id, code: scale.code, name: scale.name, instrumentVersion: scale.instrumentVersion },
        principal: { userId: user.id }, parent: null, requiresContext: false,
      })
      const assessment = await db.assessment.create({ data: {
        scaleId: scale.id, userId: user.id, status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
        runtimeSnapshotEncrypted: encrypted, compiledRuntimeHash: snapshot.compiledRuntime.compiledRuntimeHash,
        ...frozenAdmissionPersistence(admission), progress: 0,
      } })
      ledger.scaleAssessmentIds.push(assessment.id)
      const body = {
        submissionId: `perf01-scale-${scaleClass}-${runId}-${String(index + 1).padStart(6, '0')}`,
        attemptEpoch: 1, definitionHash, contextSnapshotHash: null, answers,
      }
      fixturePool.push({
        fixtureId: `scale-${scaleClass}-${String(index + 1).padStart(6, '0')}`,
        instrument: 'scale', fixtureClass: `scale${scaleClass}`, method: 'POST' as const,
        path: `/api/scales/assessments/${assessment.id}/submit`, body,
        headers: {
          Cookie: `ptool_session=${encodeURIComponent(token)}; ptool_csrf=${encodeURIComponent(csrf)}`,
          'x-csrf-token': csrf, 'Content-Type': 'application/json',
        },
        itemCount, bodyBytes: Buffer.byteLength(JSON.stringify(body)),
        canonicalPayloadBytes: canonicalJsonBytes({ answers }).byteLength,
        expected: { total: itemCount, definitionHash, compiledRuntimeHash: snapshot.compiledRuntime.compiledRuntimeHash },
      })
    }
    if (scaleClass === 'Typical') {
      const partition = partitionFreshFixturePool(fixturePool, warmupCount, steadyCount)
      groups.scaleTypicalWarmup = partition.warmup
      groups.scaleTypicalSteady = partition.steady
      mixedRequests.push(...fixturePool.slice(warmupCount + steadyCount))
      const questionnaire = await db.questionnaire.create({ data: {
        code: `P01-Q-SCALE-${runId}`, name: `Disposable Scale questionnaire ${runId}`,
        creatorId: ledger.userIds[0]!, type: 'GENERAL', status: 'PUBLISHED', visibility: 'PUBLIC',
      } })
      ledger.questionnaireIds.push(questionnaire.id)
      const binding = await db.questionnaireScale.create({ data: {
        questionnaireId: questionnaire.id, scaleId: scale.id, position: 0,
      } })
      const slotSet = freezeQuestionnaireActiveSlotSet({ attemptEpoch: 1, scales: [{
        questionnaireScaleId: binding.id, code: scale.code, instrumentVersion: scale.instrumentVersion,
        sourceDefinitionHash: definitionHash, compiledRuntimeHash: snapshot.compiledRuntime.compiledRuntimeHash,
      }], formSections: [] })
      for (const publicMode of [false, true]) {
        const groupName = publicMode ? 'publicQuestionnaireScaleSteady' : 'authQuestionnaireScaleSteady'
        groups[groupName] = []
        for (let index = 0; index < 2; index += 1) {
          const username = `perf01-${runId}-questionnaire-scale-${publicMode ? 'public' : 'auth'}-${index + 1}`
          const user = publicMode ? null : await db.user.create({ data: {
            username, passwordHash, role: 'STUDENT', nickname: username,
            isActive: true, mustChangePassword: false, teacherApproved: true,
          } })
          if (user) ledger.userIds.push(user.id)
          const sessionId = publicMode ? randomUUID() : null
          const resumeToken = publicMode ? randomBytes(32).toString('base64url') : null
          const parent = await db.questionnaireAssessment.create({ data: {
            questionnaireId: questionnaire.id, userId: user?.id ?? null,
            sessionId, resumeTokenHash: resumeToken ? hashQuestionnaireResumeToken(resumeToken) : null,
            resumeTokenExpiresAt: publicMode ? new Date(Date.now() + 60 * 60 * 1000) : null,
            status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
            frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slotSet), frozenActiveSlotSetHash: slotSet.snapshotHash,
          } })
          ledger.questionnaireAssessmentIds.push(parent.id)
          const admission = createFrozenUnitAdmission({
            attemptEpoch: 1,
            scale: { id: scale.id, code: scale.code, name: scale.name, instrumentVersion: scale.instrumentVersion },
            principal: { userId: user?.id ?? null, questionnaireSessionId: sessionId,
              recoveryTokenHash: resumeToken ? hashQuestionnaireResumeToken(resumeToken) : null },
            parent: { kind: 'questionnaire', parentId: parent.id, slotKey: `scale:${binding.id}`,
              sourceDefinitionHash: definitionHash, compiledRuntimeHash: snapshot.compiledRuntime.compiledRuntimeHash },
          })
          const child = await db.assessment.create({ data: {
            scaleId: scale.id, userId: user?.id ?? null, questionnaireAssessmentId: parent.id,
            status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
            runtimeSnapshotEncrypted: encrypted, compiledRuntimeHash: snapshot.compiledRuntime.compiledRuntimeHash,
            ...frozenAdmissionPersistence(admission), progress: 0,
          } })
          ledger.scaleAssessmentIds.push(child.id)
          const body = {
            submissionId: `perf01-q-scale-${runId}-${publicMode ? 'public' : 'auth'}-${index + 1}`,
            attemptEpoch: 1, definitionHash, contextSnapshotHash: null, answers,
          }
          const csrf = randomBytes(32).toString('base64url')
          const token = user ? jwt.sign({ userId: user.id, username: user.username, role: user.role,
            tokenVersion: user.tokenVersion, mustChangePassword: false }, process.env.JWT_SECRET!, { expiresIn: '7d' }) : null
          groups[groupName].push({
            fixtureId: `${groupName}-${index + 1}`, instrument: 'scale', fixtureClass: groupName,
            method: 'POST', path: publicMode
              ? `/api/public/assessments/${sessionId}/scale/${child.id}/submit`
              : `/api/questionnaires/assessments/${parent.id}/scales/${child.id}/submit`,
            body, headers: publicMode
              ? { Authorization: `Bearer ${resumeToken}`, 'Content-Type': 'application/json' }
              : { Cookie: `ptool_session=${encodeURIComponent(token!)}; ptool_csrf=${encodeURIComponent(csrf)}`,
                'x-csrf-token': csrf, 'Content-Type': 'application/json' },
            durableType: 'scale', durableChildId: child.id,
          })
        }
      }
    } else {
      groups.scaleMaxLegalSteady = fixturePool
    }
  }

  // Same-parent contention: one parent, distinct section children and stable
  // frozen slot identities. These requests are only consumed together.
  {
    const siblingCount = Number(process.env.PERF_SAME_PARENT_SIBLINGS || 2)
    if (![2, 10, 50].includes(siblingCount)) throw new Error('PERF_SAME_PARENT_SIBLINGS must be 2, 10, or 50')
    const username = `perf01-${runId}-same-parent`
    const user = await db.user.create({ data: {
      username, passwordHash, role: 'STUDENT', nickname: username,
      isActive: true, mustChangePassword: false, teacherApproved: true,
    } })
    ledger.userIds.push(user.id)
    const csrf = randomBytes(32).toString('base64url')
    const token = jwt.sign({
      userId: user.id, username: user.username, role: user.role,
      tokenVersion: user.tokenVersion, mustChangePassword: false,
    }, process.env.JWT_SECRET!, { expiresIn: '7d' })
    const questionnaire = await db.questionnaire.create({ data: {
      code: `P01-Q-SAME-${runId}`, name: `Disposable same-parent ${runId}`,
      creatorId: ledger.userIds[0]!, type: 'COURSE', status: 'PUBLISHED', visibility: 'PUBLIC',
    } })
    ledger.questionnaireIds.push(questionnaire.id)
    for (let index = 0; index < siblingCount; index += 1) {
      const section = await db.questionnaireFormSection.create({ data: {
        questionnaireId: questionnaire.id, title: `Section ${index + 1}`, position: index, contextSection: false,
      } })
      await db.questionnaireFormItem.create({ data: {
        questionnaireId: questionnaire.id, sectionId: section.id, sectionPosition: 0,
        type: 'text_input', label: `Disposable answer ${index + 1}`, required: true, position: index,
      } })
    }
    await ensureQuestionnaireFormSections(questionnaire.id)
    const sections = await listQuestionnaireFormSections(questionnaire.id)
    const sectionHashes = await Promise.all(sections.map(async (section) => {
      const raw = await db.questionnaireFormSection.findUnique({
        where: { id: section.id },
        include: { items: { orderBy: [{ sectionPosition: 'asc' }, { position: 'asc' }] } },
      })
      if (!raw) throw new Error('missing raw same-parent form section')
      return { sectionId: section.id, definitionHash: canonicalHash(mapQuestionnaireSection(raw)) }
    }))
    const slotSet = freezeQuestionnaireActiveSlotSet({ attemptEpoch: 1, scales: [], formSections: sectionHashes })
    const parent = await db.questionnaireAssessment.create({ data: {
      questionnaireId: questionnaire.id, userId: user.id, status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
      progress: 0, frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slotSet),
      frozenActiveSlotSetHash: slotSet.snapshotHash,
    } })
    ledger.questionnaireAssessmentIds.push(parent.id)
    ledger.formSectionIds.push(...sections.map((section) => section.id))
    groups.sameParentSteady = sections.map((section, index) => {
      const definitionHash = sectionHashes[index]!.definitionHash
      const body = {
        submissionId: `perf01-same-parent-${runId}-${String(index + 1).padStart(4, '0')}`,
        attemptEpoch: 1, definitionHash, contextSnapshotHash: null,
        answers: section.items.map((item) => ({ formItemId: item.id, value: `answer-${index + 1}` })),
      }
      return {
        fixtureId: `same-parent-${String(index + 1).padStart(4, '0')}`,
        instrument: 'form', fixtureClass: 'sameParent', parentKey: `perf01-${runId}-same-parent`,
        method: 'POST' as const,
        path: `/api/questionnaires/assessments/${parent.id}/form-sections/${section.id}/submit`,
        body, headers: {
          Cookie: `ptool_session=${encodeURIComponent(token)}; ptool_csrf=${encodeURIComponent(csrf)}`,
          'x-csrf-token': csrf, 'Content-Type': 'application/json',
        },
        itemCount: section.items.length, bodyBytes: Buffer.byteLength(JSON.stringify(body)),
      }
    })
    groups.publicQuestionnaireFormSteady = []
    const publicSection = sections[0]!
    for (let index = 0; index < 2; index += 1) {
      const sessionId = randomUUID()
      const resumeToken = randomBytes(32).toString('base64url')
      const publicParent = await db.questionnaireAssessment.create({ data: {
        questionnaireId: questionnaire.id, userId: null, sessionId,
        resumeTokenHash: hashQuestionnaireResumeToken(resumeToken),
        resumeTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
        frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slotSet), frozenActiveSlotSetHash: slotSet.snapshotHash,
      } })
      ledger.questionnaireAssessmentIds.push(publicParent.id)
      const body = {
        submissionId: `perf01-public-form-${runId}-${index + 1}`, attemptEpoch: 1,
        definitionHash: sectionHashes[0]!.definitionHash, contextSnapshotHash: null,
        answers: publicSection.items.map((item) => ({ formItemId: item.id, value: `anonymous-answer-${index + 1}` })),
      }
      groups.publicQuestionnaireFormSteady.push({
        fixtureId: `public-form-${index + 1}`, fixtureClass: 'publicQuestionnaireForm', instrument: 'form',
        method: 'POST', path: `/api/public/assessments/${sessionId}/form-sections/${publicSection.id}/submit`,
        body, headers: { Authorization: `Bearer ${resumeToken}`, 'Content-Type': 'application/json' },
        durableType: 'form', durableParentId: publicParent.id, durableSectionId: publicSection.id,
      })
    }
  }

  for (const testType of ['nback', 'cpt'] as const) {
    const seedConfig = COGNITIVE_SEEDS.find((seed) => seed.testType === testType && seed.status === 'PUBLISHED')
    if (!seedConfig) throw new Error(`missing published ${testType} seed`)
    const cfg = await db.cognitiveTestConfig.upsert({
      where: { testType_configVersion: { testType, configVersion: seedConfig.configVersion } },
      create: {
        testType, configVersion: seedConfig.configVersion, name: seedConfig.name,
        status: 'PUBLISHED', engineVersion: seedConfig.engineVersion,
        scoringVersion: seedConfig.scoringVersion, config: seedConfig.config as Prisma.InputJsonValue,
        publishedAt: fixedFrozenAt,
      },
      update: {},
    })
    if (canonicalHash(cfg.config) !== canonicalHash(seedConfig.config)) throw new Error(`${testType} config drift in isolated DB`)
    const entry = requireCognitiveRegistryEntry(testType, cfg.engineVersion, cfg.scoringVersion)
    for (const profile of ['experience', 'standard', 'research'] as const) {
      if (!entry.profiles[profile]) continue
      const freeze = freezeAssignmentProfile({ entry, baseConfig: seedConfig.config, profile })
      const assignment = await db.cognitiveAssignment.create({ data: {
        configId: cfg.id, title: `Disposable ${testType} ${profile} ${runId}`,
        status: 'PUBLISHED', publishedAt: fixedFrozenAt, listedStandalone: false,
        ...freezeDataForWrite(freeze),
      } })
      ledger.cognitiveAssignmentIds.push(assignment.id)
      const snapshot = await createUnifiedCognitiveSessionConfigSnapshot({
        testType, configVersion: cfg.configVersion,
        engineVersion: cfg.engineVersion, scoringVersion: cfg.scoringVersion,
        config: freeze.resolvedConfig,
      })
      const parsed = readCognitiveSessionConfig(snapshot.encrypted).snapshot
      if (!parsed || parsed.configHash !== freeze.resolvedConfigHash) throw new Error(`${testType}/${profile} snapshot hash drift`)
      const fixturePool = []
      for (let index = 0; index < warmupCount + steadyCount + mixedPerClass; index += 1) {
        const username = `perf01-${runId}-${testType}-${profile}-${index + 1}`
        const user = await db.user.create({ data: {
          username, passwordHash, role: 'STUDENT', nickname: username,
          isActive: true, mustChangePassword: false, teacherApproved: true,
        } })
        ledger.userIds.push(user.id)
        const csrf = randomBytes(32).toString('base64url')
        const token = jwt.sign({
          userId: user.id, username: user.username, role: user.role,
          tokenVersion: user.tokenVersion, mustChangePassword: false,
        }, process.env.JWT_SECRET!, { expiresIn: '7d' })
        const randomSeed = `perf01-${runId}-${testType}-${profile}-${index}`
        const admission = createFrozenUnitAdmission({
          attemptEpoch: 1,
          cognitive: {
            testType, engineVersion: cfg.engineVersion, scoringVersion: cfg.scoringVersion,
            configHash: parsed.configHash,
          },
          principal: { userId: user.id }, parent: null, requiresContext: false,
        })
        const session = await db.cognitiveSession.create({ data: {
          userId: user.id, participantKey: getParticipantKey(user.id),
          assignmentId: assignment.id, configId: cfg.id, testType, attemptNo: 1,
          status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1',
          configVersion: cfg.configVersion, configSnapshotEncrypted: snapshot.encrypted,
          engineVersion: cfg.engineVersion, scoringVersion: cfg.scoringVersion, randomSeed,
          compiledRuntimeHash: snapshot.compiledRuntime.compiledRuntimeHash,
          ...frozenAdmissionPersistence(admission),
        } })
        ledger.cognitiveSessionIds.push(session.id)
        const trials = cognitiveTrials(testType, randomSeed, freeze.resolvedConfig as Record<string, unknown>)
        const expectedScore = entry.score({
          config: freeze.resolvedConfig,
          randomSeed,
          trials: trials.map((trial) => ({ trialIndex: trial.trialIndex, payload: trial.payload })),
        } as never)
        const body = {
          submissionId: `perf01-${testType}-${profile}-${runId}-${String(index + 1).padStart(6, '0')}`,
          attemptEpoch: 1, definitionHash: parsed.configHash, contextSnapshotHash: null, trials,
        }
        fixturePool.push({
          fixtureId: `${testType}-${profile}-${String(index + 1).padStart(6, '0')}`,
          instrument: 'cognitive', fixtureClass: `${testType}-${profile}`, method: 'POST' as const,
          path: `/api/cognitive/sessions/${session.id}/submit`, body,
          headers: {
            Cookie: `ptool_session=${encodeURIComponent(token)}; ptool_csrf=${encodeURIComponent(csrf)}`,
            'x-csrf-token': csrf, 'Content-Type': 'application/json',
          },
          trialCount: trials.length, bodyBytes: Buffer.byteLength(JSON.stringify(body)),
          expected: {
            profile, resolvedConfigHash: freeze.resolvedConfigHash,
            compiledRuntimeHash: snapshot.compiledRuntime.compiledRuntimeHash,
            score: expectedScore,
          },
        })
      }
      const key = `cognitive${testType[0]!.toUpperCase()}${testType.slice(1)}${profile[0]!.toUpperCase()}${profile.slice(1)}`
      const partition = partitionFreshFixturePool(fixturePool, warmupCount, steadyCount)
      groups[`${key}Warmup`] = partition.warmup
      groups[`${key}Steady`] = partition.steady
      mixedRequests.push(...fixturePool.slice(warmupCount + steadyCount))
      if (testType === 'nback' && profile === 'standard') {
        groups.publicCognitiveSteady = []
        for (let index = 0; index < 2; index += 1) {
          const recoveryToken = randomBytes(24).toString('base64url')
          const recoveryTokenHash = hashRecoveryToken(recoveryToken)
          const randomSeed = `perf01-${runId}-public-nback-${index + 1}`
          const admission = createFrozenUnitAdmission({
            attemptEpoch: 1,
            cognitive: { testType, engineVersion: cfg.engineVersion, scoringVersion: cfg.scoringVersion,
              configHash: parsed.configHash },
            principal: { userId: null, recoveryTokenHash }, parent: null, requiresContext: false,
          })
          const session = await db.cognitiveSession.create({ data: {
            userId: null, participantKey: `anonymous:perf01-${runId}-${index + 1}`,
            recoveryTokenHash, assignmentId: assignment.id, configId: cfg.id, testType, attemptNo: 1,
            status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1',
            configVersion: cfg.configVersion, configSnapshotEncrypted: snapshot.encrypted,
            engineVersion: cfg.engineVersion, scoringVersion: cfg.scoringVersion, randomSeed,
            compiledRuntimeHash: snapshot.compiledRuntime.compiledRuntimeHash,
            ...frozenAdmissionPersistence(admission),
          } })
          ledger.cognitiveSessionIds.push(session.id)
          const body = {
            submissionId: `perf01-public-cognitive-${runId}-${index + 1}`, attemptEpoch: 1,
            definitionHash: parsed.configHash, contextSnapshotHash: null,
            trials: cognitiveTrials(testType, randomSeed, freeze.resolvedConfig as Record<string, unknown>),
            recoveryToken,
          }
          groups.publicCognitiveSteady.push({
            fixtureId: `public-cognitive-${index + 1}`, instrument: 'cognitive', fixtureClass: 'publicCognitive',
            method: 'POST', path: `/api/public/cognitive/sessions/${session.id}/submit`, body,
            headers: { 'Content-Type': 'application/json' },
            durableType: 'cognitive', durableChildId: session.id,
          })
        }
      }
    }
  }
  // Route-cost fixtures cover every Composite FINAL template using the same
  // frozen runtime as the standalone source, with a distinct parent/child for
  // each logical request. The unused siblings keep this a non-last-unit case.
  {
    const sourceScaleFixture = groups.scaleTypicalSteady![0]!
    const sourceSjtFixture = groups.sjtLinear10Steady![0]!
    const sourceScaleId = sourceScaleFixture.path.split('/').at(-2)!
    const sourceSjtId = sourceSjtFixture.path.split('/').at(-2)!
    const [scaleSource, sjtSource] = await Promise.all([
      db.assessment.findUniqueOrThrow({ where: { id: sourceScaleId }, include: { scale: true } }),
      db.situationalAttempt.findUniqueOrThrow({ where: { id: sourceSjtId } }),
    ])
    const composite = await db.compositeAssessment.create({ data: {
      code: `P01-COMPOSITE-${runId}`, name: `Disposable composite cost ${runId}`,
      status: 'PUBLISHED', createdBy: ledger.userIds[0]!, publicEnabled: true, maxAttempts: 3,
    } })
    ledger.compositeIds.push(composite.id)
    const scaleItem = await db.compositeAssessmentItem.create({ data: {
      compositeAssessmentId: composite.id, type: 'SCALE', position: 0, required: true,
      scaleId: scaleSource.scaleId,
    } })
    const sjtItem = await db.compositeAssessmentItem.create({ data: {
      compositeAssessmentId: composite.id, type: 'SITUATIONAL', position: 1, required: true,
      situationalInstrumentKey: sjtSource.instrumentKey,
      situationalInstrumentVersion: sjtSource.instrumentVersion,
    } })
    const section = await db.compositeFormSection.create({ data: {
      compositeAssessmentId: composite.id, title: 'Disposable form', position: 0, contextSection: false,
    } })
    const formItem = await db.compositeAssessmentItem.create({ data: {
      compositeAssessmentId: composite.id, type: 'FORM', position: 2, required: true,
      formType: 'text_input', formLabel: 'Disposable answer',
      formSectionId: section.id, formSectionPosition: 0,
    } })
    const formDefinition = (await listCompositeFormSections(composite.id)).find((value) => value.id === section.id)
    if (!formDefinition) throw new Error('composite fixture form section is missing')
    const { definitionHash: _computedDefinitionHash, ...formIdentityDefinition } = formDefinition
    const formHash = formSectionIdentityHash(formIdentityDefinition)
    const slotSet = freezeCompositeActiveSlotSet({
      attemptEpoch: 1,
      scales: [{ compositeItemId: scaleItem.id, code: scaleSource.scale.code,
        instrumentVersion: scaleSource.scale.instrumentVersion,
        sourceDefinitionHash: sourceScaleFixture.body.definitionHash as string,
        compiledRuntimeHash: scaleSource.compiledRuntimeHash! }],
      cognitive: [], formSections: [{ sectionId: section.id, definitionHash: formSectionIdentityHash(formIdentityDefinition) }],
      situational: [{ compositeItemId: sjtItem.id,
        instrumentKey: sjtSource.instrumentKey, instrumentVersion: sjtSource.instrumentVersion,
        definitionHash: sjtSource.definitionHash, compiledRuntimeHash: sjtSource.compiledRuntimeHash,
        scorerKey: sjtSource.scorerKey, scoringVersion: sjtSource.scoringVersion,
        runtimeGeneration: 'UNIFIED_V1', deliveryMode: 'FINAL_ONLY', frozenAt: sjtSource.frozenAt.toISOString() }],
    })
    for (const publicMode of [false, true]) {
      for (const kind of ['scale', 'situational', 'form'] as const) {
        const groupName = `${publicMode ? 'public' : 'auth'}Composite${kind[0]!.toUpperCase()}${kind.slice(1)}Steady`
        groups[groupName] = []
        for (let index = 0; index < 2; index += 1) {
          const username = `perf01-${runId}-composite-${publicMode ? 'public' : 'auth'}-${kind}-${index + 1}`
          const user = publicMode ? null : await db.user.create({ data: {
            username, passwordHash, role: 'STUDENT', nickname: username,
            isActive: true, mustChangePassword: false, teacherApproved: true,
          } })
          if (user) ledger.userIds.push(user.id)
          const recoveryToken = publicMode ? randomBytes(24).toString('base64url') : null
          const recoveryTokenHash = recoveryToken ? hashRecoveryToken(recoveryToken) : null
          const parent = await db.compositeAssessmentAttempt.create({ data: {
            compositeAssessmentId: composite.id, userId: user?.id ?? null,
            recoveryTokenHash, participantKey: user ? getParticipantKey(user.id) : `anonymous:perf01-${runId}-${kind}-${index + 1}`,
            attemptNo: 1, status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1',
            attemptEpoch: 1, frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slotSet),
            frozenActiveSlotSetHash: slotSet.snapshotHash,
          } })
          ledger.compositeAttemptIds.push(parent.id)
          const scaleAdmission = createFrozenUnitAdmission({
            attemptEpoch: 1,
            scale: { id: scaleSource.scale.id, code: scaleSource.scale.code, name: scaleSource.scale.name,
              instrumentVersion: scaleSource.scale.instrumentVersion },
            principal: { userId: user?.id ?? null, recoveryTokenHash },
            parent: { kind: 'composite', parentId: parent.id, slotKey: compositeItemSlotKey(scaleItem.id, 'SCALE'),
              sourceDefinitionHash: sourceScaleFixture.body.definitionHash as string,
              compiledRuntimeHash: scaleSource.compiledRuntimeHash! },
          })
          const scaleChild = await db.assessment.create({ data: {
            scaleId: scaleSource.scaleId, userId: user?.id ?? null,
            compositeAttemptId: parent.id, compositeItemId: scaleItem.id,
            status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
            runtimeSnapshotEncrypted: scaleSource.runtimeSnapshotEncrypted,
            compiledRuntimeHash: scaleSource.compiledRuntimeHash,
            ...frozenAdmissionPersistence(scaleAdmission),
          } })
          ledger.scaleAssessmentIds.push(scaleChild.id)
          const sjtChild = await db.situationalAttempt.create({ data: {
            userId: user?.id ?? null, compositeAttemptId: parent.id, compositeItemId: sjtItem.id,
            compositeSlotKey: compositeItemSlotKey(sjtItem.id, 'SITUATIONAL'),
            participantKey: parent.participantKey, instrumentKey: sjtSource.instrumentKey,
            instrumentVersion: sjtSource.instrumentVersion, attemptNo: 1, status: 'IN_PROGRESS',
            deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
            definitionHash: sjtSource.definitionHash, compiledRuntimeHash: sjtSource.compiledRuntimeHash,
            scorerKey: sjtSource.scorerKey, scoringVersion: sjtSource.scoringVersion,
            frozenAt: sjtSource.frozenAt, runtimeSnapshotEncrypted: sjtSource.runtimeSnapshotEncrypted,
          } })
          ledger.situationalAttemptIds.push(sjtChild.id)
          const csrf = randomBytes(32).toString('base64url')
          const token = user ? jwt.sign({ userId: user.id, username: user.username, role: user.role,
            tokenVersion: user.tokenVersion, mustChangePassword: false }, process.env.JWT_SECRET!, { expiresIn: '7d' }) : null
          const headers = publicMode
            ? { 'x-recovery-token': recoveryToken!, 'Content-Type': 'application/json' }
            : { Cookie: `ptool_session=${encodeURIComponent(token!)}; ptool_csrf=${encodeURIComponent(csrf)}`,
              'x-csrf-token': csrf, 'Content-Type': 'application/json' }
          const body = kind === 'scale'
            ? { ...sourceScaleFixture.body, submissionId: `perf01-composite-scale-${runId}-${publicMode}-${index + 1}` }
            : kind === 'situational'
              ? { ...sourceSjtFixture.body, submissionId: `perf01-composite-sjt-${runId}-${publicMode}-${index + 1}` }
              : { submissionId: `perf01-composite-form-${runId}-${publicMode}-${index + 1}`,
                attemptEpoch: 1, definitionHash: formHash, contextSnapshotHash: null,
                answers: [{ formItemId: formItem.id, value: `answer-${index + 1}` }] }
          const prefix = publicMode ? '/api/public/composite-assessments' : '/api/composite-assessments'
          const path = kind === 'scale'
            ? `${prefix}/attempts/${parent.id}/items/${scaleItem.id}/scale/submit`
            : kind === 'situational'
              ? `${prefix}/attempts/${parent.id}/items/${sjtItem.id}/situational/${sjtChild.id}/submit`
              : `${prefix}/attempts/${parent.id}/form-sections/${section.id}/submit`
          groups[groupName].push({
            fixtureId: `${groupName}-${index + 1}`, instrument: kind, fixtureClass: groupName,
            method: 'POST', path, body, headers,
            durableType: kind === 'form' ? 'compositeForm' : kind,
            ...(kind === 'form'
              ? { durableParentId: parent.id, durableSectionId: section.id }
              : { durableChildId: kind === 'scale' ? scaleChild.id : sjtChild.id }),
          })
        }
      }
    }
  }
  // Separate cost domains. An explicit STARTED SELF assignment exercises the
  // real relational FINAL consent authority for both legacy and Organization
  // policy domains; the generic Composite pool above remains independent.
  {
    const generic = groups.authCompositeScaleSteady![0]!
    const genericChild = await db.assessment.findUniqueOrThrow({
      where: { id: generic.durableChildId as string }, include: { scale: true },
    })
    const genericParent = await db.compositeAssessmentAttempt.findUniqueOrThrow({
      where: { id: generic.path.split('/')[4]! }, include: { compositeAssessment: true },
    })
    const itemId = generic.path.split('/')[6]!
    const assignments = createSqlRelationalAssignmentRepository(db)
    for (const policyDomain of ['LEGACY_COURSE', 'ORGANIZATION_RUN'] as const) {
      const groupName = policyDomain === 'LEGACY_COURSE'
        ? 'relationalCompositeScaleSteady' : 'organizationCompositeScaleSteady'
      groups[groupName] = []
      for (let index = 0; index < 2; index += 1) {
        const username = `perf01-${runId}-${policyDomain}-${index + 1}`
        const user = await db.user.create({ data: {
          username, passwordHash, role: 'STUDENT', nickname: username,
          isActive: true, mustChangePassword: false, teacherApproved: true,
        } })
        ledger.userIds.push(user.id)
        const episode = await db.assessmentEpisode.create({ data: {
          subjectUserId: user.id, initiatedByUserId: user.id, initiationMode: 'STUDENT_SELF',
        } })
        ledger.episodeIds.push(episode.id)
        const assignmentId = randomUUID()
        const now = new Date().toISOString()
        const relationshipSnapshot = {
          schemaVersion: 1 as const, relationshipKind: 'SELF' as const, relationshipRef: null,
          subjectUserId: user.id, subjectRole: 'STUDENT' as const,
          respondentUserId: user.id, respondentRole: 'STUDENT' as const,
          courseId: null, verifiedAt: now, facts: {},
        }
        await assignments.create({
          assignmentId, episodeId: episode.id,
          subjectUserId: user.id, subjectRole: 'STUDENT',
          respondentUserId: user.id, respondentRole: 'STUDENT', createdByUserId: user.id,
          relationshipKind: 'SELF', relationshipRef: null, relationshipSnapshot,
          relationshipSnapshotHash: canonicalHash(relationshipSnapshot),
          perspective: 'SELF_REPORT', resourceKind: 'BUNDLE',
          resourceKey: genericParent.compositeAssessment.code, resourceVersion: '1.0.0',
          applicabilityHash: canonicalHash({ policyDomain, resourceKey: genericParent.compositeAssessment.code }),
          analysisMode: 'INDIVIDUAL_ONLY', minimumRespondents: null,
          consentId: null, visibilityPolicyKey: 'self_private_v1', policyDomain,
          status: 'STARTED', createdAt: now, startedAt: now, completedAt: null, revokedAt: null,
        })
        ledger.relationalAssignmentIds.push(assignmentId)
        const parent = await db.compositeAssessmentAttempt.create({ data: {
          compositeAssessmentId: genericParent.compositeAssessmentId,
          userId: user.id, participantKey: getParticipantKey(user.id), attemptNo: 1,
          status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
          frozenActiveSlotSetEncrypted: genericParent.frozenActiveSlotSetEncrypted,
          frozenActiveSlotSetHash: genericParent.frozenActiveSlotSetHash,
          subjectUserId: user.id, respondentUserId: user.id, respondentType: 'SELF',
          episodeId: episode.id, assignmentRef: assignmentId,
        } })
        ledger.compositeAttemptIds.push(parent.id)
        const admission = createFrozenUnitAdmission({
          attemptEpoch: 1,
          scale: { id: genericChild.scale.id, code: genericChild.scale.code,
            name: genericChild.scale.name, instrumentVersion: genericChild.scale.instrumentVersion },
          principal: { userId: user.id },
          parent: { kind: 'composite', parentId: parent.id, slotKey: compositeItemSlotKey(itemId, 'SCALE'),
            sourceDefinitionHash: generic.body.definitionHash as string,
            compiledRuntimeHash: genericChild.compiledRuntimeHash! },
        })
        const child = await db.assessment.create({ data: {
          scaleId: genericChild.scaleId, userId: user.id,
          compositeAttemptId: parent.id, compositeItemId: itemId,
          status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', attemptEpoch: 1,
          runtimeSnapshotEncrypted: genericChild.runtimeSnapshotEncrypted,
          compiledRuntimeHash: genericChild.compiledRuntimeHash,
          ...frozenAdmissionPersistence(admission),
          subjectUserId: user.id, respondentUserId: user.id, respondentType: 'SELF',
          episodeId: episode.id, assignmentRef: assignmentId,
        } })
        ledger.scaleAssessmentIds.push(child.id)
        const csrf = randomBytes(32).toString('base64url')
        const token = jwt.sign({ userId: user.id, username: user.username, role: user.role,
          tokenVersion: user.tokenVersion, mustChangePassword: false }, process.env.JWT_SECRET!, { expiresIn: '7d' })
        groups[groupName].push({
          fixtureId: `${groupName}-${index + 1}`, instrument: 'scale', fixtureClass: groupName,
          method: 'POST', path: `/api/composite-assessments/attempts/${parent.id}/items/${itemId}/scale/submit`,
          body: { ...generic.body, submissionId: `perf01-${groupName}-${runId}-${index + 1}` },
          headers: { Cookie: `ptool_session=${encodeURIComponent(token)}; ptool_csrf=${encodeURIComponent(csrf)}`,
            'x-csrf-token': csrf, 'Content-Type': 'application/json' },
          durableType: 'scale', durableChildId: child.id,
        })
      }
    }
  }
  // A/B variants reseed with different run IDs. Mixed ordering must depend only
  // on stable fixture identity or BASE/HEAD receive different workload mixes.
  const mixKey = (fixtureId: string) => createHash('sha256').update(fixtureId).digest('hex')
  groups.mixedSteady = mixedRequests.sort((left, right) => mixKey(left.fixtureId).localeCompare(mixKey(right.fixtureId)))
  const validation = assertFreshFixturePool(groups)
  mkdirSync(outDir, { recursive: true, mode: 0o700 })
  writeFileSync(`${outDir}/final-submit-fixtures.json`, JSON.stringify(groups), { mode: 0o600 })
  writeFileSync(`${outDir}/journey-fixtures.json`, JSON.stringify(journeyGroups), { mode: 0o600 })
  writeFileSync(`${outDir}/ledger.json`, JSON.stringify(ledger, null, 2), { mode: 0o600 })
  writeFileSync(`${outDir}/auth.env`, '# Per-fixture authentication is embedded in final-submit-fixtures.json (mode 0600).\n', { mode: 0o600 })
  console.log(JSON.stringify({ outDir, runId, classes: classes.map((cls) => cls.key), journeys: Object.keys(journeyGroups), ...validation }, null, 2))
}
