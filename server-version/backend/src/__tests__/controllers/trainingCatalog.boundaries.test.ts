import { beforeEach, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), execute: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: {
  $queryRawUnsafe: db.query, $transaction: db.transaction, $executeRawUnsafe: db.execute,
} }))
import { parseCatalogFilters, metadataWhere } from '../../modules/training-catalog/filters'
import { courseCatalogPage } from '../../modules/training-catalog/course'
import { updateCatalogTags } from '../../modules/training-catalog/tags'

beforeEach(() => {
  vi.clearAllMocks()
  db.query.mockResolvedValue([])
  db.transaction.mockResolvedValue([[], [{ total: 0n }]])
  db.execute.mockResolvedValue(1)
})
it('normalizes offset API bounds to the same UTC instants used by SQL and metadata queries', () => {
  const offset = parseCatalogFilters({ from: '2026-10-21T00:00:00+08:00', to: '2026-10-22T00:00:00+08:00' })
  const utc = parseCatalogFilters({ from: '2026-10-20T16:00:00.000Z', to: '2026-10-21T16:00:00.000Z' })
  expect(offset).toEqual(utc)
  expect(metadataWhere(offset)).toEqual(metadataWhere(utc))
  expect(() => parseCatalogFilters({ from: '2026-10-21T00:00:00+08:00', to: '2026-10-20T16:00:00Z' })).toThrow()
})
it('binds normalized UTC to row and count SQL and preserves legacy NULL tags without a tag filter', async () => {
  db.transaction.mockResolvedValue([[{ id: 'legacy', kind: 'SCALE', owner: 'teacher', tags: null }], [{ total: 1n }]])
  const result = await courseCatalogPage('course', { userId: 'teacher', role: 'TEACHER' }, { from: '2026-10-21T00:00:00+08:00', to: '2026-10-22T00:00:00+08:00' })
  const [rows, count] = db.query.mock.calls
  expect(rows.slice(1, 9)).toEqual(count.slice(1))
  expect(rows.slice(6, 9)).toEqual(['2026-10-20T16:00:00.000Z', '2026-10-21T16:00:00.000Z', []])
  expect(rows[0]).toContain('(cardinality($8::text[])=0 OR tags @> $8::text[])')
  expect(result.list[0].tags).toEqual([])
  expect(result.total).toBe(1)
})
it('keeps nonempty tag filtering and caller strings as bound parameters', async () => {
  await courseCatalogPage('course', { userId: 'teacher', role: 'TEACHER' }, { tags: "x',danger" })
  expect(db.query.mock.calls[0][8]).toEqual(["x'", 'danger'])
  expect(db.query.mock.calls[0][0]).not.toContain("x'")
})
it('atomically compares legacy NULL Scale tags as empty and keeps ownership and timestamp updates', async () => {
  expect(await updateCatalogTags({ userId: 'teacher', role: 'TEACHER' }, 'scale', { kind: 'SCALE', expectedTags: [], tags: ['new', 'new'] })).toEqual({ tags: ['new'] })
  expect(db.execute).toHaveBeenCalledWith(
    'UPDATE scales SET tags=$1::text[], updated_at=$2 WHERE id=$3 AND ($4::boolean OR creator_id=$5) AND COALESCE(tags, ARRAY[]::text[])=$6::text[]',
    ['new'], expect.any(Date), 'scale', false, 'teacher', [],
  )
  expect(db.execute.mock.calls[0][0]).not.toMatch(/revision|definition|status\s*=/)
})
it('retains exact expected-tag order and fails closed on stale or unauthorized Scale writes', async () => {
  db.execute.mockResolvedValue(0)
  await expect(updateCatalogTags({ userId: 'foreign', role: 'TEACHER' }, 'scale', { kind: 'SCALE', expectedTags: ['b', 'a'], tags: [] })).rejects.toMatchObject({ statusCode: 409 })
  expect(db.execute.mock.calls[0].slice(4)).toEqual([false, 'foreign', ['b', 'a']])
  db.execute.mockClear()
  await expect(updateCatalogTags({ userId: 'student', role: 'STUDENT' }, 'scale', { kind: 'SCALE', expectedTags: [], tags: [] })).rejects.toMatchObject({ statusCode: 403 })
  expect(db.execute).not.toHaveBeenCalled()
})
it('retains the existing administrator tag authority with the same atomic comparison', async () => {
  await updateCatalogTags({ userId: 'admin', role: 'ADMIN' }, 'scale', { kind: 'SCALE', expectedTags: [], tags: ['new'] })
  expect(db.execute.mock.calls[0].slice(4)).toEqual([true, 'admin', []])
})

it('rejects syntactically matched but invalid offsets before UTC conversion', () => {
  expect(() => parseCatalogFilters({ from: '2026-10-21T00:00:00+99:00' })).toThrow('日期无效')
})
