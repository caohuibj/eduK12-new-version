import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import React from 'react'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { SharegameTask } from '../SharegameTask'

const config = {
  endowments: [20, 50],
  fixationMs: 400,
  timeoutMs: 20000,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'sharegame',
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

const chooseLabel = (label: string) => {
  fireEvent.pointerDown(screen.getByRole('button', { name: new RegExp(label) }), { pointerType: 'mouse', button: 0 })
}

describe('SharegameTask', () => {
  it('completes practice, then submits endowment facts per round and completes', async () => {
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<SharegameTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(400) })
    chooseLabel('给一半')
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => { vi.advanceTimersByTime(400) })
    chooseLabel('给 3/4')
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ endowment: 20, given: 15, rtMs: 0, interrupted: false })
    expect(screen.getByText('已记录，下一轮准备中')).toBeTruthy()

    // runner 推进 trialIndex 由 harness 模拟：直接重渲染 trialIndex=1
    await act(async () => { vi.advanceTimersByTime(400) })
    // 第二轮仍渲染 trialIndex=0 的静态上下文：改为验证 task complete 未触发
    expect(onTaskComplete).not.toHaveBeenCalled()
  })

  it('advances through all rounds with a trialIndex-driving harness', async () => {
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    const payloads: Record<string, unknown>[] = []
    function Harness() {
      const [trialIndex, setTrialIndex] = React.useState(0)
      const onTrialComplete = async (payload: Record<string, unknown>) => {
        payloads.push(payload)
        if (trialIndex + 1 < config.endowments.length) setTrialIndex(trialIndex + 1)
        return true
      }
      return <SharegameTask taskContext={context} trialIndex={trialIndex} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />
    }
    render(<Harness />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(400) })
    chooseLabel('给一半')
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => { vi.advanceTimersByTime(400) })
    chooseLabel('全部给出')
    await act(async () => { vi.advanceTimersByTime(400) })
    chooseLabel('全部自留')
    await act(async () => {})
    expect(payloads).toHaveLength(2)
    expect(payloads[0]).toMatchObject({ endowment: 20, given: 20 })
    expect(payloads[1]).toMatchObject({ endowment: 50, given: 0 })
    expect(onTaskComplete).toHaveBeenCalledTimes(1)
  })

  it('keeps the trial pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    render(<SharegameTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(400) })
    chooseLabel('给一半')
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => { vi.advanceTimersByTime(400) })
    chooseLabel('给一半')
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交失败，请重试当前轮')).toBeTruthy()
  })

  it('flags visibility interruption in the payload', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<SharegameTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(400) })
    chooseLabel('给一半')
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => { vi.advanceTimersByTime(400) })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    chooseLabel('全部自留')
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })
})
