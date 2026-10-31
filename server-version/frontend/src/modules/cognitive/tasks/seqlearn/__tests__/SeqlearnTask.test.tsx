import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { SeqlearnTask } from '../SeqlearnTask'

const config = {
  totalTrials: 2,
  trialsPerBlock: 10,
  patternSequence: [3, 1, 4, 2, 1, 3, 2, 4, 1, 2],
  randomBlockIndices: [1],
  fixationMs: 300,
  stimulusMs: 1200,
  timeoutMs: 1500,
  validRtFloorMs: 150,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'seqlearn',
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

const pressKey = (key: string) => {
  fireEvent.keyDown(window, { key })
}

const enterFormal = async (onTrialComplete: Mock<(payload: Record<string, unknown>) => Promise<boolean | void>>) => {
  render(<SeqlearnTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
  fireEvent.click(screen.getByText('开始练习'))
  act(() => vi.advanceTimersByTime(400))
  pressKey('2')
  fireEvent.click(screen.getByText('下一个'))
  act(() => vi.advanceTimersByTime(400))
  pressKey('3')
  fireEvent.click(screen.getByText('下一个'))
  act(() => vi.advanceTimersByTime(400))
  pressKey('1')
  fireEvent.click(screen.getByText('下一个'))
  act(() => vi.advanceTimersByTime(400))
  pressKey('4')
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => {})
}

describe('SeqlearnTask', () => {
  it('submits position facts in formal trials', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(300))
    pressKey('1')
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('已记录')).toBeTruthy()
    expect(Object.keys(onTrialComplete.mock.calls[0][0]).sort()).toEqual(['interrupted', 'position', 'response', 'rtMs'])
  })

  it('records timeout as null response and null rt', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(300))
    act(() => vi.advanceTimersByTime(1500))
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ response: null, rtMs: null })
  })

  it('flags visibility interruption without changing the response', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(300))
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    pressKey('4')
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })

  it('keeps the trial pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(300))
    pressKey('1')
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交失败，请重试当前试次')).toBeTruthy()
  })
})
