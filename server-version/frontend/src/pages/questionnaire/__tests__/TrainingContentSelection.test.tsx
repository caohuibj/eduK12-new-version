import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
const http = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('../../../api/client', () => ({ sessionFetch: http.send }))
import { TrainingContentSelection } from '../TrainingContentSelection'
type Props = Parameters<typeof TrainingContentSelection>[0]
type Detail = Props['detail']
const base: Detail = { id: 'composite', revision: 7, trainingReferenceSelectionDraft: null, trainingReportSelectionDraft: null }
const choice = { releaseId: 'reference-1', entryKey: 'entry-1', version: '1', metricKey: 'effort', referenceKind: 'descriptive_sample', scope: 'PRIVATE', population: { description: '成年培训学员' }, limitations: ['不外推到未成年人'] }
const catalog = { schemaVersion: 1, units: [{ itemId: 'item-1', family: 'SCALE', measurementReleaseId: 'measurement-1', choices: [choice], reports: [{ releaseId: 'report-1', version: '1', title: '教师报告', audience: 'teacher' }] }] }
const refs = { schemaVersion: 1 as const, units: [{ itemId: 'item-1', choices: [{ releaseId: 'reference-1', entryKey: 'entry-1', priority: 0 }] }] }
const reports = { schemaVersion: 1 as const, units: [{ itemId: 'item-1', reportReleaseId: 'report-1' }] }
const storageKey = (actor = 'actor', id = 'composite') => 'training-content-selection:' + JSON.stringify([actor, id])
const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => ({ code: status < 400 ? 0 : -1, message: status < 400 ? undefined : '明确拒绝', data }) })
const NativeRequest = Request
beforeAll(() => vi.stubGlobal('Request', class extends NativeRequest { constructor(input: RequestInfo | URL, init?: RequestInit) { super(input, { ...init, signal: undefined }) } }))
afterEach(() => { cleanup(); http.send.mockReset(); sessionStorage.clear(); vi.restoreAllMocks() })
function mount(initial = base, actor = 'actor', disabled = false) {
  const onSaved = vi.fn(), risk = vi.fn()
  let change!: (value: { actorId?: string; detail?: Detail; disabled?: boolean }) => void
  function Workspace() {
    const [state, setState] = useState({ actorId: actor, detail: initial, disabled })
    change = value => setState(old => ({ ...old, ...value }))
    return <><Link to="/other">离开</Link><TrainingContentSelection {...state} onRiskChange={risk} onSaved={row => { onSaved(row); setState(old => ({ ...old, detail: row })) }} /></>
  }
  const router = createMemoryRouter([{ path: '/edit', element: <Workspace /> }, { path: '/other', element: <p>Other page</p> }], { initialEntries: ['/edit'] })
  render(<RouterProvider router={router} />)
  return { router, onSaved, risk, change: (value: Parameters<typeof change>[0]) => act(() => change(value)) }
}
async function open() {
  fireEvent.click(screen.getByRole('button', { name: '读取可选报告与参考' }))
  await screen.findByLabelText('报告 item-1')
}
function selectReference() { fireEvent.click(screen.getByRole('checkbox', { name: /effort/ })) }
function selectReport() { fireEvent.change(screen.getByLabelText('报告 item-1'), { target: { value: 'report-1' } }) }
function autoApi(initial = base) {
  let current = initial
  http.send.mockImplementation(async (path: string, init: RequestInit) => {
    if (path.endsWith('/content-reference-choices')) return response(catalog)
    if (init.method === 'POST') {
      const body = JSON.parse(init.body as string)
      const field = path.endsWith('/content-reference-selection') ? 'trainingReferenceSelectionDraft' : 'trainingReportSelectionDraft'
      current = { ...current, revision: body.revision + 1, [field]: body.selection }
    }
    return response(current)
  })
}
const posts = () => http.send.mock.calls.filter(([, init]) => init.method === 'POST')
async function uncertain() {
  http.send.mockResolvedValueOnce(response(catalog)).mockRejectedValueOnce(new Error('response lost'))
  const mounted = mount(); await open(); selectReference()
  fireEvent.click(screen.getByRole('button', { name: '保存参考选择' }))
  await screen.findByText('response lost')
  return mounted
}
describe('Training content selection real component', () => {
  it('shows only server choices and limitations, leaves comparisons unselected, and publishes nothing', async () => {
    autoApi(); mount(); await open()
    expect(screen.getByText('适用范围：成年培训学员')).toBeInTheDocument()
    expect(screen.getByText('不外推到未成年人')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByLabelText('报告 item-1')).toHaveValue('')
    expect(screen.getByText(/相同优先级若同时匹配/)).toBeInTheDocument()
    expect(posts()).toHaveLength(0)
  })
  it('keeps edits to the other selection and uses the receipt revision; sends no hashes or inferred context', async () => {
    autoApi(); mount(); await open(); selectReference(); selectReport()
    fireEvent.change(screen.getByLabelText('优先级 item-1 entry-1'), { target: { value: '-2' } })
    fireEvent.click(screen.getByRole('button', { name: '保存报告选择' }))
    await screen.findByText('选择已保存；正式发布时才冻结，不改变已有作答。')
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.getByLabelText('优先级 item-1 entry-1')).toHaveValue(-2)
    fireEvent.click(screen.getByRole('button', { name: '保存参考选择' }))
    await waitFor(() => expect(posts()).toHaveLength(2))
    expect(posts().map(([, init]) => JSON.parse(init.body))).toEqual([{ revision: 7, selection: reports }, { revision: 8, selection: { schemaVersion: 1, units: [{ itemId: 'item-1', choices: [{ releaseId: 'reference-1', entryKey: 'entry-1', priority: -2 }] }] } }])
    await waitFor(() => expect(screen.getByRole('button', { name: '保存参考选择' })).toBeDisabled())
  })
  it.each(['参考', '报告'])('clears %s only through explicit null and rejects a double click synchronously', async label => {
    const initial = { ...base, trainingReferenceSelectionDraft: refs, trainingReportSelectionDraft: reports }
    let finish!: (value: unknown) => void
    http.send.mockResolvedValueOnce(response(catalog)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    mount(initial); await open(); fireEvent.click(screen.getByRole('button', { name: '清空' + label + '选择' }))
    const button = screen.getByRole('button', { name: '保存' + label + '选择' })
    fireEvent.click(button); fireEvent.click(button)
    expect(posts()).toHaveLength(1); expect(JSON.parse(posts()[0][1].body)).toEqual({ revision: 7, selection: null })
    await act(async () => finish(response({ ...initial, revision: 8, [label === '参考' ? 'trainingReferenceSelectionDraft' : 'trainingReportSelectionDraft']: null })))
    expect(sessionStorage.getItem(storageKey())).toBeNull()
  })
  it('recognizes a saved selection after JSONB reorders its object keys', async () => {
    const reordered = { units: [{ choices: [{ priority: 0, entryKey: 'entry-1', releaseId: 'reference-1' }], itemId: 'item-1' }], schemaVersion: 1 }
    http.send.mockResolvedValueOnce(response(catalog)).mockResolvedValueOnce(response({ ...base, revision: 8, trainingReferenceSelectionDraft: reordered }))
    const mounted = mount(); await open(); selectReference(); fireEvent.click(screen.getByRole('button', { name: '保存参考选择' }))
    await screen.findByText('选择已保存；正式发布时才冻结，不改变已有作答。')
    expect(mounted.onSaved).toHaveBeenCalledOnce(); expect(sessionStorage.getItem(storageKey())).toBeNull()
    expect(screen.getByRole('button', { name: '保存参考选择' })).toBeDisabled()
  })
  it('preserves unavailable references and visibly preserves the unavailable selected report', async () => {
    const unavailable = { schemaVersion: 1 as const, units: [{ itemId: 'item-1', choices: [{ releaseId: 'old-reference', entryKey: 'old-entry', priority: 9 }] }] }
    const initial = { ...base, trainingReferenceSelectionDraft: unavailable, trainingReportSelectionDraft: { schemaVersion: 1 as const, units: [{ itemId: 'item-1', reportReleaseId: 'old-report' }] } }
    autoApi(initial); mount(initial); await open()
    expect(screen.getByRole('option', { name: '已保存但当前不可选：old-report' })).toBeInTheDocument()
    expect(screen.getByLabelText('报告 item-1')).toHaveValue('old-report')
    expect(screen.getByText(/部分已保存选择不在当前可选列表中/)).toBeInTheDocument()
    selectReference(); fireEvent.click(screen.getByRole('button', { name: '保存参考选择' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(JSON.parse(posts()[0][1].body).selection.units[0].choices).toEqual([...unavailable.units[0].choices, ...refs.units[0].choices])
  })
  it('requires a read before exact original-revision retry, including after remount', async () => {
    await uncertain(); const original = JSON.parse(posts()[0][1].body)
    cleanup(); const mounted = mount()
    expect(screen.getByRole('button', { name: '按原修订重试' })).toBeDisabled()
    expect(http.send).toHaveBeenCalledTimes(2)
    http.send.mockResolvedValueOnce(response(base)).mockResolvedValueOnce(response({ ...base, revision: 8, trainingReferenceSelectionDraft: refs }))
    fireEvent.click(screen.getByRole('button', { name: '核对原选择请求' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '按原修订重试' })).toBeEnabled())
    expect(posts()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '按原修订重试' }))
    await waitFor(() => expect(mounted.onSaved).toHaveBeenCalledOnce())
    expect(JSON.parse(posts()[1][1].body)).toEqual(original)
    expect(sessionStorage.getItem(storageKey())).toBeNull()
  })
  it('recognizes a matching current save without sending another mutation', async () => {
    const mounted = await uncertain()
    http.send.mockResolvedValueOnce(response({ ...base, revision: 9, trainingReferenceSelectionDraft: refs }))
    fireEvent.click(screen.getByRole('button', { name: '核对原选择请求' }))
    await screen.findByText('已核对：服务器当前已保存相同选择。')
    expect(posts()).toHaveLength(1); expect(mounted.onSaved).toHaveBeenCalledOnce()
  })
  it('ends a superseded revision only explicitly, never claiming success or resending at a new revision', async () => {
    const mounted = await uncertain()
    http.send.mockResolvedValueOnce(response({ ...base, revision: 10 }))
    fireEvent.click(screen.getByRole('button', { name: '核对原选择请求' }))
    const end = await screen.findByRole('button', { name: '结束已失效选择恢复（不确认成功）' })
    expect(screen.getByRole('button', { name: '按原修订重试' })).toBeDisabled()
    expect(mounted.onSaved).not.toHaveBeenCalled(); expect(sessionStorage.getItem(storageKey())).not.toBeNull()
    fireEvent.click(end)
    expect(mounted.onSaved).toHaveBeenCalledWith({ ...base, revision: 10 }); expect(posts()).toHaveLength(1)
    expect(screen.getByText('已结束失效修订的恢复并读取当前设置；这不确认原请求成功。')).toBeInTheDocument()
  })
  it.each([400, 401, 403, 404, 409, 422])('unlocks a first definitive HTTP %s refusal without dropping local edits', async status => {
    http.send.mockResolvedValueOnce(response(catalog)).mockResolvedValueOnce(response(null, status))
    mount(); await open(); selectReference(); fireEvent.click(screen.getByRole('button', { name: '保存参考选择' }))
    await screen.findByText('明确拒绝')
    expect(sessionStorage.getItem(storageKey())).toBeNull(); expect(screen.queryByRole('button', { name: '核对原选择请求' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeChecked(); expect(screen.getByRole('button', { name: '保存参考选择' })).toBeEnabled()
  })
  it('retains earlier uncertainty after a retry receives a definitive refusal and requires another read', async () => {
    await uncertain()
    http.send.mockResolvedValueOnce(response(base)).mockResolvedValueOnce(response(null, 403))
    fireEvent.click(screen.getByRole('button', { name: '核对原选择请求' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '按原修订重试' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '按原修订重试' })); await screen.findByText('明确拒绝')
    expect(JSON.parse(sessionStorage.getItem(storageKey())!).uncertain).toBe(true)
    expect(screen.getByRole('button', { name: '按原修订重试' })).toBeDisabled()
  })
  it.each(['malformed', 'missing-owner-fields', 'wrong-selection', 'wrong-id', 'old-revision'])('holds %s save receipts as unknown', async kind => {
    const valid = { ...base, revision: 8, trainingReferenceSelectionDraft: refs }
    const invalid = kind === 'missing-owner-fields' ? { id: base.id, revision: 8 } : kind === 'wrong-selection' ? { ...valid, trainingReferenceSelectionDraft: null } : kind === 'wrong-id' ? { ...valid, id: 'other' } : { ...valid, revision: 7 }
    http.send.mockResolvedValueOnce(response(catalog)).mockResolvedValueOnce(kind === 'malformed' ? { ok: true, status: 200, json: async () => { throw new Error('not JSON') } } : response(invalid))
    const mounted = mount(); await open(); selectReference(); fireEvent.click(screen.getByRole('button', { name: '保存参考选择' }))
    await screen.findByRole('button', { name: '核对原选择请求' })
    expect(mounted.onSaved).not.toHaveBeenCalled(); expect(sessionStorage.getItem(storageKey())).not.toBeNull()
  })
  it('does not mistake omitted owner-only fields for a verified null during recovery', async () => {
    sessionStorage.setItem(storageKey(), JSON.stringify({ actorId: 'actor', compositeId: 'composite', kind: 'reference', revision: 7, selection: null, uncertain: true }))
    http.send.mockResolvedValue(response({ id: 'composite', revision: 8 }))
    const mounted = mount(); fireEvent.click(screen.getByRole('button', { name: '核对原选择请求' }))
    await screen.findByRole('alert'); expect(mounted.onSaved).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(storageKey())).not.toBeNull(); expect(screen.getByRole('button', { name: '按原修订重试' })).toBeDisabled()
  })
  it.each(['actor', 'product'])('isolates a late request and its stored recovery from another %s', async scope => {
    let finish!: (value: unknown) => void
    http.send.mockResolvedValueOnce(response(catalog)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const mounted = mount(); await open(); selectReference(); fireEvent.click(screen.getByRole('button', { name: '保存参考选择' }))
    mounted.change(scope === 'actor' ? { actorId: 'new-actor' } : { detail: { ...base, id: 'other-product' } })
    await act(async () => finish(response({ ...base, revision: 8, trainingReferenceSelectionDraft: refs })))
    expect(mounted.onSaved).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: '核对原选择请求' })).not.toBeInTheDocument()
    expect(sessionStorage.getItem(storageKey())).not.toBeNull()
    expect(screen.getByRole('button', { name: '读取可选报告与参考' })).toBeEnabled()
    expect(mounted.risk).toHaveBeenLastCalledWith({ dirty: false, pending: false, busy: false })
  })
  it('ignores late choice results after a product change', async () => {
    let finish!: (value: unknown) => void
    http.send.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const mounted = mount(); fireEvent.click(screen.getByRole('button', { name: '读取可选报告与参考' }))
    mounted.change({ detail: { ...base, id: 'other-product' } })
    await act(async () => finish(response(catalog)))
    expect(screen.queryByLabelText('报告 item-1')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '读取可选报告与参考' })).toBeEnabled()
  })
  it('retains local dirty edits when an independent saved selection baseline advances', async () => {
    autoApi(); const mounted = mount(); await open(); selectReference()
    mounted.change({ detail: { ...base, revision: 8, trainingReportSelectionDraft: reports } })
    expect(screen.getByRole('checkbox')).toBeChecked(); expect(screen.getByLabelText('报告 item-1')).toHaveValue('report-1')
    expect(screen.getByRole('button', { name: '保存报告选择' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '保存参考选择' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(JSON.parse(posts()[0][1].body).revision).toBe(8)
  })
  it('protects dirty SPA navigation, leaves after explicit discard, and warns before unloading', async () => {
    autoApi(); const mounted = mount(); await open(); selectReference()
    const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true)
    fireEvent.click(screen.getByRole('link', { name: '离开' })); await screen.findByRole('button', { name: '继续编辑' })
    expect(mounted.router.state.location.pathname).toBe('/edit')
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' })); expect(screen.getByRole('checkbox')).toBeChecked()
    fireEvent.click(screen.getByRole('link', { name: '离开' })); fireEvent.click(await screen.findByRole('button', { name: '放弃修改并离开' }))
    await screen.findByText('Other page')
    expect(mounted.risk).toHaveBeenLastCalledWith({ dirty: false, pending: false, busy: false })
  })
  it('blocks leaving an unknown outcome and keeps recovery available while new edits are externally disabled', async () => {
    const mounted = await uncertain(); mounted.change({ disabled: true })
    fireEvent.click(screen.getByRole('link', { name: '离开' })); await screen.findByRole('button', { name: '继续编辑' })
    expect(screen.queryByRole('button', { name: '放弃修改并离开' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
    expect(screen.getByRole('button', { name: '核对原选择请求' })).toBeEnabled(); expect(screen.getByRole('button', { name: '刷新可选内容' })).toBeDisabled()
  })
  it('rejects incomplete choice data without rendering or inventing a population', async () => {
    http.send.mockResolvedValue(response({ ...catalog, units: [{ ...catalog.units[0], choices: [{ ...choice, population: null }] }] }))
    mount(); fireEvent.click(screen.getByRole('button', { name: '读取可选报告与参考' }))
    await screen.findByText('可选版本响应不完整，请重新读取。')
    expect(screen.queryByLabelText('报告 item-1')).not.toBeInTheDocument(); expect(posts()).toHaveLength(0)
  })
  it('does not transmit a mutation when durable pending storage fails', async () => {
    autoApi(); mount(); await open(); selectReference()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked') })
    fireEvent.click(screen.getByRole('button', { name: '保存参考选择' }))
    await screen.findByText('storage blocked'); expect(posts()).toHaveLength(0)
  })
})

it('shows a fixed administrator configuration without offering that unit any P or R control and preserves other units',async()=>{
 http.send.mockResolvedValue(response({schemaVersion:1,units:[{itemId:'fixed',family:'SCALE',measurementReleaseId:'fixed-m',fixedConfiguration:{name:'基础教学反馈'},choices:[],reports:[]},...catalog.units]}));mount();await open()
 expect(screen.getByRole('heading',{name:'基础教学反馈'})).toBeVisible();expect(screen.getByText(/内容、参数和报告已由管理员固定/)).toBeVisible();expect(screen.queryByLabelText('报告 fixed')).not.toBeInTheDocument();expect(screen.queryByLabelText(/优先级 fixed/)).not.toBeInTheDocument();expect(screen.getByLabelText('报告 item-1')).toBeEnabled();expect(posts()).toHaveLength(0)
})
