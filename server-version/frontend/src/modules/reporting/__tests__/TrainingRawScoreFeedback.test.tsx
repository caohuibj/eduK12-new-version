import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import ScaleUnitReportCard from '../ScaleUnitReportCard'
import { toScaleUnitReport, type Assessment } from '../../../pages/student/ScaleResult'
const fetcher = vi.hoisted(() => vi.fn())
vi.mock('../../../api/client', () => ({ default: { get: vi.fn() }, sessionFetch: fetcher }))
const feedback = [{ scoreKey: 'total', rangeKey: 'a', text: '服务器匹配的描述', images: [{ asset: { assetId: 'asset-1', contentHash: 'a'.repeat(64), mimeType: 'image/png' as const }, altText: '结果配图', order: 0 }] }]
const report = () => ({ type: 'SCALE' as const, kind: 'scale' as const, reportKind: 'full' as const, assessmentId: 'assessment-1', scaleName: '量表', caveats: [], disclaimer: '', completedAt: null, totalTime: null, rawScoreFeedback: feedback })
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('Image', class { src = ''; decode = () => Promise.resolve() })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:feedback') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  fetcher.mockResolvedValue({ ok: true, blob: async () => new Blob(['image'], { type: 'image/png' }) })
})
afterEach(() => vi.unstubAllGlobals())
describe('Training matched feedback display', () => {
  it('renders only projected matches and loads from the report-authorized asset route', async () => {
    render(<ScaleUnitReportCard report={report()} />)
    expect(screen.getByText('服务器匹配的描述')).toBeInTheDocument()
    expect(await screen.findByAltText('结果配图')).toHaveAttribute('src', 'blob:feedback')
    expect(fetcher).toHaveBeenCalledWith('/api/scales/assessments/assessment-1/report-assets/asset-1')
  })
  it('uses the collection-provided authorization transport instead of a standalone route', async () => {
    const loader = vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    render(<ScaleUnitReportCard report={report()} loadReportImage={loader} />)
    await screen.findByAltText('结果配图')
    expect(loader).toHaveBeenCalledWith('asset-1')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('never shows matched feedback or loads assets in scores-only and completion modes', () => {
    const view = render(<ScaleUnitReportCard report={{ ...report(), reportKind: 'scores' }} />)
    expect(screen.queryByText('服务器匹配的描述')).not.toBeInTheDocument()
    view.rerender(<ScaleUnitReportCard report={{ ...report(), reportKind: 'completion' }} />)
    expect(screen.queryByText('服务器匹配的描述')).not.toBeInTheDocument()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('keeps text on failed image authorization, never falls back to a generic asset URL', async () => {
    fetcher.mockResolvedValue({ ok: false })
    render(<ScaleUnitReportCard report={report()} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('以上文字反馈仍可查看'))
    expect(screen.getByText('服务器匹配的描述')).toBeInTheDocument()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('adapts approved external full feedback, not raw result rules or scores-only fields', () => {
    const input = { id: 'a1', scale: { id: 's1', name: '量表', code: 's', description: null }, report: { kind: 'full', instrument: { scaleId: 's1', name: '量表', code: 's', instrumentVersion: 'v1' }, rawScoreFeedback: feedback } } as unknown as Assessment
    expect(toScaleUnitReport(input)).toMatchObject({ assessmentId: 'a1', rawScoreFeedback: feedback })
    const scoresOnly = { ...input, report: { ...input.report!, kind: 'scores' } } as Assessment
    expect(toScaleUnitReport(scoresOnly).rawScoreFeedback).toBeUndefined()
  })
})

it.each(['image/png', 'video/mp4', 'application/pdf'] as const)('loads generic %s only through the granted report transport', async mimeType => {
  const loader = vi.fn(async () => new NodeBlob(['synthetic'], { type: mimeType }) as unknown as Blob)
  const material = { asset: { assetId: 'report-material', contentHash: 'a'.repeat(64), mimeType }, name: '获准报告素材', order: 0 }
  const value = { ...report(), rawScoreFeedback: [{ scoreKey: 'total', rangeKey: 'a', text: '反馈正文', materials: [material] }] }
  const view = render(<ScaleUnitReportCard report={value} loadReportImage={loader} />)
  expect(loader).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: mimeType.startsWith('image/') ? '查看图片' : mimeType.startsWith('video/') ? '查看视频' : '查看PDF 文档' }))
  await waitFor(() => expect(loader).toHaveBeenCalledWith('report-material'))
  if (mimeType === 'application/pdf') expect(await screen.findByTitle('获准报告素材')).toHaveAttribute('sandbox', '')
  else if (mimeType.startsWith('image/')) expect(await screen.findByAltText('获准报告素材')).toHaveAttribute('src', 'blob:feedback')
  else expect(await screen.findByLabelText('获准报告素材')).toHaveAttribute('controls')
  expect(fetcher).not.toHaveBeenCalled()
  loader.mockClear()
  view.rerender(<ScaleUnitReportCard report={{ ...value, reportKind: 'scores' }} loadReportImage={loader} />)
  expect(screen.queryByText('获准报告素材')).not.toBeInTheDocument()
  expect(loader).not.toHaveBeenCalled()
})
