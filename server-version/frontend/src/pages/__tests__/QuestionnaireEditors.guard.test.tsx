import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }))
vi.mock('../../api/client', () => ({ default: mocks }))
vi.mock('../../components/ScaleSelector', () => ({ ScaleSelector: () => <div>scales</div> }))
vi.mock('../../components/FormSectionManager', () => ({ default: () => <div>sections</div> }))
vi.mock('../../components/PublicDeliveryManager', () => ({ PublicDeliveryManager: () => <div>deliveries</div> }))
import QuestionnaireEdit from '../QuestionnaireEdit'
import GeneralQuestionnaireEdit from '../teacher/GeneralQuestionnaireEdit'

const questionnaire = { id: 'q', code: 'code', name: 'Original', description: '', instruction: '', visibility: 'HIDDEN', status: 'DRAFT', estimatedTime: 30, courseQuestionnaires: [] }
const cases = [[QuestionnaireEdit, 'questionnaires'], [GeneralQuestionnaireEdit, 'general-questionnaires']] as const
// jsdom's AbortSignal is not accepted by Node's native Request. These routes
// have no loaders/network; browser gates verify navigation with native signals.
const NativeRequest = Request
beforeAll(() => vi.stubGlobal('Request', class extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) { super(input, { ...init, signal: undefined }) }
}))
afterAll(() => vi.unstubAllGlobals())
function mount(Page: typeof QuestionnaireEdit, prefix: string, id = 'q') {
  const router = createMemoryRouter([
    { path: '/', element: <Link to={`/${prefix}/${id}`}>打开编辑</Link> },
    { path: `/${prefix}/:id`, element: <><Link to="/">站内离开</Link><Page /></> },
    { path: `/${prefix}`, element: <div>列表页面</div> },
  ], { initialEntries: ['/', `/${prefix}/${id}`], initialIndex: 1 })
  render(<RouterProvider router={router} />)
  return router
}
describe('whole questionnaire page guards', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.get.mockImplementation((path: string) => Promise.resolve({ code: 0, data: path.endsWith('/q') ? questionnaire : { list: path.endsWith('/form-items') ? [{ id: 'item', label: 'Question', type: 'text_input', position: 0 }] : [] } }))
    mocks.put.mockResolvedValue({ code: 0, data: { ...questionnaire, name: 'Changed' } })
    mocks.post.mockResolvedValue({ code: 0, data: {} })
  })
  it.each(cases)('protects dirty edits through links, browser back and beforeunload for %s', async (Page, prefix) => {
    const user = userEvent.setup()
    const router = mount(Page, prefix)
    const name = await screen.findByLabelText('问卷名称 *')
    await user.clear(name); await user.type(name, 'Changed')
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    await user.click(screen.getByText('站内离开'))
    expect(screen.getByRole('dialog', { name: '放弃未保存的修改？' })).toBeInTheDocument()
    await user.click(screen.getByText('继续编辑'))
    expect(name).toHaveValue('Changed')
    await act(async () => { await router.navigate(-1) })
    await user.click(screen.getByText('放弃修改并离开'))
    expect(await screen.findByText('打开编辑')).toBeInTheDocument()
  })
  it.each(cases)('deduplicates saves, locks editing and navigation, preserves failures and resets the saved baseline for %s', async (Page, prefix) => {
    let fail!: (reason: unknown) => void
    mocks.put.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
    const user = userEvent.setup()
    mount(Page, prefix)
    const name = await screen.findByLabelText('问卷名称 *')
    await user.clear(name); await user.type(name, 'Changed')
    const save = screen.getByRole('button', { name: '保存' })
    act(() => { fireEvent.click(save); fireEvent.click(save) })
    expect(mocks.put).toHaveBeenCalledTimes(1)
    expect(name).toBeDisabled()
    await user.click(screen.getByText('站内离开'))
    expect(screen.getByRole('dialog', { name: '正在提交，请稍候' })).toBeInTheDocument()
    expect(screen.queryByText('放弃修改并离开')).toBeNull()
    await user.click(screen.getByText('继续编辑'))
    await act(async () => fail({ message: 'offline' }))
    expect(await screen.findByText('offline')).toBeInTheDocument()
    expect(name).toHaveValue('Changed')
    expect(name).not.toBeDisabled()
    await user.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByText('保存成功')
    await user.click(screen.getByText('站内离开'))
    expect(await screen.findByText('打开编辑')).toBeInTheDocument()
  })
  it.each(cases)('does not expose a blank editable form when metadata fails for %s', async (Page, prefix) => {
    mocks.get.mockRejectedValueOnce({ message: 'metadata offline' })
    const user = userEvent.setup()
    mount(Page, prefix)
    await screen.findByText('问卷加载失败')
    expect(screen.queryByLabelText('问卷名称 *')).toBeNull()
    expect(mocks.put).not.toHaveBeenCalled()
    await user.click(screen.getByText('重试'))
    expect(await screen.findByLabelText('问卷名称 *')).toHaveValue('Original')
  })
  it('creates a questionnaire once and navigates without prompting to discard the just-saved draft', async () => {
    const user = userEvent.setup()
    mocks.post.mockResolvedValue({ code: 0, data: questionnaire })
    const router = mount(QuestionnaireEdit, 'questionnaires', 'new')
    await user.type(screen.getByLabelText('问卷编码 *'), 'code')
    await user.type(screen.getByLabelText('问卷名称 *'), 'Original')
    const save = screen.getByRole('button', { name: '保存' })
    act(() => { fireEvent.click(save); fireEvent.click(save) })
    await waitFor(() => expect(router.state.location.pathname).toBe('/questionnaires/q'))
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('preserves unsaved basic information and its baseline while refreshing course associations', async () => {
    let linked = false
    mocks.get.mockImplementation((path: string) => Promise.resolve({ code: 0, data: path.endsWith('/q')
      ? { ...questionnaire, courseQuestionnaires: linked ? [{ course: { id: 'course', title: 'Course' } }] : [] }
      : { list: path === '/courses' ? [{ id: 'course', title: 'Course' }] : [] } }))
    mocks.post.mockImplementation(async () => { linked = true; return { code: 0 } })
    const user = userEvent.setup()
    mount(QuestionnaireEdit, 'questionnaires')
    const name = await screen.findByLabelText('问卷名称 *')
    await user.clear(name); await user.type(name, 'Changed')
    await user.click(screen.getByText('课程关联'))
    await user.selectOptions(screen.getByRole('listbox'), 'course')
    await user.click(screen.getByRole('button', { name: '添加' }))
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Course' })).toBeNull())
    await user.click(screen.getByText('基本信息'))
    expect(screen.getByLabelText('问卷名称 *')).toHaveValue('Changed')
    await user.click(screen.getByText('站内离开'))
    expect(screen.getByRole('dialog', { name: '放弃未保存的修改？' })).toBeInTheDocument()
  })
  it('requires saved basic information before publishing and shares the save/publish lock', async () => {
    const user = userEvent.setup()
    let finish!: (value: unknown) => void
    mocks.post.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    mount(GeneralQuestionnaireEdit, 'general-questionnaires')
    const name = await screen.findByLabelText('问卷名称 *')
    await user.clear(name); await user.type(name, 'Changed')
    await user.click(screen.getByText('发布问卷'))
    expect(await screen.findByText('请先保存修改')).toBeInTheDocument()
    expect(mocks.post).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByText('保存成功')
    const publish = screen.getByText('发布问卷')
    act(() => { fireEvent.click(publish); fireEvent.click(publish) })
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(name).toBeDisabled()
    expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled()
    await act(async () => finish({ code: 7, message: 'publish offline' }))
    expect(await screen.findByText('publish offline')).toBeInTheDocument()
    expect(name).toHaveValue('Changed')
    mocks.post.mockResolvedValue({ code: 0, data: {} })
    await user.click(screen.getByText('发布问卷'))
    expect(mocks.post).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('发布成功')).toBeInTheDocument()
  })
})
