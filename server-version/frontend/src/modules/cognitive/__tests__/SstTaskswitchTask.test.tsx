import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SstTask } from '../tasks/sst/SstTask'
import { TaskswitchTask } from '../tasks/taskswitch/TaskswitchTask'
import { sstSequence, taskswitchSequence, RANDOMIZATION_ALGORITHM_VERSION } from '../tasks/shared/prng'
import golden from '../../../../../cognitive-randomization-golden-v1.json'

const context = {
  sessionId: 's1',
  testType: 'sst',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  randomSeed: 'seed-1',
  config: {
    totalTrials: 40,
    stopRatio: 0.25,
    ssdStartMs: 250,
    ssdMinMs: 50,
    ssdMaxMs: 800,
    ssdStepMs: 50,
    goTimeoutMs: 400,
    isiMs: 20,
    validRtFloorMs: 100,
  },
}

describe('SST and Task Switching runners', () => {
  it('starts SST from instruction into practice without persisting', () => {
    const onTrialComplete = vi.fn()
    render(<SstTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    expect(screen.getByText('停止信号任务')).toBeTruthy()
    fireEvent.click(screen.getByText('开始练习'))
    expect(screen.getByText(/练习 1/)).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('starts Task Switching from instruction into practice without persisting', () => {
    const onTrialComplete = vi.fn()
    render(
      <TaskswitchTask
        taskContext={{
          ...context,
          testType: 'taskswitch',
          config: {
            totalTrials: 48,
            switchRatio: 0.5,
            blockCount: 2,
            includePureBlocks: false,
            cueMs: 20,
            stimulusMs: 40,
            isiMs: 20,
            validRtFloorMs: 100,
          },
        }}
        trialIndex={0}
        onTrialComplete={onTrialComplete}
      />,
    )
    expect(screen.getByText('任务转换')).toBeTruthy()
    fireEvent.click(screen.getByText('开始练习'))
    expect(screen.getByText(/练习 1/)).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('matches the backend seed sequence contract', () => {
    expect(RANDOMIZATION_ALGORITHM_VERSION).toBe(golden.version)
    expect(sstSequence(golden.seed, 8, 0.25)).toEqual(golden.sst)
    expect(taskswitchSequence(golden.seed, 8, 2, 0.5, false)).toEqual(golden.taskswitch)
  })
})
