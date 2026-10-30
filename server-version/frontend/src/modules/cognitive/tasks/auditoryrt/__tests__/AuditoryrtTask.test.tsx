import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { AuditoryrtTask } from '../AuditoryrtTask'
import { generateAuditoryRtForeperiods } from '../generator'

const { prepareAudioContextMock, playToneMock } = vi.hoisted(() => ({
  prepareAudioContextMock: vi.fn(),
  playToneMock: vi.fn(),
}))

vi.mock('../../shared/audio', () => ({
  prepareAudioContext: prepareAudioContextMock,
  playTone: playToneMock,
}))

const config = {
  totalTrials: 2,
  foreperiodMinMs: 1000,
  foreperiodMaxMs: 4000,
  toneFrequencyHz: 880,
  toneDurationMs: 120,
  maxRtWindowMs: 1500,
  interTrialIntervalMs: 800,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'auditoryrt',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  config,
  randomSeed: 'seed-1',
}

const foreperiods = generateAuditoryRtForeperiods('seed-1', 2, 1000, 4000)

let currentTime = 1000

beforeEach(() => {
  vi.useFakeTimers()
  currentTime = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => currentTime)
  prepareAudioContextMock.mockResolvedValue({ context: {}, latencyMs: 12 })
  playToneMock.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const enterFormal = async (onTrialComplete: ReturnType<typeof vi.fn>, onTaskComplete?: ReturnType<typeof vi.fn>) => {
  render(<AuditoryrtTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
  fireEvent.click(screen.getByText('开始练习'))
  await act(async () => {})
  // 练习 1：等 1200ms 出声后按键
  await act(async () => { vi.advanceTimersByTime(1200) })
  currentTime += 200
  fireEvent.keyDown(window, { key: ' ', code: 'Space' })
  await act(async () => { vi.advanceTimersByTime(0) })
  fireEvent.click(screen.getByText('下一个'))
  // 练习 2：等 2000ms 出声后按键
  await act(async () => { vi.advanceTimersByTime(2000) })
  currentTime += 200
  fireEvent.keyDown(window, { key: ' ', code: 'Space' })
  await act(async () => { vi.advanceTimersByTime(0) })
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => {})
}

describe('AuditoryrtTask', () => {
  it('runs practice then submits the first formal trial with echoed foreperiod and audio latency', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    render(<AuditoryrtTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => {})
    expect(playToneMock).toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1200) })
    currentTime += 300
    fireEvent.keyDown(window, { key: ' ', code: 'Space' })
    await act(async () => { vi.advanceTimersByTime(0) })
    expect(screen.getByText(/正确/)).toBeTruthy()
    fireEvent.click(screen.getByText('下一个'))
    await act(async () => { vi.advanceTimersByTime(2000) })
    currentTime += 250
    fireEvent.keyDown(window, { key: ' ', code: 'Space' })
    await act(async () => { vi.advanceTimersByTime(0) })
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => {})
    await act(async () => { vi.advanceTimersByTime(foreperiods[0]) })
    currentTime += 280
    fireEvent.pointerDown(screen.getByLabelText('反应按键'))
    await act(async () => { vi.advanceTimersByTime(0) })
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toEqual({
      trialIndex: 0,
      foreperiodMs: foreperiods[0],
      rtMs: 280,
      interrupted: false,
      audioLatencyMs: 12,
    })
    expect(onTaskComplete).not.toHaveBeenCalled()
  })

  it('records a miss when no response arrives within maxRtWindowMs', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    expect(screen.getByText('第 1 / 2 题')).toBeTruthy()
    await act(async () => { vi.advanceTimersByTime(foreperiods[0]) })
    await act(async () => { vi.advanceTimersByTime(1500) })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ trialIndex: 0, rtMs: null })
  })

  it('records a premature press during the ready wait as rtMs 0', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    fireEvent.pointerDown(screen.getByLabelText('反应按键'))
    await act(async () => { vi.advanceTimersByTime(0) })
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ trialIndex: 0, rtMs: 0 })
  })

  it('blocks the task when the audio context cannot be prepared', async () => {
    prepareAudioContextMock.mockResolvedValue(null)
    render(<AuditoryrtTask taskContext={context} trialIndex={0} onTrialComplete={vi.fn().mockResolvedValue(undefined)} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => {})
    expect(screen.getByText(/无法播放音频/)).toBeTruthy()
  })
})
