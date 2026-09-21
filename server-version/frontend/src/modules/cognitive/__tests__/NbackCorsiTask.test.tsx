import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { NbackTask } from '../tasks/nback/NbackTask'
import { CorsiTask } from '../tasks/corsi/CorsiTask'
import { corsiSequence, cptSequence, gonogoSequence, nbackSequence, RANDOMIZATION_ALGORITHM_VERSION } from '../tasks/shared/prng'
import golden from '../../../../../cognitive-randomization-golden-v1.json'

const nbackContext = {
  sessionId: 's1',
  testType: 'nback',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  randomSeed: 'seed-1',
  config: {
    nLevels: [1] as Array<1 | 2 | 3>,
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
    expect(screen.getByText(/1-back 练习 1/)).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('requires a new unscored practice gate before entering 2-back', async () => {
    vi.useFakeTimers()
    const onTrialComplete = vi.fn()
    try {
      const multiLevelContext = {
        ...nbackContext,
        config: {
          ...nbackContext.config,
          nLevels: [1, 2] as Array<1 | 2 | 3>,
          trialCountByN: [1, 1],
          blockCountByN: [1, 1],
          stimulusMs: 10,
          isiMs: 10,
        },
      }
      const view = render(<NbackTask taskContext={multiLevelContext} trialIndex={0} onTrialComplete={onTrialComplete} />)
      fireEvent.click(screen.getByText('开始练习'))

      const practiceResponses = [false, true, false, true]
      for (const shouldRespond of practiceResponses) {
        await act(async () => { vi.advanceTimersByTime(10) })
        if (shouldRespond) fireEvent.pointerDown(screen.getByRole('button'))
        await act(async () => { vi.advanceTimersByTime(10 + 600) })
      }

      expect(screen.getByText(/1-back 练习结果/)).toBeTruthy()
      fireEvent.click(screen.getByText('开始正式测验'))
      expect(screen.getByText(/区块 1 \/ 2/)).toBeTruthy()
      fireEvent.click(screen.getByText('开始本区块'))

      view.rerender(<NbackTask taskContext={multiLevelContext} trialIndex={1} onTrialComplete={onTrialComplete} />)
      expect(screen.getByText('准备进入 2-back')).toBeTruthy()
      expect(screen.getByText('开始 2-back 练习')).toBeTruthy()
      expect(onTrialComplete).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
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
    expect(RANDOMIZATION_ALGORITHM_VERSION).toBe(golden.version)
    expect(nbackSequence(golden.seed, [1, 2], [6, 8], [2, 2], 0.3)).toEqual(golden.nback)
    expect(corsiSequence(golden.seed, 3, 5)).toEqual(golden.corsi)
    expect(gonogoSequence(golden.seed, 8, 0.25)).toEqual(golden.gonogo)
    expect(cptSequence(golden.seed, 8, 0.25, 2)).toEqual(golden.cpt)
  })

  it('records a Corsi timeout as an interrupted trial and advances', async () => {
    vi.useFakeTimers()
    const onTrialComplete = vi.fn().mockResolvedValue(true)
    try {
      render(
        <CorsiTask
          taskContext={{
            ...nbackContext,
            testType: 'corsi',
            config: {
              startSpan: 3,
              maxSpan: 3,
              highlightMs: 1,
              intervalMs: 1,
              readyDurationMs: 1,
              inactivityGuardMs: 20,
            },
          }}
          trialIndex={0}
          onTrialComplete={onTrialComplete}
        />,
      )
      const reachResponsePhase = async () => {
        await act(async () => { vi.advanceTimersByTime(1) })
        await act(async () => { vi.advanceTimersByTime(10) })
      }
      fireEvent.click(screen.getByText('开始练习'))
      await reachResponsePhase()
      for (const block of [0, 4, 8]) fireEvent.click(screen.getByLabelText(`block-${block}`))
      fireEvent.click(screen.getByText('提交'))
      await reachResponsePhase()
      for (const block of [2, 6, 1]) fireEvent.click(screen.getByLabelText(`block-${block}`))
      fireEvent.click(screen.getByText('提交'))
      fireEvent.click(screen.getByText('开始正式测验'))
      await reachResponsePhase()
      await act(async () => { vi.advanceTimersByTime(20); await Promise.resolve() })

      expect(onTrialComplete).toHaveBeenCalledWith(expect.objectContaining({
        spanLength: 3,
        trialWithinLevel: 1,
        response: [],
        interrupted: true,
      }))
      expect(screen.queryByText(/响应超时/)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
