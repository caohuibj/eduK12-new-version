import { beforeEach, describe, expect, it, vi } from 'vitest'
const query = vi.hoisted(() => vi.fn())
vi.mock('../../config/database', () => ({ prisma: { $queryRaw: query } }))
vi.mock('../../modules/composite/composite.controller', () => ({ compositeController: { getAttempt: vi.fn(), submitFinalFormSection: vi.fn(), submitFinalScale: vi.fn() } }))
vi.mock('../../modules/composite/composite-image.controller', () => ({ compositeImageController: { authenticatedScaleImage: vi.fn() } }))
vi.mock('../../modules/composite/composite-video.controller', () => ({ compositeVideoController: { authenticatedScaleVideo: vi.fn() } }))
vi.mock('../../modules/assessment-run/startExecution', () => ({ startAssessmentRunExecution: vi.fn() }))
vi.mock('../../modules/reporting/teacher-personal-changes.service', () => ({ readTeacherPersonalChanges: vi.fn() }))
vi.mock('../../modules/huiteacher/scalePersonalReport.service', () => ({ readTeacherPersonalScaleReport: vi.fn() }))
import { listOwnTeacherScaleTasks } from '../../modules/huiteacher/scaleRuntime.routes'
import { decodeRunTaskCursor, encodeRunTaskCursor } from '../../modules/assessment-run/productRead'
import { ListCursorError } from '../../utils/listCursor'

const actor = '11111111-1111-4111-8111-111111111111'
const rows = Array.from({ length: 102 }, (_, index) => ({
  executionId: '33333333-3333-4333-8333-' + String(102 - index).padStart(12, '0'),
  createdAtMicros: '2026-10-22T10:00:00.123456Z',
  eventId: 'event', eventTitle: '活动', runId: 'run', organizationId: 'org',
  status: index === 101 ? 'ASSIGNED' : 'COMPLETED', runtimeBindingRef: null,
  resourceKey: 'teacher-scale:one:INDIVIDUAL', title: 'Scale ' + index, runStatus: 'PUBLISHED',
}))

beforeEach(() => { query.mockReset() })

describe('Teacher own Scale bounded keyset pages', () => {
  it('keeps all 102 tasks across (created_at, id) pages with default cap 100', async () => {
    query.mockResolvedValueOnce(rows.slice(0, 51)).mockResolvedValueOnce(rows.slice(50, 101)).mockResolvedValueOnce(rows.slice(100))
    const first = await listOwnTeacherScaleTasks(actor, { pageSize: '50' })
    const second = await listOwnTeacherScaleTasks(actor, { cursor: first.nextCursor!, pageSize: '50' })
    const third = await listOwnTeacherScaleTasks(actor, { cursor: second.nextCursor! })
    expect([first.list.length, second.list.length, third.list.length]).toEqual([50, 50, 2])
    expect(third.nextCursor).toBeNull()
    expect([...first.list, ...second.list, ...third.list].map(row => row.executionId)).toEqual(rows.map(row => row.executionId))
    expect(first.list[0]).not.toHaveProperty('createdAtMicros')
    expect(first.truncated).toBe(true)
    expect(decodeRunTaskCursor(first.nextCursor)).toEqual({ createdAt: rows[49].createdAtMicros, id: rows[49].executionId })
    const secondQuery = query.mock.calls[1][0]
    expect(secondQuery.sql.replace(/\s+/g, ' ')).toContain('(e."created_at", e."id") <')
    expect(secondQuery.sql.replace(/\s+/g, ' ')).toContain('ORDER BY e."created_at" DESC,e."id" DESC LIMIT')
    expect(secondQuery.values).toEqual(expect.arrayContaining([actor, '2026-10-22T10:00:00.123456Z', rows[49].executionId, 51]))
  })

  it('defaults the first page to 100 and omits the keyset predicate', async () => {
    query.mockResolvedValueOnce(rows.slice(0, 101))
    const first = await listOwnTeacherScaleTasks(actor)
    expect(first.list).toHaveLength(100)
    expect(first.truncated).toBe(true)
    expect(first.nextCursor).toBe(encodeRunTaskCursor({ createdAt: rows[99].createdAtMicros, id: rows[99].executionId }))
    expect(query.mock.calls[0][0].sql.replace(/\s+/g, ' ')).not.toContain('(e."created_at", e."id") <')
    expect(query.mock.calls[0][0].values).toEqual(expect.arrayContaining([actor, 101]))
  })

  it('rejects malformed, mixed, or unbounded page requests before reading tasks', async () => {
    query.mockResolvedValueOnce(rows.slice(0, 51))
    const { nextCursor } = await listOwnTeacherScaleTasks(actor, { pageSize: '50' })
    query.mockClear()
    for (const input of [{ cursor: 'not-a-cursor' }, { pageSize: '101' }, { pageSize: '0' }, { page: '2' }, { cursor: nextCursor, page: '2' }]) {
      await expect(listOwnTeacherScaleTasks(actor, input)).rejects.toBeInstanceOf(ListCursorError)
    }
    expect(query).not.toHaveBeenCalled()
  })
})
