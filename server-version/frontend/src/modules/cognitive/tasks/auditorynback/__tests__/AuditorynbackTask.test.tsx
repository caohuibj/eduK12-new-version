import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { AuditorynbackTask } from '../AuditorynbackTask'
import * as nbackGenerator from '../generator'
import { generateAuditoryNbackPracticeSequence, generateAuditoryNbackSequence } from '../generator'

const { prepareAudioContextMock, playToneMock } = vi.hoisted(() => ({
  prepareAudioContextMock: vi.fn(),
  playToneMock: vi.fn(),
}))

vi.mock('../../shared/audio', () => ({
  prepareAudioContext: prepareAudioContextMock,
  playTone: playToneMock,
}))

const config = {
  nLevel: 2,
  totalTrials: 2,
  targetRatio: 0.3,
  stimulusMs: 400,
  isiMs: 600,
  toneFrequenciesHz: [262, 330, 392, 494, 587],
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'auditorynback',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  config,
  randomSeed: 'seed-1',
}

const practiceSequence = generateAuditoryNbackPracticeSequence('seed-1', 2, 5)
const formalSequence = generateAuditoryNbackSequence('seed-1', 2, 2, 0.3, 5)

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

const isPracticeTarget = (index: number): boolean =>
  index >= 2 && practiceSequence[index] === practiceSequence[index - 2]

const runPracticeTrial = async (press: boolean) => {
  await act(async () => { vi.advanceTimersByTime(400) })
  if (press) {
    currentTime += 150
    fireEvent.keyDown(window, { key: ' ', code: 'Space' })
  }
  await act(async () => { vi.advanceTimersByTime(600) })
}

describe('AuditorynbackTask', () => {
  it('runs practice to completion then submits a formal miss with the echoed tone index', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    render(<AuditorynbackTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => {})
    for (let index = 0; index < 8; index += 1) {
      await runPracticeTrial(isPracticeTarget(index))
      if (index < 7) fireEvent.click(screen.getByText('下一个'))
    }
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => {})
    await act(async () => { vi.advanceTimersByTime(400) })
    await act(async () => { vi.advanceTimersByTime(600) })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toEqual({
      trialIndex: 0,
      toneIndex: formalSequence[0],
      responded: false,
      rtMs: null,
      interrupted: false,
      audioLatencyMs: 12,
    })
    expect(onTaskComplete).not.toHaveBeenCalled()
  })

  it('records a hit with rt when responding during the sound phase', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<AuditorynbackTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => {})
    for (let index = 0; index < 8; index += 1) {
      await runPracticeTrial(isPracticeTarget(index))
      if (index < 7) fireEvent.click(screen.getByText('下一个'))
    }
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => {})
    await act(async () => { vi.advanceTimersByTime(400) })
    currentTime += 250
    fireEvent.pointerDown(screen.getByLabelText('匹配按键'))
    await act(async () => { vi.advanceTimersByTime(600) })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ trialIndex: 0, responded: true, rtMs: 250 })
  })

  it('shows corrective feedback when responding during warm-up and blocks on failed practice', async () => {
    render(<AuditorynbackTask taskContext={context} trialIndex={0} onTrialComplete={vi.fn().mockResolvedValue(undefined)} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => {})
    await runPracticeTrial(true)
    expect(screen.getByText(/只听不按/)).toBeTruthy()
    fireEvent.click(screen.getByText('下一个'))
    for (let index = 1; index < 8; index += 1) {
      await runPracticeTrial(isPracticeTarget(index))
      if (index < 7) fireEvent.click(screen.getByText('下一个'))
    }
    expect(screen.getByText('重新练习')).toBeTruthy()
  })

  it('blocks the task when the audio context cannot be prepared', async () => {
    prepareAudioContextMock.mockResolvedValue(null)
    render(<AuditorynbackTask taskContext={context} trialIndex={0} onTrialComplete={vi.fn().mockResolvedValue(undefined)} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => {})
    expect(screen.getByText(/无法播放音频/)).toBeTruthy()
  })
})


it('submits tone index zero and ignores a held Space response', async () => {
  vi.spyOn(nbackGenerator, 'generateAuditoryNbackSequence').mockReturnValue([0, 1])
  const save = vi.fn().mockResolvedValue(undefined)
  render(<AuditorynbackTask taskContext={context} trialIndex={0} onTrialComplete={save} />)
  fireEvent.click(screen.getByText('开始练习'))
  await act(async () => {})
  for (let index = 0; index < 8; index += 1) {
    await runPracticeTrial(isPracticeTarget(index))
    if (index < 7) fireEvent.click(screen.getByText('下一个'))
  }
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => {})
  fireEvent.keyDown(window, { key: ' ', code: 'Space', repeat: true })
  await act(async () => { vi.advanceTimersByTime(400) })
  await act(async () => { vi.advanceTimersByTime(600) })
  await act(async () => {})
  expect(save).toHaveBeenCalledTimes(1)
  expect(save.mock.calls[0][0]).toMatchObject({ toneIndex: 0, responded: false, rtMs: null })
})
