import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { StroopTask } from '../StroopTask'

const config = {
  totalTrials: 4,
  congruentRatio: 0.5,
  fixationMs: 500,
  stimulusDurationMs: 2000,
  isiMs: 500,
  validRtFloorMs: 200,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'stroop',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  config,
  randomSeed: 'seed-1',
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockReturnValue(1000)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const respondWith = (name: RegExp) => {
  fireEvent.pointerDown(screen.getByRole('button', { name }), { pointerType: 'mouse', button: 0 })
}

const enterFormal = async (onTrialComplete: ReturnType<typeof vi.fn>) => {
  render(<StroopTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
  fireEvent.click(screen.getByText('开始练习'))
  act(() => vi.advanceTimersByTime(400))
  respondWith(/1 · 红/)
  fireEvent.click(screen.getByText('下一个'))
  act(() => vi.advanceTimersByTime(400))
  respondWith(/2 · 绿/)
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => {})
}

describe('StroopTask', () => {
  it('requires both practice conditions and keeps formal feedback neutral', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(500))
    respondWith(/1 · 红/)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('已记录，下一题准备中')).toBeTruthy()
    expect(screen.queryByText('正确')).toBeNull()
    expect(screen.queryByText('错误')).toBeNull()
    expect(screen.queryByText('超时')).toBeNull()
    expect(Object.keys(onTrialComplete.mock.calls[0][0]).sort()).toEqual([
      'inkColor', 'interrupted', 'response', 'rtMs', 'word',
    ])
  })

  it('records timeout and visibility interruption as server-derived facts', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(500))
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    act(() => vi.advanceTimersByTime(2000))
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ response: null, rtMs: null, interrupted: true })
  })

  it('does not enter formal after repeated failed competency practice', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<StroopTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (let attempt = 0; attempt < 2; attempt += 1) {
      act(() => vi.advanceTimersByTime(400))
      respondWith(/2 · 绿/)
      fireEvent.click(screen.getByText('下一个'))
      act(() => vi.advanceTimersByTime(400))
      respondWith(/1 · 红/)
      fireEvent.click(screen.getByText(attempt === 0 ? '重新练习' : '结束'))
    }
    expect(screen.getByText('练习尚未通过，本次正式测评未开始。')).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })
})