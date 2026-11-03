import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Prisma, PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { lockRelationalAdmission } from '../../modules/composite/relational-admission-lock'

/**
 * Concurrency evidence for the relational Composite START admission protocol.
 * Locks are only observable on a real PostgreSQL, so this suite is opt-in via
 * an isolated loopback test database and never falls back to a dev database.
 */
const DB_URL = integrationDatabaseUrl('RELATIONAL_ADMISSION_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL', 'COGNITIVE_INTEGRATION_DB_URL')
const suite = DB_URL ? describe : describe.skip
if (DB_URL) {
  const url = new URL(DB_URL)
  const isolated = ['localhost', '127.0.0.1'].includes(url.hostname)
    && (/test|ci/i.test(url.pathname) || process.env.CI === 'true')
  if (!isolated) throw new Error('relational admission concurrency requires an isolated loopback test database')
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const waitFor = async (probe: () => Promise<boolean>, timeoutMs = 10000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await probe()) return
    await sleep(20)
  }
  throw new Error('condition not observed before timeout')
}

suite('relational admission concurrency on real PostgreSQL', () => {
  let db: PrismaClient
  let service: typeof import('../../modules/composite/composite.service')
  let compositeId = ''
  const prefix = `rel-adm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const studentIds: string[] = []
  const episodeIds: string[] = []
  const POOL = 24
  const dbUrl = DB_URL ? `${DB_URL}${DB_URL.includes('?') ? '&' : '?'}connection_limit=${POOL}` : ''

  const start = (index: number, assignmentRef = randomUUID()) =>
    db.$transaction((tx: any) => service.startRelationalCompositeAttemptInTransaction(tx, {
      compositeAssessmentId: compositeId,
      respondentUserId: studentIds[index],
      attemptIdentity: {
        subjectUserId: studentIds[index],
        respondentUserId: studentIds[index],
        respondentType: 'SELF',
        episodeId: episodeIds[index],
        assignmentRef,
        consentId: null,
      },
    }))

  const compositeOid = async () => {
    const rows = await db.$queryRaw<Array<{ oid: bigint }>>`SELECT 'composite_assessments'::regclass::oid AS oid`
    return Number(rows[0].oid)
  }
  const grantedModes = async (oid: number) =>
    (await db.$queryRaw<Array<{ mode: string }>>`
      SELECT mode FROM pg_locks WHERE relation=${oid}::oid AND granted
    `).map((row) => row.mode)

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: dbUrl } } })
    service = await import('../../modules/composite/composite.service')
    const teacherId = `${prefix}-teacher`
    await db.user.create({ data: {
      id: teacherId, username: `${prefix}-teacher`, passwordHash: 'SYNTHETIC NONLOGIN',
      role: 'TEACHER', teacherApproved: true, accountDomain: 'SCHOOL',
    } })
    const PARTICIPANTS = 26
    for (let i = 0; i < PARTICIPANTS; i += 1) {
      const id = `${prefix}-student-${i}`
      studentIds.push(id)
      await db.user.create({ data: {
        id, username: id, passwordHash: 'SYNTHETIC NONLOGIN',
        role: 'STUDENT', accountDomain: 'SCHOOL',
      } })
    }
    const { compileResearchScale } = await import('../../modules/survey/builder.compiler')
    const { hashScaleDefinition } = await import('../../modules/scale/scale-definition')
    const definition = compileResearchScale('Synthetic relational admission source', {
      schemaVersion: 1, respondentType: 'participant_self_report', aggregation: 'mean',
      responseOptions: [
        { optionKey: 'low', label: 'Low', score: 0 },
        { optionKey: 'high', label: 'High', score: 2 },
      ],
      dimensions: [{ dimensionKey: 'total', label: 'Total', direction: 'descriptive' }],
      items: [{ itemKey: 'item', prompt: 'Synthetic item', required: true, reverse: false, dimensionKeys: ['total'] }],
    })
    const scale = await db.scale.create({ data: {
      code: `${prefix}-scale`, name: 'Synthetic relational source', creatorId: teacherId,
      status: 'PUBLISHED', instrumentClass: 'CUSTOM_DESCRIPTIVE', instrumentVersion: '1',
      definition, definitionHash: hashScaleDefinition(definition),
    } })
    const composite = await db.compositeAssessment.create({ data: {
      code: `${prefix}-composite`, name: 'Synthetic relational delivery', createdBy: teacherId,
      productKind: 'ORGANIZATION_RESOURCE', status: 'DRAFT', maxAttempts: 100,
      items: { create: { type: 'SCALE', position: 0, required: true, scaleId: scale.id } },
    } })
    compositeId = composite.id
    await db.compositeAssessment.update({
      where: { id: compositeId },
      data: { status: 'PUBLISHED', publishedAt: new Date('2026-10-01T00:00:00Z') },
    })
    for (const id of studentIds) {
      const episode = await db.assessmentEpisode.create({ data: {
        subjectUserId: id, initiatedByUserId: id, initiationMode: 'STUDENT_SELF',
      } })
      episodeIds.push(episode.id)
    }
  }, 120000)

  afterAll(async () => {
    if (db) {
      await (await import('../../config/queue')).closeQueues(true)
      await db.$disconnect()
    }
  })

  it('admits distinct participants of the same composite concurrently — every start succeeds', async () => {
    const WAVE = 16
    const t0 = Date.now()
    const results = await Promise.all([...Array(WAVE).keys()].map((i) => start(i)))
    const elapsed = Date.now() - t0
    console.info(`[relational-admission] ${WAVE} concurrent distinct-participant starts completed in ${elapsed}ms`)
    expect(results).toHaveLength(WAVE)
    expect(new Set(results.map((r) => r.id)).size).toBe(WAVE)
    expect(results.every((r) => r.attemptNo === 1)).toBe(true)
    const children = await db.assessment.count({ where: { compositeAttemptId: { in: results.map((r) => r.id) } } })
    expect(children).toBe(WAVE)
  }, 120000)

  it('holds many participant admission locks concurrently while starts overlap', async () => {
    const WAVE = 16
    const identities = [...Array(WAVE).keys()].map((i) => JSON.stringify(['relational-admission-v1', compositeId, `user:${studentIds[i]}`]))
    const concurrentAdvisoryCount = async () => {
      const tuple = Prisma.join(identities.map((id) => Prisma.sql`(${id}, (hashtextextended(${id},0) >> 32) & 4294967295, hashtextextended(${id},0) & 4294967295)`))
      const rows = await db.$queryRaw<Array<{ n: bigint }>>`
        WITH keys(ident, hi, lo) AS (VALUES ${tuple})
        SELECT count(*) AS n FROM pg_locks l JOIN keys k
          ON l.locktype='advisory' AND l.granted AND l.objsubid=1
          AND l.classid::bigint=k.hi AND l.objid::bigint=k.lo`
      return Number(rows[0].n)
    }
    // Each admission holds its participant advisory lock for the whole
    // transaction, so an unserialized admission protocol must show many of
    // them granted at the same time. A lock taken per composite (the previous
    // FOR UPDATE) lets at most one admission proceed at a time.
    let peak = 0
    let running = true
    const sampler = (async () => {
      while (running) {
        peak = Math.max(peak, await concurrentAdvisoryCount())
        await sleep(5)
      }
    })()
    await Promise.all([...Array(WAVE).keys()].map((i) => start(i)))
    running = false
    await sampler
    console.info(`[relational-admission] peak concurrently held admission locks: ${peak}/${WAVE}`)
    expect(peak).toBeGreaterThanOrEqual(8)
  }, 120000)

  it('serializes one participant across concurrent distinct assignmentRefs', async () => {
    const [a, b] = await Promise.all([start(24), start(24)])
    expect(new Set([a.id, b.id]).size).toBe(2)
    expect([a.attemptNo, b.attemptNo].sort()).toEqual([1, 2])
  }, 60000)

  it('replays the same assignmentRef to the single original attempt', async () => {
    const assignmentRef = randomUUID()
    const results = await Promise.all([1, 2, 3].map(() => start(25, assignmentRef)))
    expect(new Set(results.map((r) => r.id)).size).toBe(1)
    expect(await db.compositeAssessmentAttempt.count({ where: { assignmentRef } })).toBe(1)
  }, 60000)

  it('a publication mutation waits for an in-flight admission holding the shared lock', async () => {
    const oid = await compositeOid()
    let releaseAdmission!: () => void
    const admission = db.$transaction(async (tx) => {
      await lockRelationalAdmission(tx, compositeId, 'user:mutation-gate')
      await new Promise<void>((resolve) => { releaseAdmission = resolve })
    })
    await waitFor(async () => (await grantedModes(oid)).includes('RowShareLock'))
    let mutationDone = false
    const mutation = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM composite_assessments WHERE id=${compositeId} FOR UPDATE`
      await tx.$executeRaw`UPDATE composite_assessments SET revision=revision+1 WHERE id=${compositeId}`
      mutationDone = true
    })
    await sleep(400)
    expect(mutationDone).toBe(false)
    releaseAdmission()
    await Promise.all([admission, mutation])
    expect(mutationDone).toBe(true)
  }, 60000)
})
