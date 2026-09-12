import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFinalDraftMeta, finalDraftStore } from '../../../services/persistence/finalDraftStore'
import ScaleFormVideoGate from '../ScaleFormVideoGate'

const presentation = {
  schemaVersion: 1 as const,
  video: { assetId: 'video-1', contentHash: 'a'.repeat(64), mimeType: 'video/webm' as const },
  title: '题目视频',
}

const requiredDraftKey = 'scale:required-video-gate-test'

const setFullPlayedCoverage = (video: HTMLVideoElement, duration = 10) => {
  Object.defineProperty(video, 'duration', { configurable: true, value: duration })
  Object.defineProperty(video, 'played', {
    configurable: true,
    value: { length: 1, start: () => 0, end: () => duration },
  })
}

afterEach(async () => {
  await finalDraftStore.delete(requiredDraftKey).catch(() => undefined)
  vi.restoreAllMocks()
})

describe('ScaleFormVideoGate', () => {
  it('keeps response controls unavailable until native video metadata is ready', async () => {
    render(
      <ScaleFormVideoGate presentation={presentation} loadSources={vi.fn().mockResolvedValue({ videoUrl: '/video', captions: [] })}>
        <button type="button">作答</button>
      </ScaleFormVideoGate>,
    )
    expect(screen.queryByRole('button', { name: '作答' })).toBeNull()
    const video = await screen.findByLabelText('题目视频')
    fireEvent.loadedMetadata(video)
    expect(await screen.findByRole('button', { name: '作答' })).toBeTruthy()
  })

  it('keeps retry actionable after capability loading fails', async () => {
    const loadSources = vi.fn()
      .mockRejectedValueOnce(new Error('视频授权失败'))
      .mockResolvedValueOnce({ videoUrl: '/video', captions: [] })
    render(
      <ScaleFormVideoGate presentation={presentation} loadSources={loadSources}>
        <button type="button">作答</button>
      </ScaleFormVideoGate>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('视频授权失败')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(loadSources).toHaveBeenCalledTimes(2))
    expect(await screen.findByLabelText('题目视频')).toBeTruthy()
  })

  it('does not reissue capabilities for callback-only rerenders and invalidates readiness for a new frozen presentation', async () => {
    const loadSources = vi.fn().mockResolvedValue({ videoUrl: '/video', captions: [] })
    const view = render(
      <ScaleFormVideoGate presentation={presentation} loadSources={(value) => loadSources(value)}>
        <button type="button">作答</button>
      </ScaleFormVideoGate>,
    )

    fireEvent.loadedMetadata(await screen.findByLabelText('题目视频'))
    expect(await screen.findByRole('button', { name: '作答' })).toBeTruthy()
    expect(loadSources).toHaveBeenCalledTimes(1)

    view.rerender(
      <ScaleFormVideoGate presentation={presentation} loadSources={(value) => loadSources(value)}>
        <button type="button">作答</button>
      </ScaleFormVideoGate>,
    )
    await Promise.resolve()
    expect(loadSources).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '作答' })).toBeTruthy()

    const revisedPresentation = { ...presentation, title: '替代题目视频' }
    view.rerender(
      <ScaleFormVideoGate presentation={revisedPresentation} loadSources={(value) => loadSources(value)}>
        <button type="button">作答</button>
      </ScaleFormVideoGate>,
    )
    expect(screen.queryByRole('button', { name: '作答' })).toBeNull()
    expect(await screen.findByLabelText('替代题目视频')).toBeTruthy()
    await waitFor(() => expect(loadSources).toHaveBeenCalledTimes(2))
  })

  it('requires a durable full-view marker and reuses that marker when the same frozen slot is revisited', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    await finalDraftStore.ensure(createFinalDraftMeta({
      draftKey: requiredDraftKey,
      instrument: 'scale',
      attemptId: 'required-video-gate-test',
      attemptEpoch: 1,
      definitionHash: 'definition-hash',
      contextSnapshotHash: null,
      deliveryMode: 'final_only',
      submissionId: 'submission-1',
    }))
    const loadSources = vi.fn().mockResolvedValue({ videoUrl: '/video', captions: [] })
    const requiredViewing = { draftKey: requiredDraftKey, slotKey: 'scale-item:item-1:video' }

    const first = render(
      <ScaleFormVideoGate presentation={presentation} loadSources={loadSources} requiredViewing={requiredViewing}>
        <button type="button">作答</button>
      </ScaleFormVideoGate>,
    )
    const video = await screen.findByLabelText('题目视频') as HTMLVideoElement
    fireEvent.loadedMetadata(video)
    expect(screen.queryByRole('button', { name: '作答' })).toBeNull()
    setFullPlayedCoverage(video)
    fireEvent.ended(video)
    expect(await screen.findByRole('button', { name: '作答' })).toBeTruthy()

    first.unmount()
    render(
      <ScaleFormVideoGate presentation={presentation} loadSources={loadSources} requiredViewing={requiredViewing}>
        <button type="button">作答</button>
      </ScaleFormVideoGate>,
    )
    expect(await screen.findByRole('button', { name: '作答' })).toBeTruthy()
  })
})
