import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { attempts, exportData } = vi.hoisted(() => ({ attempts: vi.fn(), exportData: vi.fn() }))
const trainingPresentation = vi.hoisted(() => ({ enabled: false }))
vi.mock('../../../training/context', () => ({ isTrainingHost: () => trainingPresentation.enabled }))
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
beforeEach(() => { attempts.mockReset(); exportData.mockReset(); trainingPresentation.enabled = false })

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


it('keeps the anonymous unsatisfied submission report available and labels qualification separately', async () => {
  const payload = response('QUESTIONNAIRE')
  Object.assign(payload.data.list[0], { taskSatisfied: false, taskSatisfaction: 'NOT_SATISFIED', isAnonymous: true, displayName: 'ANON-1' })
  Object.assign(payload.data.attemptCounts, { satisfied: 0, notSatisfied: 1 })
  attempts.mockResolvedValue(payload)
  mount()
  expect(await screen.findByText('任务未达成')).toBeInTheDocument()
  expect(screen.getByText(/已交卷中任务达成 0 次，未达成 1 次/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '查看' }))
  expect(screen.getByTestId('location').textContent).toBe('/composite-assessments/one/attempts/complete/report')
})

describe('Training results presentation', () => {
  beforeEach(() => { trainingPresentation.enabled = true })
  it('shows the existing counts separately from participant progress and preserves full/partial report actions', async () => {
    const payload = response('QUESTIONNAIRE')
    Object.assign(payload.data.attemptCounts, { satisfied: 0, notSatisfied: 1 })
    Object.assign(payload.data.list[0], { taskSatisfied: false })
    attempts.mockResolvedValue(payload)
    mount()
    await screen.findByRole('heading', { name: 'one 结果' })
    const overview = screen.getByRole('region', { name: '作答概览' })
    expect(within(overview).getByText('任务达成')).toBeInTheDocument()
    expect(within(overview).getByText('0', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '进行者的作答进度' })).toHaveAttribute('value', '50')
    expect(screen.getByText('任务未达成')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看报告' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '已完成单项' }))
    expect(screen.getByTestId('location').textContent).toBe('/composite-assessments/one/attempts/partial/report?partial=1')
    expect(exportData).not.toHaveBeenCalled()
  })
  it('distinguishes no attempts from no filter matches and clears filters using the existing API', async () => {
    const empty = response('QUESTIONNAIRE')
    empty.data.list = []; empty.data.total = 0
    attempts.mockResolvedValue(empty)
    mount()
    expect(await screen.findByRole('heading', { name: '还没有作答记录' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('搜索'), { target: { value: '没有此人' } })
    fireEvent.click(screen.getByRole('button', { name: '筛选' }))
    expect(await screen.findByRole('heading', { name: '没有符合条件的作答记录' })).toBeInTheDocument()
    expect(attempts).toHaveBeenLastCalledWith('one', { status: undefined, q: '没有此人', page: 1, pageSize: 20 })
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(await screen.findByRole('heading', { name: '还没有作答记录' })).toBeInTheDocument()
    expect(screen.getByLabelText('搜索')).toHaveValue('')
    expect(attempts).toHaveBeenLastCalledWith('one', { status: undefined, q: undefined, page: 1, pageSize: 20 })
  })
  it('does not show zero counts or a no-attempts message when access fails', async () => {
    attempts.mockResolvedValue({ code: 403, message: '无权读取结果' })
    mount()
    await screen.findByText('无权读取结果')
    const overview = screen.getByRole('region', { name: '作答概览' })
    expect(within(overview).getAllByText('—', { selector: 'strong' })).toHaveLength(4)
    expect(screen.queryByText('还没有作答记录')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '返回配置' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '查看报告' })).not.toBeInTheDocument()
  })
  it('keeps uncertain progress unmeasured and preserves pagination', async () => {
    const payload = response('QUESTIONNAIRE')
    Object.assign(payload.data.list[1], { progressUnavailableReason: '等待核对' })
    payload.data.totalPages = 2; payload.data.hasMore = true; payload.data.total = 21
    attempts.mockResolvedValue(payload)
    mount()
    await screen.findByText('进度待核对')
    expect(screen.queryByRole('progressbar', { name: '进行者的作答进度' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await screen.findByText('进度待核对')
    expect(attempts).toHaveBeenLastCalledWith('one', { status: undefined, q: undefined, page: 2, pageSize: 20 })
  })
})

it('preserves the course scope in list filtering and report navigation',async()=>{
 trainingPresentation.enabled=true
 const payload=response('QUESTIONNAIRE');Object.assign(payload.data,{courseScope:{id:'course-a',title:'课程 A'}})
 attempts.mockResolvedValue(payload)
 render(<MemoryRouter initialEntries={['/composite-assessments/one/results?courseId=course-a']}><Location/><Routes><Route path="/composite-assessments/:id/results" element={<CompositeAssessmentResults/>}/><Route path="*" element={<p>目标页面</p>}/></Routes></MemoryRouter>)
 await screen.findByText(/当前课程：课程 A/)
 expect(attempts).toHaveBeenCalledWith('one',expect.objectContaining({courseId:'course-a'}))
 fireEvent.click(screen.getByRole('button',{name:'查看报告'}))
 expect(screen.getByTestId('location').textContent).toBe('/composite-assessments/one/attempts/complete/report?courseId=course-a')
})
