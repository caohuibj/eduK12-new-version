import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import type { AssessmentVideoCapabilitySources, AssessmentVideoPresentationV1 } from './types'

export interface AssessmentVideoPlayerProps {
  presentation: AssessmentVideoPresentationV1
  sources: AssessmentVideoCapabilitySources
  className?: string
  autoPlay?: boolean
  onRetry?: () => void | Promise<void>
  onReady?: () => void
  onError?: () => void
}

export const AssessmentVideoPlayer = ({
  presentation,
  sources,
  className = '',
  autoPlay = false,
  onRetry,
  onReady,
  onError,
}: AssessmentVideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [loading, setLoading] = useState(true)
  const [buffering, setBuffering] = useState(false)
  const [error, setError] = useState(false)
  const title = presentation.title || '测评视频'

  useEffect(() => {
    setLoading(true)
    setBuffering(false)
    setError(false)
  }, [sources.videoUrl])

  const handleReady = () => {
    setLoading(false)
    setBuffering(false)
    onReady?.()
  }

  const handleError = () => {
    setLoading(false)
    setBuffering(false)
    setError(true)
    onError?.()
  }

  const retry = async () => {
    setError(false)
    setLoading(true)
    await onRetry?.()
    videoRef.current?.load()
  }

  return (
    <section className={className} data-assessment-video-player>
      {presentation.description ? (
        <p className="mb-2 text-sm text-gray-600">{presentation.description}</p>
      ) : null}

      <div className="relative overflow-hidden rounded-lg bg-black" style={{ aspectRatio: '16/9' }}>
        {(loading || buffering) && !error ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-white">
            <div className="text-center">
              <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin" aria-hidden="true" />
              <span className="text-sm">{buffering ? '缓冲视频中…' : '加载视频中…'}</span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-950 text-white">
            <div className="text-center">
              <AlertCircle className="mx-auto mb-2 h-9 w-9 text-red-400" aria-hidden="true" />
              <p className="mb-3 text-sm">视频加载失败，请重试。</p>
              <button
                type="button"
                onClick={() => void retry()}
                className="inline-flex items-center gap-2 rounded border border-white/40 px-3 py-2 text-sm"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                重试
              </button>
            </div>
          </div>
        ) : null}

        <video
          ref={videoRef}
          className="h-full w-full"
          src={sources.videoUrl}
          poster={sources.posterUrl}
          controls
          playsInline
          preload="metadata"
          autoPlay={autoPlay}
          aria-label={title}
          onLoadedMetadata={handleReady}
          onCanPlay={() => {
            setLoading(false)
            setBuffering(false)
          }}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onError={handleError}
        >
          {(sources.captions || []).map((track) => (
            <track
              key={`${track.assetId}:${track.srcLang}:${track.kind}`}
              kind={track.kind}
              src={track.src}
              srcLang={track.srcLang}
              label={track.label}
              default={track.default}
            />
          ))}
          您的浏览器不支持视频播放。
        </video>
      </div>

      {presentation.transcript ? (
        <details className="mt-3 rounded border border-gray-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">文字稿</summary>
          <p lang={presentation.transcript.language} className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
            {presentation.transcript.text}
          </p>
        </details>
      ) : null}
    </section>
  )
}

export default AssessmentVideoPlayer
