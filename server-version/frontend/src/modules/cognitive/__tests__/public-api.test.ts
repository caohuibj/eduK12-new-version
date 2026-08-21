import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClient } = vi.hoisted(() => ({
  mockClient: { get: vi.fn(), post: vi.fn() },
}))

vi.mock('../../../api/client', () => ({ default: mockClient }))

import { publicCognitiveApi } from '../api'

beforeEach(() => vi.clearAllMocks())

describe('public cognitive api', () => {
  it('uses the recovery header for reads and never puts it in the URL', async () => {
    await publicCognitiveApi('recovery-token-1234567890').getSession('session-1')

    expect(mockClient.get).toHaveBeenCalledWith(
      '/public/cognitive/sessions/session-1',
      { headers: { 'X-Recovery-Token': 'recovery-token-1234567890' } },
    )
    expect(mockClient.get.mock.calls[0][0]).not.toContain('recovery-token')
  })

  it('sends the recovery credential in the request body for writes', async () => {
    await publicCognitiveApi('recovery-token-1234567890').appendTrial('session-1', 2, { rtMs: 320 })

    expect(mockClient.post).toHaveBeenCalledWith(
      '/public/cognitive/sessions/session-1/trials',
      { recoveryToken: 'recovery-token-1234567890', trialIndex: 2, payload: { rtMs: 320 } },
    )
  })
})
