import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PatterncompareTask } from '../tasks/patterncompare/PatterncompareTask'
import { FlankerTask } from '../tasks/flanker/FlankerTask'
import { CardsortTask } from '../tasks/cardsort/CardsortTask'
import { cardsortSequence, flankerSequence, patterncompareTrial } from '../tasks/shared/prng'
import { resolveRunner } from '../registry'
import golden from '../../../../../cognitive-randomization-golden-v1.json'

const baseContext = {
  sessionId: 'session-1',
  testType: 'patterncompare',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  randomSeed: 'seed-1',
  config: {},
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Round 2 PR3 task runners', () => {
  it('registers all exact frontend engine versions', () => {
    expect(resolveRunner('patterncompare', '1.0.0')?.completionMode).toBe('task')
    expect(resolveRunner('flanker', '1.0.0')?.completionMode).toBe('task')
    expect(resolveRunner('cardsort', '1.0.0')?.completionMode).toBe('task')
    expect(resolveRunner('cardsort', 'latest')).toBeUndefined()
  })

  it('matches the backend seed golden fixtures', () => {
    expect(Array.from({ length: 4 }, (_, index) => patterncompareTrial(golden.seed, index))).toEqual(golden.patterncompare)
    expect(flankerSequence(golden.seed, 8)).toEqual(golden.flanker)
    expect(cardsortSequence(golden.seed, 12, 2, 0.33)).toEqual(golden.cardsort)
  })

  it('does not persist failed pattern-comparison practice and offers retry', () => {
    const onTrialComplete = vi.fn()
    render(<PatterncompareTask
      taskContext={{ ...baseContext, config: { durationSec: 30, trialTimeoutMs: 1000, isiMs: 10 } }}
      trialIndex={0}
      onTrialComplete={onTrialComplete}
    />)
    fireEvent.click(screen.getByText('开始练习'))
    for (let index = 0; index < 4; index += 1) fireEvent.click(screen.getByRole('button', { name: '相同' }))
    expect(screen.getByText('重新练习')).toBeInTheDocument()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('does not persist failed Flanker practice and offers retry', () => {
    const onTrialComplete = vi.fn()
    render(<FlankerTask
      taskContext={{ ...baseContext, testType: 'flanker', config: { totalTrials: 24, stimulusMs: 40, isiMs: 10 } }}
      trialIndex={0}
      onTrialComplete={onTrialComplete}
    />)
    fireEvent.click(screen.getByText('开始练习'))
    for (let index = 0; index < 4; index += 1) fireEvent.click(screen.getByRole('button', { name: '← 左' }))
    expect(screen.getByText('重新练习')).toBeInTheDocument()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('does not persist failed card-sort practice and offers retry', () => {
    const onTrialComplete = vi.fn()
    render(<CardsortTask
      taskContext={{
        ...baseContext,
        testType: 'cardsort',
        config: { totalTrials: 24, blockCount: 2, switchRatio: 0.33, cueMs: 10, stimulusMs: 40, isiMs: 10 },
      }}
      trialIndex={0}
      onTrialComplete={onTrialComplete}
    />)
    fireEvent.click(screen.getByText('开始练习'))
    for (let index = 0; index < 4; index += 1) fireEvent.click(screen.getByRole('button', { name: /分到左侧/ }))
    expect(screen.getByText('重新练习')).toBeInTheDocument()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('submits the seed-derived formal Flanker trial after practice', async () => {
    vi.useFakeTimers()
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    const expected = flankerSequence(baseContext.randomSeed, 24)[0]
    render(<FlankerTask
      taskContext={{ ...baseContext, testType: 'flanker', config: { totalTrials: 24, stimulusMs: 40, isiMs: 10 } }}
      trialIndex={0}
      onTrialComplete={onTrialComplete}
    />)
    fireEvent.click(screen.getByText('开始练习'))
    for (const response of ['left', 'right', 'right', 'left'] as const) {
      fireEvent.click(screen.getByRole('button', { name: response === 'left' ? '← 左' : '右 →' }))
    }
    fireEvent.click(screen.getByText('开始正式测验'))
    act(() => { vi.advanceTimersByTime(10) })
    fireEvent.click(screen.getByRole('button', { name: expected.correctResponse === 'left' ? '← 左' : '右 →' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(40) })
    expect(onTrialComplete).toHaveBeenCalledWith(expect.objectContaining({
      targetDirection: expected.targetDirection,
      flankerDirection: expected.flankerDirection,
      response: expected.correctResponse,
    }))
  })

  it('completes the timed pattern-comparison task only once at its deadline', async () => {
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    const props = {
      taskContext: { ...baseContext, config: { durationSec: 0, trialTimeoutMs: 50, isiMs: 10 } },
      onTrialComplete: vi.fn().mockResolvedValue(undefined),
      onTaskComplete,
    }
    const { rerender } = render(<PatterncompareTask {...props} trialIndex={0} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (const response of ['same', 'different', 'same', 'different'] as const) {
      fireEvent.click(screen.getByRole('button', { name: response === 'same' ? '相同' : '不同' }))
    }
    fireEvent.click(screen.getByText('开始正式测验'))
    await act(async () => {})
    rerender(<PatterncompareTask {...props} trialIndex={1} />)
    await act(async () => {})

    expect(onTaskComplete).toHaveBeenCalledTimes(1)
  })
})
