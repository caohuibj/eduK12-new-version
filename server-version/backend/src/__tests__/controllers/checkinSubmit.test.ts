import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    checkin: { findUnique: vi.fn() },
    checkinSubmission: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { checkinController } from '../../controllers/checkinController'
import { Messages } from '../../constants'

const makeReq = (overrides: any = {}) => ({
  user: { userId: 'student-1', username: 's1', role: UserRole.STUDENT },
  body: { content: 'today' },
  params: { id: 'ck-1' },
  query: {},
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

describe('logged-in checkin submit endTime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a submit after endTime', async () => {
    mockPrisma.checkin.findUnique.mockResolvedValue({
      id: 'ck-1',
      endTime: new Date(Date.now() - 60_000),
    })
    const res = makeRes()

    await checkinController.submit(makeReq(), res)

    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe(Messages.CHECKIN.EXPIRED)
    expect(mockPrisma.checkinSubmission.create).not.toHaveBeenCalled()
  })

  it('rejects an update after endTime', async () => {
    mockPrisma.checkin.findUnique.mockResolvedValue({
      id: 'ck-1',
      endTime: new Date(Date.now() - 60_000),
    })
    mockPrisma.checkinSubmission.findFirst.mockResolvedValue({ id: 'sub-1' })
    const res = makeRes()

    await checkinController.submit(makeReq(), res)

    expect(res.statusCode).toBe(400)
    expect(mockPrisma.checkinSubmission.update).not.toHaveBeenCalled()
  })

  it('accepts a submit when endTime has not passed', async () => {
    mockPrisma.checkin.findUnique.mockResolvedValue({
      id: 'ck-1',
      endTime: new Date(Date.now() + 60_000),
    })
    mockPrisma.checkinSubmission.findFirst.mockResolvedValue(null)
    mockPrisma.checkinSubmission.create.mockResolvedValue({ id: 'sub-1' })
    const res = makeRes()

    await checkinController.submit(makeReq(), res)

    expect(res.body.code).toBe(0)
    expect(mockPrisma.checkinSubmission.create).toHaveBeenCalledOnce()
  })
})
