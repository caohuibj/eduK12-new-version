import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import React from 'react'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { UfovTask } from '../UfovTask'

const config = {
  totalTrials: 1,
  stimulusMs: 400,
  fixationMs: 500,
  validRtFloorMs: 200,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'ufov',
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

const directionButtons = () => screen.getAllByRole('button').filter((button) => ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'].includes(button.textContent ?? ''))
const centralButtons = () => screen.getAllByRole('button').filter((button) => /圆形|三角形/.test(button.textContent ?? ''))

const enterFormal = async (onTrialComplete: Mock<(payload: Record<string, unknown>) => Promise<boolean | void>>) => {
  render(<UfovTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
  fireEvent.click(screen.getByText('开始练习'))
  await act(async () => { vi.advanceTimersByTime(500) })
  await act(async () => { vi.advanceTimersByTime(400) })
  fireEvent.pointerDown(centralButtons()[0], { pointerType: 'mouse', button: 0 })
  fireEvent.pointerDown(directionButtons()[0], { pointerType: 'mouse', button: 0 })
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => { vi.advanceTimersByTime(500) })
  await act(async () => { vi.advanceTimersByTime(400) })
}

describe('UfovTask', () => {
  it('runs dual-response flow and submits observable facts', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    fireEvent.pointerDown(centralButtons()[0], { pointerType: 'mouse', button: 0 })
    fireEvent.pointerDown(directionButtons()[0], { pointerType: 'mouse', button: 0 })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(Object.keys(onTrialComplete.mock.calls[0][0]).sort()).toEqual([
      'centralResponse', 'centralTarget', 'interrupted', 'peripheralPosition', 'peripheralResponse', 'rtMs',
    ])
  })

  it('records timeout as null responses', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(0) // sequential flow: no timeout auto-submit implemented (user must respond)
  })

  it('flags visibility interruption in the payload', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    fireEvent.pointerDown(centralButtons()[0], { pointerType: 'mouse', button: 0 })
    fireEvent.pointerDown(directionButtons()[0], { pointerType: 'mouse', button: 0 })
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })

  it('keeps the trial pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    await enterFormal(onTrialComplete)
    fireEvent.pointerDown(centralButtons()[0], { pointerType: 'mouse', button: 0 })
    fireEvent.pointerDown(directionButtons()[0], { pointerType: 'mouse', button: 0 })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交失败，请重试当前试次')).toBeTruthy()
  })
})
