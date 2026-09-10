import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AssessmentVideoCapabilitySources } from '../assessment-media/types'
import type { CognitiveVideoPresentationEntry } from './video-presentation'

export type CognitiveVideoSourceStatus = 'ready' | 'loading' | 'error'

export interface CognitiveVideoSourceState {
  status: CognitiveVideoSourceStatus
  sources: Readonly<Record<string, AssessmentVideoCapabilitySources>>
  error: string | null
  retry: () => void
  refresh: (videoKey: string) => Promise<void>
}

type InternalState = {
  requestKey: string
  status: CognitiveVideoSourceStatus
  sources: Record<string, AssessmentVideoCapabilitySources>
  error: string | null
}

const entryRequestKey = (entries: readonly CognitiveVideoPresentationEntry[]): string => JSON.stringify(
  entries.map((entry) => [
    entry.key,
    entry.presentation.video.assetId,
    entry.presentation.video.contentHash,
    entry.presentation.video.mimeType,
  ]),
)

export const useCognitiveVideoSources = (
  entries: readonly CognitiveVideoPresentationEntry[],
  issueSources: (videoKey: string) => Promise<AssessmentVideoCapabilitySources>,
): CognitiveVideoSourceState => {
  const requestKey = useMemo(() => entryRequestKey(entries), [entries])
  const [retryEpoch, setRetryEpoch] = useState(0)
  const [state, setState] = useState<InternalState>({
    requestKey: '',
    status: 'ready',
    sources: {},
    error: null,
  })

  useEffect(() => {
    // Preserve MEDIA-3/no-media behavior exactly: mounting the video adapter for
    // a session with no frozen video slots must not schedule an extra render.
    if (!entries.length) return undefined

    let disposed = false
    setState({ requestKey, status: 'loading', sources: {}, error: null })
    void Promise.all(entries.map(async (entry) => [entry.key, await issueSources(entry.key)] as const))
      .then((loaded) => {
        if (disposed) return
        setState({
          requestKey,
          status: 'ready',
          sources: Object.fromEntries(loaded),
          error: null,
        })
      })
      .catch((reason) => {
        if (disposed) return
        setState({
          requestKey,
          status: 'error',
          sources: {},
          error: reason instanceof Error ? reason.message : 'Cognitive video capability load failed',
        })
      })
    return () => {
      disposed = true
    }
  }, [entries, issueSources, requestKey, retryEpoch])

  const retry = useCallback(() => setRetryEpoch((value) => value + 1), [])
  const refresh = useCallback(async (videoKey: string) => {
    if (!entries.some((entry) => entry.key === videoKey)) {
      throw new Error('Unknown frozen Cognitive video slot')
    }
    const next = await issueSources(videoKey)
    setState((current) => ({
      ...current,
      status: 'ready',
      error: null,
      sources: { ...current.sources, [videoKey]: next },
    }))
  }, [entries, issueSources])

  if (!entries.length) return { status: 'ready', sources: {}, error: null, retry, refresh }
  if (state.requestKey !== requestKey) return { status: 'loading', sources: {}, error: null, retry, refresh }
  return { status: state.status, sources: state.sources, error: state.error, retry, refresh }
}

export default useCognitiveVideoSources
