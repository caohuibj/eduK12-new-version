import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NumberlineNpTask } from '../NumberlineNpTask'
import type { CognitiveTaskContext } from '../../../core/runner.types'
const context = (maxResponseMs = 4000): CognitiveTaskContext => ({ sessionId: 'synthetic-np', testType: 'numberline', engineVersion: '1.1.0', scoringVersion: '1.1.0', configVersion: '1.1.0', randomSeed: 'synthetic-np', attemptNo: 1, config: { totalTrials: 6, lineMax: 100, targetSet: 'A', maxResponseMs } })
const pickZero = () => { const track = screen.getByRole('slider'); fireEvent.keyDown(track, { key: 'Home' }); fireEvent.keyDown(track, { key: 'Enter' }) }
const enter = () => { fireEvent.click(screen.getByText('开始练习')); pickZero(); fireEvent.click(screen.getByText('开始正式任务')) }
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })
describe('numberline NP participant flow', () => {
  it.each([4000, 30000])('uses the frozen %i ms deadline without midpoint teaching or a practice accuracy gate', async deadline => {
    vi.useFakeTimers()
    const onTrialComplete = vi.fn().mockResolvedValue(true)
    render(<NumberlineNpTask taskContext={context(deadline)} trialIndex={0} onTrialComplete={onTrialComplete} />)
    expect(screen.queryByText(/中点|四分之一|15%/)).toBeNull()
    enter()
    expect(onTrialComplete).not.toHaveBeenCalled()
    expect(screen.queryByText('50')).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(400 + deadline - 1) })
    expect(onTrialComplete).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(onTrialComplete).toHaveBeenCalledOnce()
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ responsePosition: null, rtMs: null })
  })
  it('records all six trials before completion and retries the first saved endpoint without recomputing it', async () => {
    vi.useFakeTimers()
    const onTrialComplete = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    const view = render(<NumberlineNpTask taskContext={context()} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    enter()
    for (let i = 0; i < 6; i++) {
      if (i) view.rerender(<NumberlineNpTask taskContext={context()} trialIndex={i} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
      await act(async () => { await vi.advanceTimersByTimeAsync(800) })
      fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' })
      await act(async () => { fireEvent.keyDown(screen.getByRole('slider'), { key: 'Enter' }) })
      if (i === 0) {
        const payload = onTrialComplete.mock.calls[0][0]
        await act(async () => { await vi.advanceTimersByTimeAsync(500) })
        await act(async () => { fireEvent.click(screen.getByText('重试保存本次位置')) })
        expect(onTrialComplete.mock.calls[1][0]).toEqual(payload)
        expect(payload.responsePosition).toBe(0)
      }
      if (i < 5) expect(onTaskComplete).not.toHaveBeenCalled()
    }
    expect(onTrialComplete).toHaveBeenCalledTimes(7)
    expect(onTaskComplete).toHaveBeenCalledOnce()
    expect(screen.getByText('6题记录已保存，任务已完成。')).toBeTruthy()
  })
})
