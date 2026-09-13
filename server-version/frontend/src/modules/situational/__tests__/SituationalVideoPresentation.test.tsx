import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SituationalVideoPresentation from '../SituationalVideoPresentation'
import type { AssessmentVideoCapabilitySources, AssessmentVideoPresentationV1 } from '../../assessment-media/types'

const completionMocks = vi.hoisted(() => ({
  read: vi.fn(),
  mark: vi.fn(),
}))

vi.mock('../../assessment-media/required-video-completion', () => ({
  readRequiredVideoCompletion: completionMocks.read,
  markRequiredVideoComplete: completionMocks.mark,
}))

const playerProps: Array<Record<string, unknown>> = []

vi.mock('../../assessment-media/AssessmentVideoPlayer', () => ({
  default: (props: Record<string, unknown>) => {
    playerProps.push(props)
    return (
      <div data-testid="video-player-adapter">
        <button type="button" onClick={() => (props.onViewingComplete as (() => void | Promise<void>) | undefined)?.()}>complete-viewing</button>
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
    completionMocks.read.mockReset()
    completionMocks.mark.mockReset()
    completionMocks.read.mockResolvedValue(null)
    completionMocks.mark.mockResolvedValue({ schemaVersion: 1 })
  })

  it('keeps the scene blocked after capability readiness until durable full viewing completes', async () => {
    const pending = deferred<AssessmentVideoCapabilitySources>()
    const loadSources = vi.fn(() => pending.promise)
    const onGateChange = vi.fn()

    render(
      <SituationalVideoPresentation
        draftKey="situational:attempt-1"
        sceneKey="VIDEO-01"
        slotKey="round-1-video"
        presentation={presentation}
        loadSources={loadSources}
        onGateChange={onGateChange}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('正在准备视频题面')
    await waitFor(() => expect(completionMocks.read).toHaveBeenCalledWith(expect.objectContaining({
      draftKey: 'situational:attempt-1',
      slotKey: 'round-1-video',
      assetId: 'video-1',
      contentHash: 'a'.repeat(64),
    })))

    pending.resolve(sources)
    expect(await screen.findByTestId('video-player-adapter')).toBeInTheDocument()
    const latestProps = playerProps[playerProps.length - 1]
    expect(latestProps).toMatchObject({
      presentation,
      sources,
      autoPlay: false,
      requiredViewing: true,
      viewingComplete: false,
    })
    await waitFor(() => expect(onGateChange).toHaveBeenLastCalledWith(
      'VIDEO-01',
      'blocked',
      '请以 1× 速度从头完整观看视频后继续。',
    ))

    fireEvent.click(screen.getByRole('button', { name: 'complete-viewing' }))
    await waitFor(() => expect(completionMocks.mark).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(onGateChange).toHaveBeenLastCalledWith('VIDEO-01', 'ready'))

    expect(latestProps).not.toHaveProperty('onEnded')
    expect(latestProps).not.toHaveProperty('onTimeUpdate')
  })

  it('fails closed on capability loading and recovers only through explicit retry plus full viewing', async () => {
    const loadSources = vi.fn()
      .mockRejectedValueOnce(new Error('capability unavailable'))
      .mockResolvedValueOnce(sources)
    const onGateChange = vi.fn()

    render(
      <SituationalVideoPresentation
        draftKey="situational:attempt-1"
        sceneKey="VIDEO-01"
        slotKey="round-1-video"
        presentation={presentation}
        loadSources={loadSources}
        onGateChange={onGateChange}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('视频题面暂时无法加载')
    await waitFor(() => expect(onGateChange).toHaveBeenLastCalledWith(
      'VIDEO-01',
      'error',
      '视频题面暂时无法加载，请重试。',
    ))

    fireEvent.click(screen.getByRole('button', { name: '重试视频' }))
    expect(await screen.findByTestId('video-player-adapter')).toBeInTheDocument()
    expect(loadSources).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(onGateChange).toHaveBeenLastCalledWith(
      'VIDEO-01',
      'blocked',
      '请以 1× 速度从头完整观看视频后继续。',
    ))

    fireEvent.click(screen.getByRole('button', { name: 'complete-viewing' }))
    await waitFor(() => expect(onGateChange).toHaveBeenLastCalledWith('VIDEO-01', 'ready'))
  })

  it('reuses a durable completion marker for the same frozen video slot', async () => {
    completionMocks.read.mockResolvedValue({ schemaVersion: 1 })
    const onGateChange = vi.fn()

    render(
      <SituationalVideoPresentation
        draftKey="situational:attempt-1"
        sceneKey="VIDEO-01"
        slotKey="round-1-video"
        presentation={presentation}
        loadSources={vi.fn().mockResolvedValue(sources)}
        onGateChange={onGateChange}
      />,
    )

    expect(await screen.findByTestId('video-player-adapter')).toBeInTheDocument()
    await waitFor(() => expect(onGateChange).toHaveBeenLastCalledWith('VIDEO-01', 'ready'))
    expect(playerProps[playerProps.length - 1]).toMatchObject({ requiredViewing: true, viewingComplete: true })
    expect(completionMocks.mark).not.toHaveBeenCalled()
  })
})
