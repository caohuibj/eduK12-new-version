/**
 * E3 cognitive large-payload session seeder.
 * Creates fake-test cognitive sessions with a configurable trialCount and
 * returns ready-to-submit fixtures with that many legal {correct,rtMs} trials.
 * This is the only schema-valid way to reach large FINAL payloads for the
 * fake test type (fakeTrialSchema is strict; trialCount is unbounded).
 */
import 'dotenv/config'
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { createUnifiedCognitiveSessionConfigSnapshot, readCognitiveSessionConfig } from '../src/modules/cognitive/session.service'
import { createTrialEnvelope } from '../src/modules/cognitive/v2/trial-envelope'

const prisma = new PrismaClient()
const OUT = process.env.E3_OUT || '/workspace/eduk12-pr49-cloud-results/e3-cognitive-fixtures.json'
const N = Number(process.env.E3_SESSION_COUNT || 250)
/**
 * Payload class (Stage 1R): distinguish NORMAL / LARGE / ENGINE_MAX. There is NO
 * product evidence that engine-max 1000 trials is a realistic production "large"
 * workload; 1000 is the engine hard cap (see unified-final-submit /
 * trial-normalizer) and is treated as ENGINE_MAX stress only. Any trialCount > 1000
 * fails validation with SUBMISSION_PAYLOAD_CONFLICT and is NOT a legal fixture.
 * 1000 trials ≈ ~100KB payload (under the 1.5MiB FINAL_SUBMISSION_MAX_BYTES.cognitive
 * limit, which is NOT reachable for the fake test type).
 */
const MAX_TRIALS = 1000
// Realistic business scale for the fake test type (NORMAL default); LARGE is a
// best-effort business-valid size, ENGINE_MAX (== MAX_TRIALS) is stress-only.
const TRIAL_COUNT = Number(process.env.E3_TRIAL_COUNT || 5)
const STUDENT_USERNAME = process.env.PERF_STUDENT_USERNAME || 'gate47student'
const STUDENT_PASSWORD = process.env.PERF_STUDENT_PASSWORD || 'Gate47StudentPass!'
const JWT_SECRET = process.env.JWT_SECRET!

async function main() {
  if (!Number.isInteger(TRIAL_COUNT) || TRIAL_COUNT < 1 || TRIAL_COUNT > MAX_TRIALS) {
    throw new Error(
      `F8: E3_TRIAL_COUNT must be 1..${MAX_TRIALS} (engine maxTrials=1000). Got ${TRIAL_COUNT}. >1000 would fail validation with SUBMISSION_PAYLOAD_CONFLICT.`
    )
  }
  // Stage 1R payload classification: ENGINE_MAX is stress-only, never called "large".
  const payloadClass: 'NORMAL' | 'LARGE' | 'ENGINE_MAX' =
    TRIAL_COUNT >= MAX_TRIALS ? 'ENGINE_MAX' : TRIAL_COUNT >= 60 ? 'LARGE' : 'NORMAL'
  if (payloadClass === 'LARGE') {
    console.warn(
      `[Stage 1R] ${TRIAL_COUNT}-trial payload labelled LARGE (best-effort business-valid; no product evidence above ~60).`
    )
  }
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

  const fake = await prisma.cognitiveTestConfig.findFirst({
    where: { testType: 'fake', status: 'PUBLISHED' },
  })
  if (!fake) throw new Error('no published fake cognitive config')

  const config = {
    trialCount: TRIAL_COUNT,
    trialDurationMs: 1000,
    allowPractice: false,
    maxRtMs: 60000,
  }
  // Stage 1R: use the production UNIFIED config snapshot writer so the session
  // is a real UNIFIED_V1 session (compiled runtime + reference bindings) whose
  // compiledRuntimeHash is consistent with snapshot.configHash. The frozen
  // admission is derived on first submit by the production delivery path.
  const unifiedSnapshot = await createUnifiedCognitiveSessionConfigSnapshot({
    testType: fake.testType,
    configVersion: fake.configVersion,
    engineVersion: fake.engineVersion,
    scoringVersion: fake.scoringVersion,
    config,
    db: prisma as any,
  })
  const snapshot = readCognitiveSessionConfig(unifiedSnapshot.encrypted).snapshot
  if (!snapshot) throw new Error('cognitive snapshot missing')

  const requests = []
  for (let i = 0; i < N; i += 1) {
    const runId = randomUUID().slice(0, 8)
    const session = await prisma.cognitiveSession.create({
      data: {
        userId: student.id,
        participantKey: `g47-e3-${runId}-${i}`,
        configId: fake.id,
        testType: fake.testType,
        attemptNo: 1,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        configVersion: fake.configVersion,
        configSnapshotEncrypted: unifiedSnapshot.encrypted,
        engineVersion: fake.engineVersion,
        scoringVersion: fake.scoringVersion,
        randomSeed: `g47-e3-seed-${runId}-${i}`,
        runtimeGeneration: 'UNIFIED_V1',
        compiledRuntimeHash: unifiedSnapshot.compiledRuntime.compiledRuntimeHash,
      },
    })
    const trials = Array.from({ length: TRIAL_COUNT }, (_, trialIndex) => createTrialEnvelope({
      trialIndex,
      phase: 'test',
      payload: { correct: trialIndex % 2 === 0, rtMs: 400 + (trialIndex % 5) },
      startedAtPerfMs: trialIndex * 1000,
      endedAtPerfMs: trialIndex * 1000 + 400,
    }))
    requests.push({
      fixtureId: `perf-e3-cog-${String(i + 1).padStart(6, '0')}`,
      instrument: 'cognitive',
      parentKey: `perf-parent-e3-cog-${String(i + 1).padStart(6, '0')}`,
      method: 'POST',
      path: `/api/cognitive/sessions/${session.id}/submit`,
      headers,
      body: {
        submissionId: `g47-e3-${runId}-${String(i + 1).padStart(6, '0')}`,
        attemptEpoch: 1,
        definitionHash: snapshot.configHash,
        contextSnapshotHash: null,
        trials,
      },
    })
  }

  mkdirSync(require('node:path').dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(requests))
  const one = JSON.stringify(requests[0].body).length
  console.log(JSON.stringify({
    out: OUT,
    count: requests.length,
    trial_count: TRIAL_COUNT,
    payload_class: payloadClass,
    per_request_body_bytes: one,
    studentId: student.id,
  }, null, 2))
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })