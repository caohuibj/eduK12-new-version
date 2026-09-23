/** Disposable current-main fixtures, invoked only through gate47-seed-fixtures.ts. */
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
  if (!Number.isInteger(warmupCount) || warmupCount < 1 || !Number.isInteger(steadyCount) || steadyCount < 1) {
    throw new Error('PERF_WARMUP_FIXTURES and PERF_STEADY_FIXTURES must be positive integers')
  }
  return { outDir, warmupCount, steadyCount }
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
  const { outDir, warmupCount, steadyCount } = isolatedOptions()
  const runId = randomUUID().slice(0, 8)
  const password = randomBytes(24).toString('base64url')
  const passwordHash = await bcrypt.hash(password, 10)

  const groups: Record<string, Array<{ fixtureId: string; instrument: string; method: 'POST'; path: string; body: { submissionId: string; attemptEpoch: number; [key: string]: unknown }; [key: string]: unknown }>> = {}
  const ledger = {
    runId, userIds: [] as string[], situationalAttemptIds: [] as string[],
    cognitiveSessionIds: [] as string[], cognitiveAssignmentIds: [] as string[],
    scaleIds: [] as string[], scaleAssessmentIds: [] as string[],
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
    for (let index = 0; index < warmupCount + steadyCount; index += 1) {
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
    const count = scaleClass === 'Typical' ? warmupCount + steadyCount : 1
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
    } else {
      groups.scaleMaxLegalSteady = fixturePool
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
      for (let index = 0; index < warmupCount + steadyCount; index += 1) {
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
    }
  }
  const validation = assertFreshFixturePool(groups)
  mkdirSync(outDir, { recursive: true, mode: 0o700 })
  writeFileSync(`${outDir}/final-submit-fixtures.json`, JSON.stringify(groups), { mode: 0o600 })
  writeFileSync(`${outDir}/ledger.json`, JSON.stringify(ledger, null, 2), { mode: 0o600 })
  writeFileSync(`${outDir}/auth.env`, '# Per-fixture authentication is embedded in final-submit-fixtures.json (mode 0600).\n', { mode: 0o600 })
  console.log(JSON.stringify({ outDir, runId, classes: classes.map((cls) => cls.key), ...validation }, null, 2))
}
