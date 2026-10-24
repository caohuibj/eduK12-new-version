import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sessionFetch } from '../../../api/client'
import { newOnlineDocument, OnlineAuthorEditor } from '../OnlineAuthorEditor'

vi.mock('../../../api/client', () => ({ sessionFetch: vi.fn() }))
beforeEach(() => {
  vi.resetAllMocks()
  // These transport fixtures contain synthetic bytes; decoder behavior has its own hook contracts.
  vi.stubGlobal('Image', class { src = ''; decode = () => Promise.resolve() })
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:review'), configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
})
afterEach(() => vi.unstubAllGlobals())

describe('online read-only review', () => {
  it('allows a reviewer to inspect another scene and retry media while all authoring controls remain disabled', async () => {
    const value = newOnlineDocument(), onChange = vi.fn()
    value.display.scenes = [1, 2].map(index => ({ sceneKey: `scene-${index}`, title: `情境 ${index}`, stimulus: `文字 ${index}`,
      image: { asset: { assetId: `image-${index}`, contentHash: 'a'.repeat(64), mimeType: 'image/png' as const }, altText: `图片 ${index}`, rightsStatus: 'authorized' as const, rightsNote: '课程展示许可' }, questions: [] }))
    vi.mocked(sessionFetch).mockImplementation(async url => String(url).includes('image-2')
      ? { ok: true, blob: async () => new Blob(['image'], { type: 'image/png' }) } as Response
      : { ok: false } as Response)
    render(<OnlineAuthorEditor value={value} onChange={onChange} disabled draftId="review-draft"/>)
    expect(screen.getByLabelText('测验标题')).toBeDisabled()
    expect(screen.getByRole('button', { name: '增加情境' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '添加人工样例' })).toBeDisabled()
    expect(await screen.findByRole('button', { name: '重试' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '2. 情境 2' }))
    expect(await screen.findByRole('img', { name: '图片 2' })).toBeInTheDocument()
    expect(screen.getByLabelText('情境材料')).toHaveValue('文字 2')
    expect(screen.getByLabelText('情境材料')).toBeDisabled()
    expect(sessionFetch).toHaveBeenCalledWith('/api/situational/authoring/drafts/review-draft/media/image-2/content', { cache: 'no-store' })
    expect(onChange).not.toHaveBeenCalled()
  })
})
