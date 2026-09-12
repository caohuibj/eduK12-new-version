import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import AssessmentVideoPlayer from './AssessmentVideoPlayer'
import {
  markRequiredVideoComplete,
  readRequiredVideoCompletion,
  type RequiredVideoCompletionIdentity,
} from './required-video-completion'
import type { AssessmentVideoCapabilitySources, AssessmentVideoPresentationV1 } from './types'

export interface RequiredVideoGateContext {
  draftKey: string
  slotKey: string
}

export interface ScaleFormVideoGateProps {
  presentation?: AssessmentVideoPresentationV1
  loadSources: (presentation: AssessmentVideoPresentationV1) => Promise<AssessmentVideoCapabilitySources>
  children: ReactNode
  ariaLabel?: string
  requiredViewing?: RequiredVideoGateContext
}

type LoadedSources = {
  identityKey: string
  value: AssessmentVideoCapabilitySources
}

const presentationIdentityKey = (presentation?: AssessmentVideoPresentationV1): string => (
  presentation ? JSON.stringify(presentation) : ''
)

const completionIdentityFor = (
  presentation: AssessmentVideoPresentationV1,
  context: RequiredVideoGateContext,
): RequiredVideoCompletionIdentity => ({
  draftKey: context.draftKey,
  slotKey: context.slotKey,
  assetId: presentation.video.assetId,
  contentHash: presentation.video.contentHash,
})

export const ScaleFormVideoGate = ({
  presentation,
  loadSources,
  children,
  ariaLabel,
  requiredViewing,
}: ScaleFormVideoGateProps) => {
  const identityKey = presentationIdentityKey(presentation)
  const completionIdentityKey = requiredViewing && presentation
    ? `${requiredViewing.draftKey}:${requiredViewing.slotKey}:${presentation.video.assetId}:${presentation.video.contentHash}`
    : ''
  const identityKeyRef = useRef(identityKey)
  const completionIdentityKeyRef = useRef(completionIdentityKey)
  const loadSourcesRef = useRef(loadSources)
  identityKeyRef.current = identityKey
  completionIdentityKeyRef.current = completionIdentityKey
  loadSourcesRef.current = loadSources

  const [sources, setSources] = useState<LoadedSources | null>(null)
  const [loadingIdentity, setLoadingIdentity] = useState<string | null>(presentation ? identityKey : null)
  const [error, setError] = useState<{ identityKey: string; message: string } | null>(null)
  const [readyIdentity, setReadyIdentity] = useState<string | null>(presentation ? null : identityKey)
  const [completionLoadedIdentity, setCompletionLoadedIdentity] = useState<string | null>(requiredViewing ? null : completionIdentityKey)
  const [viewingCompleteIdentity, setViewingCompleteIdentity] = useState<string | null>(null)
  const [completionError, setCompletionError] = useState<{ identityKey: string; message: string } | null>(null)

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

  useEffect(() => {
    if (!presentation || !requiredViewing) {
      setCompletionLoadedIdentity(completionIdentityKey)
      setViewingCompleteIdentity(null)
      setCompletionError(null)
      return
    }
    const requestedIdentity = completionIdentityKey
    const completionIdentity = completionIdentityFor(presentation, requiredViewing)
    setCompletionLoadedIdentity(null)
    setViewingCompleteIdentity(null)
    setCompletionError(null)
    void readRequiredVideoCompletion(completionIdentity)
      .then((marker) => {
        if (completionIdentityKeyRef.current !== requestedIdentity) return
        setViewingCompleteIdentity(marker ? requestedIdentity : null)
        setCompletionLoadedIdentity(requestedIdentity)
      })
      .catch((cause) => {
        if (completionIdentityKeyRef.current !== requestedIdentity) return
        setCompletionLoadedIdentity(requestedIdentity)
        setViewingCompleteIdentity(null)
        setCompletionError({
          identityKey: requestedIdentity,
          message: cause instanceof Error ? cause.message : '无法读取视频观看完成状态',
        })
      })
  }, [completionIdentityKey, presentation, requiredViewing])

  if (!presentation) return <>{children}</>

  const currentSources = sources?.identityKey === identityKey ? sources.value : null
  const currentError = error?.identityKey === identityKey ? error.message : null
  const loading = loadingIdentity === identityKey
  const ready = readyIdentity === identityKey
  const completionLoaded = !requiredViewing || completionLoadedIdentity === completionIdentityKey
  const viewingComplete = Boolean(requiredViewing && viewingCompleteIdentity === completionIdentityKey)
  const currentCompletionError = completionError?.identityKey === completionIdentityKey ? completionError.message : null
  // A durable marker is authoritative for the same frozen slot. Returning to an
  // already-completed video must not require another capability fetch or metadata
  // load before the associated response controls are restored.
  const unlocked = requiredViewing
    ? completionLoaded && viewingComplete
    : ready

  const persistViewingCompletion = async () => {
    if (!requiredViewing) return
    const requestedIdentity = completionIdentityKey
    const completionIdentity = completionIdentityFor(presentation, requiredViewing)
    setCompletionError(null)
    try {
      await markRequiredVideoComplete(completionIdentity)
      if (completionIdentityKeyRef.current !== requestedIdentity) return
      setViewingCompleteIdentity(requestedIdentity)
      setCompletionLoadedIdentity(requestedIdentity)
    } catch (cause) {
      if (completionIdentityKeyRef.current !== requestedIdentity) return
      const nextError = cause instanceof Error ? cause : new Error('无法保存视频观看完成状态')
      setCompletionError({ identityKey: requestedIdentity, message: nextError.message })
      throw nextError
    }
  }

  return (
    <section aria-label={ariaLabel || '测评视频'} className="space-y-4">
      {currentSources ? (
        <AssessmentVideoPlayer
          presentation={presentation}
          sources={currentSources}
          requiredViewing={Boolean(requiredViewing)}
          viewingComplete={viewingComplete}
          onViewingComplete={persistViewingCompletion}
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
          <button type="button" onClick={() => void load()} className="mt-2 min-h-11 underline">重试</button>
        </div>
      ) : null}
      {requiredViewing && !completionLoaded ? <p role="status" className="text-sm text-gray-500">正在核对本地观看状态…</p> : null}
      {currentCompletionError ? (
        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          无法确认本地观看状态：{currentCompletionError}。当前不会解锁作答。
        </div>
      ) : null}
      <div aria-disabled={!unlocked}>{unlocked ? children : null}</div>
    </section>
  )
}

export default ScaleFormVideoGate
