import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import React from 'react'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { LetternumseriesTask } from '../LetternumseriesTask'

const config = {
  totalTrials: 1,
  lettersPerTrial: 3,
  digitsPerTrial: 2,
  stimulusMs: 500,
  isiMs: 250,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'letternumseries',
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
  for (let chunk = 0; chunk < 12; chunk += 1) {
    await act(async () => { vi.advanceTimersByTime(750) })
  }
}

const pickLettersPractice = async (items: string[]) => {
  for (const item of items) fireEvent.click(screen.getByRole('button', { name: item }))
  fireEvent.click(screen.getByText('提交字母'))
  await act(async () => {})
}

const pickLettersFormal = async (items: string[]) => {
  for (const item of items) fireEvent.click(screen.getByRole('button', { name: item }))
  fireEvent.click(screen.getByText('下一步：排数字'))
  await act(async () => {})
}

const pickDigitsAndSubmit = async (items: string[]) => {
  for (const item of items) fireEvent.click(screen.getByRole('button', { name: item }))
  fireEvent.click(screen.getByText('提交答案'))
  await act(async () => {})
}

describe('LetternumseriesTask', () => {
  it('runs both practice recall phases, then submits the sequence and both responses', async () => {
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<LetternumseriesTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await runPresentation()
    expect(screen.getByText(/按 A→Z/)).toBeTruthy()
    await pickLettersPractice(['D', 'K', 'M'])
    await pickDigitsAndSubmit(['2', '6'])
    fireEvent.click(screen.getByText('开始正式测评'))
    await runPresentation()
    await pickLettersFormal(['D', 'K', 'M'])
    await pickDigitsAndSubmit(['2', '6'])
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    const payload = onTrialComplete.mock.calls[0][0]
    expect(payload.sequence).toHaveLength(5)
    expect(payload.lettersResponse).toEqual(['D', 'K', 'M'])
    expect(payload.digitsResponse).toEqual(['2', '6'])
    expect(onTaskComplete).toHaveBeenCalledTimes(1)
  })

  it('gives two-step practice feedback', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<LetternumseriesTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await runPresentation()
    await pickLettersPractice(['D', 'K', 'M'])
    expect(screen.getByText(/字母部分正确/)).toBeTruthy()
    expect(screen.getByText(/从小到大/)).toBeTruthy()
    await pickDigitsAndSubmit(['2', '6'])
    expect(screen.getByText(/完全正确/)).toBeTruthy()
    fireEvent.click(screen.getByText('开始正式测评'))
    await runPresentation()
    await pickLettersFormal(['D', 'K', 'M'])
    await pickDigitsAndSubmit(['2', '6'])
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
  })

  it('keeps the trial pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    render(<LetternumseriesTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await runPresentation()
    await pickLettersPractice(['D', 'K', 'M'])
    await pickDigitsAndSubmit(['2', '6'])
    fireEvent.click(screen.getByText('开始正式测评'))
    await runPresentation()
    await pickLettersFormal(['D', 'K', 'M'])
    await pickDigitsAndSubmit(['2', '6'])
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交尚未确认，请重试已记录的答案')).toBeTruthy()
  })

  it('flags visibility interruption in the payload', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<LetternumseriesTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await runPresentation()
    await pickLettersPractice(['D', 'K', 'M'])
    await pickDigitsAndSubmit(['2', '6'])
    fireEvent.click(screen.getByText('开始正式测评'))
    await runPresentation()
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    await pickLettersFormal(['D', 'K', 'M'])
    await pickDigitsAndSubmit(['2', '6'])
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })
  it('continues after host rerender and retries the first recall payload unchanged', async () => {
    const onTrialComplete = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    const twoTrialContext = { ...context, config: { ...config, totalTrials: 2 } }
    const view = render(<LetternumseriesTask taskContext={twoTrialContext} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await runPresentation()
    await pickLettersPractice(['D', 'K', 'M'])
    await pickDigitsAndSubmit(['2', '6'])
    fireEvent.click(screen.getByText('开始正式测评'))
    await runPresentation()
    await pickLettersFormal(['D', 'K', 'M'])
    await pickDigitsAndSubmit(['2', '6'])
    const first = onTrialComplete.mock.calls[0][0]
    vi.mocked(performance.now).mockReturnValue(9000)
    fireEvent.click(screen.getByRole('button', { name: '重试提交已记录答案' }))
    await act(async () => {})
    expect(onTrialComplete.mock.calls[1][0]).toBe(first)
    expect(onTaskComplete).not.toHaveBeenCalled()
    view.rerender(<LetternumseriesTask taskContext={twoTrialContext} trialIndex={1} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    await runPresentation()
    expect(screen.getByText(/按 A→Z/)).toBeTruthy()
    await pickLettersFormal(['B', 'D', 'F'])
    await pickDigitsAndSubmit(['3', '4'])
    expect(onTrialComplete).toHaveBeenCalledTimes(3)
    expect(onTrialComplete.mock.calls[2][0]).toMatchObject({ lettersResponse: ['B', 'D', 'F'], digitsResponse: ['3', '4'] })
    expect(onTaskComplete).toHaveBeenCalledTimes(1)
  })
})
