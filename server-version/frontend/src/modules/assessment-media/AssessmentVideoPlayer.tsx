import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, Maximize2, Minimize2, Pause, Play, RefreshCw, Volume2, VolumeX } from 'lucide-react'
import type { AssessmentVideoCapabilitySources, AssessmentVideoPresentationV1 } from './types'

export interface AssessmentVideoPlayerProps {
  presentation: AssessmentVideoPresentationV1
  sources: AssessmentVideoCapabilitySources
  className?: string
  autoPlay?: boolean
  requiredViewing?: boolean
  viewingComplete?: boolean
  onViewingComplete?: () => void | Promise<void>
  onRetry?: () => void | Promise<void>
  onReady?: () => void
  onError?: () => void
}

const START_TOLERANCE_SECONDS = 0.1
const GAP_TOLERANCE_SECONDS = 0.15
const END_TOLERANCE_SECONDS = 0.25

const hasFullPlayedCoverage = (video: HTMLVideoElement) => {
  const duration = video.duration
  if (!Number.isFinite(duration) || duration <= 0 || video.played.length === 0) return false
  let coveredUntil = 0
  for (let index = 0; index < video.played.length; index += 1) {
    const start = video.played.start(index)
    const end = video.played.end(index)
    if (index === 0 && start > START_TOLERANCE_SECONDS) return false
    if (index > 0 && start > coveredUntil + GAP_TOLERANCE_SECONDS) return false
    coveredUntil = Math.max(coveredUntil, end)
  }
  return coveredUntil >= duration - END_TOLERANCE_SECONDS
}

export const AssessmentVideoPlayer = ({
  presentation,
  sources,
  className = '',
  autoPlay = false,
  requiredViewing = false,
  viewingComplete = false,
  onViewingComplete,
  onRetry,
  onReady,
  onError,
}: AssessmentVideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const internalSeekRef = useRef(false)
  const completionCandidateRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [buffering, setBuffering] = useState(false)
  const [error, setError] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [captionsVisible, setCaptionsVisible] = useState(Boolean(presentation.captions?.some((track) => track.default)))
  const [enlarged, setEnlarged] = useState(false)
  const [viewingNotice, setViewingNotice] = useState<string | null>(null)
  const [completionPersistError, setCompletionPersistError] = useState<string | null>(null)
  const title = presentation.title || '测评视频'

  const resetRequiredViewing = useCallback((reason?: string) => {
    if (!requiredViewing || viewingComplete) return
    completionCandidateRef.current = false
    setCompletionPersistError(null)
    setViewingNotice(reason ?? '请从头完整观看视频。')
    const video = videoRef.current
    if (!video) return
    video.pause()
    setPlaying(false)
    if (video.currentTime > 0.01) {
      internalSeekRef.current = true
      video.currentTime = 0
    }
  }, [requiredViewing, viewingComplete])

  useEffect(() => {
    setLoading(true)
    setBuffering(false)
    setError(false)
    setPlaying(false)
    setCompletionPersistError(null)
    completionCandidateRef.current = false
    internalSeekRef.current = false
    if (requiredViewing && !viewingComplete) resetRequiredViewing()
  }, [sources.videoUrl, requiredViewing, viewingComplete, resetRequiredViewing])

  useEffect(() => {
    if (!requiredViewing || viewingComplete) return
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return
      const video = videoRef.current
      if (!video) return
      if (video.currentTime > 0.01) resetRequiredViewing('页面离开或锁屏后，未完成的视频需要从头重新观看。')
      else video.pause()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [requiredViewing, viewingComplete, resetRequiredViewing])

  useEffect(() => {
    if (viewingComplete) {
      setCompletionPersistError(null)
      setViewingNotice('视频已完整观看。')
    }
  }, [viewingComplete])

  const handleReady = () => {
    const video = videoRef.current
    if (video && requiredViewing) {
      video.defaultPlaybackRate = 1
      video.playbackRate = 1
      if (!viewingComplete && video.currentTime > 0.01) resetRequiredViewing()
    }
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
    if (requiredViewing && !viewingComplete) resetRequiredViewing('视频重新加载后，需要从头完整观看。')
    videoRef.current?.load()
  }

  const persistCompletion = async () => {
    if (viewingComplete) return
    if (!onViewingComplete) {
      setCompletionPersistError('无法保存观看完成状态，请重试。')
      return
    }
    setCompletionPersistError(null)
    setViewingNotice('正在保存观看完成状态…')
    try {
      await onViewingComplete()
    } catch {
      setCompletionPersistError('观看已完成，但本地完成状态保存失败。请重试保存；刷新页面后需要重新观看。')
      setViewingNotice(null)
    }
  }

  const handleEnded = () => {
    setPlaying(false)
    if (!requiredViewing || viewingComplete || completionCandidateRef.current) return
    const video = videoRef.current
    if (!video) return
    if (Math.abs(video.playbackRate - 1) > 0.001 || !hasFullPlayedCoverage(video)) {
      resetRequiredViewing('未检测到从头到尾的连续 1× 播放，请重新完整观看。')
      return
    }
    completionCandidateRef.current = true
    void persistCompletion()
  }

  const handleSeeking = () => {
    if (!requiredViewing || viewingComplete) return
    const video = videoRef.current
    if (internalSeekRef.current && video && video.currentTime <= 0.01) return
    resetRequiredViewing('测评视频不能跳播；请从头完整观看。')
  }

  const handleRateChange = () => {
    const video = videoRef.current
    if (!video || !requiredViewing || viewingComplete) return
    if (Math.abs(video.playbackRate - 1) <= 0.001 && Math.abs(video.defaultPlaybackRate - 1) <= 0.001) return
    video.defaultPlaybackRate = 1
    video.playbackRate = 1
    resetRequiredViewing('测评视频必须保持 1× 播放；请从头重新观看。')
  }

  const togglePlayback = async () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      if (viewingComplete && video.ended) video.currentTime = 0
      video.playbackRate = 1
      try { await video.play() } catch { handleError() }
    } else {
      video.pause()
    }
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }

  const changeVolume = (next: number) => {
    const video = videoRef.current
    if (!video) return
    video.volume = next
    if (next > 0 && video.muted) video.muted = false
    setVolume(next)
    setMuted(video.muted)
  }

  const toggleCaptions = () => {
    const video = videoRef.current
    if (!video) return
    const next = !captionsVisible
    for (let index = 0; index < video.textTracks.length; index += 1) {
      const track = video.textTracks[index]
      if (track.kind === 'captions' || track.kind === 'subtitles') track.mode = next ? 'showing' : 'disabled'
    }
    setCaptionsVisible(next)
  }

  return (
    <section className={className} data-assessment-video-player data-required-viewing={requiredViewing || undefined}>
      {presentation.description ? (
        <p className="mb-2 text-sm text-gray-600">{presentation.description}</p>
      ) : null}

      <div className={enlarged ? 'fixed inset-4 z-50 overflow-hidden rounded-lg bg-black shadow-2xl' : 'relative overflow-hidden rounded-lg bg-black'} style={{ aspectRatio: '16/9' }}>
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
                className="inline-flex min-h-11 items-center gap-2 rounded border border-white/40 px-3 py-2 text-sm"
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
          controls={!requiredViewing}
          controlsList={requiredViewing ? 'noplaybackrate nofullscreen nodownload noremoteplayback' : undefined}
          disablePictureInPicture={requiredViewing}
          playsInline
          preload="metadata"
          autoPlay={requiredViewing ? false : autoPlay}
          aria-label={title}
          onLoadedMetadata={handleReady}
          onCanPlay={() => {
            setLoading(false)
            setBuffering(false)
          }}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => {
            setPlaying(true)
            setBuffering(false)
          }}
          onPause={() => setPlaying(false)}
          onSeeking={handleSeeking}
          onSeeked={() => { internalSeekRef.current = false }}
          onRateChange={handleRateChange}
          onEnded={handleEnded}
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

        {requiredViewing && !error ? (
          <div className="absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-2 bg-black/75 px-3 py-2 text-white">
            <button type="button" onClick={() => void togglePlayback()} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-white/30" aria-label={playing ? '暂停视频' : '播放视频'}>
              {playing ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
            </button>
            <button type="button" onClick={toggleMute} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-white/30" aria-label={muted ? '取消静音' : '静音'}>
              {muted ? <VolumeX className="h-5 w-5" aria-hidden="true" /> : <Volume2 className="h-5 w-5" aria-hidden="true" />}
            </button>
            <label className="flex min-h-11 items-center gap-2 text-xs">
              <span>音量</span>
              <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={(event) => changeVolume(Number(event.target.value))} aria-label="视频音量" />
            </label>
            {sources.captions?.length ? (
              <button type="button" onClick={toggleCaptions} className="min-h-11 rounded border border-white/30 px-3 text-xs" aria-pressed={captionsVisible}>
                {captionsVisible ? '关闭字幕' : '开启字幕'}
              </button>
            ) : null}
            <span className="rounded bg-white/15 px-2 py-1 text-xs" aria-label="固定播放速度">1×</span>
            <button type="button" onClick={() => setEnlarged((value) => !value)} className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-white/30" aria-label={enlarged ? '退出放大' : '放大视频'}>
              {enlarged ? <Minimize2 className="h-5 w-5" aria-hidden="true" /> : <Maximize2 className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        ) : null}
      </div>

      {requiredViewing ? (
        <div className="mt-2 text-sm" aria-live="polite">
          {viewingComplete ? <p className="text-green-700">视频已完整观看，可以继续。</p> : <p className="text-gray-600">请以 1× 速度从头完整观看视频后继续；不支持跳播或倍速。</p>}
          {viewingNotice && !viewingComplete ? <p className="mt-1 text-amber-700">{viewingNotice}</p> : null}
          {completionPersistError ? (
            <div role="alert" className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-red-700">
              <p>{completionPersistError}</p>
              <button type="button" onClick={() => void persistCompletion()} className="mt-1 min-h-11 underline">重试保存完成状态</button>
            </div>
          ) : null}
        </div>
      ) : null}

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
