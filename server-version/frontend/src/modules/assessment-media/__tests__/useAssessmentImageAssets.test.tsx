import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAssessmentImageAssets } from '../useAssessmentImageAssets'
import type { AssessmentImagePresentationItem } from '../types'

const item = (assetId: string, altText = assetId): AssessmentImagePresentationItem => ({
  asset: {
    assetId,
    contentHash: 'a'.repeat(64),
    mimeType: 'image/png',
  },
  altText,
})

describe('useAssessmentImageAssets', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => `blob:${blob.type}:${Math.random()}`),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
  })

  it('loads unique assets and revokes object URLs on unmount', async () => {
    const items = [item('asset-1'), item('asset-1', 'duplicate presentation')]
    const loadAsset = vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    const { result, unmount } = renderHook(() => useAssessmentImageAssets(items, loadAsset))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(loadAsset).toHaveBeenCalledTimes(1)
    expect(result.current.urls['asset-1']).toMatch(/^blob:image\/png:/u)

    const objectUrl = result.current.urls['asset-1']!
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl)
  })

  it('exposes an explicit retry that recovers after a failed load', async () => {
    const items = [item('asset-1')]
    const loadAsset = vi.fn()
      .mockRejectedValueOnce(new Error('temporary unavailable'))
      .mockResolvedValueOnce(new Blob(['image'], { type: 'image/png' }))
    const { result } = renderHook(() => useAssessmentImageAssets(items, loadAsset))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toContain('temporary unavailable')

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(loadAsset).toHaveBeenCalledTimes(2)
  })

  it('ignores stale async completion after the requested items change', async () => {
    let resolveFirst: ((blob: Blob) => void) | undefined
    const first = new Promise<Blob>((resolve) => { resolveFirst = resolve })
    const loadAsset = vi.fn((assetId: string) => (
      assetId === 'asset-1'
        ? first
        : Promise.resolve(new Blob(['second'], { type: 'image/webp' }))
    ))
    const firstItems = [item('asset-1')]
    const secondItems: AssessmentImagePresentationItem[] = [{
      asset: { assetId: 'asset-2', contentHash: 'b'.repeat(64), mimeType: 'image/webp' },
      altText: 'second',
    }]
    const { result, rerender } = renderHook(
      ({ items }: { items: AssessmentImagePresentationItem[] }) => useAssessmentImageAssets(items, loadAsset),
      { initialProps: { items: firstItems } },
    )

    rerender({ items: secondItems })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.urls['asset-2']).toBeTruthy()

    await act(async () => {
      resolveFirst?.(new Blob(['first'], { type: 'image/png' }))
      await first
    })
    expect(result.current.urls['asset-1']).toBeUndefined()
  })
})
