import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

const url = integrationDatabaseUrl('COGNITIVE_ASSIGNMENT_INTEGRATION_DB_URL')
const suite = url ? describe : describe.skip
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

suite('standalone assignment draft/publication races (real PostgreSQL)', () => {
  let db: (typeof import('../../config/database'))['prisma']
  let service: typeof import('../../modules/cognitive/assignment.service')
  let readFrozenReport: (typeof import('../../modules/cognitive/profile-freeze'))['readFrozenReport']
  let appConfig: (typeof import('../../config'))['config']
  let previousEnabled: boolean
  let teacherId: string, courseId: string, configId: string, assignmentId: string
  const assignments: string[] = []
  type Barrier = { id: string; action: 'update' | 'updateMany'; reached: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> }
  let pending: Barrier | null = null
  const barriers = new Set<Barrier>()
  const pauseWrite = (action: Barrier['action']) => {
    const barrier: Barrier = { id: assignmentId, action, reached: deferred(), release: deferred() }
    pending = barrier
    barriers.add(barrier)
    return barrier
  }
  const settle = <T>(promise: Promise<T>) => promise.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }))
  const reachedWrite = async (barrier: Barrier, outcome: Promise<unknown>) => Promise.race([
    barrier.reached.promise,
    outcome.then(() => { throw new Error('Service completed before the expected assignment write boundary') }),
  ])

  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
    db = (await import('../../config/database')).prisma
    appConfig = (await import('../../config')).config
    previousEnabled = appConfig.cognitiveModuleEnabled
    appConfig.cognitiveModuleEnabled = true
    service = await import('../../modules/cognitive/assignment.service')
    readFrozenReport = (await import('../../modules/cognitive/profile-freeze')).readFrozenReport
    // Pause only the named service request before its real SQL write. All reads,
    // competing writes, CAS predicates, constraints and triggers remain real.
    db.$use(async (params, next) => {
      const barrier = pending
      if (barrier && params.model === 'CognitiveAssignment' && params.action === barrier.action && params.args.where.id === barrier.id) {
        pending = null
        barrier.reached.resolve()
        await barrier.release.promise
      }
      return next(params)
    })
    teacherId = (await db.user.create({ data: {
      username: 'synthetic-assignment-race-' + randomUUID(), passwordHash: 'synthetic-only',
      accountDomain: 'TRAINING', role: 'TEACHER', teacherApproved: true,
    } })).id
    courseId = (await db.course.create({ data: {
      title: 'Synthetic assignment race', courseCode: randomUUID(), creatorId: teacherId,
    } })).id
    configId = (await db.cognitiveTestConfig.create({ data: {
      testType: 'reaction', configVersion: 'synthetic-race-' + randomUUID(), name: 'Synthetic assignment race',
      engineVersion: '1.0.0', scoringVersion: '1.1.0', status: 'PUBLISHED',
      config: {
        totalTrials: 20, foreperiodMinMs: 700, foreperiodMaxMs: 1500, timeoutMs: 2000, readyDurationMs: 1000,
        report: { reportVersion: '1.1.0', referenceMode: 'simulated', referenceVersion: 'lit-sim-k12-v0.2', referenceBand: 'K7-9' },
      },
    } })).id
  }, 30000)

  beforeEach(async () => {
    assignmentId = (await db.cognitiveAssignment.create({ data: {
      courseId, configId, createdBy: teacherId, title: 'Synthetic ordinary draft',
      status: 'DRAFT', listedStandalone: true, profile: 'experience', maxAttempts: 1,
    } })).id
    assignments.push(assignmentId)
  })
  afterEach(() => {
    pending = null
    for (const barrier of barriers) barrier.release.resolve()
    barriers.clear()
  })
  afterAll(async () => {
    if (appConfig) appConfig.cognitiveModuleEnabled = previousEnabled
    if (!db) return
    try {
      if (assignments.length) await db.cognitiveAssignment.deleteMany({ where: { id: { in: assignments } } })
      if (courseId) await db.course.delete({ where: { id: courseId } })
      if (configId) await db.cognitiveTestConfig.delete({ where: { id: configId } })
      if (teacherId) await db.user.delete({ where: { id: teacherId } })
    } finally { await db.$disconnect() }
  })

  it('rejects the pending draft edit after actual publication without changing its config/report freeze or quota', async () => {
    const barrier = pauseWrite('update')
    const editing = settle(service.updateDraftAssignment(teacherId, 'TEACHER', assignmentId, { profile: 'research', maxAttempts: 99 }))
    let published: Awaited<ReturnType<typeof db.cognitiveAssignment.findUniqueOrThrow>>
    try {
      await reachedWrite(barrier, editing)
      await service.publishAssignment(teacherId, 'TEACHER', assignmentId)
      published = await db.cognitiveAssignment.findUniqueOrThrow({ where: { id: assignmentId } })
    } finally { barrier.release.resolve() }
    const result = await editing
    expect(result).toMatchObject({ ok: false, error: { statusCode: 409 } })
    const saved = await db.cognitiveAssignment.findUniqueOrThrow({ where: { id: assignmentId } })
    expect(saved).toEqual(published!)
    expect(saved).toMatchObject({ status: 'PUBLISHED', profile: 'experience', maxAttempts: 1, measurementReleaseId: null })
    expect(saved.resolvedConfigHash).toMatch(/^[a-f0-9]{64}$/)
    expect(readFrozenReport(saved.resolvedReportSnapshotEncrypted)?.profile).toBe('experience')
  }, 15000)

  it('rejects a stale publication after the actual draft edit and publishes only the saved profile on a fresh retry', async () => {
    // Exercise a clock/timestamp collision too: the edit must advance the read
    // revision even when wall-clock time cannot produce a later timestamp.
    const previous = new Date('2100-01-01T00:00:00Z')
    await db.cognitiveAssignment.update({ where: { id: assignmentId }, data: { updatedAt: previous } })
    const barrier = pauseWrite('updateMany')
    const publishing = settle(service.publishAssignment(teacherId, 'TEACHER', assignmentId))
    let edited: Awaited<ReturnType<typeof db.cognitiveAssignment.findUniqueOrThrow>>
    try {
      await reachedWrite(barrier, publishing)
      await service.updateDraftAssignment(teacherId, 'TEACHER', assignmentId, { profile: 'research' })
      edited = await db.cognitiveAssignment.findUniqueOrThrow({ where: { id: assignmentId } })
      expect(edited.updatedAt.getTime()).toBe(previous.getTime() + 1)
    } finally { barrier.release.resolve() }
    expect(await publishing).toMatchObject({ ok: false, error: { statusCode: 409 } })
    expect(await db.cognitiveAssignment.findUniqueOrThrow({ where: { id: assignmentId } })).toEqual(edited!)
    expect(edited!).toMatchObject({ status: 'DRAFT', profile: 'research', publishedAt: null,
      resolvedConfigSnapshotEncrypted: null, resolvedReportSnapshotEncrypted: null })

    await service.publishAssignment(teacherId, 'TEACHER', assignmentId)
    const published = await db.cognitiveAssignment.findUniqueOrThrow({ where: { id: assignmentId } })
    expect(published).toMatchObject({ status: 'PUBLISHED', profile: 'research', measurementReleaseId: null })
    expect(readFrozenReport(published.resolvedReportSnapshotEncrypted)?.profile).toBe('research')
  }, 15000)
})
