import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GonogoTask } from '../tasks/gonogo/GonogoTask'
import { CptTask } from '../tasks/cpt/CptTask'

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
    expect(screen.getByText(/练习剩余/)).toBeTruthy()
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
    expect(screen.getByText(/练习剩余/)).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })
})
