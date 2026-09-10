import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SituationalVideoPresentation from '../SituationalVideoPresentation'
import type { AssessmentVideoCapabilitySources, AssessmentVideoPresentationV1 } from '../../assessment-media/types'

const playerProps: Array<Record<string, unknown>> = []

vi.mock('../../assessment-media/AssessmentVideoPlayer', () => ({
  default: (props: Record<string, unknown>) => {
    playerProps.push(props)
    return (
      <div data-testid="video-player-adapter">
        <button type="button" onClick={() => (props.onReady as (() => void) | undefined)?.()}>metadata-ready</button>
        <button type="button" onClick={() => (props.onError as (() => void) | undefined)?.()}>player-error</button>
      </div>
    )
  },
}))

const presentation: AssessmentVideoPresentationV1 = {
  schemaVersion: 1,
  video: { assetId: 'video-1', contentHash: 'a'.repeat(64), mimeType: 'video/webm' },
  poster: { assetId: 'poster-1', contentHash: 'b'.repeat(64), mimeType: 'image/png' },
  captions: [{
    asset: { assetId: 'caption-1', contentHash: 'c'.repeat(64), mimeType: 'text/vtt' },
    kind: 'captions',
    srcLang: 'zh-CN',
    label: '中文字幕',
    default: true,
  }],
  transcript: { language: 'zh-CN', text: '视频文字稿。' },
  title: '视频情境',
}

const sources: AssessmentVideoCapabilitySources = {
  videoUrl: '/api/assets/assessment-media/content?cap=video-cap',
  posterUrl: '/api/assets/assessment-media/content?cap=poster-cap',
  captions: [{
    assetId: 'caption-1',
    kind: 'captions',
    srcLang: 'zh-CN',
    label: '中文字幕',
    default: true,
    src: '/api/assets/assessment-media/content?cap=caption-cap',
  }],
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('SituationalVideoPresentation', () => {
  beforeEach(() => {
    playerProps.length = 0
  })

  it('keeps the scene not-ready until capability load and player metadata readiness', async () => {
    const pending = deferred<AssessmentVideoCapabilitySources>()
    const loadSources = vi.fn(() => pending.promise)
    const onReadyChange = vi.fn()

    render(
      <SituationalVideoPresentation
        sceneKey="VIDEO-01"
        presentation={presentation}
        loadSources={loadSources}
        onReadyChange={onReadyChange}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('正在准备视频题面')
    expect(onReadyChange).toHaveBeenCalledWith('VIDEO-01', false)

    pending.resolve(sources)
    expect(await screen.findByTestId('video-player-adapter')).toBeInTheDocument()
    const latestProps = playerProps[playerProps.length - 1]
    expect(latestProps).toMatchObject({ presentation, sources, autoPlay: false })
    expect(onReadyChange).not.toHaveBeenCalledWith('VIDEO-01', true)

    fireEvent.click(screen.getByRole('button', { name: 'metadata-ready' }))
    await waitFor(() => expect(onReadyChange).toHaveBeenCalledWith('VIDEO-01', true))

    // MEDIA-5 deliberately has no playback-completion/ended callback contract.
    expect(latestProps).not.toHaveProperty('onEnded')
    expect(latestProps).not.toHaveProperty('onTimeUpdate')
  })

  it('fails closed on capability loading and recovers only through explicit retry', async () => {
    const loadSources = vi.fn()
      .mockRejectedValueOnce(new Error('capability unavailable'))
      .mockResolvedValueOnce(sources)
    const onReadyChange = vi.fn()

    render(
      <SituationalVideoPresentation
        sceneKey="VIDEO-01"
        presentation={presentation}
        loadSources={loadSources}
        onReadyChange={onReadyChange}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('视频题面暂时无法加载')
    expect(onReadyChange).not.toHaveBeenCalledWith('VIDEO-01', true)

    fireEvent.click(screen.getByRole('button', { name: '重试视频' }))
    expect(await screen.findByTestId('video-player-adapter')).toBeInTheDocument()
    expect(loadSources).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'metadata-ready' }))
    await waitFor(() => expect(onReadyChange).toHaveBeenCalledWith('VIDEO-01', true))
  })
})
