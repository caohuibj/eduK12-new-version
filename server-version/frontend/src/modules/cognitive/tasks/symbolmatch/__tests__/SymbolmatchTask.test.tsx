import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { SymbolmatchTask } from '../SymbolmatchTask'

const config = {
  totalTrials: 2,
  symbolDigitMap: [['●', 1], ['■', 2], ['▲', 3], ['◆', 4], ['★', 5]] as Array<[string, number]>,
  fixationMs: 400,
  timeoutMs: 8000,
  validRtFloorMs: 250,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'symbolmatch',
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

const respondDigit = (digit: number) => {
  fireEvent.pointerDown(screen.getByRole('button', { name: `${digit}` }), { pointerType: 'mouse', button: 0 })
}

const enterFormal = async (onTrialComplete: Mock<(payload: Record<string, unknown>) => Promise<boolean | void>>) => {
  render(<SymbolmatchTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
  fireEvent.click(screen.getByText('开始练习'))
  act(() => vi.advanceTimersByTime(400))
  respondDigit(1)
  fireEvent.click(screen.getByText('下一个'))
  act(() => vi.advanceTimersByTime(400))
  respondDigit(5)
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => {})
}

describe('SymbolmatchTask', () => {
  it('requires both practice trials and submits observable facts in formal trials', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(400))
    respondDigit(1)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('已记录，下一题准备中')).toBeTruthy()
    expect(Object.keys(onTrialComplete.mock.calls[0][0]).sort()).toEqual(['interrupted', 'response', 'rtMs', 'symbol'])
  })

  it('records timeout as null response and null rt', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(400))
    act(() => vi.advanceTimersByTime(8000))
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ response: null, rtMs: null })
  })

  it('flags visibility interruption without changing timing facts', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(400))
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    respondDigit(2)
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })

  it('accepts keyboard 1-5 responses', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(400))
    fireEvent.keyDown(window, { key: '3' })
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ response: 3 })
  })

  it('keeps the trial pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(400))
    respondDigit(1)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交失败，请重试当前试次')).toBeTruthy()
  })

  it('intake repair: ignores held-key repeats and accepts focused button activation once', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    act(() => vi.advanceTimersByTime(400))
    fireEvent.keyDown(window, { key: '1', repeat: true })
    expect(onTrialComplete).not.toHaveBeenCalled()
    const button = screen.getByRole('button', { name: '1' })
    button.focus()
    fireEvent.click(button, { detail: 0 })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ response: 1 })
  })

  it('intake repair: rereads full instructions before the second practice round and keeps the round limit', () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<SymbolmatchTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (let round = 1; round <= 2; round++) {
      act(() => vi.advanceTimersByTime(400))
      fireEvent.pointerDown(screen.getByRole('button', { name: '2' }), { pointerType: 'mouse', button: 0 })
      fireEvent.click(screen.getByText('下一个'))
      act(() => vi.advanceTimersByTime(400))
      fireEvent.pointerDown(screen.getByRole('button', { name: '2' }), { pointerType: 'mouse', button: 0 })
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
