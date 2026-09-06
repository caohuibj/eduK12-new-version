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
// Participant-key prefix of the pool to rebuild. Stage 3R pools use 'e3r-';
// Stage 4 capacity-curve pools use 'e3s4-' so the two never mix.
const PREFIX = process.env.E3_PREFIX || 'e3r-'
// Stage selects the band plan: '3r' = 9 boundary bands per class (x3 reps),
// '4' = 11 capacity-curve bands per class (single run per rate, 25..175 step 15).
const STAGE = process.env.E3_STAGE || '3r'
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
        // Only genuinely fresh sessions qualify: a consumed (COMPLETED) session
        // would re-emit a fixture that the backend answers with replayed:true,
        // which the harness fail-closes as first-attempt replay. This keeps
        // re-runs of the rebuild deterministic for untouched pools.
        where: { participantKey: { startsWith: prefix }, status: 'IN_PROGRESS' },
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
    const match = new RegExp(`^${PREFIX}(nback|cpt|fake)-[0-9a-f]{8}-(\\d+)$`).exec(s.participantKey)
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
      submissionId: s.participantKey,
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

  // Band plans. Each run consumes warmup(5/s×10s=50; cap 75 with 1.5x slack) +
  // steady(rate×30s), plus +50 headroom per band to absorb k6 arrival pacing.
  // Stage 3R: 9 boundary runs per class (rate x3 reps).
  //   NORMAL: 70→2200, 85→2650, 100→3100 per run; LARGE: 40→1300, 55→1750, 70→2200.
  // Stage 4: 11 capacity-curve runs per class, single run per rate (25..175
  // step 15); size = 75 + rate*30 + 50 rounded up to the next 25.
  type Band = { rate: number; size: number }
  const PLAN_3R: Record<string, Band[]> = {
    cognitiveNormal: [
      { rate: 70, size: 2200 }, { rate: 70, size: 2200 }, { rate: 70, size: 2200 },
      { rate: 85, size: 2650 }, { rate: 85, size: 2650 }, { rate: 85, size: 2650 },
      { rate: 100, size: 3100 }, { rate: 100, size: 3100 }, { rate: 100, size: 3100 },
    ],
    cognitiveLarge: [
      { rate: 40, size: 1300 }, { rate: 40, size: 1300 }, { rate: 40, size: 1300 },
      { rate: 55, size: 1750 }, { rate: 55, size: 1750 }, { rate: 55, size: 1750 },
      { rate: 70, size: 2200 }, { rate: 70, size: 2200 }, { rate: 70, size: 2200 },
    ],
  }
  const S4_RATES = [25, 40, 55, 70, 85, 100, 115, 130, 145, 160, 175]
  const PLAN_4: Record<string, Band[]> = {
    cognitiveNormal: S4_RATES.map((rate) => ({ rate, size: Math.ceil((75 + rate * 30 + 50) / 25) * 25 })),
    cognitiveLarge: S4_RATES.map((rate) => ({ rate, size: Math.ceil((75 + rate * 30 + 50) / 25) * 25 })),
  }
  const bandPlan = STAGE === '4' ? PLAN_4 : PLAN_3R
  const fileBase = STAGE === '4' ? 'e3s4-cognitive-class-fixtures' : 'e3r-cognitive-class-fixtures'

  async function emitClass(key: string, prefix: string, plan: Band[]) {
    let bandIdx = 0
    let filled = 0
    let fixtures: ReturnType<typeof buildFixture>[] = []
    const flush = () => {
      if (!fixtures.length) return
      const rate = plan[bandIdx] ? plan[bandIdx].rate : null
      const tag = rate !== null ? `-${rate}s-r${bandIdx + 1}` : `-band${bandIdx + 1}`
      const filePath = OUT.replace(/\.json$/, `${tag}.json`).replace(/e3r-cognitive-class-fixtures/, fileBase)
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
        const cap = plan[bandIdx].size
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

  // Stage 4 capacity-curve: a single run happens at each rate, and the runner
  // reads ONE per-rate file and selects the group via GROUP (cognitiveNormal /
  // cognitiveLarge). So each band file must carry BOTH groups sliced to the
  // same size (PLAN_4 sizes are equal for normal and large at each rate). We
  // replay the two pools in lockstep (nback first, then cpt) so neither class
  // ever reads the other's fresh slice.
  async function emitS4() {
    const normalGen = sessionsByPrefix(`${PREFIX}nback-`)
    const largeGen = sessionsByPrefix(`${PREFIX}cpt-`)
    let nBuf: Row[] = []
    let lBuf: Row[] = []
    let nIdx = 0
    let lIdx = 0
    const pull = async (gen: AsyncGenerator<Row[]>, buf: Row[], idx: number) => {
      while (idx >= buf.length) {
        const b = await gen.next()
        if (b.done) return null
        buf = b.value
        idx = 0
      }
      return { s: buf[idx], buf, idx: idx + 1 }
    }
    for (const { rate, size } of PLAN_4.cognitiveNormal) {
      let nn = 0
      let nl = 0
      const nSl: ReturnType<typeof buildFixture>[] = []
      const lSl: ReturnType<typeof buildFixture>[] = []
      for (; nn < size; nn += 1) {
        const r = await pull(normalGen, nBuf, nIdx)
        if (!r) break
        nBuf = r.buf
        nIdx = r.idx
        nSl.push(buildFixture(r.s))
      }
      for (; nl < size; nl += 1) {
        const r = await pull(largeGen, lBuf, lIdx)
        if (!r) break
        lBuf = r.buf
        lIdx = r.idx
        lSl.push(buildFixture(r.s))
      }
      const filePath = OUT.replace(/\.json$/, `-${rate}s-r1.json`).replace(/e3r-cognitive-class-fixtures/, 'e3s4-cognitive-class-fixtures')
      writeFileSync(filePath, JSON.stringify({ cognitiveNormal: nSl, cognitiveLarge: lSl }))
      console.log(`s4 wrote ${filePath} normal=${nSl.length} large=${lSl.length}`)
    }
  }

  if (STAGE === '4') {
    await emitS4()
    return
  }
  await emitClass('cognitiveNormal', `${PREFIX}nback-`, bandPlan.cognitiveNormal)
  // E3_ONLY_NORMAL=1: nback bands only (cpt/fake pools untouched since last
  // rebuild, so their band files remain valid).
  if (process.env.E3_ONLY_NORMAL === '1') {
    console.log('E3_ONLY_NORMAL=1: cognitiveLarge bands left as-is')
  } else {
    await emitClass('cognitiveLarge', `${PREFIX}cpt-`, bandPlan.cognitiveLarge)
  }
  // Size ladder (fake) is only needed for Stage 4's size dimension; it uses the
  // Stage 3R pool (e3r-fake-) and is kept out of the rate-curve bands.
  if (process.env.E3_INCLUDE_SIZE === '1') {
    await emitClass('cognitiveSize', `${PREFIX}fake-`, [{ rate: 0, size: 1600 }])
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(async () => {
    await prisma.$disconnect()
    // Forced exit: tsx/ESM can leak Prisma handles that keep the event loop
    // alive after $disconnect, hanging callers that wait on this subprocess.
    process.exit(process.exitCode || 0)
  })
