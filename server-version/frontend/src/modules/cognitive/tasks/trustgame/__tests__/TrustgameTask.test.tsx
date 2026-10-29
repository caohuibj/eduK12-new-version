import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import React from 'react'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { TrustgameTask } from '../TrustgameTask'

const config = {
  offers: [50, 20],
  potTotal: 100,
  fixationMs: 400,
  timeoutMs: 20000,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'trustgame',
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

const choose = (label: RegExp) => {
  fireEvent.pointerDown(screen.getByRole('button', { name: label }), { pointerType: 'mouse', button: 0 })
}

const enterFormal = async (onTrialComplete: Mock<(payload: Record<string, unknown>) => Promise<boolean | void>>) => {
  render(<TrustgameTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
  fireEvent.click(screen.getByText('开始练习'))
  await act(async () => { vi.advanceTimersByTime(400) })
  choose(/拒绝/)
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => { vi.advanceTimersByTime(400) })
}

describe('TrustgameTask', () => {
  it('gives practice feedback then submits offer facts per round', async () => {
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<TrustgameTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(400) })
    choose(/拒绝/)
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => { vi.advanceTimersByTime(400) })
    choose(/接受/)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ roundIndex: 0, offerToSelf: 50, response: 'accept', rtMs: 0, interrupted: false })
  })

  it('advances through rounds and completes with a trialIndex-driving harness', async () => {
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    const payloads: Record<string, unknown>[] = []
    function Harness() {
      const [trialIndex, setTrialIndex] = React.useState(0)
      const onTrialComplete = async (payload: Record<string, unknown>) => {
        payloads.push(payload)
        if (trialIndex + 1 < config.offers.length) setTrialIndex(trialIndex + 1)
        return true
      }
      return <TrustgameTask taskContext={context} trialIndex={trialIndex} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />
    }
    render(<Harness />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(400) })
    choose(/拒绝/)
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => { vi.advanceTimersByTime(400) })
    choose(/接受/)
    await act(async () => { vi.advanceTimersByTime(400) })
    choose(/拒绝/)
    await act(async () => {})
    expect(payloads).toHaveLength(2)
    expect(payloads[1]).toMatchObject({ roundIndex: 1, offerToSelf: 20, response: 'reject' })
    expect(onTaskComplete).toHaveBeenCalledTimes(1)
  })

  it('records timeout as null response and null rt', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    await act(async () => { vi.advanceTimersByTime(20000) })
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ response: null, rtMs: null })
  })

  it('keeps the round pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    await enterFormal(onTrialComplete)
    choose(/接受/)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交失败，请重试当前轮')).toBeTruthy()
  })

  it('flags visibility interruption in the payload', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    choose(/接受/)
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })
})
