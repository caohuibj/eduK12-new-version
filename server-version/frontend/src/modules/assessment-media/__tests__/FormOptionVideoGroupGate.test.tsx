import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFinalDraftMeta, finalDraftStore } from '../../../services/persistence/finalDraftStore'
import FormOptionVideoGroupGate from '../FormOptionVideoGroupGate'

const presentation = (assetId: string, title: string) => ({
  schemaVersion: 1 as const,
  video: { assetId, contentHash: 'a'.repeat(64), mimeType: 'video/webm' as const },
  title,
})

const requiredDraftKey = 'questionnaire-form-section:attempt-1:section-1'

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

describe('FormOptionVideoGroupGate', () => {
  it('preserves option order and keeps answers unavailable until every declared option video is ready', async () => {
    const loadSources = vi.fn().mockResolvedValue({ videoUrl: '/video', captions: [] })
    render(
      <FormOptionVideoGroupGate
        entries={[
          { optionIndex: 0, optionLabel: '选项 A', presentation: presentation('video-a', '视频 A') },
          { optionIndex: 2, optionLabel: '选项 C', presentation: presentation('video-c', '视频 C') },
        ]}
        loadSources={loadSources}
      >
        <button type="button">选择答案</button>
      </FormOptionVideoGroupGate>,
    )

    expect(screen.getByText('选项 A')).toBeTruthy()
    expect(screen.queryByText('选项 C')).toBeNull()
    expect(screen.queryByRole('button', { name: '选择答案' })).toBeNull()

    fireEvent.loadedMetadata(await screen.findByLabelText('视频 A'))
    expect(await screen.findByText('选项 C')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '选择答案' })).toBeNull()

    fireEvent.loadedMetadata(await screen.findByLabelText('视频 C'))
    expect(await screen.findByRole('button', { name: '选择答案' })).toBeTruthy()
    expect(loadSources).toHaveBeenCalledTimes(2)
    expect(loadSources.mock.calls.map(([entry]) => entry.optionIndex)).toEqual([0, 2])
  })

  it('requires every declared option video to be fully watched when required viewing is enabled', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    await finalDraftStore.ensure(createFinalDraftMeta({
      draftKey: requiredDraftKey,
      instrument: 'questionnaire-form-section',
      attemptId: 'attempt-1',
      attemptEpoch: 1,
      definitionHash: 'definition-hash',
      contextSnapshotHash: null,
      deliveryMode: 'final_only',
      submissionId: 'submission-1',
    }))
    const loadSources = vi.fn()
      .mockResolvedValueOnce({ videoUrl: '/video-a', captions: [] })
      .mockResolvedValueOnce({ videoUrl: '/video-c', captions: [] })

    render(
      <FormOptionVideoGroupGate
        entries={[
          { optionIndex: 0, optionLabel: '选项 A', presentation: presentation('video-a', '视频 A') },
          { optionIndex: 2, optionLabel: '选项 C', presentation: presentation('video-c', '视频 C') },
        ]}
        loadSources={loadSources}
        requiredViewing={{ draftKey: requiredDraftKey, slotKeyPrefix: 'form-item:item-1' }}
      >
        <button type="button">选择答案</button>
      </FormOptionVideoGroupGate>,
    )

    const first = await screen.findByLabelText('视频 A') as HTMLVideoElement
    fireEvent.loadedMetadata(first)
    setFullPlayedCoverage(first)
    fireEvent.ended(first)
    const second = await screen.findByLabelText('视频 C') as HTMLVideoElement
    expect(screen.queryByRole('button', { name: '选择答案' })).toBeNull()

    fireEvent.loadedMetadata(second)
    setFullPlayedCoverage(second)
    fireEvent.ended(second)
    expect(await screen.findByRole('button', { name: '选择答案' })).toBeTruthy()
  })
})
