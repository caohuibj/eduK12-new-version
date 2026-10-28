import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { PursuitrotorTask } from '../PursuitrotorTask'

const config = {
  totalTrials: 1,
  trackMs: 20000,
  revolutionMs: 4000,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'pursuitrotor',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  config,
  randomSeed: 'seed-1',
}

let currentTime = 1000

beforeEach(() => {
  vi.useFakeTimers()
  currentTime = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => currentTime)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('PursuitrotorTask', () => {
  it('runs practice with feedback then enters formal and auto-submits at trackMs', async () => {
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<PursuitrotorTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(500) })
    await act(async () => { vi.advanceTimersByTime(20000) })
    expect(screen.getByText(/练习结束/)).toBeTruthy()
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => { vi.advanceTimersByTime(500) })
    currentTime += 20000
    currentTime += 20000
    await act(async () => { vi.advanceTimersByTime(21000) })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ trialIndex: 0, timeOnTargetMs: 0, totalTrackMs: 20000, interrupted: false })
    expect(onTaskComplete).toHaveBeenCalledTimes(1)
  })

  it('keeps the trial pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    render(<PursuitrotorTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(500) })
    await act(async () => { vi.advanceTimersByTime(20000) })
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => { vi.advanceTimersByTime(500) })
    currentTime += 20000
    currentTime += 20000
    await act(async () => { vi.advanceTimersByTime(21000) })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交失败，请重试当前轮')).toBeTruthy()
  })

  it('flags visibility interruption in the payload', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<PursuitrotorTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(500) })
    await act(async () => { vi.advanceTimersByTime(20000) })
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => { vi.advanceTimersByTime(500) })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    currentTime += 20000
    currentTime += 20000
    await act(async () => { vi.advanceTimersByTime(21000) })
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })
})
