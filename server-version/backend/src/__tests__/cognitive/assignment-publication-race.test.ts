import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma, UserRole } from '@prisma/client'

const { db } = vi.hoisted(() => ({ db: {
  course: { findUnique: vi.fn() },
  cognitiveTestConfig: { findUnique: vi.fn() },
  cognitiveAssignment: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
} }))
vi.mock('../../config/database', () => ({ prisma: db }))

import { config as appConfig } from '../../config'
import { publishAssignment, updateDraftAssignment } from '../../modules/cognitive/assignment.service'
import { readFrozenReport } from '../../modules/cognitive/profile-freeze'

const teacherId = 'teacher-race'
const course = { id: 'course-race', title: 'Synthetic course', courseCode: 'RACE', creatorId: teacherId }
const config = {
  id: 'config-race', testType: 'reaction', configVersion: '1.1.0', name: 'Synthetic reaction config',
  status: 'PUBLISHED', engineVersion: '1.0.0', scoringVersion: '1.1.0',
  config: {
    totalTrials: 20, foreperiodMinMs: 700, foreperiodMaxMs: 1500, timeoutMs: 2000, readyDurationMs: 1000,
    report: { reportVersion: '1.1.0', referenceMode: 'simulated', referenceVersion: 'lit-sim-k12-v0.2', referenceBand: 'K7-9' },
  },
}
const draft = () => ({
  id: 'assignment-race', createdBy: teacherId, courseId: course.id, configId: config.id,
  title: 'Synthetic draft', instruction: null, status: 'DRAFT', listedStandalone: true,
  courseSnapshot: null, profile: 'experience', maxAttempts: 1, required: true,
  opensAt: null as Date | null, dueAt: null as Date | null, updatedAt: new Date('2026-01-01T00:00:00Z'),
  publishedAt: null as Date | null, measurementReleaseId: null,
  profileDefinitionVersion: null as string | null, resolvedConfigHash: null as string | null,
  resolvedConfigSnapshotEncrypted: null as string | null, resolvedReportSnapshotEncrypted: null as string | null,
})
let current = draft()
type Write = { where: { id: string; status?: string; updatedAt?: Date }; data: Record<string, unknown> }
const matches = ({ where }: Write) => where.id === current.id
  && (where.status === undefined || where.status === current.status)
  && (where.updatedAt === undefined || where.updatedAt.getTime() === current.updatedAt.getTime())
const persist = ({ data }: Write) => {
  Object.assign(current, structuredClone(data), { updatedAt: data.updatedAt ?? new Date() })
  return structuredClone(current)
}
const update = (write: Write) => {
  if (!matches(write)) throw new Prisma.PrismaClientKnownRequestError('No matching assignment', { code: 'P2025', clientVersion: 'test' })
  return persist(write)
}
const updateMany = (write: Write) => {
  if (!matches(write)) return { count: 0 }
  persist(write)
  return { count: 1 }
}
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.DATA_PSEUDONYM_KEY = 'b'.repeat(64)
})
beforeEach(() => {
  vi.resetAllMocks()
  current = draft()
  appConfig.cognitiveModuleEnabled = true
  db.course.findUnique.mockResolvedValue(course)
  db.cognitiveTestConfig.findUnique.mockResolvedValue(config)
  db.cognitiveAssignment.findUnique.mockImplementation(async () => structuredClone(current))
  db.cognitiveAssignment.update.mockImplementation(async write => update(write))
  db.cognitiveAssignment.updateMany.mockImplementation(async write => updateMany(write))
})

describe('standalone assignment draft/publication concurrency', () => {
  it('rejects a pending draft profile/quota edit after publication and preserves its frozen profile', async () => {
    const reachedWrite = deferred(), releaseWrite = deferred()
    db.cognitiveAssignment.update.mockImplementationOnce(async write => {
      reachedWrite.resolve()
      await releaseWrite.promise
      return update(write)
    })
    const editing = updateDraftAssignment(teacherId, UserRole.TEACHER, current.id, { profile: 'research', maxAttempts: 99 })
    const rejected = expect(editing).rejects.toMatchObject({ statusCode: 409 })
    await reachedWrite.promise
    await publishAssignment(teacherId, UserRole.TEACHER, current.id)
    const published = structuredClone(current)
    releaseWrite.resolve()
    await rejected

    expect(current).toEqual(published)
    expect(current).toMatchObject({ status: 'PUBLISHED', profile: 'experience', maxAttempts: 1, measurementReleaseId: null })
    expect(readFrozenReport(current.resolvedReportSnapshotEncrypted)?.profile).toBe('experience')
  })

  it('rejects publication of a stale draft and freezes the saved profile only after a fresh retry', async () => {
    const reachedWrite = deferred(), releaseWrite = deferred()
    db.cognitiveAssignment.updateMany.mockImplementationOnce(async write => {
      reachedWrite.resolve()
      await releaseWrite.promise
      return updateMany(write)
    })
    const publishing = publishAssignment(teacherId, UserRole.TEACHER, current.id)
    const rejected = expect(publishing).rejects.toMatchObject({ statusCode: 409 })
    await reachedWrite.promise
    await updateDraftAssignment(teacherId, UserRole.TEACHER, current.id, { profile: 'research' })
    const edited = structuredClone(current)
    releaseWrite.resolve()
    await rejected

    expect(current).toEqual(edited)
    expect(current).toMatchObject({ status: 'DRAFT', profile: 'research', publishedAt: null,
      resolvedConfigSnapshotEncrypted: null, resolvedReportSnapshotEncrypted: null })
    await publishAssignment(teacherId, UserRole.TEACHER, current.id)
    expect(current).toMatchObject({ status: 'PUBLISHED', profile: 'research' })
    expect(readFrozenReport(current.resolvedReportSnapshotEncrypted)?.profile).toBe('research')
  })

  it('rejects a competing draft edit rather than combining two individually valid windows into an invalid one', async () => {
    current.opensAt = new Date('2026-01-01T10:00:00Z')
    current.dueAt = new Date('2026-01-01T18:00:00Z')
    const reachedWrite = deferred(), releaseWrite = deferred()
    db.cognitiveAssignment.update.mockImplementationOnce(async write => {
      reachedWrite.resolve()
      await releaseWrite.promise
      return update(write)
    })
    const editing = updateDraftAssignment(teacherId, UserRole.TEACHER, current.id, { opensAt: '2026-01-01T17:00:00Z' })
    const rejected = expect(editing).rejects.toMatchObject({ statusCode: 409 })
    await reachedWrite.promise
    await updateDraftAssignment(teacherId, UserRole.TEACHER, current.id, { dueAt: '2026-01-01T12:00:00Z' })
    releaseWrite.resolve()
    await rejected

    expect(current.opensAt?.toISOString()).toBe('2026-01-01T10:00:00.000Z')
    expect(current.dueAt?.toISOString()).toBe('2026-01-01T12:00:00.000Z')
  })

  it('preserves a database failure instead of presenting it as a stale draft conflict', async () => {
    const failure = new Error('Synthetic database unavailable')
    db.cognitiveAssignment.update.mockRejectedValueOnce(failure)
    await expect(updateDraftAssignment(teacherId, UserRole.TEACHER, current.id, { title: 'Updated' })).rejects.toBe(failure)
  })

  it('advances the draft revision even when the database timestamp is at or ahead of the current clock', async () => {
    current.updatedAt = new Date('2100-01-01T00:00:00Z')
    const before = current.updatedAt.getTime()
    await updateDraftAssignment(teacherId, UserRole.TEACHER, current.id, { title: 'Updated' })
    expect(current.updatedAt.getTime()).toBe(before + 1)
  })
})
