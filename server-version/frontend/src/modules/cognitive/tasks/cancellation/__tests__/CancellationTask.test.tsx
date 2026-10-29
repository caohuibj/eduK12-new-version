import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import React from 'react'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { CancellationTask } from '../CancellationTask'

const config = {
  totalTrials: 1,
  durationMs: 45000,
  stimulusSetVersion: 'cancellation-zh-v1.0.0',
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'cancellation',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  config,
  randomSeed: 'seed-1',
}

let currentTime = 1000

beforeEach(() => {
  vi.useFakeTimers()
  currentTime = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => currentTime)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const cellButtons = () => screen.getAllByRole('button').filter((button) => button.getAttribute('aria-label')?.startsWith('格子'))

const clickCell = (index: number) => {
  fireEvent.pointerDown(cellButtons()[index], { pointerType: 'mouse', button: 0 })
}

const enterFormal = async (onTrialComplete: Mock<(payload: Record<string, unknown>) => Promise<boolean | void>>) => {
  render(<CancellationTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
  fireEvent.click(screen.getByText('开始练习'))
  await act(async () => { vi.advanceTimersByTime(500) })
  fireEvent.click(cellButtons()[0])
  fireEvent.click(screen.getByText('提前结束本轮'))
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => { vi.advanceTimersByTime(500) })
}

describe('CancellationTask', () => {
  it('toggles selection and submits selectedCells at scan end', async () => {
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<CancellationTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(500) })
    clickCell(0)
    clickCell(0)
    expect(cellButtons()[0].className).not.toContain('bg-sky-500')
    clickCell(1)
    fireEvent.click(screen.getByText('提前结束本轮'))
    expect(screen.getByText(/你点亮了 1 个格子/)).toBeTruthy()
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => { vi.advanceTimersByTime(500) })
    clickCell(2)
    clickCell(3)
    clickCell(2)
    currentTime += 45000
    await act(async () => { vi.advanceTimersByTime(46000) })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ scanIndex: 0, selectedCells: [3], interrupted: false })
    expect(onTaskComplete).toHaveBeenCalledTimes(1)
  })

  it('keeps the scan pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    await enterFormal(onTrialComplete)
    clickCell(0)
    fireEvent.click(screen.getByText('提前结束本轮'))
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交失败，请重试当前轮')).toBeTruthy()
  })

  it('flags visibility interruption in the payload', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    clickCell(0)
    currentTime += 45000
    await act(async () => { vi.advanceTimersByTime(46000) })
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })
})
