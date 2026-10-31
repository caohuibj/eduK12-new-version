import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { TimecopyTask } from '../TimecopyTask'

const config = {
  totalTrials: 1,
  targetMinMs: 1000,
  targetMaxMs: 3000,
  maxResponseMs: 10000,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'timecopy',
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

const watchAndStart = async () => {
  // 观察阶段 200ms 延迟 + 目标最长 3000ms
  await act(async () => { vi.advanceTimersByTime(3500) })
  fireEvent.click(screen.getByText('开始复制'))
}

const stopAfter = (ms: number) => {
  currentTime += ms
  fireEvent.click(screen.getByText('结束复制'))
}

describe('TimecopyTask', () => {
  it('runs watch → ready → reproducing and submits the target and response', async () => {
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<TimecopyTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await watchAndStart()
    await act(async () => { vi.advanceTimersByTime(1500) })
    fireEvent.click(screen.getByText('结束复制'))
    await act(async () => {})
    fireEvent.click(screen.getByText('开始正式测评'))
    await watchAndStart()
    stopAfter(1500)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    const payload = onTrialComplete.mock.calls[0][0]
    expect(payload.targetMs).toBeGreaterThanOrEqual(1000)
    expect(payload.targetMs).toBeLessThanOrEqual(3000)
    expect(payload).toMatchObject({ responseMs: 1500, interrupted: false })
    expect(onTaskComplete).toHaveBeenCalledTimes(1)
  })

  it('gives practice feedback then moves to formal', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<TimecopyTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await watchAndStart()
    stopAfter(1500)
    expect(screen.getByText(/目标 1500ms，你复制了 1500ms/)).toBeTruthy()
    fireEvent.click(screen.getByText('开始正式测评'))
    await watchAndStart()
    stopAfter(1200)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ responseMs: 1200 })
  })

  it('caps reproductions at maxResponseMs', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<TimecopyTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await watchAndStart()
    await act(async () => { vi.advanceTimersByTime(1500) })
    fireEvent.click(screen.getByText('结束复制'))
    fireEvent.click(screen.getByText('开始正式测评'))
    await watchAndStart()
    await act(async () => { vi.advanceTimersByTime(10000) })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ responseMs: 10000 })
  })

  it('flags visibility interruption in the payload', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<TimecopyTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await watchAndStart()
    await act(async () => { vi.advanceTimersByTime(1500) })
    fireEvent.click(screen.getByText('结束复制'))
    fireEvent.click(screen.getByText('开始正式测评'))
    await watchAndStart()
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    stopAfter(800)
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })
})
