import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TrailmakingTask } from '../tasks/trailmaking/TrailmakingTask'
import { ReversallearningTask } from '../tasks/reversallearning/ReversallearningTask'
import { BartTask } from '../tasks/bart/BartTask'
import { reversallearningSequence } from '../tasks/shared/prng'
import CognitiveSingleTaskReportCard from '../CognitiveSingleTaskReportCard'
import type { CognitiveSingleTaskReport } from '../types'

const context = {
  sessionId: 'pr12-session',
  testType: 'trailmaking',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  randomSeed: 'pr12-frontend-seed',
  config: {
    form: 'A' as const,
    partAItemCount: 8,
    partBItemCount: 0,
    stepTimeoutMs: 15000,
  },
}

const finishTrailPractice = () => {
  fireEvent.click(screen.getByText('开始练习'))
  for (let index = 1; index <= 4; index += 1) {
    fireEvent.pointerDown(screen.getByRole('button', { name: `目标 ${index}` }), { pointerType: 'mouse' })
    fireEvent.click(screen.getByText(index === 4 ? '查看练习结果' : '下一题'))
  }
  fireEvent.click(screen.getByText('开始正式测验'))
}

describe('PR12 cognitive task runners', () => {
  it('keeps Trail Making practice out of storage and records coarse pointer metadata for formal trials', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(true)
    render(<TrailmakingTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
    finishTrailPractice()
    expect(onTrialComplete).not.toHaveBeenCalled()

    fireEvent.keyDown(screen.getByRole('button', { name: '目标 1' }), { key: 'Enter' })
    await waitFor(() => expect(onTrialComplete).toHaveBeenCalledTimes(1))
    const payload = onTrialComplete.mock.calls[0][0] as { attempts: Array<{ pointerType: string }>; deviceClass: string }
    expect(payload.attempts[0].pointerType).toBe('keyboard')
    expect(['desktop', 'tablet', 'phone', 'unknown']).toContain(payload.deviceClass)
    expect(JSON.stringify(payload)).not.toMatch(/userAgent|screen|coordinate|deviceId/i)
  })

  it('runs Reversal Learning practice feedback without submitting a formal trial', () => {
    const onTrialComplete = vi.fn()
    render(
      <ReversallearningTask
        taskContext={{ ...context, testType: 'reversallearning', config: { totalTrials: 40, acquisitionTrials: 20, reversalTrials: 20, rewardProbability: 0.8, trialTimeoutMs: 3000 } }}
        trialIndex={0}
        onTrialComplete={onTrialComplete}
      />,
    )
    fireEvent.click(screen.getByText('开始练习'))
    fireEvent.click(screen.getByRole('button', { name: '左侧符号' }))
    expect(screen.getByText(/反馈/)).toBeTruthy()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('shows formal Reversal Learning feedback from the frozen seed schedule', () => {
    const onTrialComplete = vi.fn().mockResolvedValue(true)
    const config = { totalTrials: 4, acquisitionTrials: 2, reversalTrials: 2, rewardProbability: 0.8, trialTimeoutMs: 3000 }
    const randomSeed = 'reversallearning-feedback-seed'
    const practice = reversallearningSequence('reversallearning-practice-v1.0.0', 4, 2, 2, 0.8)
    const formal = reversallearningSequence(randomSeed, 4, 2, 2, config.rewardProbability)[0]
    const expectedFeedback = formal.rewardRoll < config.rewardProbability ? '获得反馈' : '本次未获得反馈'

    render(
      <ReversallearningTask
        taskContext={{ ...context, testType: 'reversallearning', randomSeed, config }}
        trialIndex={0}
        onTrialComplete={onTrialComplete}
      />,
    )
    fireEvent.click(screen.getByText('开始练习'))
    practice.forEach((item, index) => {
      fireEvent.click(screen.getByRole('button', { name: item.correctResponse === 'left' ? '左侧符号' : '右侧符号' }))
      fireEvent.click(screen.getByText(index === practice.length - 1 ? '查看练习结果' : '下一题'))
    })
    fireEvent.click(screen.getByText('开始正式测验'))
    fireEvent.click(screen.getByRole('button', { name: formal.correctResponse === 'left' ? '左侧符号' : '右侧符号' }))

    expect(onTrialComplete).toHaveBeenCalledWith({ choice: formal.correctResponse, rtMs: expect.any(Number), interrupted: false })
    expect(screen.getByText(expectedFeedback)).toBeTruthy()
  })

  it('keeps BART practice local and submits cashout/explode payloads without a score field', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(true)
    render(
      <BartTask
        taskContext={{ ...context, testType: 'bart', config: { balloonCount: 10, maxPumps: 6, trialTimeoutMs: 3000, pumpAnimationMs: 100 } }}
        trialIndex={0}
        onTrialComplete={onTrialComplete}
      />,
    )
    fireEvent.click(screen.getByText('开始练习'))
    fireEvent.click(screen.getByText('现金化'))
    expect(onTrialComplete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('下一题'))
    expect(screen.getByText(/练习 2/)).toBeTruthy()
  })

  it('anchors BART timeout to balloon start instead of resetting after a pump', async () => {
    vi.useFakeTimers()
    try {
      const onTrialComplete = vi.fn().mockResolvedValue(true)
      render(
        <BartTask
          taskContext={{
            ...context,
            testType: 'bart',
            randomSeed: 'timeout-seed-a',
            config: { balloonCount: 1, maxPumps: 6, trialTimeoutMs: 2000, pumpAnimationMs: 100 },
          }}
          trialIndex={0}
          onTrialComplete={onTrialComplete}
        />,
      )
      fireEvent.click(screen.getByText('开始练习'))
      for (let index = 0; index < 4; index += 1) {
        fireEvent.click(screen.getByText('现金化'))
        fireEvent.click(screen.getByText(index === 3 ? '查看练习结果' : '下一题'))
      }
      fireEvent.click(screen.getByText('开始正式测验'))
      await act(async () => { vi.advanceTimersByTime(500) })
      fireEvent.click(screen.getByText('继续泵压'))

      await act(async () => { vi.advanceTimersByTime(1000) })
      expect(onTrialComplete).not.toHaveBeenCalled()
      await act(async () => {
        vi.advanceTimersByTime(500)
        await Promise.resolve()
      })
      expect(onTrialComplete).toHaveBeenCalledTimes(1)
      expect(onTrialComplete.mock.calls[0][0]).toMatchObject({
        pumpCount: 1,
        completed: false,
        cashedOut: false,
        interrupted: true,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not render the product-index block for BART reports', () => {
    const report = {
      testType: 'bart', profile: 'standard', profileLabel: '正式版', title: 'BART 泵压任务',
      interpretable: true, qualityState: 'interpretable', qualityFlags: [], headline: null,
      productIndex: null, showProductIndex: false, primaryMetrics: [], secondaryMetrics: [],
      caveats: [], practicalTips: [], method: { testType: 'bart', engineVersion: '1.0.0', scoringVersion: '1.0.0', configVersion: '1.0.0', profile: 'standard' },
      disclaimer: '只描述本次行为。', reference: null,
    } satisfies CognitiveSingleTaskReport
    render(<CognitiveSingleTaskReportCard report={report} />)
    expect(screen.queryByText('任务表现指数')).toBeNull()
    expect(screen.queryByText(/风险高|冲动性等级/)).toBeNull()
  })

  it('labels active informational quality flags without implying invalid data', () => {
    const report = {
      testType: 'trailmaking', profile: 'standard', profileLabel: '正式版', title: 'Trail Making',
      interpretable: true, qualityState: 'interpretable',
      qualityFlags: [{ key: 'mixedPointerType', label: '指针方式混合', active: true }],
      headline: null, productIndex: { label: '任务表现指数' as const, value: 80 }, showProductIndex: true,
      primaryMetrics: [], secondaryMetrics: [], caveats: [], practicalTips: [],
      method: { testType: 'trailmaking', engineVersion: '1.0.0', scoringVersion: '1.0.0', configVersion: '1.0.0', profile: 'standard' },
      disclaimer: '只描述本次任务。', reference: null,
    } satisfies CognitiveSingleTaskReport
    render(<CognitiveSingleTaskReportCard report={report} />)
    expect(screen.getByText(/解释提示（不自动表示结果无效）/)).toBeTruthy()
  })
})
