import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { EmbeddedfiguresTask } from '../EmbeddedfiguresTask'

const config = {
  totalTrials: 1,
  stimulusSetVersion: 'embeddedfigures-zh-v1.0.0',
  showTargetMs: 3000,
  timeoutMs: 15000,
  validRtFloorMs: 400,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'embeddedfigures',
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

const enterFormal = async (onTrialComplete: Mock<(payload: Record<string, unknown>) => Promise<boolean | void>>) => {
  render(<EmbeddedfiguresTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
  fireEvent.click(screen.getByText('开始练习'))
  await act(async () => { vi.advanceTimersByTime(3000) })
  // 练习：点一个多边形进入反馈，再进正式
  fireEvent.pointerDown(document.querySelectorAll('svg polygon[style]')[0])
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => { vi.advanceTimersByTime(3000) })
}

describe('EmbeddedfiguresTask', () => {
  it('shows target, then submits clickedShapeId in formal trials', async () => {
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<EmbeddedfiguresTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(3000) })
    fireEvent.pointerDown(document.querySelectorAll('svg polygon[style]')[0])
    fireEvent.click(screen.getByText('开始正式测评'))
    await act(async () => { vi.advanceTimersByTime(3000) })
    fireEvent.pointerDown(document.querySelectorAll('svg polygon[style]')[0])
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(Object.keys(onTrialComplete.mock.calls[0][0]).sort()).toEqual(['clickedShapeId', 'interrupted', 'itemIndex', 'rtMs'])
  })

  it('records timeout as null clickedShapeId and null rt', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    await act(async () => { vi.advanceTimersByTime(15000) })
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ clickedShapeId: null, rtMs: null })
  })

  it('keeps the trial pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    await enterFormal(onTrialComplete)
    const polygons = document.querySelectorAll('svg polygon[style]')
    fireEvent.pointerDown(polygons[0])
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交失败，请重试当前试次')).toBeTruthy()
  })

  it('flags visibility interruption in the payload', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    const polygons = document.querySelectorAll('svg polygon[style]')
    fireEvent.pointerDown(polygons[0])
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })
})
