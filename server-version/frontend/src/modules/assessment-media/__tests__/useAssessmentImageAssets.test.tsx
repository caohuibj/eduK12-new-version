import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const decode = vi.fn<(source: string) => Promise<void>>()
const images: Array<{ src: string; onload: (() => void) | null; onerror: (() => void) | null }> = []
const installImageMock = (supportsDecode = true) => {
  vi.stubGlobal('Image', class {
    src = ''
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor() {
      images.push(this)
      if (supportsDecode) Object.defineProperty(this, 'decode', { value: () => decode(this.src) })
    }
  })
}
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}

describe('useAssessmentImageAssets', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    decode.mockReset().mockResolvedValue(undefined)
    images.length = 0
    installImageMock()
    let urlOrdinal = 0
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => `blob:${blob.type}:${++urlOrdinal}`),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('loads unique assets and revokes object URLs on unmount', async () => {
    const items = [item('asset-1'), item('asset-1', 'duplicate presentation')]
    const loadAsset = vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    const { result, unmount } = renderHook(() => useAssessmentImageAssets(items, loadAsset))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(loadAsset).toHaveBeenCalledTimes(1)
    expect(decode).toHaveBeenCalledTimes(1)
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

  it('keeps fetched HTTP-success bytes blocked until every image has actually decoded', async () => {
    const first = deferred<void>(), second = deferred<void>()
    decode.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    const items = [item('asset-1'), item('asset-2')]
    const loadAsset = vi.fn().mockResolvedValue(new Blob(['original image bytes'], { type: 'image/png' }))
    const { result } = renderHook(() => useAssessmentImageAssets(items, loadAsset))
    await waitFor(() => expect(decode).toHaveBeenCalledTimes(2))
    expect(result.current.status).toBe('loading')
    expect(result.current.urls).toEqual({})
    await act(async () => { first.resolve(undefined); await first.promise })
    expect(result.current.status).toBe('loading')
    await act(async () => { second.resolve(undefined); await second.promise })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(Object.keys(result.current.urls)).toEqual(['asset-1', 'asset-2'])
  })

  it('blocks a corrupt 200 Blob, releases it, and retries decoding before becoming ready', async () => {
    decode.mockRejectedValueOnce(new Error('Image decoding failed'))
    const retryDecode = deferred<void>()
    decode.mockImplementationOnce(() => retryDecode.promise)
    const items = [item('asset-1')]
    const loadAsset = vi.fn().mockResolvedValue(new Blob(['corrupt bytes despite HTTP 200'], { type: 'image/png' }))
    const { result, unmount } = renderHook(() => useAssessmentImageAssets(items, loadAsset))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.urls).toEqual({})
    expect(result.current.error).toContain('Image decoding failed')
    const failedUrl = vi.mocked(URL.createObjectURL).mock.results[0]!.value
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(failedUrl)
    act(() => result.current.retry())
    await waitFor(() => expect(decode).toHaveBeenCalledTimes(2))
    expect(result.current.status).toBe('loading')
    await act(async () => { retryDecode.resolve(undefined); await retryDecode.promise })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const readyUrl = result.current.urls['asset-1']!
    expect(readyUrl).not.toBe(failedUrl)
    unmount()
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.filter(([url]) => url === failedUrl)).toHaveLength(1)
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.filter(([url]) => url === readyUrl)).toHaveLength(1)
  })

  it.each(['resolve', 'reject'] as const)('ignores old decode %s after a generation switch', async outcome => {
    const oldDecode = deferred<void>(), newDecode = deferred<void>()
    decode.mockImplementationOnce(() => oldDecode.promise).mockImplementationOnce(() => newDecode.promise)
    const loadAsset = vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    const { result, rerender } = renderHook(
      ({ items }: { items: AssessmentImagePresentationItem[] }) => useAssessmentImageAssets(items, loadAsset),
      { initialProps: { items: [item('old')] } },
    )
    await waitFor(() => expect(decode).toHaveBeenCalledTimes(1))
    const oldUrl = vi.mocked(URL.createObjectURL).mock.results[0]!.value
    rerender({ items: [item('new')] })
    await waitFor(() => expect(decode).toHaveBeenCalledTimes(2))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(oldUrl)
    await act(async () => {
      if (outcome === 'resolve') oldDecode.resolve(undefined)
      else oldDecode.reject(new Error('late old decode failure'))
      await oldDecode.promise.catch(() => undefined)
    })
    expect(result.current.status).toBe('loading')
    expect(result.current.urls).toEqual({})
    await act(async () => { newDecode.resolve(undefined); await newDecode.promise })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.urls.old).toBeUndefined()
    expect(result.current.urls.new).toBeTruthy()
    expect(result.current.error).toBeNull()
  })

  it('does not allocate late Blob URLs after another asset has failed', async () => {
    const lateBlob = deferred<Blob>()
    const loadAsset = vi.fn((assetId: string) => assetId === 'bad'
      ? Promise.reject(new Error('Unavailable')) : lateBlob.promise)
    const items = [item('bad'), item('late')]
    const { result, unmount } = renderHook(() => useAssessmentImageAssets(items, loadAsset))
    await waitFor(() => expect(result.current.status).toBe('error'))
    await act(async () => { lateBlob.resolve(new Blob(['late image'], { type: 'image/png' })); await lateBlob.promise })
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(decode).not.toHaveBeenCalled()
    expect(result.current.status).toBe('error')
    unmount()
  })

  it('releases all allocated URLs when one decode fails while another remains pending', async () => {
    const first = deferred<void>(), second = deferred<void>()
    decode.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    const items = [item('bad'), item('pending')]
    const loadAsset = vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    const { result, unmount } = renderHook(() => useAssessmentImageAssets(items, loadAsset))
    await waitFor(() => expect(decode).toHaveBeenCalledTimes(2))
    await act(async () => { first.reject(new Error('Corrupt image')); await first.promise.catch(() => undefined) })
    await waitFor(() => expect(result.current.status).toBe('error'))
    const allocated = vi.mocked(URL.createObjectURL).mock.results.map(result => result.value)
    for (const url of allocated) expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
    await act(async () => { second.resolve(undefined); await second.promise })
    expect(result.current.status).toBe('error')
    expect(result.current.urls).toEqual({})
    unmount()
    for (const url of allocated) expect(vi.mocked(URL.revokeObjectURL).mock.calls.filter(([value]) => value === url)).toHaveLength(1)
  })

  it('cancels pending decoding on unmount without leaking or reviving an object URL', async () => {
    const pending = deferred<void>()
    decode.mockImplementationOnce(() => pending.promise)
    const items = [item('asset-1')]
    const loadAsset = vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    const { unmount } = renderHook(() => useAssessmentImageAssets(items, loadAsset))
    await waitFor(() => expect(decode).toHaveBeenCalledTimes(1))
    const objectUrl = vi.mocked(URL.createObjectURL).mock.results[0]!.value
    unmount()
    expect(images[0]!.src).toBe('')
    await act(async () => { pending.reject(new Error('decode cancelled after unmount')); await pending.promise.catch(() => undefined) })
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.filter(([url]) => url === objectUrl)).toHaveLength(1)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('uses real load/error events when Image.decode is unavailable, never an automatic success', async () => {
    installImageMock(false)
    const items = [item('asset-1')]
    const loadAsset = vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    const { result } = renderHook(() => useAssessmentImageAssets(items, loadAsset))
    await waitFor(() => expect(images).toHaveLength(1))
    expect(result.current.status).toBe('loading')
    await act(async () => { images[0]!.onerror!() })
    await waitFor(() => expect(result.current.status).toBe('error'))
    act(() => result.current.retry())
    await waitFor(() => expect(images).toHaveLength(2))
    expect(result.current.status).toBe('loading')
    await act(async () => { images[1]!.onload!() })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(decode).not.toHaveBeenCalled()
    expect(images.every(image => image.onload === null && image.onerror === null)).toBe(true)
  })

})
