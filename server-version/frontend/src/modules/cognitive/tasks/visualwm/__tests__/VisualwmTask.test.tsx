import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import React from 'react'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { VisualwmTask } from '../VisualwmTask'

const config = {
  totalTrials: 1,
  studyMs: 500,
  retentionMs: 900,
  validRtFloorMs: 200,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'visualwm',
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

const respond = (index: number) => {
  const buttons = screen.getAllByRole('button').filter((button) => button.className.includes('btn-secondary'))
  fireEvent.pointerDown(buttons[index], { pointerType: 'mouse', button: 0 })
}

const enterFormal = async (onTrialComplete: Mock<(payload: Record<string, unknown>) => Promise<boolean | void>>) => {
  render(<VisualwmTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
  fireEvent.click(screen.getByText('开始练习'))
  await act(async () => { vi.advanceTimersByTime(400) })
  await act(async () => { vi.advanceTimersByTime(500) })
  await act(async () => { vi.advanceTimersByTime(900) })
  respond(0)
  fireEvent.click(screen.getByText('开始正式测评'))
  await act(async () => { vi.advanceTimersByTime(400) })
  await act(async () => { vi.advanceTimersByTime(500) })
  await act(async () => { vi.advanceTimersByTime(900) })
}

describe('VisualwmTask', () => {
  it('gives practice feedback and submits stimulus facts in formal trials', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    respond(0)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(Object.keys(onTrialComplete.mock.calls[0][0]).sort()).toEqual(['interrupted', 'isChange', 'response', 'rtMs', 'setSize'])
  })

  it('flags visibility interruption in the payload', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    respond(0)
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ interrupted: true })
  })

  it('keeps the trial pending when the runner rejects the submission', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(false)
    await enterFormal(onTrialComplete)
    respond(0)
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('提交失败，请重试当前试次')).toBeTruthy()
  })
})


it('records the first real probe RT, ignores repeated keys and continues after the same-record retry', async () => {
  let now = 1000
  vi.mocked(performance.now).mockImplementation(() => now)
  const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(undefined)
  const taskContext = { ...context, config: { ...config, totalTrials: 2 } }
  const view = render(<VisualwmTask taskContext={taskContext} trialIndex={0} onTrialComplete={save} />)
  const reachProbe = async () => {
    await act(async () => { vi.advanceTimersByTime(400) })
    await act(async () => { vi.advanceTimersByTime(500) })
    await act(async () => { vi.advanceTimersByTime(900) })
  }
  fireEvent.click(screen.getByText('开始练习'))
  await reachProbe()
  respond(0)
  fireEvent.click(screen.getByText('开始正式测评'))
  await reachProbe()
  now = 1321.4
  fireEvent.keyDown(window, { key: '2', repeat: true })
  expect(save).not.toHaveBeenCalled()
  fireEvent.keyDown(window, { key: '2' })
  await act(async () => {})
  expect(save.mock.calls[0][0].rtMs).toBe(321)
  now = 9000
  fireEvent.click(screen.getByText('重试保存'))
  await act(async () => {})
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0])
  view.rerender(<VisualwmTask taskContext={taskContext} trialIndex={1} onTrialComplete={save} />)
  await reachProbe()
  fireEvent.click(screen.getByText('1 · 相同'), { detail: 0 })
  await act(async () => {})
  expect(save).toHaveBeenCalledTimes(3)
})
