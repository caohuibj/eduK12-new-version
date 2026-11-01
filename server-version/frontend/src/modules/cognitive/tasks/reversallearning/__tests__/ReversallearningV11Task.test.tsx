import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReversallearningTask } from '../ReversallearningTask'
import { reversallearningSequence } from '../../shared/prng'
import type { CognitiveTaskContext } from '../../../core/runner.types'

const config = { totalTrials: 40, acquisitionTrials: 20, reversalTrials: 20, rewardProbability: 0.8, trialTimeoutMs: 2000, practiceTrialCount: 4, practiceAcquisitionOnly: false }
const context = (patch = {}): CognitiveTaskContext => ({ sessionId: 'synthetic-reversal', testType: 'reversallearning', engineVersion: '1.1.0', scoringVersion: '1.0.0', configVersion: '1.1.0', attemptNo: 1, randomSeed: 'synthetic-reversal', config: { ...config, ...patch } })
const practice = (count = 4, only = false) => reversallearningSequence('reversallearning-practice-v1.1.0', count, only ? count : Math.ceil(count / 2), only ? 0 : Math.floor(count / 2), 0.8)
const enterFormal = () => {
  fireEvent.click(screen.getByText('开始练习'))
  practice().forEach((spec, i) => {
    fireEvent.click(screen.getByRole('button', { name: spec.correctResponse === 'left' ? '左侧符号' : '右侧符号' }))
    fireEvent.click(screen.getByText(i === 3 ? '查看练习结果' : '下一题'))
  })
  fireEvent.click(screen.getByText('开始正式测验'))
}

afterEach(() => { cleanup(); vi.useRealTimers() })
describe('reversal C1.1 participant feedback and research preparation', () => {
  it.each(['correct-but-unrewarded', 'incorrect'])('uses the identical negative message for %s and keeps it visible for 500 ms', async mode => {
    vi.useFakeTimers()
    let randomSeed = ''
    for (let i = 0; i < 100; i++) {
      const candidate = `negative-feedback-${i}`
      if (reversallearningSequence(candidate, 40, 20, 20, 0.8)[0].rewardRoll >= 0.8) { randomSeed = candidate; break }
    }
    expect(randomSeed).not.toBe('')
    const onTrialComplete = vi.fn().mockResolvedValue(true)
    render(<ReversallearningTask taskContext={{ ...context(), randomSeed }} trialIndex={0} onTrialComplete={onTrialComplete} />)
    enterFormal()
    expect(screen.queryByText(/习得阶段|反转阶段/)).toBeNull()
    const spec = reversallearningSequence(randomSeed, 40, 20, 20, 0.8)[0]
    const correct = spec.correctResponse
    const choice = mode === 'incorrect' ? (correct === 'left' ? 'right' : 'left') : correct
    fireEvent.click(screen.getByRole('button', { name: choice === 'left' ? '左侧符号' : '右侧符号' }))
    expect(screen.getByText('未获得反馈')).toBeTruthy()
    expect(screen.queryByText('本次未获得反馈')).toBeNull()
    expect(onTrialComplete).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(499) })
    expect(onTrialComplete).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(onTrialComplete).toHaveBeenCalledOnce()
    expect(onTrialComplete.mock.calls[0][0].choice).toBe(choice)
  })

  it('runs all 30 local acquisition-only research practice trials without inventing an accuracy gate', () => {
    const onTrialComplete = vi.fn()
    render(<ReversallearningTask taskContext={context({ practiceTrialCount: 30, practiceAcquisitionOnly: true })} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    expect(screen.getByText('◇')).toBeTruthy()
    expect(screen.queryByText('○')).toBeNull()
    const specs = practice(30, true)
    expect(specs.every(s => s.segment === 'acquisition')).toBe(true)
    specs.forEach((spec, i) => {
      // Deliberately choose the other pattern; completing training is not a qualification gate.
      fireEvent.click(screen.getByRole('button', { name: spec.correctResponse === 'left' ? '右侧符号' : '左侧符号' }))
      fireEvent.click(screen.getByText(i === 29 ? '查看练习结果' : '下一题'))
    })
    expect(screen.getByText('练习已完成 30 题')).toBeTruthy()
    fireEvent.click(screen.getByText('开始正式测验'))
    expect(screen.getByText('正式试次 1 / 40')).toBeTruthy()
    expect(screen.getByText('○')).toBeTruthy()
    expect(screen.queryByText('◇')).toBeNull()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('keeps a 2-second timeout as a missing choice, then displays timeout feedback for 500 ms', async () => {
    vi.useFakeTimers()
    const onTrialComplete = vi.fn().mockResolvedValue(true)
    render(<ReversallearningTask taskContext={context()} trialIndex={0} onTrialComplete={onTrialComplete} />)
    enterFormal()
    await act(async () => { await vi.advanceTimersByTimeAsync(1999) })
    expect(onTrialComplete).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(screen.getByText('超时未选择')).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(onTrialComplete).toHaveBeenCalledWith({ choice: null, rtMs: null, interrupted: true })
  })
})
