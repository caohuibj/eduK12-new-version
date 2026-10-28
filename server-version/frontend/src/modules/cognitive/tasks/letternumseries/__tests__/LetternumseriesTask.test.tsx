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
    expect(screen.getByText('提交失败，请重试当前试次')).toBeTruthy()
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
})
