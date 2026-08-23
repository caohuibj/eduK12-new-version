import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NbackTask } from '../tasks/nback/NbackTask'
import { CorsiTask } from '../tasks/corsi/CorsiTask'
import { corsiSequence, nbackSequence, RANDOMIZATION_ALGORITHM_VERSION } from '../tasks/shared/prng'

const nbackContext = {
  sessionId: 's1',
  testType: 'nback',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  randomSeed: 'seed-1',
  config: {
    nLevels: [1],
    trialCountByN: [16],
    blockCountByN: [1],
    targetRatio: 0.3,
    stimulusMs: 50,
    isiMs: 20,
    validRtFloorMs: 100,
  },
}

describe('N-Back and Corsi runners', () => {
  it('starts N-Back from instruction into practice without persisting', () => {
    const onTrialComplete = vi.fn()
    render(<NbackTask taskContext={nbackContext} trialIndex={0} onTrialComplete={onTrialComplete} />)
    expect(screen.getByText('N-Back')).toBeTruthy()
    fireEvent.click(screen.getByText('开始练习'))
    expect(screen.getByText(/练习 1/)).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('starts Corsi from instruction into practice without persisting', () => {
    const onTrialComplete = vi.fn()
    render(
      <CorsiTask
        taskContext={{
          ...nbackContext,
          testType: 'corsi',
          config: {
            startSpan: 3,
            maxSpan: 6,
            highlightMs: 40,
            intervalMs: 20,
            readyDurationMs: 20,
            inactivityGuardMs: 5000,
          },
        }}
        trialIndex={0}
        onTrialComplete={onTrialComplete}
      />,
    )
    expect(screen.getByText('Corsi 方块广度')).toBeTruthy()
    fireEvent.click(screen.getByText('开始练习'))
    expect(screen.getByText(/练习 1/)).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('matches the backend seed sequence contract', () => {
    expect(RANDOMIZATION_ALGORITHM_VERSION).toBe('seq-v1.0.0')
    expect(nbackSequence('seed-1', [1], [16], [1], 0.3)).toEqual(nbackSequence('seed-1', [1], [16], [1], 0.3))
    expect(corsiSequence('seed-1', 0, 3)).toEqual(corsiSequence('seed-1', 0, 3))
  })
})
