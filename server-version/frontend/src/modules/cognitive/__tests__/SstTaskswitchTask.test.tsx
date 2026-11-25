import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
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
  it('starts SST with anti-waiting guidance and a Go-only unscored practice stage', () => {
    const onTrialComplete = vi.fn()
    render(<SstTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    expect(screen.getByText('停止信号任务')).toBeTruthy()
    expect(screen.getByText(/不要为了等待停止信号而故意放慢/)).toBeTruthy()
    fireEvent.click(screen.getByText('开始练习'))
    expect(screen.getByText(/方向反应练习 1 \/ 4/)).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('explains a fast press on a Stop trial and reviews instructions before retrying the mixed stage', () => {
    vi.useFakeTimers()
    const onTrialComplete = vi.fn()
    const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
    const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
    try {
      render(<SstTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
      click('开始练习')
      for (const [index, key] of ['ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'].entries()) {
        advance(20)
        fireEvent.keyDown(window, { key })
        advance(400)
        click(index === 3 ? '查看练习结果' : '继续下一题')
      }
      click('继续停止信号练习')
      for (let index = 0; index < 8; index++) {
        advance(20)
        if (index === 2) fireEvent.keyDown(window, { key: 'ArrowLeft' })
        advance(400)
        if (index === 2) expect(screen.getByText(/按键可能早于红色停止信号/)).toBeTruthy()
        click(index === 7 ? '查看练习结果' : '继续下一题')
      }
      click('重新练习本阶段')
      expect(screen.getByText(/不要为了等待停止信号而故意放慢/)).toBeTruthy()
      click('开始练习')
      expect(screen.getByText('Go / Stop 混合练习 1 / 8')).toBeTruthy()
      expect(onTrialComplete).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })

  it('starts Task Switching with separate-rule practice before mixed switching', () => {
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
    expect(screen.getByText(/规则会在试次之间切换/)).toBeTruthy()
    fireEvent.click(screen.getByText('开始练习'))
    expect(screen.getByText(/奇偶规则练习 1 \/ 4/)).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('matches the backend seed sequence contract', () => {
    expect(RANDOMIZATION_ALGORITHM_VERSION).toBe(golden.version)
    expect(sstSequence(golden.seed, 8, 0.25)).toEqual(golden.sst)
    expect(taskswitchSequence(golden.seed, 8, 2, 0.5, false)).toEqual(golden.taskswitch)
  })
})
