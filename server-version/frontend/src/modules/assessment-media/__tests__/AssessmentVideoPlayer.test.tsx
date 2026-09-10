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
})
