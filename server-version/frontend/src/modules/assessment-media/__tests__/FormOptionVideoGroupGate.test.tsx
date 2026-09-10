import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FormOptionVideoGroupGate from '../FormOptionVideoGroupGate'

const presentation = (assetId: string, title: string) => ({
  schemaVersion: 1 as const,
  video: { assetId, contentHash: 'a'.repeat(64), mimeType: 'video/webm' as const },
  title,
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
})
