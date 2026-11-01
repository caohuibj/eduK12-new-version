import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { ReadingcompTaskV1 as ReadingcompTask } from '../ReadingcompTaskV1'

const config = {
  totalTrials: 1,
  stimulusSetVersion: 'readingcomp-zh-v1.0.0',
  fixationMs: 400,
  timeoutMs: 15000,
  validRtFloorMs: 300,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'readingcomp',
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

const choose = (name: RegExp | string) => {
  fireEvent.pointerDown(screen.getByRole('button', { name }), { pointerType: 'mouse', button: 0 })
}

const optionButtons = () => screen.getAllByRole('button').filter((button) => button.className.includes('btn-secondary'))

const chooseOption = (index: number) => {
  fireEvent.pointerDown(optionButtons()[index], { pointerType: 'mouse', button: 0 })
}

const enterFormal = async (onTrialComplete: Mock<(payload: Record<string, unknown>) => Promise<boolean | void>>) => {
  render(<ReadingcompTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
  fireEvent.click(screen.getByText('开始练习'))
  await act(async () => { vi.advanceTimersByTime(400) })
  choose(/上课更有精神/)
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => { vi.advanceTimersByTime(400) })
}

describe('ReadingcompTask', () => {
  it('gives practice feedback and submits item facts in formal trials', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    chooseOption(0)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('已记录，下一题准备中')).toBeTruthy()
    expect(Object.keys(onTrialComplete.mock.calls[0][0]).sort()).toEqual(['interrupted', 'itemId', 'responseIndex', 'rtMs'])
  })

  it('records timeout as null response and null rt', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    await act(async () => { vi.advanceTimersByTime(15000) })
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ responseIndex: null, rtMs: null })
  })

  it('flags visibility interruption without changing the response', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    chooseOption(1)
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })

  it('keeps the trial pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    await enterFormal(onTrialComplete)
    chooseOption(0)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交失败，请重试当前试次')).toBeTruthy()
  })
})
