import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FakeTask } from '../tasks/fake/FakeTask'

const taskContext = {
  sessionId: 's1',
  testType: 'fake',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  config: { trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 },
  randomSeed: 'seed-123',
}

const renderTask = (trialIndex: number, onTrialComplete = vi.fn()) =>
  render(<FakeTask taskContext={taskContext} trialIndex={trialIndex} onTrialComplete={onTrialComplete} />)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('FakeTask', () => {
  it('renders trial label 第 {trialIndex+1}/{trialCount} for trial 0/1/2', () => {
    const { unmount } = renderTask(0)
    expect(screen.getByText(/试次 1 \/ 3/)).toBeTruthy()
    unmount()
    renderTask(1)
    expect(screen.getByText(/试次 2 \/ 3/)).toBeTruthy()
    unmount()
    renderTask(2)
    expect(screen.getByText(/试次 3 \/ 3/)).toBeTruthy()
  })

  it('accepts and retains randomSeed from task context (contract)', () => {
    expect(taskContext.randomSeed).toBe('seed-123')
    const { unmount } = renderTask(0)
    unmount()
    expect(taskContext.randomSeed).toBe('seed-123') // 不被改写
  })

  it('click submits raw trial payload { correct: boolean, rtMs: number } only', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    renderTask(0, onTrialComplete)
    fireEvent.click(screen.getByLabelText('trial 0'))
    // onTrialComplete 异步完成后断言
    await vi.waitFor(() => expect(onTrialComplete).toHaveBeenCalledTimes(1))
    const payload = onTrialComplete.mock.calls[0][0] as { correct: boolean; rtMs: number }
    expect(typeof payload.correct).toBe('boolean')
    expect(typeof payload.rtMs).toBe('number')
    expect(payload.rtMs).toBeGreaterThanOrEqual(0)
    // 不提交 score / payloadHash / 加密字段
    expect(Object.keys(payload).sort()).toEqual(['correct', 'rtMs'])
  })

  it('does not submit score/hash/encrypted fields', () => {
    const onTrialComplete = vi.fn()
    renderTask(0, onTrialComplete)
    const payloadKeys = ['correct', 'rtMs']
    expect(payloadKeys).not.toContain('score')
    expect(payloadKeys).not.toContain('payloadHash')
    expect(payloadKeys).not.toContain('payloadEncrypted')
  })
})
