import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AssessmentVideoPlayer from '../AssessmentVideoPlayer'
import type { AssessmentVideoPresentationV1 } from '../types'

const presentation: AssessmentVideoPresentationV1 = {
  schemaVersion: 1,
  video: { assetId: 'video-1', contentHash: 'a'.repeat(64), mimeType: 'video/mp4' },
  poster: { assetId: 'poster-1', contentHash: 'b'.repeat(64), mimeType: 'image/png' },
  captions: [{
    asset: { assetId: 'caption-1', contentHash: 'c'.repeat(64), mimeType: 'text/vtt' },
    kind: 'captions',
    srcLang: 'zh-CN',
    label: '简体中文',
    default: true,
  }],
  transcript: { language: 'zh-CN', text: '这是可访问的文字稿。' },
  title: '测评示例视频',
  description: '观看后继续完成任务。',
}

const sources = {
  videoUrl: '/api/assets/assessment-media/content?cap=video-cap',
  posterUrl: '/api/assets/assessment-media/content?cap=poster-cap',
  captions: [{
    assetId: 'caption-1',
    src: '/api/assets/assessment-media/content?cap=caption-cap',
    kind: 'captions' as const,
    srcLang: 'zh-CN',
    label: '简体中文',
    default: true,
  }],
}

const setFullPlayedCoverage = (video: HTMLVideoElement, duration = 10) => {
  Object.defineProperty(video, 'duration', { configurable: true, value: duration })
  Object.defineProperty(video, 'played', {
    configurable: true,
    value: {
      length: 1,
      start: () => 0,
      end: () => duration,
    },
  })
}

describe('AssessmentVideoPlayer', () => {
  it('uses native streaming URLs directly and exposes poster, captions, transcript, and controls', () => {
    render(<AssessmentVideoPlayer presentation={presentation} sources={sources} />)
    const video = screen.getByLabelText('测评示例视频') as HTMLVideoElement
    expect(video.getAttribute('src')).toBe(sources.videoUrl)
    expect(video.getAttribute('poster')).toBe(sources.posterUrl)
    expect(video.controls).toBe(true)
    expect(video.preload).toBe('metadata')
    expect(video.autoplay).toBe(false)
    expect(video.getAttribute('controlsList')).toBeNull()

    const track = video.querySelector('track')
    expect(track?.getAttribute('src')).toBe(sources.captions[0].src)
    expect(track?.getAttribute('srclang')).toBe('zh-CN')
    expect(track?.getAttribute('kind')).toBe('captions')
    expect(screen.getByText('这是可访问的文字稿。')).toBeInTheDocument()
  })

  it('shows loading/buffering state and clears it when media is ready again', () => {
    render(<AssessmentVideoPlayer presentation={presentation} sources={sources} />)
    const video = screen.getByLabelText('测评示例视频')
    expect(screen.getByText('加载视频中…')).toBeInTheDocument()
    fireEvent.loadedMetadata(video)
    expect(screen.queryByText('加载视频中…')).not.toBeInTheDocument()
    fireEvent.waiting(video)
    expect(screen.getByText('缓冲视频中…')).toBeInTheDocument()
    fireEvent.playing(video)
    expect(screen.queryByText('缓冲视频中…')).not.toBeInTheDocument()
  })

  it('provides explicit retry without anti-download or developer-tool interception semantics', async () => {
    const onRetry = vi.fn()
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
    render(<AssessmentVideoPlayer presentation={presentation} sources={sources} onRetry={onRetry} />)
    const video = screen.getByLabelText('测评示例视频')
    fireEvent.error(video)
    expect(screen.getByText('视频加载失败，请重试。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1))
    expect(load).toHaveBeenCalled()
    expect(document.body.oncontextmenu).toBeNull()
    load.mockRestore()
  })

  it('uses controlled required-viewing controls and only reports completion after contiguous 1x playback', async () => {
    const onViewingComplete = vi.fn().mockResolvedValue(undefined)
    render(
      <AssessmentVideoPlayer
        presentation={presentation}
        sources={sources}
        requiredViewing
        onViewingComplete={onViewingComplete}
      />,
    )
    const video = screen.getByLabelText('测评示例视频') as HTMLVideoElement
    expect(video.controls).toBe(false)
    expect(video.getAttribute('controlsList')).toContain('noplaybackrate')
    expect(screen.getByLabelText('固定播放速度')).toHaveTextContent('1×')
    expect(screen.getByRole('button', { name: '播放视频' })).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: /进度|seek/i })).toBeNull()

    fireEvent.loadedMetadata(video)
    setFullPlayedCoverage(video)
    fireEvent.ended(video)
    await waitFor(() => expect(onViewingComplete).toHaveBeenCalledTimes(1))
  })

  it('rejects seeking or rate changes before completion and resets playback to the beginning', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    render(
      <AssessmentVideoPlayer
        presentation={presentation}
        sources={sources}
        requiredViewing
        onViewingComplete={vi.fn()}
      />,
    )
    const video = screen.getByLabelText('测评示例视频') as HTMLVideoElement
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 4 })
    fireEvent.seeking(video)
    expect(video.currentTime).toBe(0)
    expect(screen.getByText(/不能跳播/)).toBeInTheDocument()

    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 3 })
    Object.defineProperty(video, 'playbackRate', { configurable: true, writable: true, value: 2 })
    Object.defineProperty(video, 'defaultPlaybackRate', { configurable: true, writable: true, value: 2 })
    fireEvent.rateChange(video)
    expect(video.playbackRate).toBe(1)
    expect(video.defaultPlaybackRate).toBe(1)
    expect(video.currentTime).toBe(0)
    expect(screen.getByText(/必须保持 1×/)).toBeInTheDocument()
    pause.mockRestore()
  })

  it('does not silently unlock when the durable completion marker cannot be saved', async () => {
    const onViewingComplete = vi.fn().mockRejectedValue(new Error('quota'))
    render(
      <AssessmentVideoPlayer
        presentation={presentation}
        sources={sources}
        requiredViewing
        onViewingComplete={onViewingComplete}
      />,
    )
    const video = screen.getByLabelText('测评示例视频') as HTMLVideoElement
    fireEvent.loadedMetadata(video)
    setFullPlayedCoverage(video)
    fireEvent.ended(video)
    expect(await screen.findByRole('alert')).toHaveTextContent('本地完成状态保存失败')
    expect(screen.getByRole('button', { name: '重试保存完成状态' })).toBeInTheDocument()
  })
})
