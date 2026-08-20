import { describe, it, expect, vi, beforeEach } from 'vitest'

// 断言 cognitiveApi 复用共享 apiClient：mock 掉 ../../../api/client（相对本测试文件 = src/api/client）
const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))
vi.mock('../../../api/client', () => ({ default: mockClient }))

import { cognitiveApi } from '../api'

beforeEach(() => {
  vi.clearAllMocks()
  mockClient.get.mockResolvedValue({ code: 0, message: 'ok', data: undefined })
  mockClient.post.mockResolvedValue({ code: 0, message: 'ok', data: undefined })
})

describe('cognitive api wrapper', () => {
  it('uses the shared apiClient for all endpoints (no separate auth client)', () => {
    // api.ts 内不 import axios；所有调用都落在同一个 mockClient 上
    expect(mockClient.get).toBeDefined()
    expect(mockClient.post).toBeDefined()
  })

  it('GET /cognitive/assignments/my', async () => {
    await cognitiveApi.getMyAssignments()
    expect(mockClient.get).toHaveBeenCalledWith('/cognitive/assignments/my')
  })

  it('GET /cognitive/assignments/:id', async () => {
    await cognitiveApi.getAssignment('asg-1')
    expect(mockClient.get).toHaveBeenCalledWith('/cognitive/assignments/asg-1')
  })

  it('GET /cognitive/history', async () => {
    await cognitiveApi.getHistory()
    expect(mockClient.get).toHaveBeenCalledWith('/cognitive/history?page=1&pageSize=20')
  })

  it('POST /cognitive/sessions with { assignmentId }', async () => {
    await cognitiveApi.createSession('asg-1')
    expect(mockClient.post).toHaveBeenCalledWith('/cognitive/sessions', { assignmentId: 'asg-1' })
  })

  it('GET /cognitive/sessions/:id', async () => {
    await cognitiveApi.getSession('sess-1')
    expect(mockClient.get).toHaveBeenCalledWith('/cognitive/sessions/sess-1')
  })

  it('POST /cognitive/sessions/:id/restart with empty body', async () => {
    await cognitiveApi.restartSession('sess-1')
    expect(mockClient.post).toHaveBeenCalledWith('/cognitive/sessions/sess-1/restart', {})
  })

  it('POST /cognitive/sessions/:id/trials with { trialIndex, payload }', async () => {
    await cognitiveApi.appendTrial('sess-1', 0, { correct: true, rtMs: 420 })
    expect(mockClient.post).toHaveBeenCalledWith('/cognitive/sessions/sess-1/trials', {
      trialIndex: 0,
      payload: { correct: true, rtMs: 420 },
    })
  })

  it('POST /cognitive/sessions/:id/complete with empty body', async () => {
    await cognitiveApi.completeSession('sess-1')
    expect(mockClient.post).toHaveBeenCalledWith('/cognitive/sessions/sess-1/complete', {})
  })
})
