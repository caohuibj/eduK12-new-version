import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import React from 'react'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { NumberlineTask } from '../NumberlineTask'

const config = {
  totalTrials: 2,
  lineMax: 100,
  maxResponseMs: 10000,
  validRtFloorMs: 300,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'numberline',
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

const getTrack = () => {
  const track = screen.getByRole('slider', { name: /0 到 100 的数字线/ })
  const rect = (track as HTMLElement).getBoundingClientRect()
  Object.defineProperty(track, 'getBoundingClientRect', { configurable: true, value: () => ({ ...rect, left: 0, width: 100 }) })
  return track
}

/** Runner-like harness: advances trialIndex after each accepted trial; the task calls onTaskComplete itself. */
const Harness: React.FC<{
  onSubmit: (payload: Record<string, unknown>) => void
  onTaskComplete: Mock<() => Promise<void>>
  accepted?: boolean
}> = ({ onSubmit, onTaskComplete, accepted = true }) => {
  const [trialIndex, setTrialIndex] = React.useState(0)
  const onTrialComplete = async (payload: Record<string, unknown>) => {
    onSubmit(payload)
    if (!accepted) return false
    if (trialIndex + 1 < config.totalTrials) setTrialIndex(trialIndex + 1)
    return true
  }
  return <NumberlineTask taskContext={context} trialIndex={trialIndex} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />
}

const enterFormal = async (onTrialComplete: Mock<(payload: Record<string, unknown>) => Promise<boolean | void>>) => {
  render(<NumberlineTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
  fireEvent.click(screen.getByText('开始练习'))
  await act(async () => { vi.advanceTimersByTime(400) })
  fireEvent.click(getTrack(), { clientX: 37, button: 0 })
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => { vi.advanceTimersByTime(400) })
}

describe('NumberlineTask', () => {
  it('completes practice, then submits a 0..1 position payload for each formal trial', async () => {
    const payloads: Record<string, unknown>[] = []
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    render(<Harness onSubmit={(payload) => payloads.push(payload)} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(400) })
    fireEvent.click(getTrack(), { clientX: 37, button: 0 })
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => { vi.advanceTimersByTime(400) })
    fireEvent.click(getTrack(), { clientX: 60, button: 0 })
    await act(async () => { await Promise.resolve() })
    expect(payloads.length).toBe(1)
    expect(payloads[0]).toMatchObject({ targetNumber: expect.any(Number), responsePosition: 0.6, interrupted: false })
    expect(payloads[0].rtMs).toBe(0)

    await act(async () => { vi.advanceTimersByTime(400) })
    fireEvent.click(getTrack(), { clientX: 25, button: 0 })
    await act(async () => { await Promise.resolve() })
    expect(payloads.length).toBe(2)
    expect(payloads[1]).toMatchObject({ responsePosition: 0.25 })
    expect(onTaskComplete).toHaveBeenCalledTimes(1)
  })

  it('records a timeout as null position and null rt', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ responsePosition: null, rtMs: null })
  })

  it('flags visibility interruption without changing timing facts', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    fireEvent.click(getTrack(), { clientX: 50, button: 0 })
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })

  it('clamps clicks beyond the track to the 0..1 range', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    fireEvent.click(getTrack(), { clientX: 250, button: 0 })
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ responsePosition: 1 })
  })

  it('keeps the trial pending when the runner rejects the submission', async () => {
    const payloads: Record<string, unknown>[] = []
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    render(<Harness onSubmit={(payload) => payloads.push(payload)} onTaskComplete={onTaskComplete} accepted={false} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(400) })
    fireEvent.click(getTrack(), { clientX: 37, button: 0 })
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => { vi.advanceTimersByTime(400) })
    fireEvent.click(getTrack(), { clientX: 60, button: 0 })
    await act(async () => { await Promise.resolve() })
    expect(payloads.length).toBe(1)
    expect(screen.getByText('提交失败，请重试当前试次')).toBeTruthy()
    expect(onTaskComplete).not.toHaveBeenCalled()
    fireEvent.click(getTrack(), { clientX: 40, button: 0 })
    await act(async () => { await Promise.resolve() })
    expect(payloads.length).toBe(2)
    expect(payloads[1]).toMatchObject({ responsePosition: 0.4 })
  })
})
