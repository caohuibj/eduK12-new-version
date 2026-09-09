import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AssessmentImagePresentationItem } from './types'

export type AssessmentImageAssetStatus = 'ready' | 'loading' | 'error'

export interface AssessmentImageAssetLoadState {
  status: AssessmentImageAssetStatus
  urls: Readonly<Record<string, string>>
  error: string | null
  retry: () => void
}

type InternalState = {
  key: string
  status: AssessmentImageAssetStatus
  urls: Record<string, string>
  error: string | null
}

const assetRequestKey = (items: readonly AssessmentImagePresentationItem[]): string => JSON.stringify(
  items.map((item) => [item.asset.assetId, item.asset.contentHash, item.asset.mimeType]),
)

export const useAssessmentImageAssets = (
  items: readonly AssessmentImagePresentationItem[],
  loadAsset: (assetId: string) => Promise<Blob>,
): AssessmentImageAssetLoadState => {
  const requestKey = useMemo(() => assetRequestKey(items), [items])
  const [retryEpoch, setRetryEpoch] = useState(0)
  const [state, setState] = useState<InternalState>({ key: '', status: 'ready', urls: {}, error: null })

  useEffect(() => {
    if (!items.length) {
      setState({ key: requestKey, status: 'ready', urls: {}, error: null })
      return undefined
    }

    let disposed = false
    let objectUrls: string[] = []
    setState({ key: requestKey, status: 'loading', urls: {}, error: null })

    const uniqueAssetIds = [...new Set(items.map((item) => item.asset.assetId))]
    void Promise.all(uniqueAssetIds.map(async (assetId) => [assetId, await loadAsset(assetId)] as const))
      .then((loaded) => {
        if (disposed) return
        const urls: Record<string, string> = {}
        for (const [assetId, blob] of loaded) {
          const objectUrl = URL.createObjectURL(blob)
          objectUrls.push(objectUrl)
          urls[assetId] = objectUrl
        }
        setState({ key: requestKey, status: 'ready', urls, error: null })
      })
      .catch((reason) => {
        if (disposed) return
        setState({
          key: requestKey,
          status: 'error',
          urls: {},
          error: reason instanceof Error ? reason.message : 'Assessment image load failed',
        })
      })

    return () => {
      disposed = true
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
      objectUrls = []
    }
  }, [items, loadAsset, requestKey, retryEpoch])

  const retry = useCallback(() => setRetryEpoch((value) => value + 1), [])
  if (!items.length) return { status: 'ready', urls: {}, error: null, retry }
  if (state.key !== requestKey) return { status: 'loading', urls: {}, error: null, retry }
  return { status: state.status, urls: state.urls, error: state.error, retry }
}

export default useAssessmentImageAssets
