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
import { createCognitiveSessionConfigSnapshot, readCognitiveSessionConfig } from '../src/modules/cognitive/session.service'
import { createTrialEnvelope } from '../src/modules/cognitive/v2/trial-envelope'

const prisma = new PrismaClient()
const OUT = process.env.E3_OUT || '/workspace/eduk12-pr49-cloud-results/e3-cognitive-fixtures.json'
const N = Number(process.env.E3_SESSION_COUNT || 250)
/**
 * F8: largest-business-valid is bounded by the engine's hard maxTrials=1000
 * (see unified-final-submit / trial-normalizer). Any trialCount > 1000 fails
 * cognitive validation with SUBMISSION_PAYLOAD_CONFLICT and is NOT a legal
 * capacity fixture. cap: 1000 trials ≈ ~100KB payload (well under the 1.5MiB
 * FINAL_SUBMISSION_MAX_BYTES.cognitive limit, which is NOT reachable for the
 * fake test type). So 1000 trials is the true largest business-valid payload.
 */
const MAX_TRIALS = 1000
const TRIAL_COUNT = Number(process.env.E3_TRIAL_COUNT || 300)
const STUDENT_USERNAME = process.env.PERF_STUDENT_USERNAME || 'gate47student'
const STUDENT_PASSWORD = process.env.PERF_STUDENT_PASSWORD || 'Gate47StudentPass!'
const JWT_SECRET = process.env.JWT_SECRET!

async function main() {
  if (!Number.isInteger(TRIAL_COUNT) || TRIAL_COUNT < 1 || TRIAL_COUNT > MAX_TRIALS) {
    throw new Error(
      `F8: E3_TRIAL_COUNT must be 1..${MAX_TRIALS} (engine maxTrials=1000). Got ${TRIAL_COUNT}. >1000 would fail validation with SUBMISSION_PAYLOAD_CONFLICT.`
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
  const configSnapshotEncrypted = createCognitiveSessionConfigSnapshot({
    testType: fake.testType,
    configVersion: fake.configVersion,
    engineVersion: fake.engineVersion,
    scoringVersion: fake.scoringVersion,
    config,
  })
  const snapshot = readCognitiveSessionConfig(configSnapshotEncrypted).snapshot
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
        configSnapshotEncrypted,
        engineVersion: fake.engineVersion,
        scoringVersion: fake.scoringVersion,
        randomSeed: `g47-e3-seed-${runId}-${i}`,
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
    per_request_body_bytes: one,
    studentId: student.id,
  }, null, 2))
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })