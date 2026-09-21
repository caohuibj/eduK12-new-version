import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PatterncompareTask } from '../tasks/patterncompare/PatterncompareTask'
import CognitiveSingleTaskReportCard from '../CognitiveSingleTaskReportCard'
import type { CognitiveSingleTaskReport } from '../types'

const baseContext = {
  sessionId: 'session-pattern-publish-prep',
  testType: 'patterncompare',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  randomSeed: 'pattern-publish-prep-seed',
  config: { durationSec: 60, trialTimeoutMs: 2500, isiMs: 250, validRtFloorMs: 150 },
}

const report = (profile: 'standard' | 'research'): CognitiveSingleTaskReport => ({
  testType: 'patterncompare',
  profile,
  profileLabel: profile === 'standard' ? 'Pilot 版' : 'Research Ready 版',
  title: '图形模式比较',
  interpretable: true,
  qualityState: 'interpretable',
  qualityFlags: [],
  interpretationSummary: profile === 'standard'
    ? '本次 Pilot 短版结果提示你在本次图形比较任务中的速度与准确性表现。'
    : '本次 Research Ready 完整协议显示你在本次图形比较任务中的速度与准确性表现。',
  headline: { key: 'correctPerMinute', label: '每分钟正确数', unit: 'score', value: 42, formatted: '42' },
  productIndex: null,
  showProductIndex: false,
  primaryMetrics: [
    { key: 'accuracy', label: '准确率', unit: 'ratio', value: 0.9, formatted: '90%' },
    { key: 'medianCorrectRtMs', label: '正确反应中位RT', unit: 'ms', value: 620, formatted: '620 ms' },
  ],
  secondaryMetrics: [
    { key: 'lapseRate', label: '未反应比例', unit: 'ratio', value: 0.05, formatted: '5%' },
  ],
  caveats: [profile === 'standard' ? 'Pilot 短版采用 60 秒正式协议。' : 'Research Ready 版采用 90 秒完整协议。'],
  practicalTips: [],
  method: {
    testType: 'patterncompare',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configVersion: '1.0.0',
    profile,
  },
  disclaimer: '结果只反映本次任务表现，不代表人口常模。',
  reference: null,
})

afterEach(() => vi.useRealTimers())

describe('Pattern Comparison publish-prep UX', () => {
  it('explains the rule, duration and input modes before practice', () => {
    render(<PatterncompareTask taskContext={baseContext} trialIndex={0} onTrialComplete={vi.fn()} />)
    expect(screen.getByText(/只要有一项不同，就选择“不同”/)).toBeInTheDocument()
    expect(screen.getByText(/正式阶段约 60 秒/)).toBeInTheDocument()
    expect(screen.getByText(/触控或鼠标/)).toBeInTheDocument()
    expect(screen.getByText(/至少答对 3 题/)).toBeInTheDocument()
  })

  it('uses responsive SVG stimuli and corrective practice feedback', () => {
    render(<PatterncompareTask taskContext={baseContext} trialIndex={0} onTrialComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('开始练习'))
    const stimuli = screen.getAllByRole('img', { name: '视觉图形刺激' })
    expect(stimuli).toHaveLength(2)
    expect(stimuli.every((node) => node.tagName.toLowerCase() === 'svg')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '相同' }))
    fireEvent.click(screen.getByRole('button', { name: '相同' }))
    expect(screen.getByText('上一题：不正确，正确答案是「不同」')).toBeInTheDocument()
  })

  it('does not create an artificial timed-out trial when the total deadline has no valid response window left', async () => {
    vi.useFakeTimers()
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    const onTaskComplete = vi.fn().mockResolvedValue(undefined)
    const zeroDurationContext = {
      ...baseContext,
      config: { ...baseContext.config, durationSec: 0 },
    }
    render(
      <PatterncompareTask
        taskContext={zeroDurationContext}
        trialIndex={0}
        onTrialComplete={onTrialComplete}
        onTaskComplete={onTaskComplete}
      />,
    )
    fireEvent.click(screen.getByText('开始练习'))
    for (const response of ['相同', '不同', '相同', '不同']) {
      fireEvent.click(screen.getByRole('button', { name: response }))
    }
    fireEvent.click(screen.getByText('开始正式测验'))
    await act(async () => {})
    expect(onTaskComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('renders Pilot as tentative and Research Ready as stronger task-level evidence without a 0-100 product index', () => {
    const pilot = render(<CognitiveSingleTaskReportCard report={report('standard')} />)
    expect(screen.getByText('Pilot 版')).toBeInTheDocument()
    expect(screen.getByText(/Pilot 短版结果提示/)).toBeInTheDocument()
    expect(screen.getByText('每分钟正确比较数')).toBeInTheDocument()
    expect(screen.queryByText('任务表现指数')).not.toBeInTheDocument()
    pilot.unmount()

    render(<CognitiveSingleTaskReportCard report={report('research')} />)
    expect(screen.getByText('Research Ready 版')).toBeInTheDocument()
    expect(screen.getByText(/Research Ready 完整协议显示/)).toBeInTheDocument()
    expect(screen.queryByText('任务表现指数')).not.toBeInTheDocument()
  })
})
