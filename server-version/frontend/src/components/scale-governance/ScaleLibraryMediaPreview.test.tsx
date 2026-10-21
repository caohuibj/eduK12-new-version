import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ScaleLibraryMediaPreview } from './ScaleLibraryMediaPreview'
const api = vi.hoisted(() => ({ preview: vi.fn(), capability: vi.fn() }))
vi.mock('../../api/scaleLibraryGovernance', () => ({ previewGovernanceMedia: api.preview, capabilityGovernanceMedia: api.capability }))
const item = { assetId: 'media', contentHash: 'fixed-hash', mimeType: 'video/mp4', sizeBytes: 120, assetVersion: '1', usages: ['item'], rights: 'AUTHOR_SHARED_FOR_BOUND_SCALE' as const, dependencyReleaseIds: [] }
beforeEach(() => { vi.resetAllMocks() })
describe('authorized fixed-version media preview', () => {
  it('requests a short-lived video capability only on explicit preview and never guesses an asset URL', async () => {
    api.capability.mockResolvedValue({ url: '/api/assets/granted?capability=synthetic', expiresAt: '2098-10-21T00:00:00Z' })
    const { container } = render(<ScaleLibraryMediaPreview product="TRAINING" context={{ kind: 'submissions', id: 'application' }} item={item}/>)
    expect(api.capability).not.toHaveBeenCalled(); expect(container.querySelector('video')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '授权预览视频' }))
    await waitFor(() => expect(container.querySelector('video')).toHaveAttribute('src', '/api/assets/granted?capability=synthetic'))
    expect(api.capability).toHaveBeenCalledWith('TRAINING', { kind: 'submissions', id: 'application' }, 'media')
    expect(container.querySelector('video')).toHaveAttribute('preload', 'none')
  })
  it('rejects an unexpected external preview URL', async () => {
    api.capability.mockResolvedValue({ url: 'https://untrusted.example/video', expiresAt: '2098-10-21T00:00:00Z' })
    const { container } = render(<ScaleLibraryMediaPreview product="SURVEY" context={{ kind: 'sources', id: 'source', releaseId: 'release' }} item={item}/>)
    fireEvent.click(screen.getByRole('button', { name: '授权预览视频' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('授权响应无效')
    expect(container.querySelector('video')).toBeNull()
  })
})
