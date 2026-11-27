import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SurveyDeclaredReportView, isSurveyDeclaredReport } from './SurveyDeclaredReportView'

describe('SurveyDeclaredReportView', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('validates DECLARATIVE_REPORT_V1 payloads strictly', () => {
    expect(isSurveyDeclaredReport({ generatorVersion: 'DECLARATIVE_REPORT_V1', title: '报告', blocks: [] })).toBe(true)
    expect(isSurveyDeclaredReport({ generatorVersion: 'OTHER', blocks: [] })).toBe(false)
    expect(isSurveyDeclaredReport(null)).toBe(false)
  })

  it('shows only the frozen built-in comic and leaves older reports readable without an image', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const report = { generatorVersion: 'DECLARATIVE_REPORT_V1' as const, blocks: [{ type: 'TEXT', text: '本次反馈' }] }
    const { rerender } = render(<SurveyDeclaredReportView report={report} />)
    expect(screen.queryByRole('img')).toBeNull()
    rerender(<SurveyDeclaredReportView report={{ ...report, illustrationKey: 'chinese-self-concept-door-v1' }} />)
    const comic = screen.getByRole('img', { name: /小禾.*她在犹豫.*她在怕什么/ })
    expect(comic).toHaveAttribute('src', expect.stringContaining('chinese-self-concept-door-v1.webp'))
    expect(comic).toHaveAttribute('width', '1635')
    expect(comic).toHaveAttribute('height', '962')
    expect(comic.closest('a')).toHaveAttribute('href', comic.getAttribute('src'))
    rerender(<SurveyDeclaredReportView report={{ ...report, illustrationKey: 'https://example.org/external.png' }} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('本次反馈')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  const actionEdition = 'chinese-self-concept-door-with-actions-v2'
  const bandBlock = (bandKey: string, metricKey = 'academic_self_concept') => ({
    type: 'REFERENCE_BAND', metricKey, referenceKind: 'theoretical_range', bandKey,
    text: '这次的语文学习印象', guidance: [],
  })
  it('uses the authorized score feedback to illustrate an anonymous report without a reference population', () => {
    const scoreEdition = 'chinese-self-concept-door-with-score-actions-v3'
    const feedback = { ...bandBlock('high'), type: 'SCORE_FEEDBACK', text: '圈出给你提示的词句。' }
    const report = { generatorVersion: 'DECLARATIVE_REPORT_V1' as const, illustrationKey: scoreEdition, blocks: [feedback] }
    const { rerender } = render(<SurveyDeclaredReportView report={report} />)
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(screen.getByRole('img', { name: /放大镜/ }).parentElement).toHaveTextContent(feedback.text)
    rerender(<SurveyDeclaredReportView report={{ ...report, illustrationKey: actionEdition }} />)
    expect(screen.getAllByRole('img')).toHaveLength(1)
    rerender(<SurveyDeclaredReportView report={{ ...report, blocks: [bandBlock('high')] }} />)
    expect(screen.getAllByRole('img')).toHaveLength(1)
    rerender(<SurveyDeclaredReportView report={{ ...report, blocks: [] }} />)
    expect(screen.queryByText(feedback.text)).toBeNull()
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })
  it.each(['very_low', 'low', 'middle', 'high', 'very_high'])('renders only the disclosed %s action beside its feedback', band => {
    const report = { generatorVersion: 'DECLARATIVE_REPORT_V1' as const, illustrationKey: actionEdition,
      blocks: [bandBlock('middle', 'other_score'), bandBlock(band)] }
    render(<SurveyDeclaredReportView report={report} />)
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(2)
    expect(images[0]).toHaveAttribute('src', expect.stringContaining('chinese-self-concept-door-v1.webp'))
    expect(images[1]).toHaveAttribute('src', expect.stringContaining('chinese-self-concept-actions-v2/'+band+'.webp'))
    expect(images[1].parentElement).toHaveTextContent('这次的语文学习印象')
  })
  it.each([
    [actionEdition, []], [actionEdition, [bandBlock('low', 'other_score')]],
    [actionEdition, [bandBlock('unknown')]], [actionEdition, [bandBlock('low'), bandBlock('middle')]],
    [actionEdition, [{ type: 'METRIC', metricKey: 'academic_self_concept', display: 'RAW', value: 3.5 }]],
    ['chinese-self-concept-door-v1', [bandBlock('high')]],
  ] as const)('keeps only the story when the edition or returned band does not select one action', (edition, blocks) => {
    render(<SurveyDeclaredReportView report={{ generatorVersion: 'DECLARATIVE_REPORT_V1', illustrationKey: edition,
      blocks: [...blocks] }} />)
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByRole('img')).toHaveAttribute('src', expect.stringContaining('chinese-self-concept-door-v1.webp'))
  })

  it('renders narrative prose, threshold bands with guidance, chart metrics, and securely loads ASSET images', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['png'], { type: 'image/png' }), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    )
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-report-image')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    render(
      <SurveyDeclaredReportView
        proof={{ publicId: 'pub-1', attemptId: 'att-1', accessCredential: 'secret-token' }}
        report={{
          generatorVersion: 'DECLARATIVE_REPORT_V1',
          title: '标准量表完整报告',
          blocks: [
            { type: 'TEXT', text: '这是一段导语说明。' },
            { type: 'METRIC', metricKey: 'total', label: '总分', value: 18, unit: '分', status: 'INTERPRETABLE', display: 'RAW' },
            {
              type: 'REFERENCE_BAND',
              metricKey: 'total',
              referenceKind: 'criterion_threshold',
              bandKey: 'high',
              text: '处于较高水平区间。',
              guidance: ['保持日常复盘', '关注长期变化'],
            },
            {
              type: 'CHART',
              style: 'TABLE',
              caption: '维度概览',
              metrics: [{ metricKey: 'total', label: '总分', value: 18, unit: '分', status: 'INTERPRETABLE' }],
            },
            { type: 'ASSET', assetId: 'asset-img-1', alt: '阈值分布示意图' },
          ],
          limitations: ['仅反映本次作答结果。'],
          disclaimer: '不构成临床诊断。',
        }}
      />,
    )

    expect(screen.getByText('标准量表完整报告')).toBeInTheDocument()
    expect(screen.getByText('这是一段导语说明。')).toBeInTheDocument()
    expect(screen.getByText('处于较高水平区间。')).toBeInTheDocument()
    expect(screen.getByText('保持日常复盘')).toBeInTheDocument()
    expect(screen.getByText('维度概览')).toBeInTheDocument()
    expect(screen.getByText('仅反映本次作答结果。')).toBeInTheDocument()
    expect(screen.getByText('不构成临床诊断。')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByAltText('阈值分布示意图')).toHaveAttribute('src', 'blob:mock-report-image')
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/public/survey/r/pub-1/attempts/att-1/report-images/asset-img-1',
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        body: JSON.stringify({ accessCredential: 'secret-token' }),
      }),
    )
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toBeDefined()
  })
})
