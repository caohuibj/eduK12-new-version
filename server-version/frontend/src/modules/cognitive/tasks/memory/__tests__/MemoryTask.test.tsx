import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { MemoryTask } from '../MemoryTask'
import { deterministicMemorySequence } from '../prng'

const config = {
  startLength: 2,
  maxLength: 3,
  trialsPerLevel: 2,
  digitDisplayMs: 800,
  digitIntervalMs: 200,
  readyDurationMs: 1000,
  inactivityGuardMs: 30000,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'memory',
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

const showSequence = (length: number) => {
  act(() => vi.advanceTimersByTime(1000))
  act(() => vi.advanceTimersByTime((length - 1) * 1000 + 800))
}

const enterFormal = async (onTrialComplete: Mock<(payload: Record<string, unknown>) => Promise<boolean | void>>) => {
  render(<MemoryTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
  fireEvent.click(screen.getByText('开始练习'))
  for (const sequence of [[3, 7, 1], [9, 4, 2]]) {
    showSequence(3)
    sequence.forEach((digit) => fireEvent.click(screen.getByRole('button', { name: String(digit) })))
    fireEvent.click(screen.getByText('提交练习'))
    fireEvent.click(screen.getByText(sequence[0] === 3 ? '下一个' : '开始正式测评'))
    await act(async () => {})
  }
}

const submitResponse = (response: number[]) => {
  response.forEach((digit) => fireEvent.click(screen.getByRole('button', { name: String(digit) })))
  fireEvent.click(screen.getByText('提交'))
}

describe('MemoryTask Digit Span Forward', () => {
  it('requires at least one correct practice trial before formal scoring', () => {
    const onTrialComplete = vi.fn()
    render(<MemoryTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))

    for (let practiceIndex = 0; practiceIndex < 2; practiceIndex += 1) {
      showSequence(3)
      ;[0, 0, 0].forEach((digit) => fireEvent.click(screen.getByRole('button', { name: String(digit) })))
      fireEvent.click(screen.getByText('提交练习'))
      if (practiceIndex === 0) fireEvent.click(screen.getByText('下一个'))
    }

    expect(screen.getByText(/练习正确 0 \/ 2/)).toBeTruthy()
    expect(screen.getByText('重新练习')).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('重新练习'))
    expect(screen.getByText(/练习 1 \/ 2/)).toBeTruthy()
  })

  it('shows entered digits and submits the corrected formal response', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    expect(screen.getByLabelText('数字广度正式测验')).toBeTruthy()
    showSequence(2)
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    expect(screen.getByText('已输入 1 / 2')).toBeTruthy()
    expect(screen.getByLabelText('第 1 位：1')).toBeTruthy()
    expect(screen.getByLabelText('第 2 位：未输入')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(screen.getByText('已输入 0 / 2')).toBeTruthy()
    fireEvent.keyDown(window, { key: '2' })
    fireEvent.click(screen.getByRole('button', { name: '退格' }))
    expect(screen.getByText('已输入 0 / 2')).toBeTruthy()
    fireEvent.keyDown(window, { key: '0' })
    expect(screen.getByLabelText('第 1 位：0')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '清空' }))
    expect(screen.getByText('已输入 0 / 2')).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: '3' })
    fireEvent.keyDown(window, { key: '4' })
    fireEvent.keyDown(window, { key: '5' })
    expect(screen.getByText('已输入 2 / 2')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Enter' })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ response: [3, 4] })
  })

  it('locks editing while a formal response is being saved', async () => {
    let resolveSave!: (value: boolean) => void
    const onTrialComplete = vi.fn().mockImplementation(() => new Promise<boolean>(resolve => { resolveSave = resolve }))
    await enterFormal(onTrialComplete)
    showSequence(2)
    submitResponse([1, 2])
    expect(screen.getByRole('button', { name: '提交中…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '退格' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '清空' })).toBeDisabled()
    fireEvent.keyDown(window, { key: 'Backspace' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByLabelText('第 2 位：2')).toBeTruthy()
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    await act(async () => { resolveSave(true) })
  })

  it('keeps trial 1 and trial 2 at the same length before advancing', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)

    showSequence(2)
    const first = deterministicMemorySequence('seed-1', 0, 2)
    submitResponse(first)
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ length: 2, trialWithinLevel: 1, response: first })
    expect(screen.getByText(/当前长度 2 · 第 2 题/)).toBeTruthy()

    showSequence(2)
    submitResponse([9, 9])
    await act(async () => {})
    expect(onTrialComplete.mock.calls[1][0].trialWithinLevel).toBe(2)
    expect(screen.getByText(/当前长度 3 · 第 1 题/)).toBeTruthy()
  })

  it('submits only the formal observable payload and records visibility interruption', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    showSequence(2)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    submitResponse(deterministicMemorySequence('seed-1', 0, 2))
    await act(async () => {})
    expect(Object.keys(onTrialComplete.mock.calls[0][0]).sort()).toEqual([
      'interrupted', 'length', 'response', 'responseDurationMs', 'sequence', 'trialWithinLevel',
    ])
    expect(onTrialComplete.mock.calls[0][0].interrupted).toBe(true)
  })
})
