import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClient } = vi.hoisted(() => ({
  mockClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

vi.mock('../client', () => ({ default: mockClient }))

import { eligibleGrantTeachers, materialGrantApi } from '../materialGrants'

beforeEach(() => {
  vi.clearAllMocks()
  mockClient.get.mockResolvedValue({ code: 0, data: { list: [] } })
  mockClient.post.mockResolvedValue({ code: 0, data: {} })
  mockClient.put.mockResolvedValue({ code: 0, data: { list: [] } })
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

  it('sets the full teacher list for one resource atomically', async () => {
    await materialGrantApi.set({ resourceType: 'SCALE', resourceId: 'scale-1', teacherIds: ['t2'] })
    expect(mockClient.put).toHaveBeenCalledWith('/admin/material-grants/set', {
      resourceType: 'SCALE',
      resourceId: 'scale-1',
      teacherIds: ['t2'],
    })
  })

  it('keeps only approved, active, unfrozen teachers', () => {
    expect(eligibleGrantTeachers([
      { id: 'ok', username: 'ok', role: 'TEACHER', teacherApproved: true, isActive: true, isFrozen: false },
      { id: 'frozen', username: 'no', role: 'TEACHER', teacherApproved: true, isActive: true, isFrozen: true },
      { id: 'pending', username: 'p', role: 'TEACHER', teacherApproved: undefined, isActive: true, isFrozen: false },
      { id: 'admin', username: 'a', role: 'ADMIN' },
    ]).map((user) => user.id)).toEqual(['ok'])
  })

  it('pages through the teacher directory past the first 100 rows', async () => {
    const page1 = Array.from({ length: 100 }, (_, index) => ({ id: `t${index}`, username: `t${index}`, role: 'TEACHER' as const }))
    mockClient.get
      .mockResolvedValueOnce({ code: 0, data: { list: page1, total: 101, page: 1, pageSize: 100 } })
      .mockResolvedValueOnce({ code: 0, data: { list: [{ id: 't100', username: 't100', role: 'TEACHER' }], total: 101, page: 2, pageSize: 100 } })
    const response = await materialGrantApi.listTeachers()
    expect(mockClient.get).toHaveBeenNthCalledWith(1, '/users?role=TEACHER&page=1&pageSize=100')
    expect(mockClient.get).toHaveBeenNthCalledWith(2, '/users?role=TEACHER&page=2&pageSize=100')
    expect(response.data?.list).toHaveLength(101)
  })

  it.each([
    { code: 0, data: { list: [], total: 2 } },
    { code: 0, data: { total: 2 } },
    { code: 0, data: { list: [{ id: 't2' }], total: 3 } },
  ])('rejects truncated or changing teacher pages (%j)', async response => {
    mockClient.get
      .mockResolvedValueOnce({ code: 0, data: { list: [{ id: 't1' }], total: 2 } })
      .mockResolvedValueOnce(response)
    await expect(materialGrantApi.listTeachers()).rejects.toThrow('教师名单读取不完整')
  })

  it('rejects a missing first-page list rather than manufacturing an empty list', async () => {
    mockClient.get.mockResolvedValueOnce({ code: 0, data: { total: 0 } })
    await expect(materialGrantApi.listTeachers()).rejects.toThrow('教师名单格式不完整')
  })
})
