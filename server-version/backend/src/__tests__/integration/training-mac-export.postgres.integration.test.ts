import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { courseCatalogPage } from '../../modules/training-catalog/course'
import { updateCatalogTags } from '../../modules/training-catalog/tags'

// This file requires the candidate's real migrated schema and a disposable Redis.
// No database/queue/authorization/reader/serializer is mocked. Only the Express
// transport is captured; authenticate and the actual handlers run in sequence.
const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
const response = () => {
  const res = { statusCode: 200, body: undefined as any, downloaded: undefined as string | undefined,
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
    download(file: string) { this.downloaded = file; return this },
  }
  return res
}

suite('Training Mac migrated PostgreSQL catalog and course export qualification', () => {
  const users: string[] = [], courses: string[] = [], composites: string[] = []
  const questionnaires: string[] = [], scales: string[] = [], cognitive: string[] = [], configs: string[] = [], batches: string[] = []
  let teacher: string, other: string, learner: string, courseA: string, courseB: string, assessment: string
  let fixtureStarted = false
  let root: string, token: string, attemptA: string, attemptB: string, attemptUnbound: string
  let queues: typeof import('../../config/queue') | undefined
  let processor: typeof import('../../workers/exportProcessor') | undefined
  let controller: typeof import('../../modules/composite/composite-export.controller')
  let http: typeof import('../../services/assessmentExportHttp')
  let auth: typeof import('../../middleware/auth')
  let jwt: typeof import('../../utils/jwt')
  const previousExportDir = process.env.EXPORT_DIR

  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    // This suite pauses a queue and starts its real consumer. Loopback alone is
    // not isolation: admit only the runtime-created Actions service and DB 15.
    const run = process.env.GITHUB_RUN_ID ?? '', attempt = process.env.GITHUB_RUN_ATTEMPT ?? ''
    const name = process.env.TRAINING_MAC_FIXTURE_REDIS_NAME ?? ''
    const container = process.env.TRAINING_MAC_FIXTURE_REDIS_ID ?? ''
    const image = process.env.TRAINING_MAC_FIXTURE_REDIS_IMAGE_DIGEST ?? ''
    if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.NODE_ENV !== 'test'
      || process.env.TRAINING_MAC_FIXTURE_CONTRACT !== 'actions-isolated-v1'
      || !/^[1-9][0-9]*$/.test(run) || !/^[1-9][0-9]*$/.test(attempt)
      || name !== `training-mac-redis-${run}-${attempt}` || !/^[a-f0-9]{64}$/.test(container)
      || !/^sha256:[a-f0-9]{64}$/.test(image) || process.env.REDIS_URL !== 'redis://127.0.0.1:6379/15') {
      throw new Error('runtime-created Actions Redis identity and reserved fixture DB required')
    }
    // Runtime writes this expiring marker into that exact fresh container/DB.
    // Read it before importing Bull, creating fixtures, or mutating any queue.
    const { createClient } = await import('redis')
    const probe = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 3000, reconnectStrategy: false } })
    probe.on('error', () => undefined)
    try {
      await probe.connect()
      expect(await probe.get(`training-mac:qualification:${run}:${attempt}`)).toBe(`${name}:${container}:${image}`)
    } finally { if (probe.isOpen) await probe.disconnect() }
    fixtureStarted = true
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'training-mac-export-'))
    process.env.EXPORT_DIR = root
    await prisma.$connect()
    for (const role of ['TEACHER', 'TEACHER', 'STUDENT'] as const) {
      const user = await prisma.user.create({ data: { username: `mac-fixture-${randomUUID()}`, nickname: 'SYNTHETIC_PRIVATE_NAME', passwordHash: 'synthetic-not-a-login', role, accountDomain: 'TRAINING' } })
      users.push(user.id)
    }
    ;[teacher, other, learner] = users
    for (const title of ['A', 'B']) {
      const course = await prisma.course.create({ data: { title: `Synthetic ${title}`, courseCode: randomUUID(), creatorId: teacher, courseType: 'TRAINING_COURSE' } })
      courses.push(course.id)
      await prisma.courseStudent.create({ data: { courseId: course.id, studentId: learner, status: 'APPROVED' } })
    }
    ;[courseA, courseB] = courses
    const composite = await prisma.compositeAssessment.create({ data: { code: randomUUID(), name: 'Same learner two-course export', createdBy: teacher,
      productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', status: 'PUBLISHED', questionnaireCourses: { create: courses.map(courseId => ({ courseId })) } } })
    assessment = composite.id; composites.push(assessment)
    const attempts: string[] = []
    for (const [index, deliveryCourseId] of [courseA, courseB, null].entries()) {
      const attempt = await prisma.compositeAssessmentAttempt.create({ data: { compositeAssessmentId: assessment, userId: learner,
        participantKey: `user:${learner}`, anonymousCode: `SYNTHETIC_ANON_${index}`, attemptNo: index + 1, deliveryCourseId,
        status: 'COMPLETED', completedAt: new Date('2026-10-01T00:00:00Z') } })
      attempts.push(attempt.id)
    }
    ;[attemptA, attemptB, attemptUnbound] = attempts
    queues = await import('../../config/queue')
    await queues.exportQueue.pause()
    controller = await import('../../modules/composite/composite-export.controller')
    http = await import('../../services/assessmentExportHttp')
    auth = await import('../../middleware/auth')
    jwt = await import('../../utils/jwt')
    token = jwt.generateToken({ userId: teacher, username: 'synthetic-teacher', role: 'TEACHER', tokenVersion: 0, accountDomain: 'TRAINING' })
    processor = await import('../../workers/exportProcessor')
    processor.stopExportProcessingRecovery()
  }, 30000)

  afterAll(async () => {
    if (!fixtureStarted) return
    const failures: string[] = []
    const clean = async (label: string, action: () => Promise<unknown>) => {
      try { await action() } catch (error) { failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`) }
    }
    try {
      processor?.stopExportProcessingRecovery()
      if (queues) {
        await clean('pause fixture queue', () => queues!.exportQueue.pause())
        if (processor) await clean('stop fixture subprocesses', async () => {
          const { cancelActiveWorkerSubprocesses } = await import('../../workers/workerSubprocessRegistry')
          const stopped = await cancelActiveWorkerSubprocesses(3000)
          if (stopped.remaining !== 0) throw new Error('fixture subprocess remained active')
        })
        await clean('drain fixture processor callbacks', () => queues!.exportQueue.pause(true))
        // Every removal is attempted; one failure must not skip other cleanup.
        await Promise.allSettled(batches.map(id => clean(`remove fixture job ${id}`, async () => {
          const job = await queues!.exportQueue.getJob(`export-${id}`)
          if (job) await job.remove()
        })))
      }
      // Preserve FK order but retain failures rather than abandoning later rows.
      await clean('artifacts', () => prisma.exportArtifact.deleteMany({ where: { batchId: { in: batches } } }))
      await clean('batches', () => prisma.exportBatch.deleteMany({ where: { id: { in: batches } } }))
      await clean('composites', () => prisma.compositeAssessment.deleteMany({ where: { id: { in: composites } } }))
      await clean('cognitive assignments', () => prisma.cognitiveAssignment.deleteMany({ where: { id: { in: cognitive } } }))
      await clean('cognitive configs', () => prisma.cognitiveTestConfig.deleteMany({ where: { id: { in: configs } } }))
      await clean('questionnaires', () => prisma.questionnaire.deleteMany({ where: { id: { in: questionnaires } } }))
      await clean('scales', () => prisma.scale.deleteMany({ where: { id: { in: scales } } }))
      await clean('enrollments', () => prisma.courseStudent.deleteMany({ where: { courseId: { in: courses } } }))
      await clean('courses', () => prisma.course.deleteMany({ where: { id: { in: courses } } }))
      for (const userId of users) await clean('entry grants', () => prisma.$executeRaw`DELETE FROM admin_entry_grants WHERE user_id=${userId}`)
      await clean('users', () => prisma.user.deleteMany({ where: { id: { in: users } } }))
    } finally {
      await Promise.allSettled([
        clean('queue connections', async () => { if (queues) await queues.closeQueues(true) }),
        clean('cache connection', async () => { if (auth) { const { cacheService } = await import('../../services/cacheService'); await cacheService.close() } }),
        clean('database connection', () => prisma.$disconnect()),
        clean('fixture directory', async () => { if (root) await fs.rm(root, { recursive: true, force: true }) }),
      ])
      if (previousExportDir === undefined) delete process.env.EXPORT_DIR
      else process.env.EXPORT_DIR = previousExportDir
    }
    if (failures.length) throw new Error(`Fixture cleanup failed (${failures.length}): ${failures.join('; ')}`)
  }, 30000)

  it('filters/counts/pages all four source families on real schema and atomically fences nullable legacy Scale tags', async () => {
    const actor = { userId: teacher, role: 'TEACHER' }
    const config = await prisma.cognitiveTestConfig.create({ data: { testType: `mac-${randomUUID()}`, configVersion: '1.0.0', name: 'Synthetic catalog only', engineVersion: '1', scoringVersion: '1' } })
    configs.push(config.id)
    const selected: string[] = []
    let nullableScale = ''
    // Include the lower edge, exclude the upper edge, and fence a different course.
    for (const [createdAt, courseId, included] of [
      [new Date('2026-10-20T16:00:00.000Z'), courseA, true],
      [new Date('2026-10-21T16:00:00.000Z'), courseA, false],
      [new Date('2026-10-20T15:59:59.999Z'), courseA, false],
      [new Date('2026-10-20T17:00:00.000Z'), courseB, false],
    ] as const) {
      const common = { createdAt, tags: ['mac-qualified'], status: 'PUBLISHED' as const }
      const q = await prisma.questionnaire.create({ data: { ...common, code: randomUUID(), name: 'Mac boundary legacy', creatorId: teacher, type: 'COURSE', visibility: 'COURSE', courseQuestionnaires: { create: { courseId } } } })
      questionnaires.push(q.id)
      const c = await prisma.compositeAssessment.create({ data: { ...common, code: randomUUID(), name: 'Mac boundary collection', createdBy: teacher,
        productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', questionnaireCourses: { create: { courseId } } } })
      composites.push(c.id)
      const s = await prisma.scale.create({ data: { ...common, code: randomUUID(), name: 'Mac boundary scale', creatorId: teacher, visibility: 'COURSE', courseScales: { create: { courseId } }, definition: { synthetic: true } } })
      scales.push(s.id)
      const a = await prisma.cognitiveAssignment.create({ data: { ...common, title: 'Mac boundary cognitive', createdBy: teacher, configId: config.id, courseId, listedStandalone: true } })
      cognitive.push(a.id)
      if (included) { selected.push(q.id, c.id, s.id, a.id); nullableScale = s.id }
    }
    await prisma.$executeRaw`UPDATE scales SET tags=NULL WHERE id=${nullableScale}`
    const from = '2026-10-21T00:00:00+08:00', to = '2026-10-22T00:00:00+08:00'
    const filter = { search: 'Mac boundary', from, to, pageSize: 2 }
    const first = await courseCatalogPage(courseA, actor, filter)
    const second = await courseCatalogPage(courseA, actor, { ...filter, page: 2 })
    expect(first.total).toBe(4); expect(second.total).toBe(4)
    expect([...first.list, ...second.list].map(row => row.id).sort()).toEqual(selected.sort())
    expect(new Set([...first.list, ...second.list].map(row => row.kind))).toEqual(new Set(['LEGACY_QUESTIONNAIRE', 'QUESTIONNAIRE', 'SCALE', 'COGNITIVE']))
    expect(await courseCatalogPage(courseA, actor, { ...filter, from: '2026-10-20T16:00:00Z', to: '2026-10-21T16:00:00Z' })).toEqual(first)
    expect((await courseCatalogPage(courseA, actor, { ...filter, page: 3 })).list).toEqual([])
    expect((await courseCatalogPage(courseA, actor, { ...filter, tags: 'mac-qualified' })).total).toBe(3)
    expect([...first.list, ...second.list].find(row => row.id === nullableScale)?.tags).toEqual([])
    const before = await prisma.scale.findUniqueOrThrow({ where: { id: nullableScale }, select: { definition: true, definitionHash: true, status: true, instrumentVersion: true } })
    await expect(updateCatalogTags({ userId: other, role: 'TEACHER' }, nullableScale, { kind: 'SCALE', expectedTags: [], tags: ['forged'] })).rejects.toMatchObject({ statusCode: 409 })
    expect(await updateCatalogTags(actor, nullableScale, { kind: 'SCALE', expectedTags: [], tags: ['mac-qualified'] })).toEqual({ tags: ['mac-qualified'] })
    await expect(updateCatalogTags(actor, nullableScale, { kind: 'SCALE', expectedTags: [], tags: ['stale'] })).rejects.toMatchObject({ statusCode: 409 })
    expect(await prisma.scale.findUniqueOrThrow({ where: { id: nullableScale }, select: { definition: true, definitionHash: true, status: true, instrumentVersion: true } })).toEqual(before)
    const tagged1 = await courseCatalogPage(courseA, actor, { ...filter, tags: 'mac-qualified' })
    const tagged2 = await courseCatalogPage(courseA, actor, { ...filter, tags: 'mac-qualified', page: 2 })
    expect(tagged1.total).toBe(4); expect(tagged2.total).toBe(4)
    expect([...tagged1.list, ...tagged2.list].map(row => row.id).sort()).toEqual(selected)
    for (const row of [...first.list, ...second.list].filter(row => row.kind !== 'SCALE')) {
      const input = { kind: row.kind, expectedTags: ['mac-qualified'], tags: ['mac-qualified', 'reviewed'] }
      await expect(updateCatalogTags({ userId: other, role: 'TEACHER' }, row.id, input)).rejects.toMatchObject({ statusCode: 409 })
      expect(await updateCatalogTags(actor, row.id, input)).toEqual({ tags: input.tags })
      await expect(updateCatalogTags(actor, row.id, input)).rejects.toMatchObject({ statusCode: 409 })
    }
    expect((await courseCatalogPage(courseA, actor, { ...filter, tags: 'reviewed' })).total).toBe(3)
  })

  const invoke = async (handler: (req: any, res: any) => Promise<unknown>, body: unknown, requestKey: string, artifactId?: string, session = token) => {
    const req: any = { headers: { cookie: `ptool_session=${session}` }, method: artifactId ? 'GET' : 'POST', originalUrl: `/api/composite-assessments/${assessment}/export`,
      params: { id: assessment, artifactId }, body, get: (name: string) => name.toLowerCase() === 'x-export-request-key' ? requestKey : undefined }
    const res = response()
    let authorized = false
    await auth.authenticate(req, res as any, error => { if (error) throw error; authorized = true })
    if (authorized) await handler(req, res)
    return res
  }
  const enqueue = async (courseId: string, requestKey = randomUUID(), session = token) => {
    const res = await invoke(controller.compositeExportController.export, { courseId, anonymize: false, format: 'csv', detail: 'summary' }, requestKey, undefined, session)
    expect(res.statusCode).toBe(200); expect(res.body.code).toBe(0)
    const batch = res.body.data as import('../../services/exportJobService').ExportBatchResponse
    if (!batches.includes(batch.batchId)) batches.push(batch.batchId)
    return batch
  }
  const finish = async (batchId: string, denied = false) => {
    const job = await queues!.exportQueue.getJob(`export-${batchId}`)
    expect(job).toBeTruthy()
    await queues!.exportQueue.resume()
    try {
      if (denied) await expect(job!.finished()).rejects.toThrow()
      else await job!.finished()
    } finally { await queues!.exportQueue.pause() }
  }

  it('persists distinct course intents, replays identical keys, and emits only requested-course anonymous rows through the real worker', async () => {
    const key = randomUUID(), a = await enqueue(courseA, key)
    expect((await enqueue(courseA, key)).batchId).toBe(a.batchId)
    const conflict = await invoke(controller.compositeExportController.export, { courseId: courseB, anonymize: false, format: 'csv', detail: 'summary' }, key)
    expect(conflict.statusCode).toBe(409)
    const b = await enqueue(courseB)
    expect(b.batchId).not.toBe(a.batchId)
    // ADMIN normally may request names, but course exports must still force anonymity.
    await prisma.$executeRaw`INSERT INTO admin_entry_grants (id,user_id,entry,granted_by) VALUES (${randomUUID()},${other},'TRAINING',${other})`
    const adminSession = jwt.generateToken({ userId: other, username: 'synthetic-admin', role: 'ADMIN', tokenVersion: 0, accountDomain: 'TRAINING', adminVerifiedAt: Math.floor(Date.now() / 1000), adminSessionId: randomUUID() })
    const adminBatch = await enqueue(courseA, randomUUID(), adminSession)
    for (const [batch, courseId, expected, excluded, session] of [[a, courseA, attemptA, attemptB, token], [b, courseB, attemptB, attemptA, token], [adminBatch, courseA, attemptA, attemptB, adminSession]] as const) {
      const intent = await prisma.exportBatch.findUniqueOrThrow({ where: { id: batch.batchId } })
      expect(intent.anonymized).toBe(true)
      expect(intent.options).toMatchObject({ courseId, anonymize: true, authorityTokenVersion: 0 })
      const queued = await prisma.exportArtifact.findUniqueOrThrow({ where: { id: batch.artifacts[0].id } })
      expect(queued.provenance).toMatchObject({ courseId, generation: batch.batchId })
      await finish(batch.batchId)
      const artifact = await prisma.exportArtifact.findUniqueOrThrow({ where: { id: batch.artifacts[0].id } })
      expect(artifact.status).toBe('READY'); expect(artifact.anonymized).toBe(true)
      expect(artifact.provenance).toMatchObject({ courseId, attemptIds: [expected], generation: batch.batchId })
      const res = await invoke(http.assessmentExportHttp('COMPOSITE', false), {}, '', artifact.id, session)
      expect(res.downloaded).toBeTruthy()
      const csv = await fs.readFile(res.downloaded!, 'utf8')
      expect(csv).toContain(expected); expect(csv).not.toContain(excluded); expect(csv).not.toContain(attemptUnbound)
      expect(csv).not.toContain('SYNTHETIC_PRIVATE_NAME'); expect(csv).not.toContain('U_name')
      expect(csv.trim().split(/\r?\n/)).toHaveLength(2)
      const ready = await prisma.exportBatch.findUniqueOrThrow({ where: { id: batch.batchId } })
      expect(ready.recordCount).toBe(1)
    }
  }, 60000)

  it('rejects token-version and principal revocation while queued and when READY, and course removal at download', async () => {
    const ready = await enqueue(courseA)
    await finish(ready.batchId)
    const queuedToken = await enqueue(courseA)
    await prisma.user.update({ where: { id: teacher }, data: { tokenVersion: 1 } })
    await finish(queuedToken.batchId, true)
    expect((await prisma.exportArtifact.findUniqueOrThrow({ where: { id: queuedToken.artifacts[0].id } })).status).toBe('FAILED')
    const stale = await invoke(http.assessmentExportHttp('COMPOSITE', false), {}, '', ready.artifacts[0].id)
    expect(stale.statusCode).toBe(401); expect(stale.downloaded).toBeUndefined()
    token = jwt.generateToken({ userId: teacher, username: 'synthetic-teacher', role: 'TEACHER', tokenVersion: 1, accountDomain: 'TRAINING' })
    expect((await invoke(http.assessmentExportHttp('COMPOSITE', false), {}, '', ready.artifacts[0].id)).downloaded).toBeTruthy()
    const queuedPrincipal = await enqueue(courseA)
    await prisma.user.update({ where: { id: teacher }, data: { isFrozen: true } })
    await finish(queuedPrincipal.batchId, true)
    expect((await prisma.exportArtifact.findUniqueOrThrow({ where: { id: queuedPrincipal.artifacts[0].id } })).status).toBe('FAILED')
    const frozen = await invoke(http.assessmentExportHttp('COMPOSITE', false), {}, '', ready.artifacts[0].id)
    expect(frozen.statusCode).toBe(401); expect(frozen.downloaded).toBeUndefined()
    await prisma.user.update({ where: { id: teacher }, data: { isFrozen: false } })
    await prisma.questionnaireCourseDelivery.delete({ where: { compositeId_courseId: { compositeId: assessment, courseId: courseA } } })
    const revokedCourse = await invoke(http.assessmentExportHttp('COMPOSITE', false), {}, '', ready.artifacts[0].id)
    expect(revokedCourse.statusCode).toBe(404); expect(revokedCourse.downloaded).toBeUndefined()
    // An existing artifact for B remains readable; enrollment in both courses
    // must never substitute for the deleted A delivery binding.
    const b = await enqueue(courseB); await finish(b.batchId)
    expect((await invoke(http.assessmentExportHttp('COMPOSITE', false), {}, '', b.artifacts[0].id)).downloaded).toBeTruthy()
  }, 90000)
})
