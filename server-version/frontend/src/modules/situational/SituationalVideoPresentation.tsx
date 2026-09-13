import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import AssessmentVideoPlayer from '../assessment-media/AssessmentVideoPlayer'
import {
  markRequiredVideoComplete,
  readRequiredVideoCompletion,
  type RequiredVideoCompletionIdentity,
} from '../assessment-media/required-video-completion'
import type {
  AssessmentVideoCapabilitySources,
  AssessmentVideoPresentationV1,
} from '../assessment-media/types'

export type SituationalVideoGateStatus = 'checking' | 'blocked' | 'ready' | 'error'

interface SituationalVideoPresentationProps {
  draftKey: string
  sceneKey: string
  slotKey: string
  presentation: AssessmentVideoPresentationV1
  loadSources: () => Promise<AssessmentVideoCapabilitySources>
  onGateChange: (sceneKey: string, status: SituationalVideoGateStatus, message?: string) => void
}

const completionIdentityFor = (
  draftKey: string,
  slotKey: string,
  presentation: AssessmentVideoPresentationV1,
): RequiredVideoCompletionIdentity => ({
  draftKey,
  slotKey,
  assetId: presentation.video.assetId,
  contentHash: presentation.video.contentHash,
})

const SituationalVideoPresentation = ({
  draftKey,
  sceneKey,
  slotKey,
  presentation,
  loadSources,
  onGateChange,
}: SituationalVideoPresentationProps) => {
  const completionIdentityKey = `${draftKey}:${slotKey}:${presentation.video.assetId}:${presentation.video.contentHash}`
  const identityRef = useRef(completionIdentityKey)
  identityRef.current = completionIdentityKey

  const [sources, setSources] = useState<AssessmentVideoCapabilitySources | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [completionLoaded, setCompletionLoaded] = useState(false)
  const [viewingComplete, setViewingComplete] = useState(false)
  const [completionError, setCompletionError] = useState<string | null>(null)

  const refreshSources = useCallback(async () => {
    setStatus('loading')
    try {
      const next = await loadSources()
      if (identityRef.current !== completionIdentityKey) return
      setSources(next)
      setStatus('ready')
    } catch {
      if (identityRef.current !== completionIdentityKey) return
      setSources(null)
      setStatus('error')
    }
  }, [completionIdentityKey, loadSources])

  useEffect(() => {
    let cancelled = false
    setSources(null)
    setStatus('loading')
    void loadSources()
      .then((next) => {
        if (cancelled || identityRef.current !== completionIdentityKey) return
        setSources(next)
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled || identityRef.current !== completionIdentityKey) return
        setStatus('error')
      })
    return () => { cancelled = true }
  }, [completionIdentityKey, loadSources])

  useEffect(() => {
    let cancelled = false
    const identity = completionIdentityFor(draftKey, slotKey, presentation)
    setCompletionLoaded(false)
    setViewingComplete(false)
    setCompletionError(null)
    void readRequiredVideoCompletion(identity)
      .then((marker) => {
        if (cancelled || identityRef.current !== completionIdentityKey) return
        setViewingComplete(Boolean(marker))
        setCompletionLoaded(true)
      })
      .catch((cause) => {
        if (cancelled || identityRef.current !== completionIdentityKey) return
        setViewingComplete(false)
        setCompletionLoaded(true)
        setCompletionError(cause instanceof Error ? cause.message : '无法读取视频观看完成状态')
      })
    return () => { cancelled = true }
  }, [completionIdentityKey, draftKey, presentation, slotKey])

  useEffect(() => {
    if (!completionLoaded) {
      onGateChange(sceneKey, 'checking', '正在核对本机视频观看状态。')
      return
    }
    if (completionError) {
      onGateChange(sceneKey, 'error', `无法确认本机观看状态：${completionError}`)
      return
    }
    if (viewingComplete) {
      onGateChange(sceneKey, 'ready')
      return
    }
    if (status === 'error') {
      onGateChange(sceneKey, 'error', '视频题面暂时无法加载，请重试。')
      return
    }
    if (status !== 'ready') {
      onGateChange(sceneKey, 'checking', '正在准备必看视频。')
      return
    }
    onGateChange(sceneKey, 'blocked', '请以 1× 速度从头完整观看视频后继续。')
  }, [completionError, completionLoaded, onGateChange, sceneKey, status, viewingComplete])

  const persistViewingCompletion = async () => {
    const requestedIdentity = completionIdentityKey
    const identity = completionIdentityFor(draftKey, slotKey, presentation)
    setCompletionError(null)
    try {
      await markRequiredVideoComplete(identity)
      if (identityRef.current !== requestedIdentity) return
      setViewingComplete(true)
      setCompletionLoaded(true)
    } catch (cause) {
      if (identityRef.current !== requestedIdentity) return
      const error = cause instanceof Error ? cause : new Error('无法保存视频观看完成状态')
      setCompletionError(error.message)
      throw error
    }
  }

  if (status === 'loading' || (!sources && status !== 'error')) {
    return (
      <div className="mt-5 flex min-h-48 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-600" role="status">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
        正在准备视频题面…
      </div>
    )
  }

  if (status === 'error' || !sources) {
    return (
      <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-700" role="alert">
        <AlertCircle className="mx-auto mb-2 h-6 w-6" aria-hidden="true" />
        <p>视频题面暂时无法加载。</p>
        <button
          type="button"
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 font-medium"
          onClick={() => void refreshSources()}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          重试视频
        </button>
      </div>
    )
  }

  return (
    <AssessmentVideoPlayer
      presentation={presentation}
      sources={sources}
      className="mt-5"
      autoPlay={false}
      requiredViewing
      viewingComplete={viewingComplete}
      onViewingComplete={persistViewingCompletion}
      onError={() => setStatus('error')}
      onRetry={refreshSources}
    />
  )
}

export default SituationalVideoPresentation
