import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl, isActionsServiceDatabase } from '../integration/integration-env'
import example from '../../modules/situational/authoring/examples/teacher-demonstration.json'
import { captureFixture } from './vnext-capture-fixture'
import { compileSjtTemplate } from '../../modules/situational/authoring/template'
import { readSjtWorkbook } from '../../modules/situational/authoring/workbook'
const url = integrationDatabaseUrl('SJT_UPLOAD_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
suite('SJT upload real PostgreSQL governance and frozen FINAL', () => {
  let db: PrismaClient,
    service: typeof import('../../modules/situational/authoring/service'),
    runtime: typeof import('../../modules/situational/situational-runtime.service'),
    final: typeof import('../../modules/situational/situational-final-submit.service')
  let author: string, reviewer: string, other: string, student: string
  const keys: string[] = [],
    ids: string[] = [],
    attempts: string[] = []
  beforeAll(async () => {
    const localSyntheticDatabase =
      url?.startsWith('postgresql://situational_test:') &&
      url.includes('@127.0.0.1:' + (process.env.SJT_UPLOAD_TEST_PORT || '55473') + '/situational_vnext')
    // Actions supplies the exact current job's disposable service ID. Host type
    // does not grant access to a developer or production database.
    if (!localSyntheticDatabase && !isActionsServiceDatabase(url!))
      throw new Error('Dedicated synthetic database required')
    process.env.DATABASE_URL = url!
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    db = new PrismaClient({ datasources: { db: { url } } })
    await db.$connect()
    vi.doMock('../../config/database', () => ({ prisma: db }))
    service = await import('../../modules/situational/authoring/service')
    runtime = await import('../../modules/situational/situational-runtime.service')
    final = await import('../../modules/situational/situational-final-submit.service')
    async function user(role: 'TEACHER' | 'ADMIN' | 'STUDENT') {
      const id = randomUUID()
      await db.user.create({
        data: {
          id,
          username: `synthetic-sjt-${id}`,
          passwordHash: 'not-login',
          role,
          teacherApproved: true,
        },
      })
      return id
    }
    author = await user('TEACHER')
    reviewer = await user('ADMIN')
    other = await user('TEACHER')
    student = await user('STUDENT')
  }, 120000)
  afterAll(async () => {
    if (db) {
      await db.situationalAttempt.deleteMany({ where: { id: { in: attempts } } })
      await db.sjtAuthorRelease.deleteMany({ where: { instrumentKey: { in: keys } } })
      await db.sjtAuthorAudit.deleteMany({ where: { draftId: { in: ids } } })
      await db.sjtAuthorDraft.deleteMany({ where: { id: { in: ids } } })
      await db.user.deleteMany({
        where: { id: { in: [author, reviewer, other, student].filter(Boolean) } },
      })
      await db.$disconnect()
    }
  }, 60000)
  const a = () => ({ userId: author, admin: false }),
    r = () => ({ userId: reviewer, admin: true })
  async function draft() {
    const t = await readSjtWorkbook(readFileSync('assets/sjt-upload-example-v1.xlsx')) as typeof example
    expect(compileSjtTemplate(t).contentDigest).toBe(compileSjtTemplate(example).contentDigest)
    t.instrumentKey = `synthetic-sjt-${randomUUID()}`
    keys.push(t.instrumentKey)
    const d = await service.createSjtDraft(a(), t)
    ids.push(d.id)
    return d
  }
  it('isolates drafts and does not admit before independent publication', async () => {
    const d = await draft(),
      t = d.template as typeof example
    await expect(service.getSjtDraft({ userId: other, admin: false }, d.id)).rejects.toMatchObject({
      statusCode: 403,
    })
    await expect(
      runtime.startSituationalAttempt(author, { instrumentKey: t.instrumentKey }),
    ).rejects.toMatchObject({ statusCode: 404 })
    await service.requestSjtReview(a(), d.id, d.revision, d.contentDigest)
    await expect(
      service.reviewSjtDraft(
        { userId: author, admin: true },
        d.id,
        d.revision,
        d.contentDigest,
        true,
        'synthetic only',
      ),
    ).rejects.toMatchObject({ statusCode: 403 })
    await expect(
      service.reviewSjtDraft(r(), d.id, d.revision, 'f'.repeat(64), true, 'synthetic only'),
    ).rejects.toMatchObject({ statusCode: 409 })
    await service.reviewSjtDraft(
      r(),
      d.id,
      d.revision,
      d.contentDigest,
      true,
      'synthetic independent release',
    )
    await expect(
      runtime.startSituationalAttempt(student, { instrumentKey: t.instrumentKey }),
    ).rejects.toMatchObject({ statusCode: 403 })
    const start = await runtime.startSituationalAttempt(author, { instrumentKey: t.instrumentKey })
    attempts.push(start.attemptId)
    expect(start.instrument.scientificContext).toMatchObject({
      scientificMaturity: 'PILOT',
      provenance: 'FROZEN',
    })
    expect(
      runtime
        .listSituationalInstruments(await service.availableSjtPackages())
        .some((p) => p.key === t.instrumentKey && p.scienceMaturity === 'PILOT'),
    ).toBe(true)
    const source = compileSjtTemplate(t).package.definition
    if (source.schemaVersion !== 2) throw new Error('V2 required')
    const capture = captureFixture(source, start.attemptId)
    const payload = {
      attemptId: start.attemptId,
      userId: author,
      submissionId: randomUUID(),
      attemptEpoch: start.attempt.attemptEpoch,
      definitionHash: start.attempt.definitionHash,
      compiledRuntimeHash: start.attempt.compiledRuntimeHash,
      scoringVersion: start.attempt.scoringVersion,
      responses: capture.responses,
      researchCapture: capture.capture,
    }
    const [one, two] = await Promise.all([
      final.submitSituationalAttemptFinal(payload),
      final.submitSituationalAttemptFinal(payload),
    ])
    expect(one.result?.metrics.find((m) => m.key === 'E')?.value).toBe(3)
    expect(two.result).toEqual(one.result)
    expect(one.result?.narrative?.paragraphs.join()).toContain('最初')
    expect(await db.situationalRawSubmission.count({ where: { attemptId: start.attemptId } })).toBe(
      1,
    )
    await expect(runtime.getSituationalAttemptResult(start.attemptId, other)).rejects.toMatchObject(
      { statusCode: 403 },
    )
    await expect(service.reviseSjtDraft(a(), d.id, d.revision, t)).rejects.toMatchObject({
      statusCode: 409,
    })
    const again = await runtime.getSituationalAttemptResult(start.attemptId, author)
    expect(again.result).toEqual(one.result)
    expect(start.instrument.report).not.toHaveProperty('narrative')
    expect(one.result?.metrics.every((m) => !('contributions' in m))).toBe(true)
    const pending = await runtime.startSituationalAttempt(author, {
      instrumentKey: t.instrumentKey,
    })
    attempts.push(pending.attemptId)
    await service.retireSjtRelease(r(), d.id, 'synthetic retirement')
    expect((await runtime.resumeSituationalAttempt(pending.attemptId, author)).attempt.status).toBe(
      'IN_PROGRESS',
    )
    await expect(
      runtime.startSituationalAttempt(author, { instrumentKey: t.instrumentKey }),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect((await runtime.getSituationalAttemptResult(start.attemptId, author)).result).toEqual(
      one.result,
    )
  }, 60000)
  it('serializes new admission behind retirement rather than a stale catalog', async () => {
    const d = await draft(),
      t = d.template as typeof example
    await service.requestSjtReview(a(), d.id, 1, d.contentDigest)
    await service.reviewSjtDraft(r(), d.id, 1, d.contentDigest, true, 'synthetic race')
    let releaseGate!: () => void, locked!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    const ready = new Promise<void>((resolve) => {
      locked = resolve
    })
    const retirement = db.$transaction(
      async (tx) => {
        await tx.sjtAuthorRelease.update({
          where: { sourceDraftId: d.id },
          data: { status: 'RETIRED' },
        })
        locked()
        await gate
      },
      { timeout: 20000 },
    )
    await ready
    const starting = runtime
      .startSituationalAttempt(other, { instrumentKey: t.instrumentKey })
      .then(
        (value) => {
          attempts.push(value.attemptId)
          return { value, error: null }
        },
        (error) => ({ value: null, error }),
      )
    let blocked = false
    try {
      const deadline = Date.now() + 15000
      while (!blocked && Date.now() < deadline) {
        const state = await db.$queryRaw<
          Array<{ blocked: boolean }>
        >`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%sjt_author_releases%' AND query LIKE '%FOR SHARE%') AS blocked`
        blocked = state[0]?.blocked === true
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20))
      }
    } finally {
      releaseGate()
      await retirement
    }
    expect(blocked).toBe(true)
    expect((await starting).error).toMatchObject({ statusCode: 404 })
    expect(await db.situationalAttempt.count({ where: { instrumentKey: t.instrumentKey } })).toBe(0)
  }, 60000)
  it('invalidates pending review on revisions and rejects concurrent stale saves', async () => {
    const d = await draft()
    await service.requestSjtReview(a(), d.id, d.revision, d.contentDigest)
    const t = structuredClone(d.template) as typeof example
    t.title = '修订后的标题'
    const next = await service.reviseSjtDraft(a(), d.id, d.revision, t)
    expect(next.status).toBe('DRAFT')
    expect(next.revision).toBe(2)
    await expect(
      service.reviewSjtDraft(r(), d.id, 1, d.contentDigest, true, 'stale'),
    ).rejects.toMatchObject({ statusCode: 409 })
    const writes = await Promise.allSettled([
      service.reviseSjtDraft(a(), d.id, 2, t),
      service.reviseSjtDraft(a(), d.id, 2, t),
    ])
    expect(writes.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    const restored = await service.restoreSjtRevision(a(), d.id, 3, 1)
    expect(restored.revision).toBe(4)
    expect(restored.contentDigest).toBe(d.contentDigest)
    expect((await service.getSjtDraft(a(), d.id)).audits[0]?.action).toBe('RESTORE')
  }, 60000)
  it('rejects duplicate immutable versions and inadequate coverage', async () => {
    const d = await draft(),
      t = d.template as typeof example
    await service.requestSjtReview(a(), d.id, 1, d.contentDigest)
    await service.reviewSjtDraft(r(), d.id, 1, d.contentDigest, true, 'synthetic only')
    const duplicate = await service.createSjtDraft(a(), t)
    ids.push(duplicate.id)
    await service.requestSjtReview(a(), duplicate.id, 1, duplicate.contentDigest)
    await expect(
      service.reviewSjtDraft(r(), duplicate.id, 1, duplicate.contentDigest, true, 'duplicate'),
    ).rejects.toMatchObject({ statusCode: 409 })
    const bad = structuredClone(t)
    bad.instrumentVersion = '1.0.1'
    bad.cases = bad.cases.slice(0, 1)
    const thin = await service.createSjtDraft(a(), bad)
    ids.push(thin.id)
    await expect(service.requestSjtReview(a(), thin.id, 1, thin.contentDigest)).rejects.toThrow(
      '模板',
    )
  }, 60000)
})
