import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { $queryRaw: vi.fn() },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import {
  requireOrganizationDenyGovernance,
  requireOrganizationGovernance,
} from '../../modules/organization/access'

const makeReq = (platformRole: 'SYSTEM_ADMIN' | 'STANDARD') => ({
  params: { organizationId: 'org-1' },
  user: {
    userId: 'user-1',
    username: 'user-1',
    role: UserRole.STUDENT,
    platformRole,
    tokenVersion: 0,
    mustChangePassword: false,
  },
}) as any

const makeRes = () => {
  const res: any = { statusCode: 0, body: null }
  res.status = vi.fn((statusCode: number) => {
    res.statusCode = statusCode
    return res
  })
  res.json = vi.fn((body: unknown) => {
    res.body = body
    return res
  })
  return res
}

function mockDeniedContext() {
  mockPrisma.$queryRaw
    .mockResolvedValueOnce([{ id: 'org-1', status: 'ACTIVE' }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ permission: 'ORGANIZATION_GOVERNANCE' }])
}

describe('Organization explicit-deny break-glass guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps ordinary governance denied for a denied SYSTEM_ADMIN', async () => {
    mockDeniedContext()
    const req = makeReq('SYSTEM_ADMIN')
    const res = makeRes()
    const next = vi.fn()

    await requireOrganizationGovernance(req, res, next)

    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('allows a denied SYSTEM_ADMIN into deny management for recovery', async () => {
    mockDeniedContext()
    const req = makeReq('SYSTEM_ADMIN')
    const res = makeRes()
    const next = vi.fn()

    await requireOrganizationDenyGovernance(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.organizationAccess.canGovern).toBe(false)
    expect(req.organizationAccess.explicitDenies).toContain('ORGANIZATION_GOVERNANCE')
  })

  it('does not give the break-glass bypass to STANDARD users', async () => {
    mockDeniedContext()
    const req = makeReq('STANDARD')
    const res = makeRes()
    const next = vi.fn()

    await requireOrganizationDenyGovernance(req, res, next)

    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })
})
