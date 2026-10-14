import { randomUUID } from 'node:crypto'
import express from 'express'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../config/database'
import { courseController } from '../../controllers/courseController'
import { checkinController } from '../../controllers/checkinController'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { runtimeMetricLines, resetRuntimeObservabilityForTests } from '../../services/runtimeObservability'
import uploads from '../../routes/uploads'
import { writeFile } from 'node:fs/promises'
const queueMocks = vi.hoisted(() => ({ images: vi.fn(async (..._args: any[]) => [] as any[]) }))
vi.mock('../../config/queue', () => ({ imageQueue: { getJobs: queueMocks.images }, videoQueue: { getJobs: vi.fn() }, exportQueue: { add: vi.fn() } }))
// Authentication itself is unchanged; these fixtures inject a synthetic principal.
vi.mock('../../middleware/auth', () => ({ authenticate: (_req: any, _res: any, next: any) => next(), requireTeacher: (req: any, res: any, next: any) => req.user.role === 'TEACHER' ? next() : res.sendStatus(403) }))
const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
const student = randomUUID(), teacher = randomUUID(), foreign = randomUUID(), course = randomUUID()
const peers = Array.from({ length: 45 }, () => randomUUID()), crowdedTask = randomUUID()
let server: Server, endpoint: string
const identity = { userId: student, role: 'STUDENT' }
// The original, unbounded check-in controller is injected only by the
// access-efficiency A/B candidate, never the standard backend regression.
const baselineComparison = process.env.CI === 'true'
  && process.env.PERF_ISOLATED_TEST_MODE === '1'
  && process.env.PERF_SQL_EVENT_COUNT === '1'
suite('bounded authenticated list pages in real PostgreSQL', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    await prisma.user.createMany({ data: [{ id: student, username: 'page-'+student, role: 'STUDENT' }, { id: teacher, username: 'page-'+teacher, role: 'TEACHER' }, { id: foreign, username: 'page-'+foreign, role: 'STUDENT' }].map(user => ({ ...user, role: user.role as 'STUDENT' | 'TEACHER', passwordHash: 'synthetic-only' })) })
    await prisma.user.createMany({ data: peers.map(id => ({ id, username: 'page-peer-'+id, role: 'STUDENT', passwordHash: 'synthetic-only' })) })
    const courses = Array.from({ length: 45 }, (_, index) => ({ id: index ? randomUUID() : course, title: 'page-course-'+index, creatorId: teacher, status: 'PUBLISHED' as const, courseCode: randomUUID(), description: 'x'.repeat(1000) }))
    await prisma.course.createMany({ data: courses })
    await prisma.courseStudent.createMany({ data: courses.map(row => ({ courseId: row.id, studentId: student, status: 'ACTIVE' as const, joinedAt: new Date('2026-01-01T00:00:00Z') })) })
    const tasks = Array.from({ length: 405 }, (_, index) => ({ id: index ? randomUUID() : crowdedTask, courseId: course, creatorId: teacher, title: 'page-task-'+index, description: 'x'.repeat(1000), content: 'private-body', createdAt: new Date('2026-01-01T00:00:00Z'), allowViewOthers: true }))
    await prisma.checkin.createMany({ data: tasks })
    await prisma.checkinSubmission.createMany({ data: tasks.map(row => ({ checkinId: row.id, studentId: student, content: 'own-body', images: [] })) })
    await prisma.checkinSubmission.createMany({ data: peers.map(studentId => ({ checkinId: crowdedTask, studentId, content: 'peer-body', images: [] })) })
    const app = express()
    app.use((req: any, _res, next) => { req.user = { ...identity }; next() })
    app.use('/uploads', uploads)
    app.get('/courses/my', courseController.myCourses)
    app.get('/checkins/my', checkinController.myCheckins)
    if (baselineComparison) {
      // An A/B candidate without the deliberately mounted baseline fails here.
      const baseline = await import('../../controllers/__baseline-checkin' as string)
      app.get('/baseline/checkins/my', baseline.checkinController.myCheckins)
    }
    app.get('/checkins/:id/submissions', checkinController.submissions)
    app.get('/checkins/:id/others-submissions', checkinController.othersSubmissions)
    server = app.listen(0, '127.0.0.1')
    await new Promise<void>(resolve => server.once('listening', resolve))
    endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    await prisma.course.deleteMany({ where: { creatorId: teacher } })
    await prisma.user.deleteMany({ where: { id: { in: [student, teacher, foreign, ...peers] } } })
    await prisma.$disconnect()
  })
  it.each([['/courses/my', 45], ['/checkins/my', 405]])('walks %s without duplicates, even with equal timestamps, and keeps bodies out of summaries', async (path, expected) => {
    const ids: string[] = []
    let cursor: string | null = null
    do {
      const response = await fetch(endpoint + path + (cursor ? '?cursor='+encodeURIComponent(cursor) : ''))
      expect(response.status).toBe(200)
      const result = await response.json() as any
      expect(result.code).toBe(0); expect(result.data.list.length).toBeLessThanOrEqual(20)
      for (const row of result.data.list) { expect(row.content).toBeUndefined(); expect(row.description.length).toBeLessThanOrEqual(300); ids.push(row.id) }
      cursor = result.data.nextCursor
    } while (cursor)
    expect(ids).toHaveLength(expected); expect(new Set(ids).size).toBe(expected)
  })
  it('paginates teacher and peer submissions without changing parent authorization or including the requesting student', async () => {
    for (const view of ['submissions', 'others-submissions']) {
      identity.userId = view === 'submissions' ? teacher : student
      identity.role = view === 'submissions' ? 'TEACHER' : 'STUDENT'
      const ids: string[] = []; let cursor: string | null = null
      do {
        const response = await fetch(endpoint+`/checkins/${crowdedTask}/${view}`+(cursor ? '?cursor='+encodeURIComponent(cursor) : ''))
        expect(response.status).toBe(200)
        const result = await response.json() as any
        expect(result.data.list.length).toBeLessThanOrEqual(20)
        for (const row of result.data.list) { ids.push(row.id); if (view === 'others-submissions') expect(row.studentId).not.toBe(student) }
        cursor = result.data.nextCursor
      } while (cursor)
      expect(ids.length).toBe(view === 'submissions' ? 46 : 45); expect(new Set(ids).size).toBe(ids.length)
    }
    identity.userId=student;identity.role='STUDENT'
  })
  it('rejects malformed paging and still checks teacher ownership and student membership before reading submissions', async () => {
    expect((await fetch(endpoint+'/courses/my?pageSize=101')).status).toBe(400)
    expect((await fetch(endpoint+'/checkins/my?cursor=bad')).status).toBe(400)
    const task = await prisma.checkin.findFirstOrThrow({ where: { courseId: course, id: { not: crowdedTask } } })
    identity.userId = foreign
    expect((await fetch(endpoint+`/checkins/${task.id}/submissions`)).status).toBe(403)
    expect((await fetch(endpoint+`/checkins/${task.id}/others-submissions`)).status).toBe(403)
    identity.userId = student
    const own = await (await fetch(endpoint+`/checkins/${task.id}/others-submissions`)).json() as any
    expect(own.data.list).toEqual([])
  })
  it('bounds historical image status scans and caches terminal results without declaring unscanned jobs absent', async () => {
    identity.userId = teacher; identity.role = 'TEACHER'
    queueMocks.images.mockImplementation(async (states: string[], start: number, end: number) => {
      expect(start).toBe(0); expect(end).toBeLessThanOrEqual(199)
      return Array.from({ length: end + 1 }, (_, index) => ({ data: { imageId: states[0] === 'completed' && index === 0 ? 'synthetic-old-image' : 'other-'+index }, getState: async () => 'completed', returnvalue: { filename: 'old.jpg', url: '/uploads/images/old.jpg', size: 1, compressed: false, originalSize: 1, storage: 'local' } }))
    })
    const first = await fetch(endpoint+'/uploads/image/status/synthetic-old-image')
    expect(first.status).toBe(200); expect((await first.json() as any).data.status).toBe('completed')
    const calls = queueMocks.images.mock.calls.length
    expect((await fetch(endpoint+'/uploads/image/status/synthetic-old-image')).status).toBe(200)
    expect(queueMocks.images.mock.calls.length).toBe(calls)
    const older = await fetch(endpoint+'/uploads/image/status/older-than-window')
    expect(older.status).toBe(503); expect(older.headers.get('retry-after')).toBe('2')
    queueMocks.images.mockImplementation(async () => [])
    identity.userId = student; identity.role = 'STUDENT'
  })
  it('records before/after fixed synthetic concurrency latency and real SQL counts without touching production', async () => {
    const measurements = []
    for (const variant of baselineComparison ? ['baseline', 'bounded'] : ['bounded']) {
      resetRuntimeObservabilityForTests()
      for (const concurrency of [1, 10, 25]) {
        const times: number[] = [], bytes: number[] = []
        await Promise.all(Array.from({ length: concurrency }, async () => {
          for (let index = 0; index < 4; index++) {
            const start = performance.now()
            const response = await fetch(endpoint+(variant === 'baseline' ? '/baseline' : '')+'/checkins/my')
            const text = await response.text(), body = JSON.parse(text)
            expect(response.status).toBe(200)
            expect(body.data.list).toHaveLength(variant === 'baseline' ? 405 : 20)
            times.push(performance.now()-start); bytes.push(Buffer.byteLength(text))
          }
        }))
        times.sort((a,b) => a-b)
        measurements.push({ variant, concurrency, requests: times.length, responseBytes: bytes[0],
          p50Ms: times[Math.floor(times.length*.5)], p95Ms: times[Math.min(times.length-1, Math.floor(times.length*.95))], p99Ms: times[Math.min(times.length-1, Math.floor(times.length*.99))] })
      }
      const metrics = runtimeMetricLines().filter(line => /prisma|event_loop|rss|pool/.test(line))
      // SQL-event instrumentation is deliberately absent outside an opt-in
      // isolated A/B run; keep its positive/upper-bound assertions there.
      if (baselineComparison) {
        const sql = Number(metrics.find(line => line.startsWith('ptool_prisma_sql_events_total '))?.split(' ').at(-1))
        expect(sql).toBeGreaterThan(0)
        expect(sql).toBeLessThanOrEqual(144 * 6)
        measurements.push({ variant, metrics, sqlEvents: sql })
      } else {
        expect(metrics.some(line => line.startsWith('ptool_prisma_sql_events_total '))).toBe(false)
      }
    }
    if (baselineComparison) await writeFile('/evidence/access-performance.json', JSON.stringify({ fixture: { tasks: 405, pageSize: 20 }, measurements, baseline: 'Original base controller on identical synthetic data; initial response was unbounded.', limitations: 'Synthetic isolated host; production speed and pool tuning are not claimed. Prisma pool waits are not directly observable.' }, null, 2))
  }, 30_000)
})
