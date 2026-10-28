import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import React from 'react'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { RunningspanTask } from '../RunningspanTask'

const config = {
  totalTrials: 1,
  listLengthMin: 4,
  listLengthMax: 5,
  recallLength: 2,
  stimulusMs: 500,
  isiMs: 250,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'runningspan',
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

const runPresentation = async () => {
  // 逐块推进：每次 act 让 React 刷新 effect 并调度下一段（呈现约 750ms/字母）
  for (let chunk = 0; chunk < 12; chunk += 1) {
    await act(async () => { vi.advanceTimersByTime(750) })
  }
}

const pickAndSubmit = async (letters: string[]) => {
  for (const letter of letters) fireEvent.click(screen.getByRole('button', { name: letter }))
  fireEvent.click(screen.getByText('提交答案'))
  await act(async () => {})
}

describe('RunningspanTask', () => {
  it('presents letters, then submits sequence and response in the payload', async () => {
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<RunningspanTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await runPresentation()
    expect(screen.getByText(/请按出现顺序/)).toBeTruthy()
    await pickAndSubmit(['X', 'T'])
    fireEvent.click(screen.getByText('开始正式测评'))
    await runPresentation()
    await pickAndSubmit(['X', 'T'])
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    const payload = onTrialComplete.mock.calls[0][0]
    expect(payload.sequence.length).toBeGreaterThanOrEqual(4)
    expect(payload.sequence.length).toBeLessThanOrEqual(5)
    expect(payload.response).toEqual(['X', 'T'])
    expect(payload.responseDurationMs).toBe(0)
    expect(onTaskComplete).toHaveBeenCalledTimes(1)
  })

  it('gives practice feedback and blocks nothing after a single practice round', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<RunningspanTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await runPresentation()
    await pickAndSubmit(['X', 'T'])
    expect(screen.getByText(/你答对了/)).toBeTruthy()
    fireEvent.click(screen.getByText('开始正式测评'))
    await runPresentation()
    await pickAndSubmit(['X', 'T'])
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
  })

  it('keeps the trial pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    render(<RunningspanTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await runPresentation()
    await pickAndSubmit(['X', 'T'])
    fireEvent.click(screen.getByText('开始正式测评'))
    await runPresentation()
    await pickAndSubmit(['X', 'T'])
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交失败，请重试当前试次')).toBeTruthy()
  })

  it('flags visibility interruption in the payload', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<RunningspanTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await runPresentation()
    await pickAndSubmit(['X', 'T'])
    fireEvent.click(screen.getByText('开始正式测评'))
    await runPresentation()
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    await pickAndSubmit(['X', 'T'])
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })
})
