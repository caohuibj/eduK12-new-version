import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { GonogoTask } from '../tasks/gonogo/GonogoTask'
import { CptTask } from '../tasks/cpt/CptTask'
import { cptSequence, gonogoSequence, RANDOMIZATION_ALGORITHM_VERSION } from '../tasks/shared/prng'

const context = {
  sessionId: 's1',
  testType: 'gonogo',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  randomSeed: 'seed-1',
  config: { totalTrials: 8, nogoRatio: 0.25, stimulusMs: 50, isiMs: 20, validRtFloorMs: 100 },
}

describe('Go/No-Go and CPT runners', () => {
  it('starts Go/No-Go from instruction into practice without persisting', async () => {
    const onTrialComplete = vi.fn()
    render(<GonogoTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    expect(screen.getByText('Go/No-Go')).toBeTruthy()
    fireEvent.click(screen.getByText('开始练习'))
    expect(screen.getByText(/练习 1/)).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('starts CPT from instruction into practice without persisting', async () => {
    const onTrialComplete = vi.fn()
    render(
      <CptTask
        taskContext={{
          ...context,
          testType: 'cpt',
          config: { totalTrials: 12, targetRatio: 0.25, blockCount: 1, stimulusMs: 50, isiMs: 20 },
        }}
        trialIndex={0}
        onTrialComplete={onTrialComplete}
      />,
    )
    expect(screen.getByText('连续执行任务')).toBeTruthy()
    fireEvent.click(screen.getByText('开始练习'))
    expect(screen.getByText(/练习 1/)).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('does not enter formal after a failing practice block and allows retry', () => {
    vi.useFakeTimers()
    const onTrialComplete = vi.fn()
    render(
      <GonogoTask
        taskContext={{ ...context, config: { ...context.config, isiMs: 20, stimulusMs: 20 } }}
        trialIndex={0}
        onTrialComplete={onTrialComplete}
      />,
    )
    fireEvent.click(screen.getByText('开始练习'))
    for (let i = 0; i < 4; i += 1) {
      act(() => {
        vi.advanceTimersByTime(20 + 20 + 600)
      })
    }
    expect(screen.getByText('重新练习')).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('重新练习'))
    expect(screen.getByText(/练习 1/)).toBeTruthy()
    vi.useRealTimers()
  })

  it('does not show stimulus before isiMs', () => {
    vi.useFakeTimers()
    render(
      <GonogoTask
        taskContext={{ ...context, config: { ...context.config, isiMs: 500, stimulusMs: 50 } }}
        trialIndex={0}
        onTrialComplete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('开始练习'))
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(screen.getByLabelText('respond').className).toContain('bg-gray-200')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByLabelText('respond').className).toContain('bg-green-500')
    act(() => {
      vi.advanceTimersByTime(50)
    })
    expect(screen.getByLabelText('respond').className).toContain('bg-gray-200')
    vi.useRealTimers()
  })

  it('matches the backend seed sequence contract', () => {
    expect(RANDOMIZATION_ALGORITHM_VERSION).toBe('seq-v1.0.0')
    expect(gonogoSequence('seed-1', 8, 0.25)).toEqual(['nogo', 'nogo', 'go', 'go', 'go', 'go', 'go', 'go'])
    expect(cptSequence('seed-1', 12, 0.25, 1)).toEqual([
      { blockIndex: 0, isTarget: true, stimulus: 'X' },
      { blockIndex: 0, isTarget: false, stimulus: 'B' },
      { blockIndex: 0, isTarget: true, stimulus: 'X' },
      { blockIndex: 0, isTarget: false, stimulus: 'N' },
      { blockIndex: 0, isTarget: false, stimulus: 'A' },
      { blockIndex: 0, isTarget: false, stimulus: 'D' },
      { blockIndex: 0, isTarget: false, stimulus: 'U' },
      { blockIndex: 0, isTarget: false, stimulus: 'N' },
      { blockIndex: 0, isTarget: false, stimulus: 'B' },
      { blockIndex: 0, isTarget: true, stimulus: 'X' },
      { blockIndex: 0, isTarget: false, stimulus: 'N' },
      { blockIndex: 0, isTarget: false, stimulus: 'N' },
    ])
  })
})
