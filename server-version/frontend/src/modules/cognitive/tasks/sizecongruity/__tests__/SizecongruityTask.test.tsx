import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { SizecongruityTask } from '../SizecongruityTask'

const config = {
  totalTrials: 2,
  congruentRatio: 0.5,
  minDigit: 1,
  maxDigit: 9,
  minGap: 2,
  fontLargeRem: 2.8,
  fontSmallRem: 1.3,
  fixationMs: 500,
  timeoutMs: 3000,
  validRtFloorMs: 200,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'sizecongruity',
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

const enterFormal = async (onTrialComplete: Mock<(payload: Record<string, unknown>) => Promise<boolean | void>>) => {
  render(<SizecongruityTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
  fireEvent.click(screen.getByText('开始练习'))
  act(() => vi.advanceTimersByTime(400))
  respondWith(/1 · 左边的数大/)
  fireEvent.click(screen.getByText('下一个'))
  act(() => vi.advanceTimersByTime(400))
  respondWith(/1 · 左边的数大/)
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => {})
}

describe('SizecongruityTask', () => {
  it('requires both practice conditions and submits observable facts in formal trials', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(500))
    respondWith(/1 · 左边的数大/)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('已记录，下一题准备中')).toBeTruthy()
    expect(Object.keys(onTrialComplete.mock.calls[0][0]).sort()).toEqual([
      'interrupted', 'leftDigit', 'leftFontScale', 'response', 'rightDigit', 'rightFontScale', 'rtMs',
    ])
  })

  it('records timeout as null response and null rt', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(500))
    act(() => vi.advanceTimersByTime(3000))
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ response: null, rtMs: null })
  })

  it('flags visibility interruption without changing timing facts', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(500))
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    respondWith(/2 · 右边的数大/)
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })

  it('accepts arrow-key responses', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(500))
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ response: 'right' })
  })

  it('keeps the trial pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(500))
    respondWith(/1 · 左边的数大/)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交失败，请重试当前试次')).toBeTruthy()
  })

  it('intake repair: ignores held-key repeats and accepts focused button activation once', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(500))
    fireEvent.keyDown(window, { key: 'ArrowLeft', repeat: true })
    expect(onTrialComplete).not.toHaveBeenCalled()
    const button = screen.getByRole('button', { name: /1 · 左边的数大/ })
    button.focus()
    fireEvent.click(button, { detail: 0 })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ response: 'left' })
  })

  it('intake repair: rereads full instructions before the second practice round and keeps the round limit', () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<SizecongruityTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (let round = 1; round <= 2; round++) {
      act(() => vi.advanceTimersByTime(400))
      fireEvent.pointerDown(screen.getByRole('button', { name: /2 · 右边的数大/ }), { pointerType: 'mouse', button: 0 })
      fireEvent.click(screen.getByText('下一个'))
      act(() => vi.advanceTimersByTime(400))
      fireEvent.pointerDown(screen.getByRole('button', { name: /2 · 右边的数大/ }), { pointerType: 'mouse', button: 0 })
      fireEvent.click(screen.getByText(round === 1 ? '重新练习' : '结束'))
      if (round === 1) {
        expect(screen.getByText('上一轮练习未通过，请重新阅读完整说明和例子，再开始下一轮。')).toBeTruthy()
        expect(screen.getByRole('button', { name: '开始练习' })).toBeTruthy()
        fireEvent.click(screen.getByText('开始练习'))
        expect(screen.getByText(/第 2 轮/)).toBeTruthy()
      }
    }
    expect(screen.getByText('练习尚未通过，本次正式测评未开始。')).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })
})
