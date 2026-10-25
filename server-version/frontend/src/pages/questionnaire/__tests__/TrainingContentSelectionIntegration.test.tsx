import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), send: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: api, sessionFetch: api.send }))
vi.mock('../../../contexts/CapabilitiesContext', () => ({ useCognitiveEnabled: () => true }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'actor', role: 'TEACHER' } }) }))
vi.mock('../../../components/PublicDeliveryManager', () => ({ PublicDeliveryManager: () => null }))
import { QuestionnaireProductEdit } from '../QuestionnaireProducts'
const grant = '11111111-1111-4111-8111-111111111111'
const row = { id: 'composite', name: 'Training 草稿', status: 'DRAFT', revision: 7, questionnaireType: 'COURSE', questionnaireCourses: [{ courseId: 'course' }], items: [{ id: 'cog', type: 'COGNITIVE', position: 0, cognitiveAssignment: { title: '认知任务' } }], formSections: [], publicEnabled: false, trainingReferenceSelectionDraft: null, trainingReportSelectionDraft: null }
const resources = { scales: [], cognitive: [], situational: [], courses: [{ id: 'course', title: 'Training 课程', courseType: 'TRAINING_COURSE', isLibrary: false }] }
const catalog = { schemaVersion: 1, units: [{ itemId: 'cog', family: 'COGNITIVE', measurementReleaseId: 'm1', choices: [{ releaseId: 'reference-1', entryKey: 'entry-1', version: '1', metricKey: 'effort', referenceKind: 'descriptive_sample', scope: 'PRIVATE', population: { description: '培训学员' }, limitations: [] }], reports: [] }] }
const selected = { schemaVersion: 1, units: [{ itemId: 'cog', choices: [{ releaseId: 'reference-1', entryKey: 'entry-1', priority: 0 }] }] }
const reportPayload = { measurementReleaseId: 'm1', metricKeys: ['effort'], audience: 'researcher', language: 'zh-CN', template: { title: '反馈', blocks: [{ type: 'TEXT', text: '内容' }], limitations: [] }, assets: [] }
const reportDraft = { id: 'draft', report_key: 'report', version: '1', revision: 0, state: 'DRAFT', published_release_id: null, payload: reportPayload }
const response = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ code: 0, data }) })
const NativeRequest = Request
beforeAll(() => vi.stubGlobal('Request', class extends NativeRequest { constructor(input: RequestInfo | URL, init?: RequestInit) { super(input, { ...init, signal: undefined }) } }))
beforeEach(() => {
  sessionStorage.clear(); vi.resetAllMocks()
  api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? resources : row }))
  api.send.mockImplementation(async (path: string, init: RequestInit) => {
    const url = new URL(path, 'http://localhost')
    if (url.pathname.endsWith('/content-reference-choices')) return response(catalog)
    if (url.pathname.endsWith('/measurements')) return response([{ id: 'm1', key: 'effort', family: 'COGNITIVE', version: '1', status: 'PUBLISHED', metrics: [{ metricKey: 'effort', unit: 'points' }] }])
    if (url.pathname.endsWith('/draft')) return response(reportDraft)
    if (url.pathname.includes('/content-reports/')) return response([{ id: 'draft', reportKey: 'report', version: '1', state: 'DRAFT' }])
    if (init.method === 'GET') return response(row)
    throw new Error('Unexpected mutation ' + path)
  })
})
afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks() })
function mount() {
  const router = createMemoryRouter([{ path: '/questionnaire-products/:id', element: <><Link to="/other">离开页面</Link><QuestionnaireProductEdit /></> }, { path: '/other', element: <p>Other page</p> }], { initialEntries: ['/questionnaire-products/composite'] })
  render(<RouterProvider router={router} />); return router
}
async function openChoices() { fireEvent.click(await screen.findByRole('button', { name: '读取可选报告与参考' })); await screen.findByLabelText('报告 cog') }
async function openReport() {
  fireEvent.change(await screen.findByLabelText('报告内容授权 ID'), { target: { value: grant } })
  fireEvent.click(screen.getByRole('button', { name: '打开课程报告' }))
  fireEvent.click(await screen.findByRole('button', { name: 'report · 1 · 草稿' })); await screen.findByLabelText('报告标题')
}
function pendingSelection() { sessionStorage.setItem('training-content-selection:' + JSON.stringify(['actor', 'composite']), JSON.stringify({ actorId: 'actor', compositeId: 'composite', kind: 'reference', revision: 7, selection: selected, uncertain: true })) }
function pendingCognitive() { sessionStorage.setItem('training-cognitive-publication:' + JSON.stringify(['actor', 'composite']), JSON.stringify({ actorId: 'actor', id: 'composite', revision: 7, itemIds: ['cog'], hadUnknownOutcome: true })) }
describe('Training questionnaire workspace mutual exclusion', () => {
  it('blocks metadata, report editing and both publications while selection changes are dirty, then releases them on discard', async () => {
    mount(); await screen.findByLabelText('报告内容授权 ID'); await openChoices(); fireEvent.click(screen.getByRole('checkbox', { name: /effort/ }))
    expect(screen.getByLabelText('测评名称')).toBeDisabled()
    expect(screen.getByLabelText('报告内容授权 ID')).toBeDisabled()
    expect(screen.getByRole('button', { name: '发布组合测评' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '发布当前认知配置版本' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '发布前自检' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '放弃未保存的选择修改' }))
    await waitFor(() => expect(screen.getByLabelText('测评名称')).toBeEnabled())
    fireEvent.change(screen.getByLabelText('测评名称'), { target: { value: '元数据未保存' } })
    expect(screen.getByRole('button', { name: '刷新可选内容' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /effort/ })).toBeDisabled()
    expect(screen.getByLabelText('报告内容授权 ID')).toBeDisabled()
    expect(api.post).not.toHaveBeenCalled(); expect(api.put).not.toHaveBeenCalled()
  })
  it('keeps dirty report saving and its one navigation guard usable while blocking parent edits and selection', async () => {
    const warn = vi.spyOn(console, 'warn')
    const router = mount(); await openReport()
    fireEvent.change(screen.getByLabelText('报告标题'), { target: { value: '报告未保存' } })
    expect(screen.getByLabelText('测评名称')).toBeDisabled()
    expect(screen.getByRole('button', { name: '读取可选报告与参考' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '保存报告草稿' })).toBeEnabled()
    expect(screen.getByLabelText('报告标题')).toBeEnabled()
    fireEvent.click(screen.getByRole('link', { name: '离开页面' })); await screen.findByRole('button', { name: '继续编辑' })
    expect(router.state.location.pathname).toBe('/questionnaire-products/composite')
    expect(warn.mock.calls.some(call => call.join(' ').includes('only supports one blocker'))).toBe(false)
  })
  it('mounts only the selection guard when a clean report is open', async () => {
    const warn = vi.spyOn(console, 'warn')
    mount(); await openReport(); await openChoices()
    fireEvent.click(screen.getByRole('checkbox', { name: /effort/ }))
    expect(screen.getByLabelText('报告标题')).toBeDisabled()
    fireEvent.click(screen.getByRole('link', { name: '离开页面' })); await screen.findByRole('button', { name: '继续编辑' })
    expect(screen.getAllByRole('button', { name: '继续编辑' })).toHaveLength(1)
    expect(warn.mock.calls.some(call => call.join(' ').includes('only supports one blocker'))).toBe(false)
  })
  it('allows a pending selection to be read despite old cognitive recovery, but serializes the actual reads and writes', async () => {
    pendingSelection(); pendingCognitive()
    let finish!: (value: unknown) => void
    api.send.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    mount(); fireEvent.click(await screen.findByRole('button', { name: '核对原选择请求' }))
    expect(screen.getByRole('button', { name: '读取可选报告与参考' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重试原修订请求' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重新读取当前草稿' })).toBeDisabled()
    await act(async () => finish(response(row)))
    await waitFor(() => expect(screen.getByRole('button', { name: '重试原修订请求' })).toBeEnabled())
    expect(screen.getByRole('button', { name: '按原修订重试' })).toBeEnabled()
    let finishCognitive!: (value: unknown) => void
    api.post.mockImplementationOnce(() => new Promise(resolve => { finishCognitive = resolve }))
    fireEvent.click(screen.getByRole('button', { name: '重试原修订请求' }))
    expect(screen.getByRole('button', { name: '核对原选择请求' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '按原修订重试' })).toBeDisabled()
    await act(async () => finishCognitive({ code: 0, data: { ...row, revision: 8 } }))
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/questionnaire-products/composite/measurement-instances/publish', { revision: 7 })
    expect(screen.getByRole('button', { name: '核对原选择请求' })).toBeEnabled()
    expect(sessionStorage.getItem('training-content-selection:' + JSON.stringify(['actor', 'composite']))).not.toBeNull()
  })
  it('clears parent risk when an unknown selection is explicitly resolved', async () => {
    pendingSelection(); api.send.mockResolvedValueOnce(response({ ...row, revision: 8, trainingReferenceSelectionDraft: selected }))
    mount(); fireEvent.click(await screen.findByRole('button', { name: '核对原选择请求' }))
    await screen.findByText('已核对：服务器当前已保存相同选择。')
    expect(screen.getByLabelText('测评名称')).toBeEnabled()
    expect(screen.getByLabelText('报告内容授权 ID')).toBeEnabled()
    expect(screen.getByRole('button', { name: '发布当前认知配置版本' })).toBeEnabled()
    expect(api.post).not.toHaveBeenCalled()
  })
})
