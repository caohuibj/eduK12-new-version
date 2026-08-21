import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClient } = vi.hoisted(() => ({
  mockClient: { post: vi.fn() },
}))

vi.mock('../../../api/client', () => ({ default: mockClient }))

import { compositeApi, publicCompositeApi } from '../../composite/api'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('composite save draft api', () => {
  it('sends the current form value when saving and exiting', async () => {
    await compositeApi.save('attempt-1', { itemId: 'form-1', value: 'draft,with,commas' })

    expect(mockClient.post).toHaveBeenCalledWith(
      '/composite-assessments/attempts/attempt-1/save',
      { itemId: 'form-1', value: 'draft,with,commas' },
    )
  })

  it('keeps public recovery in the header while sending the draft body', async () => {
    await publicCompositeApi('recovery-token-1234567890').save('attempt-1', { itemId: 'form-1', value: 'draft' })

    expect(mockClient.post).toHaveBeenCalledWith(
      '/public/composite-assessments/attempts/attempt-1/save',
      { itemId: 'form-1', value: 'draft' },
      { headers: { 'X-Recovery-Token': 'recovery-token-1234567890' } },
    )
  })
})
