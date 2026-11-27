import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ScaleUnitReportCard, { type SafeScaleUnitReport } from '../ScaleUnitReportCard'

const baseReport = (): SafeScaleUnitReport => ({
  itemId: 'item-1',
  type: 'SCALE',
  kind: 'scale',
  scaleId: 'scale-1',
  scaleCode: 'synthetic',
  scaleName: 'Synthetic',
  label: 'Synthetic',
  result: null,
  quality: null,
  scores: [],
  references: [],
  interpretations: [],
  caveats: [],
  disclaimer: '',
  completedAt: '2026-09-21T00:00:00.000Z',
  totalTime: 1000,
  method: null,
})

describe('ScaleUnitReportCard audience-safe DTO rendering', () => {
  it('renders the frozen opening and the illustration associated with the returned reference band', () => {
    render(<ScaleUnitReportCard report={{
      ...baseReport(),
      artworkKey: 'who5/1.0.0/1.1.0-student',
      introductions: [{ scoreKey: 'raw_total', headline: '读懂这次结果', summary: '介绍本次报告。', guidance: ['从一次小事开始。'] }],
      interpretations: [{ scoreKey: 'raw_total', headline: '给自己一点空间', label: null, interpretation: '当前档位正文。',
        guidance: [], limitations: [], referenceVersion: 'p' }],
      references: [{ scoreKey: 'raw_total', referenceVersion: 'p', referenceKind: 'criterion_threshold', status: 'available',
        evidenceLevel: 'literature_beta', label: '', value: 12, mean: null, sd: null, z: null, t: null, percentile: null,
        criterionBand: { key: 'who5_under_13', label: '当前档位', minInclusive: 0, maxInclusive: 12 },
        meanDifference: null, source: null, population: null, instrumentVersion: null, scoringVersion: null,
        limitations: [], disclaimer: '',
      }],
    }} />)
    expect(screen.getByText('介绍本次报告。')).toBeInTheDocument()
    expect(screen.getByText('从一次小事开始。')).toBeInTheDocument()
    expect(screen.getByText('当前档位正文。')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '坐在校园里的学生和朋友聊近况' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '学生用画本记下最近喜欢的一个瞬间' })).not.toBeInTheDocument()
  })

  it('renders educational content without falling through to hidden score fields', async () => {
    const user = userEvent.setup()
    const report = {
      ...baseReport(),
      reportKind: 'educational' as const,
      // Sentinel values must remain inert even if a future caller accidentally
      // leaves them on the in-memory object: reportKind is the renderer boundary.
      scores: [{ label: 'SECRET SCORE', value: 99 }] as never,
      educationalFeedback: {
        contentVersion: 'education-v1',
        blocks: [{ id: 'about', title: '了解本测评', body: '固定教育反馈，不根据分数变化。' }],
        choices: [{ id: 'sleep', label: '睡眠习惯', body: '记录一周睡眠习惯。' }],
        disclaimer: '仅供教育用途。',
      },
    }
    render(<ScaleUnitReportCard report={report} />)

    expect(screen.getByTestId('educational-feedback')).toHaveAttribute('data-content-version', 'education-v1')
    expect(screen.getByText('固定教育反馈，不根据分数变化。')).toBeInTheDocument()
    expect(screen.queryByText('SECRET SCORE')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '睡眠习惯' }))
    expect(screen.getByText('记录一周睡眠习惯。')).toBeInTheDocument()
  })

  it('renders completion-only without score/report layers', () => {
    render(<ScaleUnitReportCard report={{ ...baseReport(), reportKind: 'completion' }} />)
    expect(screen.getByTestId('scale-report-completion')).toBeInTheDocument()
    expect(screen.queryByTestId('scale-score-layer')).not.toBeInTheDocument()
  })

  it('renders unavailable as a safe message without exposing a failure payload', () => {
    render(<ScaleUnitReportCard report={{
      ...baseReport(),
      reportKind: 'unavailable',
      reason: 'POLICY_UNAVAILABLE',
    }} />)
    expect(screen.getByTestId('scale-report-unavailable')).toBeInTheDocument()
    expect(screen.queryByTestId('scale-score-layer')).not.toBeInTheDocument()
  })
})
