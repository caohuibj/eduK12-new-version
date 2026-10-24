import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AssessmentImagePresentationItem } from './types'

export type AssessmentImageAssetStatus = 'ready' | 'loading' | 'error'

export interface AssessmentImageAssetLoadState {
  status: AssessmentImageAssetStatus
  urls: Readonly<Record<string, string>>
  error: string | null
  retry: () => void
}

type ImageAssetLoader = (assetId: string) => Promise<Blob>

type InternalState = {
  key: string
  loader: ImageAssetLoader | null
  retryEpoch: number
  status: AssessmentImageAssetStatus
  urls: Record<string, string>
  error: string | null
}

const assetRequestKey = (items: readonly AssessmentImagePresentationItem[]): string => JSON.stringify(
  items.map((item) => [item.asset.assetId, item.asset.contentHash, item.asset.mimeType]),
)

/** A fetched Blob is not evidence that the browser can present the stimulus.
 * Keep the gate closed until decoding succeeds; old browsers use actual image
 * load/error events instead of treating an absent decode method as success. */
const decodeImage = async (objectUrl: string, signal: AbortSignal): Promise<void> => {
  const image = new Image()
  let cancel: (() => void) | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      cancel = () => {
        image.src = ''
        reject(new Error('Assessment image load cancelled'))
      }
      if (signal.aborted) { cancel(); return }
      signal.addEventListener('abort', cancel, { once: true })
      if (typeof image.decode === 'function') {
        image.src = objectUrl
        // Attach both handlers even if cancellation wins, so a later decoder
        // rejection cannot become an unhandled promise or revive an old gate.
        image.decode().then(resolve, reject)
      } else {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Assessment image decode failed'))
        image.src = objectUrl
      }
    })
  } finally {
    if (cancel) signal.removeEventListener('abort', cancel)
    image.onload = null
    image.onerror = null
    image.src = ''
  }
}

export const useAssessmentImageAssets = (
  items: readonly AssessmentImagePresentationItem[],
  loadAsset: ImageAssetLoader,
): AssessmentImageAssetLoadState => {
  const requestKey = useMemo(() => assetRequestKey(items), [items])
  const [retryEpoch, setRetryEpoch] = useState(0)
  const [state, setState] = useState<InternalState>({ key: '', loader: null, retryEpoch: -1, status: 'ready', urls: {}, error: null })

  useEffect(() => {
    const identity = { key: requestKey, loader: loadAsset, retryEpoch }
    if (!items.length) {
      setState({ ...identity, status: 'ready', urls: {}, error: null })
      return undefined
    }

    let disposed = false
    let failed = false
    const controller = new AbortController()
    const objectUrls = new Set<string>()
    const releaseUrls = () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
      objectUrls.clear()
    }
    setState({ ...identity, status: 'loading', urls: {}, error: null })

    const uniqueAssetIds = [...new Set(items.map((item) => item.asset.assetId))]
    void Promise.all(uniqueAssetIds.map(async (assetId) => {
      const blob = await loadAsset(assetId)
      // A different item can fail before this fetch resolves. Never allocate a
      // late object URL after the failed/disposed generation has been cleaned up.
      if (disposed || failed) return undefined
      const objectUrl = URL.createObjectURL(blob)
      objectUrls.add(objectUrl)
      await decodeImage(objectUrl, controller.signal)
      return [assetId, objectUrl] as const
    }))
      .then((loaded) => {
        if (disposed || failed) return
        const urls: Record<string, string> = {}
        for (const entry of loaded) if (entry) urls[entry[0]] = entry[1]
        setState({ ...identity, status: 'ready', urls, error: null })
      })
      .catch((reason) => {
        if (disposed || failed) return
        failed = true
        controller.abort()
        releaseUrls()
        setState({
          ...identity,
          status: 'error',
          urls: {},
          error: reason instanceof Error ? reason.message : 'Assessment image load failed',
        })
      })

    return () => {
      disposed = true
      controller.abort()
      releaseUrls()
    }
  }, [items, loadAsset, requestKey, retryEpoch])

  const retry = useCallback(() => setRetryEpoch((value) => value + 1), [])
  if (!items.length) return { status: 'ready', urls: {}, error: null, retry }
  if (state.key !== requestKey || state.loader !== loadAsset || state.retryEpoch !== retryEpoch) return { status: 'loading', urls: {}, error: null, retry }
  return { status: state.status, urls: state.urls, error: state.error, retry }
}

export default useAssessmentImageAssets
