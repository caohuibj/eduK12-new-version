import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('../../../api/client', () => ({ default: mockClient }))

import { compositeApi } from '../api'

beforeEach(() => {
  vi.clearAllMocks()
  mockClient.get.mockResolvedValue({ code: 0, message: 'ok', data: { list: [] } })
  mockClient.post.mockResolvedValue({ code: 0, message: 'ok', data: { id: 'draft-1' } })
  mockClient.patch.mockResolvedValue({ code: 0, message: 'ok', data: {} })
  mockClient.put.mockResolvedValue({ code: 0, message: 'ok', data: {} })
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

  it('POST /composite-assessments/:id/copy allows omitting courseId for self-copy', async () => {
    await compositeApi.copy('mine-1', {})
    expect(mockClient.post).toHaveBeenCalledWith('/composite-assessments/mine-1/copy', {})
  })

  it('PATCH /composite-assessments/:id with copyable', async () => {
    await compositeApi.update('tpl-1', { copyable: true })
    expect(mockClient.patch).toHaveBeenCalledWith('/composite-assessments/tpl-1', { copyable: true })
  })

  it('lists and explicitly sets a fixed analysis protocol', async () => {
    await compositeApi.listAnalysisProtocols()
    expect(mockClient.get).toHaveBeenCalledWith('/composite-assessments/analysis-protocols')

    const selection = { key: 'attention_v1', version: '1.0.0', profile: 'standard' as const }
    await compositeApi.setAnalysisProtocol('tpl-1', selection)
    expect(mockClient.put).toHaveBeenCalledWith('/composite-assessments/tpl-1/analysis-protocol', {
      analysisProtocol: selection,
    })
  })
})
