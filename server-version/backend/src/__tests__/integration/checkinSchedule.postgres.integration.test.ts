import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../config/database'
import { publishDueCheckinSchedule } from '../../services/checkinScheduleService'
import { checkinScheduleController } from '../../controllers/checkinScheduleController'
import { courseController } from '../../controllers/courseController'
import { requireIsolatedReleaseDatabase } from './integration-env'

const gate = () => {
  let open!: () => void
  const ready = new Promise<void>(resolve => { open = resolve })
  return { ready, open }
}
const response = () => {
  const value: any = { statusCode: 200, body: null }
  value.status = (code: number) => { value.statusCode = code; return value }
  value.json = (body: unknown) => { value.body = body; return value }
  return value
}
// Observe a real database lock wait rather than infer concurrency from a delay.
async function assertBlockedBy(holderPid: number) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const [row] = await prisma.$queryRaw<Array<{ blocked: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${holderPid} = ANY(pg_blocking_pids(pid))) AS blocked`
    if (row?.blocked) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Expected PostgreSQL schedule lock wait was not observed')
}

// Explicit local disposable-fixture opt-in, never a production database test.
const enabled = process.env.CHECKIN_SCHEDULE_DB_TEST === '1'
describe.skipIf(!enabled)('checkin schedule PostgreSQL transaction contract', () => {
  let ownerId: string, courseId: string
  const anchor = new Date('2030-01-01T09:00:00Z')
  beforeAll(async () => {
    if (process.env.RELEASE_INTEGRATION_DATABASE_URL) {
      requireIsolatedReleaseDatabase(process.env.RELEASE_INTEGRATION_DATABASE_URL)
    } else {
      const url = new URL(process.env.DATABASE_URL!)
      if (url.hostname !== '127.0.0.1' || url.port !== '5549' || url.pathname !== '/eduk12_mac_work_20261021') throw new Error('Only an explicitly selected isolated database is allowed')
    }
    const owner = await prisma.user.create({ data: { username: 'schedule-fixture-' + randomUUID(), passwordHash: 'DISPOSABLE-NO-LOGIN', role: 'TEACHER' } })
    ownerId = owner.id
    const course = await prisma.course.create({ data: { title: '周期打卡隔离验证', creatorId: ownerId, courseCode: randomUUID(), status: 'PUBLISHED' } })
    courseId = course.id
  })
  afterAll(async () => {
    if (courseId) await prisma.course.delete({ where: { id: courseId } })
    if (ownerId) await prisma.user.delete({ where: { id: ownerId } })
    await prisma.$disconnect()
  })
  const create = () => prisma.checkinSchedule.create({ data: {
    courseId, creatorId: ownerId, template: { title: '每日复盘', content: '<p>今天学到了什么？</p>', tags: ['每日'], submissions: [{ id: 'must-not-copy' }], allowAnonymous: true },
    firstPublishAt: anchor, nextPublishAt: anchor, intervalDays: 1, durationHours: 24, timezone: 'Asia/Shanghai',
  } })
  it('serializes concurrent publishers, creates fresh occurrences and independent submissions', async () => {
    const row = await create()
    const outputs = await Promise.all([1, 2, 3].map(() => prisma.$transaction(tx => publishDueCheckinSchedule(tx, row.id, anchor))))
    expect(outputs.filter(Boolean)).toHaveLength(1)
    const first = await prisma.checkin.findFirstOrThrow({ where: { scheduleId: row.id } })
    expect(first.content).toBe('<p>今天学到了什么？</p>'); expect(first.allowAnonymous).toBe(false)
    expect(first.endTime?.toISOString()).toBe('2030-01-02T09:00:00.000Z')
    await prisma.checkinSubmission.create({ data: { checkinId: first.id, studentId: ownerId, content: '仅第一期的提交' } })
    await prisma.checkin.update({ where: { id: first.id }, data: { content: '只编辑第一期' } })
    const second = await prisma.$transaction(tx => publishDueCheckinSchedule(tx, row.id, new Date('2030-01-02T09:00:00Z')))
    expect(second!.id).not.toBe(first.id); expect(second!.content).toBe('<p>今天学到了什么？</p>')
    expect(await prisma.checkinSubmission.count({ where: { checkinId: second!.id } })).toBe(0)
    expect((await prisma.checkinSchedule.findUniqueOrThrow({ where: { id: row.id } })).publishedCount).toBe(2)
  })
  it('rolls back the occurrence and cursor together on failure, then allows retry', async () => {
    const row = await create()
    await expect(prisma.$transaction(async tx => { await publishDueCheckinSchedule(tx, row.id, anchor); throw new Error('synthetic rollback') })).rejects.toThrow('synthetic rollback')
    expect(await prisma.checkin.count({ where: { scheduleId: row.id } })).toBe(0)
    expect((await prisma.checkinSchedule.findUniqueOrThrow({ where: { id: row.id } })).nextPublishAt).toEqual(anchor)
    expect(await prisma.$transaction(tx => publishDueCheckinSchedule(tx, row.id, anchor))).not.toBeNull()
  })
  it('does not publish a stopped schedule and preserves already published data', async () => {
    const row = await create()
    await prisma.$transaction(tx => publishDueCheckinSchedule(tx, row.id, anchor))
    await prisma.checkinSchedule.update({ where: { id: row.id }, data: { active: false, nextPublishAt: null } })
    expect(await prisma.$transaction(tx => publishDueCheckinSchedule(tx, row.id, new Date('2030-01-05T09:00:00Z')))).toBeNull()
    expect(await prisma.checkin.count({ where: { scheduleId: row.id } })).toBe(1)
  })
  it('stops automatic publication when its course has ended', async () => {
    const row = await create()
    await prisma.course.update({ where: { id: courseId }, data: { status: 'COMPLETED' } })
    try {
      expect(await prisma.$transaction(tx => publishDueCheckinSchedule(tx, row.id, anchor))).toBeNull()
      expect((await prisma.checkinSchedule.findUniqueOrThrow({ where: { id: row.id } })).active).toBe(false)
      expect(await prisma.checkin.count({ where: { scheduleId: row.id } })).toBe(0)
    } finally { await prisma.course.update({ where: { id: courseId }, data: { status: 'PUBLISHED' } }) }
  })
  it('creates and stops a future series through the controller without prematurely publishing', async () => {
    const response: any = { statusCode: 200, body: null }
    response.status = (code: number) => { response.statusCode = code; return response }
    response.json = (body: unknown) => { response.body = body; return response }
    const first = new Date(Date.now() + 86400000).toISOString()
    await checkinScheduleController.create({ user: { userId: ownerId, role: 'TEACHER' }, body: {
      template: { courseId, title: '未来任务', content: '同样内容', submissions: [{ id: 'old' }], endTime: '2020-01-01', id: 'old-id' },
      firstPublishAt: first, intervalDays: 7, durationHours: 48, timezone: 'Asia/Shanghai',
    } } as any, response)
    expect(response.body.code).toBe(0)
    const id = response.body.data.id
    expect(await prisma.checkin.count({ where: { scheduleId: id } })).toBe(0)
    expect((await prisma.checkinSchedule.findUniqueOrThrow({ where: { id } })).template).not.toHaveProperty('submissions')
    await checkinScheduleController.list({ user: { userId: ownerId, role: 'TEACHER' }, query: { courseId } } as any, response)
    expect(response.body.data.list).toEqual(expect.arrayContaining([expect.objectContaining({ id, title: '未来任务', intervalDays: 7 })]))
    expect(response.body.data.list[0]).not.toHaveProperty('template')
    await checkinScheduleController.stop({ user: { userId: ownerId, role: 'TEACHER' }, params: { scheduleId: id } } as any, response)
    expect(response.body.code).toBe(0)
    expect((await prisma.checkinSchedule.findUniqueOrThrow({ where: { id } })).active).toBe(false)
  })
  it.each([{ isFrozen: true }, { teacherApproved: false }])('waits for account revocation and does not publish after it commits: %j', async change => {
    const row = await create()
    const locked = gate(), release = gate()
    let holderPid = 0
    const revoke = prisma.$transaction(async tx => {
      await tx.user.update({ where: { id: ownerId }, data: change })
      holderPid = (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`)[0].pid
      locked.open()
      await release.ready
    }, { timeout: 10000 })
    let publication: Promise<unknown> | undefined
    try {
      await Promise.race([locked.ready, revoke.then(() => { throw new Error('Revocation ended before its lock barrier') })])
      publication = prisma.$transaction(tx => publishDueCheckinSchedule(tx, row.id, anchor), { timeout: 10000 })
      await assertBlockedBy(holderPid)
      release.open()
      await revoke
      expect(await publication).toBeNull()
      expect(await prisma.checkin.count({ where: { scheduleId: row.id } })).toBe(0)
      expect((await prisma.checkinSchedule.findUniqueOrThrow({ where: { id: row.id } })).active).toBe(false)
    } finally {
      release.open()
      await Promise.allSettled([revoke, ...(publication ? [publication] : [])])
      await prisma.user.update({ where: { id: ownerId }, data: { isFrozen: false, teacherApproved: true } })
    }
  })
  it('course deletion waits for in-flight publication before collecting all asset references', async () => {
    const course = await prisma.course.create({ data: { title: 'delete race fixture', creatorId: ownerId, courseCode: randomUUID(), status: 'PUBLISHED' } })
    const asset = await prisma.storedAsset.create({ data: { objectKey: `schedule-fixture/${randomUUID()}.png`, mimeType: 'image/png', sizeBytes: 1, sha256: 'a'.repeat(64), ownerId, accessScope: 'COURSE', scopeId: course.id } })
    const row = await prisma.checkinSchedule.create({ data: { courseId: course.id, creatorId: ownerId,
      template: { title: 'with asset', images: [{ assetId: asset.id }] }, firstPublishAt: anchor, nextPublishAt: anchor,
      intervalDays: 1, durationHours: 24, timezone: 'Asia/Shanghai' } })
    const locked = gate(), release = gate()
    let holderPid = 0
    const publication = prisma.$transaction(async tx => {
      const result = await publishDueCheckinSchedule(tx, row.id, anchor)
      expect(result).not.toBeNull()
      expect(await tx.assetReference.count({ where: { assetId: asset.id } })).toBe(1)
      holderPid = (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`)[0].pid
      locked.open()
      await release.ready
      return result
    }, { timeout: 10000 })
    let deletion: Promise<unknown> | undefined
    const res = response()
    try {
      await Promise.race([locked.ready, publication.then(() => { throw new Error('Publication ended before its lock barrier') })])
      deletion = courseController.delete({ user: { userId: ownerId, role: 'ADMIN' }, params: { id: course.id } } as any, res)
      await assertBlockedBy(holderPid)
      release.open()
      await Promise.all([publication, deletion])
      expect(res.body.code).toBe(0)
      expect(await prisma.course.findUnique({ where: { id: course.id } })).toBeNull()
      expect(await prisma.assetReference.count({ where: { assetId: asset.id } })).toBe(0)
      expect(await prisma.checkin.count({ where: { scheduleId: row.id } })).toBe(0)
    } finally {
      release.open()
      await Promise.allSettled([publication, ...(deletion ? [deletion] : [])])
      await prisma.course.deleteMany({ where: { id: course.id } })
      await prisma.storedAsset.delete({ where: { id: asset.id } })
    }
  })
  it.skipIf(process.env.CHECKIN_SCHEDULE_LIVE_TEST !== '1')('live API scheduler publishes a due disposable fixture without a browser remaining open', async () => {
    const first = new Date(Date.now() + 1500)
    const row = await prisma.checkinSchedule.create({ data: {
      courseId, creatorId: ownerId, template: { title: '本地调度就绪验证', content: '临时夹具' },
      firstPublishAt: first, nextPublishAt: first, intervalDays: 1, durationHours: 24, timezone: 'Asia/Shanghai',
    } })
    const deadline = Date.now() + 65000
    while (Date.now() < deadline && await prisma.checkin.count({ where: { scheduleId: row.id } }) === 0) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    const tasks = await prisma.checkin.findMany({ where: { scheduleId: row.id } })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].scheduledFor).toEqual(first)
    expect(tasks[0].createdAt.getTime()).toBeGreaterThanOrEqual(first.getTime())
    expect((await prisma.checkinSchedule.findUniqueOrThrow({ where: { id: row.id } })).publishedCount).toBe(1)
  }, 75000)
})
