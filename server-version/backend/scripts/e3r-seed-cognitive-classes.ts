/**
 * E3R Cognitive workload-class seeder (Stage 3R).
 *
 * Derives NORMAL and realistic LARGE workload classes from ACTUAL PUBLISHED
 * product cognitive tasks in the repository (prisma/seeds/cognitive.ts), NOT
 * from the artificial E3 fake default trialCount=300.
 *
 *   NORMAL = nback v1.0.0   (config trialCountByN=[40,60] -> 100 trials)
 *   LARGE  = cpt   v1.0.0   (config totalTrials=180  -> 180 trials)
 *           ... both regenerate the frozen seed sequence so trials pass the
 *           authoritative scorer's exact-sequence check.
 *   SIZE   = fake testType, trialCount ladder (40..1000, engine cap) for the
 *           low-rate size curve only, kept SEPARATE from the product classes.
 *
 * Every session is UNIFIED_V1 (frozen runtime + compiledRuntimeHash) via
 * createUnifiedCognitiveSessionConfigSnapshot, FINAL_ONLY delivery, and a
 * unique submissionId. Emits a grouped fixture JSON
 * { cognitiveNormal: [...], cognitiveLarge: [...], cognitiveSize_<N>: [...] }
 * readable by perf/gate-e/k6-e3-cognitive-*.js.
 */
import 'dotenv/config'
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { createUnifiedCognitiveSessionConfigSnapshot, readCognitiveSessionConfig } from '../src/modules/cognitive/session.service'
import { createTrialEnvelope } from '../src/modules/cognitive/v2/trial-envelope'
import { nbackSequence, cptSequence } from '../src/modules/cognitive/randomization'

const prisma = new PrismaClient()
const OUT = process.env.E3_CLASS_OUT || '/workspace/eduk12-pr49-cloud-results/e3r-cognitive-class-fixtures.json'
// Pool sizing: 9 boundary runs per class, each run consumes
// warmup(5/s×10s=50) + steady(rate×30s). Peak NORMAL run = 100/s → 3050/run;
// peak LARGE run = 70/s → 2150/run. Totals: NORMAL 3×2150+3×2600+3×3050
// = 23400 → 24000 (+warmup headroom). LARGE 3×1250+3×1700+3×2150 = 15300
// → 16000.
const N_NORMAL = Number(process.env.E3_NORMAL_COUNT || 24000)
const N_LARGE = Number(process.env.E3_LARGE_COUNT || 16000)
const N_SIZE = Number(process.env.E3_SIZE_COUNT || 200)
// Participant-key prefix. Stage 3R pools use 'e3r-'; Stage 4 (capacity curve)
// uses a disjoint prefix so the rebuild script never mixes pools.
const PREFIX = process.env.E3_PREFIX || 'e3r-'
const STUDENT_USERNAME = process.env.PERF_STUDENT_USERNAME || 'gate47student'
const STUDENT_PASSWORD = process.env.PERF_STUDENT_PASSWORD || 'Gate47StudentPass!'
const JWT_SECRET = process.env.JWT_SECRET!

// Published task configs (must mirror prisma/seeds/cognitive.ts).
const NBACK_CONFIG = {
  nLevels: [1, 2],
  trialCountByN: [40, 60],
  blockCountByN: [1, 1],
  targetRatio: 0.3,
  stimulusMs: 500,
  isiMs: 2000,
  validRtFloorMs: 150,
  report: { reportVersion: '1.0.0', referenceMode: 'none' },
}
const CPT_CONFIG = {
  totalTrials: 180,
  targetRatio: 0.2,
  blockCount: 3,
  stimulusMs: 500,
  isiMs: 1000,
  validRtFloorMs: 100,
  perseverationRtMs: 100,
  report: { reportVersion: '1.0.0', referenceMode: 'none' },
}
// Fake-test size ladder (engine maxTrials=1000); NOT a product class.
const SIZE_LADDER = [40, 96, 120, 128, 180, 300, 600, 1000]

async function createSession(params: {
  userId: string
  cfg: { id: string; testType: string; configVersion: string; engineVersion: string; scoringVersion: string }
  config: Record<string, unknown>
  participantKey: string
  randomSeed: string
}) {
  const { encrypted, compiledRuntime } = await createUnifiedCognitiveSessionConfigSnapshot({
    testType: params.cfg.testType,
    configVersion: params.cfg.configVersion,
    engineVersion: params.cfg.engineVersion,
    scoringVersion: params.cfg.scoringVersion,
    config: params.config,
  })
  const snapshot = readCognitiveSessionConfig(encrypted).snapshot
  if (!snapshot) throw new Error('snapshot missing')
  const session = await prisma.cognitiveSession.create({
    data: {
      userId: params.userId,
      participantKey: params.participantKey,
      configId: params.cfg.id,
      testType: params.cfg.testType,
      attemptNo: 1,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      configVersion: params.cfg.configVersion,
      configSnapshotEncrypted: encrypted,
      engineVersion: params.cfg.engineVersion,
      scoringVersion: params.cfg.scoringVersion,
      randomSeed: params.randomSeed,
      runtimeGeneration: 'UNIFIED_V1',
      compiledRuntimeHash: compiledRuntime.compiledRuntimeHash,
    },
  })
  return { session, configHash: snapshot.configHash }
}

function buildNbackTrials(seed: string, config: Record<string, unknown>) {
  const nLevels = (config.nLevels as Array<1 | 2 | 3>)
  const trialCountByN = config.trialCountByN as number[]
  const blockCountByN = config.blockCountByN as number[]
  const targetRatio = config.targetRatio as number
  return nbackSequence(seed, nLevels, trialCountByN, blockCountByN, targetRatio).map((spec, index) =>
    createTrialEnvelope({
      trialIndex: index,
      phase: 'test',
      payload: {
        blockIndex: spec.blockIndex,
        nLevel: spec.nLevel,
        stimulus: spec.stimulus,
        target: spec.target,
        responded: true,
        rtMs: spec.target ? 380 + (index % 5) * 30 : 420 + (index % 5) * 30,
        interrupted: false,
      },
      startedAtPerfMs: index * 2500,
      endedAtPerfMs: index * 2500 + 420,
    }),
  )
}

function buildCptTrials(seed: string, config: Record<string, unknown>) {
  const totalTrials = config.totalTrials as number
  const targetRatio = config.targetRatio as number
  const blockCount = config.blockCount as number
  return cptSequence(seed, totalTrials, targetRatio, blockCount).map((spec, index) =>
    createTrialEnvelope({
      trialIndex: index,
      phase: 'test',
      payload: {
        blockIndex: spec.blockIndex,
        stimulus: spec.stimulus,
        isTarget: spec.isTarget,
        responded: true,
        rtMs: spec.isTarget ? 360 + (index % 5) * 30 : 400 + (index % 5) * 30,
        interrupted: false,
      },
      startedAtPerfMs: index * 1500,
      endedAtPerfMs: index * 1500 + 400,
    }),
  )
}

function buildFakeTrials(seed: string, count: number) {
  return Array.from({ length: count }, (_, index) => createTrialEnvelope({
    trialIndex: index,
    phase: 'test',
    payload: { correct: index % 2 === 0, rtMs: 400 + (index % 5) },
    startedAtPerfMs: index * 1000,
    endedAtPerfMs: index * 1000 + 400,
  }))
}

async function main() {
  const student = await prisma.user.upsert({
    where: { username: STUDENT_USERNAME },
    create: {
      username: STUDENT_USERNAME,
      passwordHash: await bcrypt.hash(STUDENT_PASSWORD, 10),
      role: 'STUDENT',
      nickname: STUDENT_USERNAME,
      isActive: true,
      mustChangePassword: false,
      teacherApproved: true,
    },
    update: {},
  })
  const csrf = randomBytes(32).toString('base64url')
  const token = jwt.sign(
    { userId: student.id, username: student.username, role: student.role, tokenVersion: student.tokenVersion, mustChangePassword: false },
    JWT_SECRET,
    { expiresIn: '7d' },
  )
  const headers = {
    Cookie: `ptool_session=${encodeURIComponent(token)}; ptool_csrf=${encodeURIComponent(csrf)}`,
    'x-csrf-token': csrf,
    'Content-Type': 'application/json',
  }

  const cfgByType: Record<string, { id: string; testType: string; configVersion: string; engineVersion: string; scoringVersion: string }> = {}
  for (const testType of ['nback', 'cpt', 'fake']) {
    const cfg = await prisma.cognitiveTestConfig.findFirst({ where: { testType, status: 'PUBLISHED' } })
    if (!cfg) throw new Error(`no PUBLISHED cognitive config for ${testType}`)
    cfgByType[testType] = {
      id: cfg.id, testType: cfg.testType, configVersion: cfg.configVersion,
      engineVersion: cfg.engineVersion, scoringVersion: cfg.scoringVersion,
    }
  }

  const grouped: Record<string, unknown[]> = {}

  async function seedGroup(key: string, testType: 'nback' | 'cpt' | 'fake', config: Record<string, unknown>, count: number) {
    const cfg = cfgByType[testType]
    const out: unknown[] = []
    const build = testType === 'nback' ? buildNbackTrials : testType === 'cpt' ? buildCptTrials : buildFakeTrials
    const trialCount = testType === 'nback' ? 100 : testType === 'cpt' ? 180 : (config.trialCount as number)
    for (let i = 0; i < count; i += 1) {
      const runId = randomUUID().slice(0, 8)
      const seed = `${PREFIX}${testType}-${runId}-${i}`
      const { session, configHash } = await createSession({
        userId: student.id,
        cfg,
        config,
        participantKey: `${PREFIX}${testType}-${runId}-${i}`,
        randomSeed: seed,
      })
      const body = {
        submissionId: `${PREFIX}${testType}-${runId}-${String(i).padStart(6, '0')}`,
        attemptEpoch: 1,
        definitionHash: configHash,
        contextSnapshotHash: null,
        trials: build(seed, config),
      }
      out.push({
        fixtureId: `${PREFIX}${testType}-${String(i + 1).padStart(6, '0')}`,
        instrument: 'cognitive',
        parentKey: `perf-e3r-${testType}-${String(i + 1).padStart(6, '0')}`,
        method: 'POST',
        path: `/api/cognitive/sessions/${session.id}/submit`,
        headers,
        body,
        payloadBytes: JSON.stringify(body).length,
        trialCount,
      })
      if ((i + 1) % 500 === 0) console.log(`  ${key}: ${i + 1}/${count} seeded`)
    }
    grouped[key] = out
    console.log(`group ${key}: ${out.length} fixtures, trials=${trialCount}, bodyBytes=${out[0] ? out[0].payloadBytes : 0}`)
  }

  console.log('seeding NORMAL (nback 100)...')
  await seedGroup('cognitiveNormal', 'nback', NBACK_CONFIG, N_NORMAL)
  // Class-selective reseed: E3_ONLY_NORMAL=1 replays only the nback pool
  // (Stage 3R NORMAL rerun) without touching the intact cpt/fake pools.
  if (process.env.E3_ONLY_NORMAL !== '1') {
    console.log('seeding LARGE (cpt 180)...')
    await seedGroup('cognitiveLarge', 'cpt', CPT_CONFIG, N_LARGE)
    console.log('seeding SIZE ladder...')
    for (const trials of SIZE_LADDER) {
      await seedGroup(`cognitiveSize_${trials}`, 'fake', { trialCount: trials, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 }, N_SIZE)
    }
  } else {
    console.log('E3_ONLY_NORMAL=1: LARGE/SIZE pools left untouched')
  }

  if (process.env.E3_SKIP_JSON === '1') {
    console.log('E3_SKIP_JSON=1: DB seeded, skipping fixture JSON emission')
    return
  }

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(grouped))
  console.log(JSON.stringify({ out: OUT, groups: Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length])), studentId: student.id }, null, 2))
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
