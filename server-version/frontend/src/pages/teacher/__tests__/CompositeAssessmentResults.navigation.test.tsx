import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { attempts, exportData } = vi.hoisted(() => ({ attempts: vi.fn(), exportData: vi.fn() }))
vi.mock('../../../modules/composite/api', () => ({ compositeApi: { attempts, exportData } }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'trainer', role: 'TEACHER' } }) }))
import CompositeAssessmentResults from '../CompositeAssessmentResults'

let navigate: ReturnType<typeof useNavigate>
function Location() { navigate = useNavigate(); const location = useLocation(); return <p data-testid="location">{location.pathname + location.search}</p> }
function mount() { return render(<MemoryRouter initialEntries={['/composite-assessments/one/results']}><Location /><Routes>
  <Route path="/composite-assessments/:id/results" element={<CompositeAssessmentResults />} />
  <Route path="*" element={<p>目标页面</p>} />
</Routes></MemoryRouter>) }
function response(productKind: string, id = 'one') {
  return { code: 0, data: {
    assessment: { id, name: id + ' 结果', productKind, code: 'CODE', status: 'PUBLISHED', courseId: 'course' },
    attemptCounts: { started: 2, inProgress: 1, completed: 1, abandoned: 0 },
    list: [
      { id: 'complete', displayName: '完成者', status: 'COMPLETED', progress: 100, isAnonymous: false },
      { id: 'partial', displayName: '进行者', status: 'IN_PROGRESS', progress: 50, partialReportAvailable: true, isAnonymous: false },
    ], page: 1, pageSize: 20, total: 2, totalPages: 1, hasMore: false,
  } }
}
function deferred() { let resolve!: (value: unknown) => void; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
beforeEach(() => { attempts.mockReset(); exportData.mockReset() })

// The previous binary branch sent every non-QUESTIONNAIRE result, including
// ASSESSMENT_BUNDLE, to the legacy composite editor and its unsupported exports.
describe('composite results product navigation and safe request state', () => {
  it.each([
    ['ASSESSMENT_BUNDLE', '/bundle-products/one'],
    ['QUESTIONNAIRE', '/questionnaire-products/one'],
    ['LEGACY_COMPOSITE', '/composite-assessments/one'],
  ])('returns %s to its own editor', async (kind, destination) => {
    attempts.mockResolvedValue(response(kind))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: '返回配置' }))
    expect(screen.getByTestId('location')).toHaveTextContent(destination)
    expect(screen.getByText('目标页面')).toBeInTheDocument()
  })

  it('only offers the existing completed Bundle report JSON path, never a generic export', async () => {
    attempts.mockResolvedValue(response('ASSESSMENT_BUNDLE'))
    mount()
    const button = await screen.findByRole('button', { name: '查看报告' })
    expect(screen.getByText('综合报告可用时，可在报告页导出 JSON。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '导出摘要' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '已完成单项' })).not.toBeInTheDocument()
    fireEvent.click(button)
    expect(screen.getByTestId('location').textContent).toBe('/composite-assessments/one/attempts/complete/report')
    expect(exportData).not.toHaveBeenCalled()
  })

  it('preserves the supported partial report path for ordinary questionnaires', async () => {
    attempts.mockResolvedValue(response('QUESTIONNAIRE'))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: '已完成单项' }))
    expect(screen.getByTestId('location').textContent).toBe('/composite-assessments/one/attempts/partial/report?partial=1')
  })

  it('does not guess an editor/export route for an unknown product kind', async () => {
    attempts.mockResolvedValue(response('UNKNOWN_KIND'))
    mount()
    await screen.findByRole('heading', { name: 'one 结果' })
    expect(screen.queryByRole('button', { name: '返回配置' })).not.toBeInTheDocument()
    expect(exportData).not.toHaveBeenCalled()
  })

  it('removes the previous product title, report rows and navigation while a new forbidden route loads', async () => {
    const next = deferred()
    attempts.mockImplementation((id: string) => id === 'one' ? Promise.resolve(response('ASSESSMENT_BUNDLE')) : next.promise)
    mount()
    await screen.findByText('完成者')
    act(() => { navigate('/composite-assessments/two/results') })
    expect(screen.queryByText('one 结果')).not.toBeInTheDocument()
    expect(screen.queryByText('完成者')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '返回配置' })).not.toBeInTheDocument()
    await act(async () => { next.resolve({ code: 403, message: '无权读取结果' }) })
    expect(await screen.findByText('无权读取结果')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '查看报告' })).not.toBeInTheDocument()
  })

  it('ignores a late route response after the current route is denied', async () => {
    const old = deferred()
    attempts.mockImplementation((id: string) => id === 'one' ? old.promise : Promise.resolve({ code: 403, message: '新测评无权限' }))
    mount()
    act(() => { navigate('/composite-assessments/two/results') })
    expect(await screen.findByText('新测评无权限')).toBeInTheDocument()
    await act(async () => { old.resolve(response('ASSESSMENT_BUNDLE')) })
    expect(screen.getByText('新测评无权限')).toBeInTheDocument()
    expect(screen.queryByText('完成者')).not.toBeInTheDocument()
  })

  it('ignores out-of-order filters and keeps stale rows cleared after a denial', async () => {
    const filtered = deferred()
    attempts.mockResolvedValueOnce(response('ASSESSMENT_BUNDLE')).mockReturnValueOnce(filtered.promise).mockResolvedValueOnce({ code: 403, message: '筛选时权限已撤回' })
    mount()
    await screen.findByText('完成者')
    fireEvent.change(screen.getByLabelText('状态'), { target: { value: 'IN_PROGRESS' } })
    expect(screen.queryByText('完成者')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('搜索'), { target: { value: 'new' } })
    fireEvent.click(screen.getByRole('button', { name: '筛选' }))
    expect(await screen.findByText('筛选时权限已撤回')).toBeInTheDocument()
    await act(async () => { filtered.resolve(response('ASSESSMENT_BUNDLE')) })
    expect(screen.getByText('筛选时权限已撤回')).toBeInTheDocument()
    expect(screen.queryByText('完成者')).not.toBeInTheDocument()
  })

  it('retries a failed authorized request without restoring old data', async () => {
    attempts.mockResolvedValueOnce({ code: 403, message: '无权限' }).mockResolvedValueOnce(response('QUESTIONNAIRE'))
    mount()
    await screen.findByText('无权限')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('完成者')).toBeInTheDocument()
    expect(attempts).toHaveBeenCalledTimes(2)
  })
})
