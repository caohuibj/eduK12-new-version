import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FlankerTask } from '../tasks/flanker/FlankerTask'
import CognitiveSingleTaskReportCard from '../CognitiveSingleTaskReportCard'
import type { CognitiveSingleTaskReport } from '../types'

const baseContext = {
  sessionId: 'session-flanker-publish-prep',
  testType: 'flanker',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  randomSeed: 'flanker-publish-prep-seed',
  config: { totalTrials: 80, congruentRatio: 0.5, stimulusMs: 1800, isiMs: 400, validRtFloorMs: 150 },
}

const report = (profile: 'standard' | 'research'): CognitiveSingleTaskReport => ({
  testType: 'flanker',
  profile,
  profileLabel: profile === 'standard' ? 'Pilot 版' : 'Research Ready 版',
  title: 'Flanker 箭头干扰',
  interpretable: true,
  qualityState: 'interpretable',
  qualityFlags: [],
  interpretationSummary: profile === 'standard'
    ? '本次 Pilot 短版结果提示你在本次箭头干扰任务中的表现，可作为初步任务表现参考。'
    : '本次 Research Ready 完整协议显示你在本次箭头干扰任务中的表现，可作为较稳定的单次任务证据。',
  headline: { key: 'flankerEffectMs', label: 'Flanker 干扰效应', unit: 'ms', value: 72, formatted: '72 ms' },
  productIndex: null,
  showProductIndex: false,
  primaryMetrics: [
    { key: 'incongruentAccuracy', label: '不一致条件准确率', unit: 'ratio', value: 0.85, formatted: '85%' },
    { key: 'congruentAccuracy', label: '一致条件准确率', unit: 'ratio', value: 0.93, formatted: '93%' },
    { key: 'errorCost', label: '准确率干扰代价', unit: 'ratio', value: 0.08, formatted: '8%' },
  ],
  secondaryMetrics: [
    { key: 'omissionRate', label: '未反应比例', unit: 'ratio', value: 0.02, formatted: '2%' },
  ],
  caveats: [profile === 'standard' ? 'Pilot 版采用 80 个严格平衡的正式试次。' : 'Research Ready 版采用 160 个严格平衡的正式试次。'],
  practicalTips: [],
  method: {
    testType: 'flanker',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    configVersion: '1.0.0',
    profile,
  },
  disclaimer: '结果只反映本次任务表现，不代表人口常模。',
  reference: null,
})

describe('Flanker publish-prep UX', () => {
  it('explains the central-target rule, dose and input modes before practice', () => {
    render(<FlankerTask taskContext={baseContext} trialIndex={0} onTrialComplete={vi.fn()} />)
    expect(screen.getByText(/只判断正中央箭头指向左还是右/)).toBeInTheDocument()
    expect(screen.getByText(/正式阶段共 80 个试次/)).toBeInTheDocument()
    expect(screen.getByText(/触控或鼠标/)).toBeInTheDocument()
    expect(screen.getByText(/至少答对 3 题/)).toBeInTheDocument()
    expect(screen.queryByText(/中央蓝色箭头/)).not.toBeInTheDocument()
  })

  it('uses the same visual style for all five arrows and gives corrective practice feedback', () => {
    render(<FlankerTask taskContext={baseContext} trialIndex={0} onTrialComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('开始练习'))

    const stimulus = screen.getByRole('img', { name: '视觉箭头干扰刺激' })
    const arrows = stimulus.querySelectorAll('span')
    expect(arrows).toHaveLength(5)
    expect(stimulus.className).toContain('text-gray-800')
    expect(stimulus.className).not.toContain('text-primary')
    expect(Array.from(arrows).every((arrow) => arrow.className === '')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '← 左' }))
    fireEvent.click(screen.getByRole('button', { name: '← 左' }))
    expect(screen.getByText('上一题：不正确，正确答案是「右」')).toBeInTheDocument()
  })

  it('advances exactly one practice item for one keyboard response', () => {
    render(<FlankerTask taskContext={baseContext} trialIndex={0} onTrialComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('开始练习'))
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText('练习 2 / 4')).toBeInTheDocument()
  })

  it('renders Pilot as tentative and Research Ready as stronger evidence without a 0-100 product index', () => {
    const pilot = render(<CognitiveSingleTaskReportCard report={report('standard')} />)
    expect(screen.getByText('Pilot 版')).toBeInTheDocument()
    expect(screen.getByText(/Pilot 短版结果提示/)).toBeInTheDocument()
    expect(screen.getByText('干扰反应时间差')).toBeInTheDocument()
    expect(screen.queryByText('任务表现指数')).not.toBeInTheDocument()
    pilot.unmount()

    render(<CognitiveSingleTaskReportCard report={report('research')} />)
    expect(screen.getByText('Research Ready 版')).toBeInTheDocument()
    expect(screen.getByText(/Research Ready 完整协议显示/)).toBeInTheDocument()
    expect(screen.queryByText('任务表现指数')).not.toBeInTheDocument()
  })
})
