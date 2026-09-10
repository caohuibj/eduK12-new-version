import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import AssessmentVideoPlayer from './AssessmentVideoPlayer'
import type { AssessmentVideoCapabilitySources, AssessmentVideoPresentationV1 } from './types'

export interface ScaleFormVideoGateProps {
  presentation?: AssessmentVideoPresentationV1
  loadSources: (presentation: AssessmentVideoPresentationV1) => Promise<AssessmentVideoCapabilitySources>
  children: ReactNode
  ariaLabel?: string
}

export const ScaleFormVideoGate = ({ presentation, loadSources, children, ariaLabel }: ScaleFormVideoGateProps) => {
  const [sources, setSources] = useState<AssessmentVideoCapabilitySources | null>(null)
  const [loading, setLoading] = useState(Boolean(presentation))
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(!presentation)

  const identityKey = useMemo(() => presentation
    ? [presentation.video.assetId, presentation.video.contentHash, presentation.video.mimeType].join(':')
    : '', [presentation])

  const load = useCallback(async () => {
    if (!presentation) {
      setSources(null)
      setLoading(false)
      setError(null)
      setReady(true)
      return
    }
    setLoading(true)
    setError(null)
    setReady(false)
    try {
      setSources(await loadSources(presentation))
    } catch (cause) {
      setSources(null)
      setLoading(false)
      setError(cause instanceof Error ? cause.message : '视频加载失败')
    }
  }, [loadSources, presentation])

  useEffect(() => {
    void load()
  }, [identityKey, load])

  if (!presentation) return <>{children}</>

  return (
    <section aria-label={ariaLabel || '测评视频'} className="space-y-4">
      {sources ? (
        <AssessmentVideoPlayer
          presentation={presentation}
          sources={sources}
          onReady={() => {
            setLoading(false)
            setReady(true)
          }}
          onError={() => {
            setLoading(false)
            setReady(false)
            setError('视频加载失败')
          }}
          onRetry={load}
        />
      ) : null}
      {loading ? <p role="status" className="text-sm text-gray-500">正在准备视频…</p> : null}
      {error ? (
        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{error}</p>
          <button type="button" onClick={() => void load()} className="mt-2 underline">重试</button>
        </div>
      ) : null}
      <div aria-disabled={!ready}>{ready ? children : null}</div>
    </section>
  )
}

export default ScaleFormVideoGate
