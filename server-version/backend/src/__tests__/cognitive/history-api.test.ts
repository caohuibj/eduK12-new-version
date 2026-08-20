import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

vi.mock('../../modules/cognitive/history.service', () => ({
  listMyHistory: vi.fn(),
}))
vi.mock('../../modules/cognitive/assignment.service', () => ({
  createAssignment: vi.fn(),
  listTeacherAssignments: vi.fn(),
  listStudentAssignments: vi.fn(),
  getAssignmentForTeacher: vi.fn(),
  getAssignmentForStudent: vi.fn(),
  updateDraftAssignment: vi.fn(),
  publishAssignment: vi.fn(),
  archiveAssignment: vi.fn(),
}))

import * as historyService from '../../modules/cognitive/history.service'
import { cognitiveController } from '../../modules/cognitive/cognitive.controller'

const makeReq = (overrides: any = {}) => ({
  user: { userId: 'student-1', username: 's1', role: UserRole.STUDENT },
  body: {},
  query: {},
  params: {},
  ...overrides,
})

const makeRes = () => {
  const res: any = { statusCode: 0, body: null }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: any) => {
    res.body = body
    return res
  })
  return res
}

beforeEach(() => vi.clearAllMocks())

describe('cognitive history API', () => {
  it('rejects unauthenticated access', async () => {
    const res = makeRes()
    await cognitiveController.myHistory(makeReq({ user: undefined }), res)
    expect(res.statusCode).toBe(401)
  })

  it('returns the standard paginated shape and forwards page parameters', async () => {
    const res = makeRes()
    ;(historyService.listMyHistory as any).mockResolvedValue({
      list: [{ sessionId: 'session-1', score: 90 }],
      total: 3,
    })

    await cognitiveController.myHistory(makeReq({ query: { page: '2', pageSize: '1' } }), res)

    expect(historyService.listMyHistory).toHaveBeenCalledWith('student-1', {
      page: 2,
      pageSize: 1,
      skip: 1,
      take: 1,
    })
    expect(res.body).toEqual(expect.objectContaining({
      code: 0,
      data: {
        list: [{ sessionId: 'session-1', score: 90 }],
        total: 3,
        page: 2,
        pageSize: 1,
        totalPages: 3,
        hasMore: true,
      },
    }))
  })
})
