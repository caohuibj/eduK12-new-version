import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const mocks = vi.hoisted(() => ({
  getAssignment: vi.fn(), collections: vi.fn(), listPublicTokens: vi.fn(), exportData: vi.fn(),
  compositeExport: vi.fn(), fetch: vi.fn(), download: vi.fn(),
}))
vi.mock('react-router-dom', async () => ({ ...await vi.importActual('react-router-dom'), useParams: () => ({ id: 'source' }), useNavigate: () => vi.fn() }))
vi.mock('../../../modules/cognitive/api', () => ({ cognitiveApi: mocks }))
vi.mock('../../../modules/composite/api', () => ({ compositeApi: { exportData: mocks.compositeExport } }))
vi.mock('../../../api/client', () => ({ sessionFetch: mocks.fetch }))
vi.mock('../../../components/PublicDeliveryManager', () => ({ PublicDeliveryManager: () => null }))
vi.mock('../../../modules/cognitive/CognitiveProfessionalReports', () => ({
  default: ({ collectionId }: { collectionId?: string }) => <p>专业报告来源：{collectionId || '独立任务'}</p>,
}))
vi.mock('../../../utils/exportJobs', async () => ({
  ...await vi.importActual('../../../utils/exportJobs'),
  triggerExportDownload: mocks.download,
}))
import CognitiveAssignmentEdit from '../CognitiveAssignmentEdit'
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear()
  mocks.getAssignment.mockResolvedValue({ code: 0, data: { id: 'source', title: '原独立任务', status: 'ARCHIVED', listedStandalone: true, config: {} } })
  mocks.collections.mockResolvedValue({ code: 0, data: [{ id: 'owned-collection', name: '三单元问卷', completedCount: 1 }] })
  mocks.compositeExport.mockResolvedValue({ code: 0, data: { artifacts: [{ id: 'artifact', fileName: 'collection.csv', downloadUrl: '/api/composite/owned/artifact' }] } })
  mocks.fetch.mockImplementation(async (path: string) => path.endsWith('/status')
    ? { ok: true, status: 200, json: async () => ({ code: 0, data: { status: 'READY' } }) }
    : { ok: true, status: 200, blob: async () => new Blob(['score,quality\n10,limited']) })
})
describe('cognitive collection data source', () => {
  it('exports both summary and full data from the explicitly displayed owned collection, and reads that report scope', async () => {
    const user = userEvent.setup()
    render(<CognitiveAssignmentEdit />)
    await waitFor(() => expect(screen.getByLabelText('认知数据来源')).toHaveValue('owned-collection'))
    await user.click(screen.getByRole('button', { name: '导出摘要' }))
    await screen.findByText(/已请求下载导出文件/)
    expect(mocks.compositeExport).toHaveBeenLastCalledWith('owned-collection', { detail: 'summary', format: 'csv' }, expect.any(String))
    expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob), 'collection.csv')
    await user.click(screen.getByRole('button', { name: '导出完整数据' }))
    await waitFor(() => expect(mocks.compositeExport).toHaveBeenLastCalledWith('owned-collection', { detail: 'full', format: 'csv' }, expect.any(String)))
    expect(mocks.exportData).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '阅读专业报告' }))
    expect(screen.getByText('专业报告来源：owned-collection')).toBeInTheDocument()
  })
  it('shows an export error and does not announce a download when the selected scope is denied', async () => {
    mocks.compositeExport.mockRejectedValue({ status: 403, message: '当前无权导出所选问卷' })
    const user = userEvent.setup()
    render(<CognitiveAssignmentEdit />)
    await waitFor(() => expect(screen.getByLabelText('认知数据来源')).toHaveValue('owned-collection'))
    await user.click(screen.getByRole('button', { name: '导出摘要' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('当前无权导出所选问卷')
    expect(mocks.download).not.toHaveBeenCalled()
    expect(screen.queryByText(/已请求下载导出文件/)).not.toBeInTheDocument()
  })
})
