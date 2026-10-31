import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import React from 'react'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { DelaydiscountTask } from '../DelaydiscountTask'

const config = {
  delayBands: [7, 30],
  delayedAmount: 100,
  bisectionSteps: 2,
  fixationMs: 500,
  timeoutMs: 15000,
  validRtFloorMs: 300,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'delaydiscount',
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

const chooseLater = () => {
  fireEvent.pointerDown(screen.getByRole('button', { name: /按 2 · 延后多得/ }), { pointerType: 'mouse', button: 0 })
}
const chooseNow = () => {
  fireEvent.pointerDown(screen.getByRole('button', { name: /按 1 · 现在立刻/ }), { pointerType: 'mouse', button: 0 })
}

const enterFormal = async (onTrialComplete: Mock<(payload: Record<string, unknown>) => Promise<boolean | void>>) => {
  render(<DelaydiscountTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={vi.fn().mockResolvedValue(undefined)} />)
  fireEvent.click(screen.getByText('开始练习'))
  await act(async () => { vi.advanceTimersByTime(500) })
  chooseLater()
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => { vi.advanceTimersByTime(500) })
}

describe('DelaydiscountTask', () => {
  it('advances the bisection bounds from the choice and submits the midpoint', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    chooseLater()
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    const first = onTrialComplete.mock.calls[0][0]
    expect(first).toMatchObject({ immediateAmount: 50, choice: 'later' })
    expect(first.delayDays).toBeGreaterThanOrEqual(7)
    await act(async () => { vi.advanceTimersByTime(500) })
    chooseLater()
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(2)
    expect(onTrialComplete.mock.calls[1][0]).toMatchObject({ immediateAmount: 75, choice: 'later' })
  })

  it('lowers the immediate amount after choosing now', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    chooseNow()
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ immediateAmount: 50, choice: 'now' })
    await act(async () => { vi.advanceTimersByTime(500) })
    chooseLater()
    await act(async () => {})
    expect(onTrialComplete.mock.calls[1][0]).toMatchObject({ immediateAmount: 25, choice: 'later' })
  })

  it('records timeout as null choice and null rt', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    await act(async () => { vi.advanceTimersByTime(15000) })
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ choice: null, rtMs: null })
  })

  it('keeps the trial pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    await enterFormal(onTrialComplete)
    chooseLater()
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交失败，请重试当前试次')).toBeTruthy()
    await act(async () => { vi.advanceTimersByTime(500) })
    chooseLater()
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(2)
    expect(onTrialComplete.mock.calls[1][0]).toMatchObject({ immediateAmount: 50 })
  })

  it('signals completion through onTaskComplete after the last trial', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    render(<DelaydiscountTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(500) })
    chooseLater()
    fireEvent.click(screen.getByText('开始正式测评'))
    for (let trial = 0; trial < 4; trial += 1) {
      await act(async () => { vi.advanceTimersByTime(500) })
      chooseLater()
      await act(async () => {})
    }
    expect(onTrialComplete).toHaveBeenCalledTimes(4)
    expect(onTaskComplete).toHaveBeenCalledTimes(1)
  })
})
