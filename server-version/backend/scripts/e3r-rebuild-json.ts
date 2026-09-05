/**
 * E3R fixture JSON rebuild (Stage 3R).
 *
 * Reads the CURRENT cognitive_sessions fixture pool from the database and
 * re-emits the grouped fixture JSON consumed by perf/gate-e/k6-e3-cognitive-*.js.
 * This guarantees the JSON session IDs always match the live DB rows, and it
 * streams the file to disk so the 248MB payload never hits V8's single-string
 * limit (the crash that broke the original seeder's JSON write).
 *
 * Deterministic: trials are rebuilt from session.randomSeed via the same
 * buildNbackTrials/buildCptTrials/buildFakeTrials logic as the seeder, and
 * definitionHash is re-read from the stored encrypted snapshot.
 */
import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { readCognitiveSessionConfig } from '../src/modules/cognitive/session.service'
import { createTrialEnvelope } from '../src/modules/cognitive/v2/trial-envelope'
import { nbackSequence, cptSequence } from '../src/modules/cognitive/randomization'

const prisma = new PrismaClient()
const OUT = process.env.E3_CLASS_OUT || '/workspace/eduk12-pr49-cloud-results/e3r-cognitive-class-fixtures.json'
const STUDENT_USERNAME = process.env.PERF_STUDENT_USERNAME || 'gate47student'
const STUDENT_PASSWORD = process.env.PERF_STUDENT_PASSWORD || 'Gate47StudentPass!'
const JWT_SECRET = process.env.JWT_SECRET!

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
  let student = await prisma.user.findUnique({ where: { username: STUDENT_USERNAME } })
  if (!student) {
    student = await prisma.user.create({
      data: {
        username: STUDENT_USERNAME,
        passwordHash: await bcrypt.hash(STUDENT_PASSWORD, 10),
        role: 'STUDENT',
        nickname: STUDENT_USERNAME,
        isActive: true,
        mustChangePassword: false,
        teacherApproved: true,
      },
    })
  }
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

  mkdirSync(dirname(OUT), { recursive: true })

  // Stream the pool per class prefix with cursor pagination so the 41,600-row
  // pool never materialises fully in memory (the OOM that killed the bulk
  // findMany). Only the fields the fixture needs are selected.
  interface Row {
    id: string
    participantKey: string
    testType: string
    randomSeed: string
    configSnapshotEncrypted: string
  }
  const BATCH = 400
  async function* sessionsByPrefix(prefix: string): AsyncGenerator<Row[]> {
    let cursor: string | undefined
    for (;;) {
      const batch = await prisma.cognitiveSession.findMany({
        where: { participantKey: { startsWith: prefix } },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          participantKey: true,
          testType: true,
          randomSeed: true,
          configSnapshotEncrypted: true,
        },
      })
      if (!batch.length) return
      yield batch
      cursor = batch[batch.length - 1].id
    }
  }

  const buildFixture = (s: Row) => {
    const match = /^e3r-(nback|cpt|fake)-[0-9a-f]{8}-(\d+)$/.exec(s.participantKey)
    const testType = (match ? match[1] : s.testType) as 'nback' | 'cpt' | 'fake'
    let config: Record<string, unknown> = {}
    let definitionHash: string | null = null
    try {
      const { snapshot } = readCognitiveSessionConfig(s.configSnapshotEncrypted)
      if (snapshot) {
        config = snapshot.config as Record<string, unknown>
        definitionHash = snapshot.configHash
      }
    } catch (err) {
      console.warn(`snapshot read failed for ${s.participantKey}: ${(err as Error).message}`)
    }
    const trialCount = testType === 'nback' ? 100 : testType === 'cpt' ? 180 : (config.trialCount as number) ?? 300
    const build = testType === 'nback' ? buildNbackTrials : testType === 'cpt' ? buildCptTrials : (seed: string) => buildFakeTrials(seed, trialCount)
    const body = {
      submissionId: s.participantKey.replace(/^e3r-/, 'e3r-'),
      attemptEpoch: 1,
      definitionHash,
      contextSnapshotHash: null,
      trials: build(s.randomSeed, config),
    }
    return {
      fixtureId: s.participantKey,
      sessionId: s.id,
      instrument: 'cognitive',
      parentKey: s.participantKey,
      method: 'POST',
      path: `/api/cognitive/sessions/${s.id}/submit`,
      headers,
      body,
      payloadBytes: JSON.stringify(body).length,
      trialCount,
    }
  }

  // Emit per-run band files so each of the 9 boundary runs per class uses a
  // fresh, disjoint slice of the pool (no FIXTURE_OFFSET collisions, no 600MB
  // parse). Each run consumes warmup(5/s×10s=50) + steady(rate×30s), with +50
  // headroom per band to absorb k6 arrival-pacing slack:
  // NORMAL: 70→2200, 85→2650, 100→3100 per run; LARGE: 40→1300, 55→1750, 70→2200.
  const bandPlan: Record<string, number[]> = {
    cognitiveNormal: [2200, 2200, 2200, 2650, 2650, 2650, 3100, 3100, 3100],
    cognitiveLarge: [1300, 1300, 1300, 1750, 1750, 1750, 2200, 2200, 2200],
  }
  const rateOf = (key: string, bandIdx: number) => {
    if (key === 'cognitiveNormal') return [70, 70, 70, 85, 85, 85, 100, 100, 100][bandIdx]
    if (key === 'cognitiveLarge') return [40, 40, 40, 55, 55, 55, 70, 70, 70][bandIdx]
    return null
  }
  async function emitClass(key: string, prefix: string, plan: number[]) {
    let bandIdx = 0
    let filled = 0
    let fixtures: ReturnType<typeof buildFixture>[] = []
    const flush = () => {
      if (!fixtures.length) return
      const rate = rateOf(key, bandIdx)
      const tag = rate !== null ? `-${rate}s-r${bandIdx + 1}` : `-band${bandIdx + 1}`
      const filePath = OUT.replace(/\.json$/, `${tag}.json`)
      writeFileSync(filePath, JSON.stringify({ [key]: fixtures }))
      console.log(`wrote ${filePath} (${fixtures.length})`)
      fixtures = []
    }
    let total = 0
    let overflow = 0
    for await (const batch of sessionsByPrefix(prefix)) {
      for (const s of batch) {
        if (bandIdx >= plan.length) { overflow += 1; continue }
        fixtures.push(buildFixture(s))
        filled += 1
        total += 1
        const cap = plan[bandIdx]
        if (filled >= cap) {
          flush()
          bandIdx += 1
          filled = 0
        }
      }
    }
    flush()
    console.log(`${key}: emitted ${total} fixtures across ${bandIdx} bands (pool overflow skipped: ${overflow})`)
  }
  await emitClass('cognitiveNormal', 'e3r-nback-', bandPlan.cognitiveNormal)
  await emitClass('cognitiveLarge', 'e3r-cpt-', bandPlan.cognitiveLarge)
  // Size ladder (fake) is only needed for Stage 4; keep it out of Stage 3R bands.
  if (process.env.E3_INCLUDE_SIZE === '1') {
    await emitClass('cognitiveSize', 'e3r-fake-', [1600])
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
