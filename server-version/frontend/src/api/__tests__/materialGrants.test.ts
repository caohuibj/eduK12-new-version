import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClient } = vi.hoisted(() => ({
  mockClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

vi.mock('../client', () => ({ default: mockClient }))

import { eligibleGrantTeachers, materialGrantApi } from '../materialGrants'

beforeEach(() => {
  vi.clearAllMocks()
  mockClient.get.mockResolvedValue({ code: 0, data: { list: [] } })
  mockClient.post.mockResolvedValue({ code: 0, data: {} })
  mockClient.delete.mockResolvedValue({ code: 0, data: { id: 'g1' } })
})

describe('materialGrantApi', () => {
  it('lists grants with resource filters', async () => {
    await materialGrantApi.list({ resourceType: 'SCALE', resourceId: 'scale-1' })
    expect(mockClient.get).toHaveBeenCalledWith('/admin/material-grants?resourceType=SCALE&resourceId=scale-1')
  })

  it('batches teacher ids onto one resource', async () => {
    await materialGrantApi.batch({ resourceType: 'COGNITIVE_CONFIG', resourceId: 'cfg-1', teacherIds: ['t1', 't2'] })
    expect(mockClient.post).toHaveBeenCalledWith('/admin/material-grants/batch', {
      resourceType: 'COGNITIVE_CONFIG',
      resourceId: 'cfg-1',
      teacherIds: ['t1', 't2'],
    })
  })

  it('keeps frozen teachers out of the grant picker', () => {
    expect(eligibleGrantTeachers([
      { id: 'ok', username: 'ok', role: 'TEACHER', teacherApproved: true, isActive: true, isFrozen: false },
      { id: 'frozen', username: 'no', role: 'TEACHER', teacherApproved: true, isActive: true, isFrozen: true },
      { id: 'admin', username: 'a', role: 'ADMIN' },
    ]).map((user) => user.id)).toEqual(['ok'])
  })
})
