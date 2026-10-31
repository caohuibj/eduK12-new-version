import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import React from 'react'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { GamblingdeckTask } from '../GamblingdeckTask'

const config = {
  totalTrials: 3,
  blockSize: 2,
  fixationMs: 400,
  feedbackMs: 1200,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'gamblingdeck',
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

const pickDeck = (deck: string) => {
  fireEvent.pointerDown(screen.getByRole('button', { name: new RegExp(`宝箱 ${deck}`) }), { pointerType: 'mouse', button: 0 })
}

const enterFormal = async (onTrialComplete: Mock<(payload: Record<string, unknown>) => Promise<boolean | void>>) => {
  render(<GamblingdeckTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={vi.fn().mockResolvedValue(undefined)} />)
  fireEvent.click(screen.getByText('开始练习'))
  pickDeck('C')
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => {})
}

describe('GamblingdeckTask', () => {
  it('shows scheduled feedback and counts down trials to completion', async () => {
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<GamblingdeckTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    pickDeck('C')
    fireEvent.click(screen.getByText('开始正式测评'))
    pickDeck('A')
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ deck: 'A', rtMs: 0, interrupted: false })
    expect(screen.getByText(/本箱 \+100/)).toBeTruthy()

    await act(async () => { vi.advanceTimersByTime(1200) })
    pickDeck('B')
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(2)
    expect(onTrialComplete.mock.calls[1][0]).toMatchObject({ deck: 'B' })

    await act(async () => { vi.advanceTimersByTime(1200) })
    pickDeck('C')
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(3)
    expect(onTaskComplete).toHaveBeenCalledTimes(1)
  })

  it('advances each deck position across repeated picks', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    pickDeck('C')
    await act(async () => {})
    expect(screen.getByText(/本箱 \+50/)).toBeTruthy()
    await act(async () => { vi.advanceTimersByTime(1200) })
    pickDeck('C')
    await act(async () => {})
    expect(screen.getByText(/本箱 \+50/)).toBeTruthy()
  })

  it('flags visibility interruption without changing the choice', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    pickDeck('D')
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ deck: 'D', interrupted: true })
  })

  it('keeps the trial pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    await enterFormal(onTrialComplete)
    pickDeck('A')
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交失败，请重试当前试次')).toBeTruthy()
    pickDeck('A')
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(2)
  })
})
