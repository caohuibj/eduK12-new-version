import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { SemanticfluencyTask } from '../SemanticfluencyTask'

const config = {
  totalTrials: 1,
  durationMs: 45000,
  stimulusSetVersion: 'semanticfluency-zh-v1.0.0',
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'semanticfluency',
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

const typeWord = async (word: string) => {
  const input = screen.getByPlaceholderText('输入词语后按回车')
  fireEvent.change(input, { target: { value: word } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await act(async () => {})
}

describe('SemanticfluencyTask', () => {
  it('runs practice with a countdown, then submits category facts in formal', async () => {
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<SemanticfluencyTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(400) })
    await typeWord('猫')
    await typeWord('狗')
    await typeWord('猫')
    fireEvent.click(screen.getByText('提前结束本轮'))
    expect(screen.getByText(/你输入了 3 个词/)).toBeTruthy()
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => { vi.advanceTimersByTime(400) })
    await typeWord('苹果')
    await typeWord('香蕉')
    currentTime += 45000
    await act(async () => { vi.advanceTimersByTime(46000) })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ responses: ['苹果', '香蕉'], interrupted: false })
    expect(onTaskComplete).toHaveBeenCalledTimes(1)
  })

  it('keeps the round pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    render(<SemanticfluencyTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(400) })
    await typeWord('猫')
    fireEvent.click(screen.getByText('提前结束本轮'))
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => { vi.advanceTimersByTime(400) })
    await typeWord('苹果')
    fireEvent.click(screen.getByText('提前结束本轮'))
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交尚未确认，请重试已记录的答案')).toBeTruthy()
  })

  it('flags visibility interruption in the payload', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<SemanticfluencyTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(400) })
    await typeWord('猫')
    fireEvent.click(screen.getByText('提前结束本轮'))
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => { vi.advanceTimersByTime(400) })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    await typeWord('苹果')
    currentTime += 45000
    await act(async () => { vi.advanceTimersByTime(46000) })
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })
  it('starts the next host round and retries the original word list unchanged', async () => {
    const onTrialComplete = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    const twoTrialContext = { ...context, config: { ...config, totalTrials: 2 } }
    const view = render(<SemanticfluencyTask taskContext={twoTrialContext} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(400) })
    await typeWord('猫')
    fireEvent.click(screen.getByText('提前结束本轮'))
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => { vi.advanceTimersByTime(400) })
    await typeWord('苹果')
    fireEvent.click(screen.getByText('提前结束本轮'))
    await act(async () => {})
    const first = onTrialComplete.mock.calls[0][0]
    currentTime += 9000
    fireEvent.click(screen.getByRole('button', { name: '重试提交已记录答案' }))
    await act(async () => {})
    expect(onTrialComplete.mock.calls[1][0]).toBe(first)
    expect(onTaskComplete).not.toHaveBeenCalled()
    view.rerender(<SemanticfluencyTask taskContext={twoTrialContext} trialIndex={1} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    await act(async () => { vi.advanceTimersByTime(400) })
    expect(screen.getByPlaceholderText('输入词语后按回车')).toHaveProperty('value', '')
    await typeWord('狗')
    fireEvent.click(screen.getByText('提前结束本轮'))
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(3)
    expect(onTrialComplete.mock.calls[2][0]).toMatchObject({ responses: ['狗'] })
    expect(onTaskComplete).toHaveBeenCalledTimes(1)
  })
})
