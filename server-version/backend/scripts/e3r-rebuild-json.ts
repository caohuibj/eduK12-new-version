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
import { createWriteStream, mkdirSync } from 'node:fs'
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

  const sessions = await prisma.cognitiveSession.findMany({
    where: { participantKey: { startsWith: 'e3r-' } },
    orderBy: { participantKey: 'asc' },
  })
  console.log(`loaded ${sessions.length} sessions from DB`)
  if (sessions.length === 0) throw new Error('no e3r sessions found')

  // Rebuild config per session from its encrypted snapshot (definitionHash + trialCount).
  const configOf = new Map<string, Record<string, unknown>>()
  const defHashOf = new Map<string, string>()
  for (const s of sessions) {
    try {
      const { snapshot } = readCognitiveSessionConfig(s.configSnapshotEncrypted)
      if (snapshot) {
        configOf.set(s.id, snapshot.config as Record<string, unknown>)
        defHashOf.set(s.id, snapshot.configHash)
      }
    } catch (err) {
      console.warn(`snapshot read failed for ${s.participantKey}: ${(err as Error).message}`)
    }
  }

  const grouped: Record<string, unknown[]> = {}
  for (const s of sessions) {
    const config = configOf.get(s.id) ?? {}
    const key = s.testType === 'nback'
      ? 'cognitiveNormal'
      : s.testType === 'cpt'
        ? 'cognitiveLarge'
        : `cognitiveSize_${(config.trialCount as number) ?? 300}`
    // Stage 3R boundary confirmation only needs the two product classes; the
    // fake size ladder stays in the DB and can be re-emitted later (Stage 4).
    if (process.env.E3_INCLUDE_SIZE !== '1' && key.startsWith('cognitiveSize_')) continue
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(s)
  }
  console.log('group distribution:', Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length])))

  mkdirSync(dirname(OUT), { recursive: true })

  const buildFixture = (s: (typeof sessions)[number]) => {
    const match = /^e3r-(nback|cpt|fake)-[0-9a-f]{8}-(\d+)$/.exec(s.participantKey)
    const testType = (match ? match[1] : s.testType) as 'nback' | 'cpt' | 'fake'
    const config = configOf.get(s.id)
    const trialCount = testType === 'nback' ? 100 : testType === 'cpt' ? 180 : (config?.trialCount as number) ?? 300
    const build = testType === 'nback' ? buildNbackTrials : testType === 'cpt' ? buildCptTrials : (seed: string) => buildFakeTrials(seed, trialCount)
    const body = {
      submissionId: s.participantKey.replace(/^e3r-/, 'e3r-'),
      attemptEpoch: 1,
      definitionHash: defHashOf.get(s.id) ?? null,
      contextSnapshotHash: null,
      trials: build(s.randomSeed, config ?? {}),
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

  const writeBand = async (filePath: string, key: string, fixtures: unknown[]) => {
    const ws = createWriteStream(filePath)
    const write = (chunk: string) => new Promise<void>((resolve, reject) => ws.write(chunk, (err) => (err ? reject(err) : resolve())))
    await write(`{\n"${key}":[`)
    for (let i = 0; i < fixtures.length; i += 1) {
      if (i > 0) await write(',')
      await write(JSON.stringify(fixtures[i]))
      if ((i + 1) % 500 === 0) console.log(`  ${filePath}: ${i + 1}/${fixtures.length}`)
    }
    await write(']\n}\n')
    await new Promise<void>((resolve, reject) => ws.end((err) => (err ? reject(err) : resolve())))
    console.log(`wrote ${filePath} (${fixtures.length})`)
  }

  // Emit per-run bands so each of the 3 runs at a rate point uses a fresh,
  // disjoint slice of the pool (no FIXTURE_OFFSET collisions, no 600MB parse).
  const bandSize = (total: number, bands: number) => Math.ceil(total / bands)
  for (const [key, list] of Object.entries(grouped)) {
    const fixtures = list.map(buildFixture)
    const bands = key.startsWith('cognitiveSize_') ? 1 : 3
    const size = bandSize(fixtures.length, bands)
    for (let b = 0; b < bands; b += 1) {
      const slice = fixtures.slice(b * size, (b + 1) * size)
      if (!slice.length) continue
      const suffix = bands === 1 ? '' : `-band${b + 1}`
      await writeBand(OUT.replace(/\.json$/, `${suffix}.json`), key, slice)
    }
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
