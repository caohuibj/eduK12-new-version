import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { LineangleTask } from '../LineangleTask'
import { buildLineangleTrials } from '../prng'

const config = {
  totalTrials: 2,
  angleStepDeg: 30,
  optionCount: 3,
  minAngleSepSteps: 2,
  fixationMs: 500,
  timeoutMs: 8000,
  validRtFloorMs: 300,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'lineangle',
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

const clickOption = (index: number) => {
  const figures = screen.getAllByRole('button').filter((button) => button.querySelector('svg'))
  fireEvent.pointerDown(figures[index], { pointerType: 'mouse', button: 0 })
}

const practiceTrials = buildLineangleTrials(`${'seed-1'}:practice`, 2, 30, 3, 2)
const clickCorrectOption = (trialIndex: number) => {
  const trial = practiceTrials[trialIndex]
  clickOption(trial.optionAngles.indexOf(trial.targetAngle))
}

const enterFormal = async (onTrialComplete: Mock<(payload: Record<string, unknown>) => Promise<boolean | void>>) => {
  render(<LineangleTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
  fireEvent.click(screen.getByText('开始练习'))
  act(() => vi.advanceTimersByTime(400))
  clickCorrectOption(0)
  fireEvent.click(screen.getByText('下一个'))
  act(() => vi.advanceTimersByTime(400))
  clickCorrectOption(1)
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => {})
}

describe('LineangleTask', () => {
  it('requires both practice trials and submits option facts in formal trials', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(500))
    clickOption(0)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('已记录，下一题准备中')).toBeTruthy()
    const payload = onTrialComplete.mock.calls[0][0]
    expect(Object.keys(payload).sort()).toEqual(['interrupted', 'optionAngles', 'responseAngle', 'rtMs', 'targetAngle'])
    expect(payload.optionAngles).toHaveLength(3)
  })

  it('records timeout as null response and null rt', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(500))
    act(() => vi.advanceTimersByTime(8000))
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ responseAngle: null, rtMs: null })
  })

  it('flags visibility interruption without changing the response', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(500))
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    clickOption(1)
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })

  it('keeps the trial pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(500))
    clickOption(0)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交失败，请重试当前试次')).toBeTruthy()
  })
})
