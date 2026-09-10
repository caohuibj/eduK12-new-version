import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import AssessmentVideoPlayer from './AssessmentVideoPlayer'
import type { AssessmentVideoCapabilitySources, AssessmentVideoPresentationV1 } from './types'

export interface ScaleFormVideoGateProps {
  presentation?: AssessmentVideoPresentationV1
  loadSources: (presentation: AssessmentVideoPresentationV1) => Promise<AssessmentVideoCapabilitySources>
  children: ReactNode
  ariaLabel?: string
}

type LoadedSources = {
  identityKey: string
  value: AssessmentVideoCapabilitySources
}

const presentationIdentityKey = (presentation?: AssessmentVideoPresentationV1): string => (
  presentation ? JSON.stringify(presentation) : ''
)

export const ScaleFormVideoGate = ({ presentation, loadSources, children, ariaLabel }: ScaleFormVideoGateProps) => {
  const identityKey = presentationIdentityKey(presentation)
  const identityKeyRef = useRef(identityKey)
  const loadSourcesRef = useRef(loadSources)
  identityKeyRef.current = identityKey
  loadSourcesRef.current = loadSources

  const [sources, setSources] = useState<LoadedSources | null>(null)
  const [loadingIdentity, setLoadingIdentity] = useState<string | null>(presentation ? identityKey : null)
  const [error, setError] = useState<{ identityKey: string; message: string } | null>(null)
  const [readyIdentity, setReadyIdentity] = useState<string | null>(presentation ? null : identityKey)

  const load = useCallback(async () => {
    const requestedIdentity = identityKey
    const requestedPresentation = presentation
    if (!requestedPresentation) {
      setSources(null)
      setLoadingIdentity(null)
      setError(null)
      setReadyIdentity(requestedIdentity)
      return
    }

    setLoadingIdentity(requestedIdentity)
    setError(null)
    setReadyIdentity(null)
    try {
      const nextSources = await loadSourcesRef.current(requestedPresentation)
      if (identityKeyRef.current !== requestedIdentity) return
      setSources({ identityKey: requestedIdentity, value: nextSources })
    } catch (cause) {
      if (identityKeyRef.current !== requestedIdentity) return
      setSources(null)
      setLoadingIdentity(null)
      setError({
        identityKey: requestedIdentity,
        message: cause instanceof Error ? cause.message : '视频加载失败',
      })
    }
  }, [identityKey, presentation])

  useEffect(() => {
    void load()
  }, [load])

  if (!presentation) return <>{children}</>

  const currentSources = sources?.identityKey === identityKey ? sources.value : null
  const currentError = error?.identityKey === identityKey ? error.message : null
  const loading = loadingIdentity === identityKey
  const ready = readyIdentity === identityKey

  return (
    <section aria-label={ariaLabel || '测评视频'} className="space-y-4">
      {currentSources ? (
        <AssessmentVideoPlayer
          presentation={presentation}
          sources={currentSources}
          onReady={() => {
            if (identityKeyRef.current !== identityKey) return
            setLoadingIdentity(null)
            setReadyIdentity(identityKey)
          }}
          onError={() => {
            if (identityKeyRef.current !== identityKey) return
            setLoadingIdentity(null)
            setReadyIdentity(null)
            setError({ identityKey, message: '视频加载失败' })
          }}
          onRetry={load}
        />
      ) : null}
      {loading ? <p role="status" className="text-sm text-gray-500">正在准备视频…</p> : null}
      {currentError ? (
        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{currentError}</p>
          <button type="button" onClick={() => void load()} className="mt-2 underline">重试</button>
        </div>
      ) : null}
      <div aria-disabled={!ready}>{ready ? children : null}</div>
    </section>
  )
}

export default ScaleFormVideoGate
