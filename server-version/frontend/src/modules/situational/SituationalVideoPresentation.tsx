import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import AssessmentVideoPlayer from '../assessment-media/AssessmentVideoPlayer'
import type {
  AssessmentVideoCapabilitySources,
  AssessmentVideoPresentationV1,
} from '../assessment-media/types'

interface SituationalVideoPresentationProps {
  sceneKey: string
  presentation: AssessmentVideoPresentationV1
  loadSources: () => Promise<AssessmentVideoCapabilitySources>
  onReadyChange: (sceneKey: string, ready: boolean) => void
}

const SituationalVideoPresentation = ({
  sceneKey,
  presentation,
  loadSources,
  onReadyChange,
}: SituationalVideoPresentationProps) => {
  const [sources, setSources] = useState<AssessmentVideoCapabilitySources | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const refreshSources = useCallback(async () => {
    onReadyChange(sceneKey, false)
    setStatus('loading')
    try {
      const next = await loadSources()
      setSources(next)
      setStatus('ready')
    } catch {
      setSources(null)
      setStatus('error')
    }
  }, [loadSources, onReadyChange, sceneKey])

  useEffect(() => {
    let cancelled = false
    onReadyChange(sceneKey, false)
    setSources(null)
    setStatus('loading')
    void loadSources()
      .then((next) => {
        if (cancelled) return
        setSources(next)
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setStatus('error')
      })
    return () => {
      cancelled = true
      onReadyChange(sceneKey, false)
    }
  }, [loadSources, onReadyChange, sceneKey])

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
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 font-medium"
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
      onReady={() => onReadyChange(sceneKey, true)}
      onError={() => onReadyChange(sceneKey, false)}
      onRetry={refreshSources}
    />
  )
}

export default SituationalVideoPresentation
