import { beforeEach, describe, expect, it, vi } from 'vitest'
const { list } = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('../../services/studentTasks', () => ({ listStudentTasks: list, taskStates: ['PENDING', 'IN_PROGRESS', 'UPCOMING', 'EXPIRED', 'COMPLETED', 'UNAVAILABLE'] }))
vi.mock('../../config/database', () => ({ prisma: {} }))
import { studentTaskList } from '../../controllers/studentTaskController'
import { requireStudent } from '../../middleware/auth'
const response = () => {
  const res: any = { status: vi.fn(), json: vi.fn() }
  res.status.mockReturnValue(res)
  return res
}
beforeEach(() => { list.mockReset() })
describe('student task endpoint', () => {
  it.each([undefined, 'TEACHER', 'ADMIN'])('requires a student principal (%s)', role => {
    const res = response()
    const next = vi.fn()
    requireStudent({ user: role ? { userId: 'other', role } : undefined } as any, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(role ? 403 : 401)
  })
  it('uses the authenticated user and strict default pagination', async () => {
    list.mockResolvedValue({ list: [], total: 0 })
    const res = response()
    await studentTaskList({ user: { userId: 'mine' }, query: { userId: 'other' } } as any, res)
    expect(list).toHaveBeenCalledWith('mine', { page: 1, pageSize: 20 })
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0 }))
  })
  it.each([{ page: '0' }, { page: '1.5' }, { pageSize: '101' }, { pageSize: '-1' }, { state: 'unknown' }, { page: ['1', '2'] }])('rejects invalid queries before reading (%j)', async query => {
    const res = response()
    await studentTaskList({ user: { userId: 'mine' }, query } as any, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(list).not.toHaveBeenCalled()
  })
  it('returns a retryable failure instead of empty tasks on partial read failure', async () => {
    list.mockRejectedValue(new Error('offline'))
    const res = response()
    await studentTaskList({ user: { userId: 'mine' }, query: {} } as any, res)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: -1, data: null }))
  })
})
