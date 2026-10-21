import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const api = vi.hoisted(() => ({ get: vi.fn(), csrf: vi.fn(), post: vi.fn() }))
vi.mock('../../api/client', () => ({ default: { get: api.get }, ensureCsrfToken: api.csrf, sessionAxios: { post: api.post } }))
import { TrainingFeedbackImageField } from '../TrainingFeedbackImageField'
describe('Training feedback image identity', () => {
  it('uploads through existing authenticated endpoint and stores only immutable image identity', async () => {
    const change = vi.fn(); api.csrf.mockResolvedValue('csrf-token')
    api.post.mockResolvedValue({ data: { code: 0, data: { assetId: 'asset1', contentHash: 'a'.repeat(64), mimeType: 'image/png', url: 'https://private.example/image' } } })
    render(<TrainingFeedbackImageField disabled={false} onChange={change} />)
    await userEvent.upload(screen.getByLabelText('上传反馈图片'), new File(['png'], 'feedback.png', { type: 'image/png' }))
    await waitFor(() => expect(change).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledWith('/uploads/image', expect.any(FormData), { headers: { 'X-CSRF-Token': 'csrf-token' } })
    expect(change.mock.calls[0][0]).toEqual([{ asset: { assetId: 'asset1', contentHash: 'a'.repeat(64), mimeType: 'image/png' }, altText: 'feedback', order: 0 }])
    expect(JSON.stringify(change.mock.calls[0][0])).not.toContain('https:')
  })
})
