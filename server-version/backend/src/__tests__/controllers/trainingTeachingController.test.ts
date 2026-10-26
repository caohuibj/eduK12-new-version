import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
const { list } = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('../../services/trainingTeachingOverview', () => ({ listTrainingTeachingOverview: list }))
import { trainingTeachingOverview } from '../../controllers/trainingTeachingController'
function response() { const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res); return res }
beforeEach(() => { vi.clearAllMocks(); list.mockResolvedValue({ list: [] }) })
describe('Training trainer overview request boundary', () => {
  it('uses the authenticated identity and a noncached bounded response', async () => {
    const res = response()
    await trainingTeachingOverview({ query: {}, user: { userId: 'owner' } } as unknown as Request, res as unknown as Response)
    expect(list).toHaveBeenCalledWith('owner', { page: 1, pageSize: 5, includeCourseCounts: true })
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0 }))
  })
  it.each(['true', 'false'])('parses the explicit course-count option %s without coercing strings to truthy values', async includeCourseCounts => {
    const res = response()
    await trainingTeachingOverview({ query: { includeCourseCounts }, user: { userId: 'owner' } } as unknown as Request, res as unknown as Response)
    expect(list).toHaveBeenCalledWith('owner', { page: 1, pageSize: 5, includeCourseCounts: includeCourseCounts === 'true' })
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0 }))
  })
  it.each([{ userId: 'other' }, { courseId: 'other' }, { page: '0' }, { pageSize: '51' }, { page: ['1', '2'] },
    { includeCourseCounts: '' }, { includeCourseCounts: '0' }, { includeCourseCounts: '1' }, { includeCourseCounts: 'False' },
    { includeCourseCounts: false }, { includeCourseCounts: ['false', 'true'] }, { includeCourseCounts: { value: 'false' } },
    { includeCourseCounts: 'false', userId: 'other' },
  ])('rejects caller-selected authority and malformed query %j', async query => {
    const res = response()
    await trainingTeachingOverview({ query, user: { userId: 'owner' } } as unknown as Request, res as unknown as Response)
    expect(res.status).toHaveBeenCalledWith(400); expect(list).not.toHaveBeenCalled()
  })
  it('returns a safe failure message without internal connection details', async () => {
    list.mockRejectedValue(new Error('private connection details'))
    const res = response()
    await trainingTeachingOverview({ query: {}, user: { userId: 'owner' } } as unknown as Request, res as unknown as Response)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('private connection')
  })
})
