import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ScaleFormVideoGate from '../ScaleFormVideoGate'

const presentation = {
  schemaVersion: 1 as const,
  video: { assetId: 'video-1', contentHash: 'a'.repeat(64), mimeType: 'video/webm' as const },
  title: '题目视频',
}

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
})
