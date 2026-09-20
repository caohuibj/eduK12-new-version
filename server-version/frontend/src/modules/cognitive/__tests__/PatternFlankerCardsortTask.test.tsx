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

afterEach(() => vi.useRealTimers())

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

  it('does not persist failed practices and offers retry', () => {
    const patternTrial = vi.fn()
    const pattern = render(<PatterncompareTask taskContext={{ ...baseContext, config: { durationSec: 30, trialTimeoutMs: 1000, isiMs: 10 } }} trialIndex={0} onTrialComplete={patternTrial} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (let index = 0; index < 4; index += 1) fireEvent.click(screen.getByRole('button', { name: '相同' }))
    expect(screen.getByText('重新练习')).toBeInTheDocument(); expect(patternTrial).not.toHaveBeenCalled(); pattern.unmount()

    const flankerTrial = vi.fn()
    const flanker = render(<FlankerTask taskContext={{ ...baseContext, testType: 'flanker', config: { totalTrials: 24, stimulusMs: 40, isiMs: 10 } }} trialIndex={0} onTrialComplete={flankerTrial} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (let index = 0; index < 4; index += 1) fireEvent.click(screen.getByRole('button', { name: '← 左' }))
    expect(screen.getByText('重新练习')).toBeInTheDocument(); expect(flankerTrial).not.toHaveBeenCalled(); flanker.unmount()

    const cardsortTrial = vi.fn()
    render(<CardsortTask taskContext={{ ...baseContext, testType: 'cardsort', config: { totalTrials: 24, blockCount: 2, switchRatio: 0.33, cueMs: 10, stimulusMs: 40, isiMs: 10 } }} trialIndex={0} onTrialComplete={cardsortTrial} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (let index = 0; index < 4; index += 1) fireEvent.click(screen.getByRole('button', { name: /分到左侧/ }))
    expect(screen.getByText('重新练习')).toBeInTheDocument(); expect(cardsortTrial).not.toHaveBeenCalled()
  })

  it('uses formal Focus Stage and does not verbalize Pattern Comparison stimulus attributes', () => {
    const props = {
      taskContext: { ...baseContext, config: { durationSec: 30, trialTimeoutMs: 1000, isiMs: 10 } },
      trialIndex: 0,
      onTrialComplete: vi.fn().mockResolvedValue(undefined),
    }
    render(<PatterncompareTask {...props} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (const response of ['same', 'different', 'same', 'different'] as const) fireEvent.click(screen.getByRole('button', { name: response === 'same' ? '相同' : '不同' }))
    fireEvent.click(screen.getByText('开始正式测验'))
    expect(document.querySelector('[data-cognitive-focus-stage]')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: '视觉图形刺激' })).toHaveLength(2)
    expect(screen.queryByLabelText(/实心|空心|旋转|标记/)).not.toBeInTheDocument()
  })

  it('submits formal Flanker by keyboard without exposing central-arrow answer in aria', async () => {
    vi.useFakeTimers()
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    const expected = flankerSequence(baseContext.randomSeed, 24)[0]
    render(<FlankerTask taskContext={{ ...baseContext, testType: 'flanker', config: { totalTrials: 24, stimulusMs: 40, isiMs: 10 } }} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (const response of ['left', 'right', 'right', 'left'] as const) fireEvent.click(screen.getByRole('button', { name: response === 'left' ? '← 左' : '右 →' }))
    fireEvent.click(screen.getByText('开始正式测验'))
    act(() => { vi.advanceTimersByTime(10) })
    expect(screen.getByRole('img', { name: '视觉箭头干扰刺激' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/中央箭头向/)).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: expected.correctResponse === 'left' ? 'ArrowLeft' : 'ArrowRight' })
    await act(async () => { await vi.advanceTimersByTimeAsync(40) })
    expect(onTrialComplete).toHaveBeenCalledWith(expect.objectContaining({ targetDirection: expected.targetDirection, flankerDirection: expected.flankerDirection, response: expected.correctResponse, timedOut: false }))
  })

  it('inserts a Card Sort gate at the frozen block boundary', async () => {
    const props = {
      taskContext: { ...baseContext, testType: 'cardsort', config: { totalTrials: 24, blockCount: 2, switchRatio: 0.33, cueMs: 10, stimulusMs: 40, isiMs: 10 } },
      onTrialComplete: vi.fn().mockResolvedValue(undefined),
    }
    const { rerender } = render(<CardsortTask {...props} trialIndex={0} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (const response of ['left', 'right', 'left', 'right'] as const) fireEvent.click(screen.getByRole('button', { name: response === 'left' ? /分到左侧/ : /分到右侧/ }))
    fireEvent.click(screen.getByText('开始正式测验'))
    rerender(<CardsortTask {...props} trialIndex={12} />)
    expect(await screen.findByText('区块完成，可以短暂休息')).toBeInTheDocument()
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
    for (const response of ['same', 'different', 'same', 'different'] as const) fireEvent.click(screen.getByRole('button', { name: response === 'same' ? '相同' : '不同' }))
    fireEvent.click(screen.getByText('开始正式测验'))
    await act(async () => {})
    rerender(<PatterncompareTask {...props} trialIndex={1} />)
    await act(async () => {})
    expect(onTaskComplete).toHaveBeenCalledTimes(1)
  })
})
