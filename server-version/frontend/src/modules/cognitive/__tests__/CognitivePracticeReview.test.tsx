import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GonogoTask } from '../tasks/gonogo/GonogoTask'
import { GonogoFrameTask } from '../tasks/gonogo/GonogoFrameTask'
import { CptTask } from '../tasks/cpt/CptTask'
import { CptFrameTask } from '../tasks/cpt/CptFrameTask'
import { SstTask } from '../tasks/sst/SstTask'
import { TaskswitchTask } from '../tasks/taskswitch/TaskswitchTask'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('persistent practice review in timed runners', () => {
  it.each([
    ['gonogo', GonogoTask], ['gonogo', GonogoFrameTask],
    ['cpt', CptTask], ['cpt', CptFrameTask],
    ['sst', SstTask], ['taskswitch', TaskswitchTask],
  ] as const)('%s keeps the completed trial and explanation until explicit continuation (%#)', async (testType, Task) => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 1))
    vi.stubGlobal('cancelAnimationFrame', window.clearTimeout)
    const save = vi.fn()
    render(<Task trialIndex={0} onTrialComplete={save} taskContext={{
      sessionId: 'practice-only', testType, engineVersion: '1.0.0', scoringVersion: '1.0.0', configVersion: '1.0.0', attemptNo: 1, randomSeed: 'practice-review',
      config: { totalTrials: 8, blockCount: 1, isiMs: 10, cueMs: 10, stimulusMs: 20, goTimeoutMs: 20 },
    }} />)
    fireEvent.click(screen.getByRole('button', { name: '开始练习' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(screen.getByRole('alert')).toHaveTextContent('正确做法')
    expect(screen.getByRole('alert')).toHaveTextContent('你的操作')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: ' ' })
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    expect(save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '继续下一题' }))
    expect(screen.queryByLabelText('练习逐题解析')).not.toBeInTheDocument()
    expect(screen.queryByText('开始正式测验')).not.toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })
})
