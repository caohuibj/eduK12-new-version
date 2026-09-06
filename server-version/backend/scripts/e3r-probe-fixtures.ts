/**
 * E3R same-child concurrent-first-submit probe fixtures (Stage 3R risk probe).
 *
 * Emits a small fixture file per class containing PROBE_COUNT fresh sessions
 * taken from the TAIL of the pool (highest ids). The banded boundary files
 * consume pool slices ordered by id ascending, so the tail is the overflow
 * region the boundary runs never touch - the probe sessions stay fresh until
 * the probe itself submits them, which is the whole point of the concurrent
 * first-submit race.
 *
 * Usage: npx tsx scripts/e3r-probe-fixtures.ts
 *   E3_PROBE_OUT   destination file (default /workspace/eduk12-pr49-cloud-results/e3r-probe-normal.json)
 *   E3_PROBE_COUNT sessions per class (default 3)
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
const OUT = process.env.E3_PROBE_OUT || '/workspace/eduk12-pr49-cloud-results/e3r-probe-normal.json'
const COUNT = Number(process.env.E3_PROBE_COUNT || 3)
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

  // Tail of the pool ordered by id desc = the overflow region bands skip.
  // Only genuinely fresh (IN_PROGRESS) sessions qualify so a consumed probe
  // session can never be re-emitted.
  const rows = await prisma.cognitiveSession.findMany({
    where: { participantKey: { startsWith: 'e3r-nback-' }, status: 'IN_PROGRESS' },
    orderBy: { id: 'desc' },
    take: COUNT,
    select: {
      id: true,
      participantKey: true,
      testType: true,
      randomSeed: true,
      configSnapshotEncrypted: true,
    },
  })
  if (rows.length < COUNT) throw new Error(`not enough fresh nback sessions (got ${rows.length})`)

  const fixtures = rows.map((s) => {
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
    const body = {
      submissionId: s.participantKey.replace(/^e3r-/, 'e3r-'),
      attemptEpoch: 1,
      definitionHash,
      contextSnapshotHash: null,
      trials: buildNbackTrials(s.randomSeed, config),
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
      trialCount: 100,
    }
  })

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ cognitiveNormal: fixtures }))
  console.log(JSON.stringify({
    out: OUT,
    count: fixtures.length,
    sessions: fixtures.map((f) => ({ sessionId: f.sessionId, fixtureId: f.fixtureId })),
  }, null, 2))
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
