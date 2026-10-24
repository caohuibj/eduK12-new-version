import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { deferredAssessmentMedia } from '../deferred-media'

describe('deferred assessment presentation', () => {
  it('shares code preparation and exposes no response controls before readiness', async () => {
    let release!: (value: typeof Content) => void
    const Content = ({ label }: { label: string }) => <button>{label}</button>
    const load = vi.fn(() => new Promise<typeof Content>(resolve => { release = resolve }))
    const Gate = deferredAssessmentMedia(load)
    render(<><Gate label="甲" /><Gate label="乙" /></>)
    expect(screen.queryByRole('button')).toBeNull()
    expect(load).toHaveBeenCalledTimes(1)
    await act(async () => release(Content))
    expect(await screen.findByRole('button', { name: '甲' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '乙' })).toBeEnabled()
  })

  it('keeps code failures blocked and offers a bounded user retry', async () => {
    const Content = () => <button>作答</button>
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(Content)
    const Gate = deferredAssessmentMedia(load)
    render(<Gate />)
    expect(await screen.findByRole('alert')).toHaveTextContent('作答尚未开放')
    expect(screen.queryByRole('button', { name: '作答' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重试媒体组件' }))
    expect(await screen.findByRole('button', { name: '作答' })).toBeEnabled()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
