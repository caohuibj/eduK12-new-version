import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

vi.mock('../../../api/client', () => ({ default: mockClient }))

import { compositeApi } from '../api'

beforeEach(() => {
  vi.clearAllMocks()
  mockClient.get.mockResolvedValue({ code: 0, message: 'ok', data: { list: [] } })
  mockClient.post.mockResolvedValue({ code: 0, message: 'ok', data: { id: 'draft-1' } })
  mockClient.patch.mockResolvedValue({ code: 0, message: 'ok', data: {} })
})

describe('composite library api', () => {
  it('GET /composite-assessments/library', async () => {
    await compositeApi.listLibrary()
    expect(mockClient.get).toHaveBeenCalledWith('/composite-assessments/library')
  })

  it('POST /composite-assessments/:id/copy with a teaching courseId', async () => {
    await compositeApi.copy('tpl-1', { courseId: 'course-own' })
    expect(mockClient.post).toHaveBeenCalledWith('/composite-assessments/tpl-1/copy', { courseId: 'course-own' })
  })

  it('PATCH /composite-assessments/:id with copyable', async () => {
    await compositeApi.update('tpl-1', { copyable: true })
    expect(mockClient.patch).toHaveBeenCalledWith('/composite-assessments/tpl-1', { copyable: true })
  })
})
