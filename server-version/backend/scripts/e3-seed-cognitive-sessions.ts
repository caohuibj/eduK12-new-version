/**
 * Production-path-aligned E3 Cognitive fixture seeder.
 *
 * Each generated session is UNIFIED_V1, carries a compiled runtime hash and a
 * frozen unit-admission snapshot, and is submitted through the normal final
 * submit route. The business-valid large class is capped at maxTrials=1000;
 * it is intentionally not sized by the HTTP 1.5 MiB ceiling.
 */
import 'dotenv/config'
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import {
  createUnifiedCognitiveSessionConfigSnapshot,
  readCognitiveSessionConfig,
} from '../src/modules/cognitive/session.service'
import { createTrialEnvelope } from '../src/modules/cognitive/v2/trial-envelope'
import {
  createFrozenUnitAdmission,
  frozenAdmissionPersistence,
} from '../src/modules/assessment-runtime/admission-snapshot'
import { FINAL_SUBMISSION_MAX_BYTES } from '../src/services/instrumentFinalSubmit'
import { canonicalJsonBytes } from '../src/modules/assessment-runtime/canonical'

const prisma = new PrismaClient()
const OUT = process.env.E3_OUT || '/workspace/eduk12-pr49-cloud-results/e3-cognitive-fixtures.json'
const N = Number(process.env.E3_SESSION_COUNT || 250)
const MAX_TRIALS = 1000
const STUDENT_USERNAME = process.env.PERF_STUDENT_USERNAME || 'gate47student'
const STUDENT_PASSWORD = process.env.PERF_STUDENT_PASSWORD || 'Gate47StudentPass!'
const JWT_SECRET = process.env.JWT_SECRET!

const numberFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name]
  const value = raw === undefined || raw === '' ? fallback : Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > MAX_TRIALS) {
    throw new Error(`${name} must be an integer from 1 to ${MAX_TRIALS} (got ${raw})`)
  }
  return value
}

const classes = [
  { key: 'cognitiveSmall', trialCount: numberFromEnv('E3_SMALL_TRIAL_COUNT', 5) },
  { key: 'cognitiveNormal', trialCount: numberFromEnv('E3_NORMAL_TRIAL_COUNT', 50) },
  { key: 'cognitiveLarge', trialCount: numberFromEnv('E3_LARGE_TRIAL_COUNT', MAX_TRIALS) },
]

async function main() {
  if (!Number.isInteger(N) || N < 1) throw new Error(`E3_SESSION_COUNT must be positive (got ${N})`)

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
  const fake = await prisma.cognitiveTestConfig.findFirst({
    where: { testType: 'fake', status: 'PUBLISHED' },
  })
  if (!fake) throw new Error('no published fake cognitive config')

  const fixtures: Record<string, any[]> = {}
  const ledger = {
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    userIds: [student.id],
    cognitiveConfigId: fake.id,
    cognitiveSessionIds: [] as string[],
    fixtureRecords: [] as Array<Record<string, unknown>>,
  }

  for (const fixtureClass of classes) {
    const config = {
      trialCount: fixtureClass.trialCount,
      trialDurationMs: 1000,
      allowPractice: false,
      maxRtMs: 60000,
    }
    const unifiedSnapshot = await createUnifiedCognitiveSessionConfigSnapshot({
      testType: fake.testType,
      configVersion: fake.configVersion,
      engineVersion: fake.engineVersion,
      scoringVersion: fake.scoringVersion,
      config,
    })
    const configSnapshot = readCognitiveSessionConfig(unifiedSnapshot.encrypted).snapshot
    if (!configSnapshot || configSnapshot.runtimeGeneration !== 'UNIFIED_V1') {
      throw new Error(`${fixtureClass.key} did not create a Unified Runtime snapshot`)
    }
    const frozenAdmission = createFrozenUnitAdmission({
      attemptEpoch: 1,
      cognitive: {
        testType: fake.testType,
        engineVersion: fake.engineVersion,
        scoringVersion: fake.scoringVersion,
        configHash: configSnapshot.configHash,
      },
      principal: { userId: student.id },
      parent: null,
      requiresContext: false,
    })

    const requests: any[] = []
    for (let i = 0; i < N; i += 1) {
      const fixtureId = `perf-e3-${fixtureClass.key}-${String(i + 1).padStart(6, '0')}`
      const session = await prisma.cognitiveSession.create({
        data: {
          userId: student.id,
          participantKey: `g47-e3-${ledger.runId}-${fixtureClass.key}-${i}`,
          configId: fake.id,
          testType: fake.testType,
          attemptNo: 1,
          status: 'IN_PROGRESS',
          deliveryMode: 'FINAL_ONLY',
          configVersion: fake.configVersion,
          configSnapshotEncrypted: unifiedSnapshot.encrypted,
          engineVersion: fake.engineVersion,
          scoringVersion: fake.scoringVersion,
          randomSeed: `g47-e3-seed-${ledger.runId}-${fixtureClass.key}-${i}`,
          runtimeGeneration: 'UNIFIED_V1',
          compiledRuntimeHash: unifiedSnapshot.compiledRuntime.compiledRuntimeHash,
          ...frozenAdmissionPersistence(frozenAdmission),
        },
      })
      ledger.cognitiveSessionIds.push(session.id)

      const trials = Array.from({ length: fixtureClass.trialCount }, (_, trialIndex) => createTrialEnvelope({
        trialIndex,
        phase: 'test',
        payload: { correct: trialIndex % 2 === 0, rtMs: 400 + (trialIndex % 5) },
        startedAtPerfMs: trialIndex * 1000,
        endedAtPerfMs: trialIndex * 1000 + 400,
      }))
      if (trials.length !== fixtureClass.trialCount || trials.length > MAX_TRIALS) {
        throw new Error(`${fixtureClass.key} trial schema/count contract failed`)
      }
      const submissionId = `g47-e3-${ledger.runId}-${fixtureClass.key}-${String(i + 1).padStart(6, '0')}`
      const body = {
        submissionId,
        attemptEpoch: 1,
        definitionHash: configSnapshot.configHash,
        contextSnapshotHash: null,
        trials,
      }
      const bodyBytes = Buffer.byteLength(JSON.stringify(body))
      const canonicalPayloadBytes = canonicalJsonBytes({ trials }).byteLength
      if (!(bodyBytes < FINAL_SUBMISSION_MAX_BYTES.cognitive)) {
        throw new Error(`${fixtureClass.key} body exceeds FINAL cognitive max`)
      }
      requests.push({
        fixtureId,
        fixtureClass: fixtureClass.key,
        logicalAttempt: `${session.id}:1:${submissionId}`,
        instrument: 'cognitive',
        parentKey: `perf-parent-e3-${fixtureClass.key}-${String(i + 1).padStart(6, '0')}`,
        method: 'POST',
        path: `/api/cognitive/sessions/${session.id}/submit`,
        sessionId: session.id,
        submissionId,
        runtimeGeneration: 'UNIFIED_V1',
        compiledRuntimeHash: unifiedSnapshot.compiledRuntime.compiledRuntimeHash,
        trialCount: fixtureClass.trialCount,
        bodyBytes,
        canonicalPayloadBytes,
        body,
      })
      ledger.fixtureRecords.push({
        fixtureId,
        fixtureClass: fixtureClass.key,
        sessionId: session.id,
        submissionId,
        trialCount: fixtureClass.trialCount,
        bodyBytes,
        canonicalPayloadBytes,
        runtimeGeneration: 'UNIFIED_V1',
        compiledRuntimeHash: unifiedSnapshot.compiledRuntime.compiledRuntimeHash,
      })
    }
    fixtures[fixtureClass.key] = requests
  }

  // Contract proof for fresh throughput: every logical submit owns one child,
  // submission ID, and fixture record. Replay tests opt out explicitly.
  fixtures.cognitive = classes.flatMap(({ key }) => fixtures[key])
  const allFixtures = fixtures.cognitive
  for (const field of ['fixtureId', 'sessionId', 'submissionId', 'logicalAttempt']) {
    const values = allFixtures.map((fixture) => fixture[field])
    if (values.some((value) => typeof value !== 'string' || value.length === 0)
      || new Set(values).size !== values.length) {
      throw new Error(`E3 fixture uniqueness contract failed for ${field}`)
    }
  }
  if (allFixtures.some((fixture) => fixture.runtimeGeneration !== 'UNIFIED_V1')) {
    throw new Error('E3 fixture runtimeGeneration contract failed')
  }

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(fixtures))
  writeFileSync(OUT.replace(/\.json$/, '.ledger.json'), JSON.stringify(ledger, null, 2))
  writeFileSync(OUT.replace(/\.json$/, '.auth.env'), [
    `PERF_AUTH_TOKEN=${token}`,
    `PERF_CSRF_TOKEN=${csrf}`,
    `PERF_STUDENT_USERNAME=${STUDENT_USERNAME}`,
    `PERF_STUDENT_PASSWORD=${STUDENT_PASSWORD}`,
    '',
  ].join('\\n'), { mode: 0o600 })
  console.log(JSON.stringify({
    out: OUT,
    runId: ledger.runId,
    countPerClass: N,
    classes: Object.fromEntries(classes.map(({ key, trialCount }) => [
      key,
      {
        trialCount,
        count: fixtures[key].length,
        minBodyBytes: Math.min(...fixtures[key].map((fixture) => fixture.bodyBytes)),
        maxBodyBytes: Math.max(...fixtures[key].map((fixture) => fixture.bodyBytes)),
        runtimeGeneration: 'UNIFIED_V1',
        compiledRuntimeHash: fixtures[key][0]?.compiledRuntimeHash ?? null,
      },
    ])),
    studentId: student.id,
    ledger: OUT.replace(/\.json$/, '.ledger.json'),
  }, null, 2))
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
