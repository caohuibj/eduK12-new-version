import { beforeEach, describe, expect, it, vi } from 'vitest'
const { db } = vi.hoisted(() => ({ db: { teacherCode: { findMany: vi.fn(), count: vi.fn() } } }))
vi.mock('../../config/database', () => ({ prisma: db }))
import { teacherCodeController } from '../../controllers/teacherCodeController'
function response() {
  const res: any = { statusCode: 200 }
  res.status = vi.fn((status: number) => { res.statusCode = status; return res })
  res.json = vi.fn((body: unknown) => { res.body = body; return res })
  return res
}
beforeEach(() => {
  vi.clearAllMocks()
  db.teacherCode.findMany.mockResolvedValue([{ id: 'code', accountValidityDays: 90, isActive: false }])
  db.teacherCode.count.mockResolvedValue(41)
})
describe('opt-in registration code pagination', () => {
  it('preserves the legacy complete list and ordering without a count query', async () => {
    const res = response()
    await teacherCodeController.list({ query: {} } as any, res)
    expect(db.teacherCode.findMany.mock.calls[0][0]).toMatchObject({ orderBy: { createdAt: 'desc' } })
    expect(db.teacherCode.findMany.mock.calls[0][0]).not.toHaveProperty('take')
    expect(db.teacherCode.count).not.toHaveBeenCalled()
    expect(res.body.data).toEqual({ list: [{ id: 'code', accountValidityDays: 90, isActive: false }], total: 1 })
  })
  it('bounds the page while retaining all code states, terms and creator projection', async () => {
    const res = response()
    await teacherCodeController.list({ query: { page: '2', pageSize: '20' } } as any, res)
    expect(db.teacherCode.findMany).toHaveBeenCalledWith({
      include: { creator: { select: { id: true, nickname: true, username: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20, skip: 20,
    })
    expect(db.teacherCode.count).toHaveBeenCalledWith()
    expect(res.body.data).toMatchObject({ total: 41, page: 2, pageSize: 20, list: [{ accountValidityDays: 90, isActive: false }] })
  })
  it('defaults page size to twenty and permits at most fifty', async () => {
    await teacherCodeController.list({ query: { page: '1' } } as any, response())
    expect(db.teacherCode.findMany.mock.calls[0][0]).toMatchObject({ take: 20, skip: 0 })
    await teacherCodeController.list({ query: { pageSize: '50' } } as any, response())
    expect(db.teacherCode.findMany.mock.calls[1][0]).toMatchObject({ take: 50, skip: 0 })
  })
  it.each([{ page: '0' }, { page: '-1' }, { page: '1.2' }, { page: '1x' }, { page: ['1', '2'] }, { pageSize: '51' }, { pageSize: '0' }, { page: '2147483647' }, { page: '9007199254740992' }])('rejects invalid or excessive paging before querying: %j', async query => {
    const res = response()
    await teacherCodeController.list({ query } as any, res)
    expect(res.statusCode).toBe(400)
    expect(db.teacherCode.findMany).not.toHaveBeenCalled()
    expect(db.teacherCode.count).not.toHaveBeenCalled()
  })
})
