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
