import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { SentencecheckTask } from '../SentencecheckTask'
import { buildSentencecheckTrialsV11 } from '../generator-v1.1'

const config = {
  totalTrials: 2,
  trueRatio: 0.5,
  negationRatio: 0.5,
  fixationMs: 500,
  timeoutMs: 8000,
  validRtFloorMs: 300,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'sentencecheck',
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

const enterFormal = async (onTrialComplete: Mock<(payload: Record<string, unknown>) => Promise<boolean | void>>, taskContext = context) => {
  render(<SentencecheckTask taskContext={taskContext} trialIndex={0} onTrialComplete={onTrialComplete} />)
  fireEvent.click(screen.getByText('开始练习'))
  act(() => vi.advanceTimersByTime(400))
  respondWith(/1 · 相符/)
  fireEvent.click(screen.getByText('下一个'))
  act(() => vi.advanceTimersByTime(400))
  respondWith(/1 · 相符/)
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => {})
}

describe('SentencecheckTask', () => {
  it('uses crossed stimuli only for engine 1.1.0 without changing practice or response timing', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    const current = { ...context, engineVersion: '1.1.0', scoringVersion: '1.1.0', configVersion: '1.1.0', config: { ...config, totalTrials: 12 } }
    await enterFormal(onTrialComplete, current)
    act(() => vi.advanceTimersByTime(499))
    expect(screen.queryByRole('button', { name: /1 · 相符/ })).toBeNull()
    act(() => vi.advanceTimersByTime(1))
    respondWith(/1 · 相符/)
    await act(async () => {})
    const { sentence: _sentence, ...expected } = buildSentencecheckTrialsV11(current.randomSeed, 12, 0.5, 0.5)[0]
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ ...expected, response: true })
  })

  it('requires both practice trials and submits structured observable facts', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(500))
    respondWith(/1 · 相符/)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('已记录，下一题准备中')).toBeTruthy()
    expect(Object.keys(onTrialComplete.mock.calls[0][0]).sort()).toEqual([
      'askedValue', 'color', 'interrupted', 'negated', 'questionKind', 'response', 'rtMs', 'shape',
    ])
  })

  it('records timeout as null response and null rt', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(500))
    act(() => vi.advanceTimersByTime(8000))
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ response: null, rtMs: null })
  })

  it('flags visibility interruption without changing timing facts', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(500))
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    respondWith(/2 · 不相符/)
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })

  it('keeps the trial pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(500))
    respondWith(/1 · 相符/)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交失败，请重试当前试次')).toBeTruthy()
  })
})


describe('Sentencecheck input repair', () => {
  it('ignores held-key repeats and accepts a keyboard-generated button click', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(500))
    fireEvent.keyDown(window, { key: '1', repeat: true })
    expect(onTrialComplete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /1 · 相符/ }), { detail: 0 })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
  })
})


it('shows the full instructions before the second practice attempt and preserves the attempt limit', () => {
  const onTrialComplete = vi.fn().mockResolvedValue(undefined)
  render(<SentencecheckTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
  fireEvent.click(screen.getByText('开始练习'))
  for (let attempt = 0; attempt < 2; attempt += 1) {
    act(() => vi.advanceTimersByTime(400))
    respondWith(/2 · 不相符/)
    fireEvent.click(screen.getByText('下一个'))
    act(() => vi.advanceTimersByTime(400))
    respondWith(/1 · 相符/)
    fireEvent.click(screen.getByText(attempt === 0 ? '重新练习' : '结束'))
    if (attempt === 0) {
      expect(screen.getByText(/每题会给一句话和一张图形/)).toBeTruthy()
      expect(onTrialComplete).not.toHaveBeenCalled()
      fireEvent.click(screen.getByText('重新开始练习'))
      expect(screen.getByText(/第 2 轮/)).toBeTruthy()
    }
  }
  expect(screen.getByText('练习尚未通过，本次正式测评未开始。')).toBeTruthy()
  expect(onTrialComplete).not.toHaveBeenCalled()
})
