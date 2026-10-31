import { useEffect, useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn(),
  selectorModule: vi.fn(), sectionModule: vi.fn(), deliveryModule: vi.fn(),
  sectionMount: vi.fn(), deliveryMount: vi.fn(),
}))
vi.mock('../../api/client', () => ({ default: mocks }))
vi.mock('../../components/ScaleSelector', () => {
  mocks.selectorModule()
  return { ScaleSelector: ({ scales }: { scales: { id: string; name: string }[] }) => <div>可选：{scales.map(scale => scale.name).join(',')}</div> }
})
vi.mock('../../components/FormSectionManager', () => {
  mocks.sectionModule()
  return { default: function Sections({ basePath }: { basePath: string }) {
    const [title, setTitle] = useState('区段初稿')
    useEffect(() => { mocks.sectionMount(basePath) }, [basePath])
    return <label>区段草稿<input value={title} onChange={event => setTitle(event.target.value)} /></label>
  } }
})
vi.mock('../../components/PublicDeliveryManager', () => {
  mocks.deliveryModule()
  return { PublicDeliveryManager: function Delivery({ resourceId, canCreate }: { resourceId: string; canCreate: boolean }) {
    const [limit, setLimit] = useState('0')
    useEffect(() => { mocks.deliveryMount(resourceId) }, [resourceId])
    return <label>令牌草稿{canCreate ? '可创建' : '需发布'}<input aria-label="令牌草稿" value={limit} onChange={event => setLimit(event.target.value)} /></label>
  } }
})
import GeneralQuestionnaireEdit from './GeneralQuestionnaireEdit'

const questionnaire = (id = 'q') => ({ id, code: `code-${id}`, name: `问卷-${id}`, description: '', instruction: '', status: 'DRAFT', estimatedTime: 30 })
const item = (label = '当前题目') => ({ id: label, label, type: 'text_input', position: 0 })
const ok = (data: unknown) => ({ code: 0, data })
function pending<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const NativeRequest = Request
beforeAll(() => vi.stubGlobal('Request', class extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) { super(input, { ...init, signal: undefined }) }
}))
afterAll(() => vi.unstubAllGlobals())
function mount() {
  const router = createMemoryRouter([
    { path: '/', element: <p>列表</p> },
    { path: '/general-questionnaires/:id', element: <><Link to="/">离开编辑</Link><GeneralQuestionnaireEdit /></> },
  ], { initialEntries: ['/general-questionnaires/q'] })
  render(<RouterProvider router={router} />)
  return router
}
function defaultGet(path: string) {
  if (/\/general-questionnaires\/[^/]+$/.test(path)) return Promise.resolve(ok(questionnaire(path.split('/').pop())))
  if (path.endsWith('/form-items')) return Promise.resolve(ok({ list: [item()] }))
  if (path.startsWith('/scales?')) return Promise.resolve(ok({ list: [{ id: 'available', name: '可用量表', status: 'PUBLISHED' }] }))
  return Promise.resolve(ok({ list: [] }))
}

describe('GeneralQuestionnaireEdit deferred tabs', () => {
  beforeEach(() => {
    mocks.get.mockReset().mockImplementation(defaultGet)
    mocks.put.mockReset().mockImplementation((_path, value) => Promise.resolve(ok({ ...questionnaire(), ...value })))
    mocks.post.mockReset().mockResolvedValue(ok({}))
    mocks.delete.mockReset().mockResolvedValue(ok({}))
    mocks.sectionMount.mockClear()
    mocks.deliveryMount.mockClear()
  })

  it('waits for metadata before exposing an editor and loads no optional code or data on basic', async () => {
    const metadata = pending<ReturnType<typeof ok>>()
    mocks.get.mockReturnValueOnce(metadata.promise)
    mount()
    expect(screen.queryByRole('heading', { name: '编辑历史泛化问卷' })).toBeNull()
    expect(screen.queryByLabelText('问卷名称 *')).toBeNull()
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
    expect(mocks.get.mock.calls.map(([path]) => path)).toEqual(['/general-questionnaires/q'])
    await act(async () => metadata.resolve(ok(questionnaire())))
    expect(await screen.findByLabelText('问卷名称 *')).toHaveValue('问卷-q')
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.selectorModule).not.toHaveBeenCalled()
    expect(mocks.sectionModule).not.toHaveBeenCalled()
    expect(mocks.deliveryModule).not.toHaveBeenCalled()
  })

  it('loads each tab on first visit and preserves basic, section and token drafts across switches', async () => {
    const user = userEvent.setup()
    const router = mount()
    const name = await screen.findByLabelText('问卷名称 *')
    await user.clear(name); await user.type(name, '未保存名称')
    await user.click(screen.getByRole('button', { name: '内容编排' }))
    expect(await screen.findByText('当前题目')).toBeVisible()
    expect(await screen.findByText('可选：可用量表')).toBeVisible()
    const section = await screen.findByLabelText('区段草稿')
    await user.clear(section); await user.type(section, '未保存区段')
    expect(mocks.get.mock.calls.map(([path]) => path)).toEqual([
      '/general-questionnaires/q', '/general-questionnaires/q/form-items', '/general-questionnaires/q/scales',
      '/scales?status=PUBLISHED&page=1&pageSize=100',
    ])
    await user.click(screen.getByRole('button', { name: '访问令牌' }))
    const token = await screen.findByLabelText('令牌草稿')
    await user.clear(token); await user.type(token, '7')
    expect(section).not.toBeVisible()
    await user.click(screen.getByRole('button', { name: '基本信息' }))
    expect(screen.getByLabelText('问卷名称 *')).toHaveValue('未保存名称')
    expect(token).not.toBeVisible()
    await user.click(screen.getByRole('button', { name: '内容编排' }))
    expect(screen.getByLabelText('区段草稿')).toHaveValue('未保存区段')
    await user.click(screen.getByRole('button', { name: '访问令牌' }))
    expect(screen.getByLabelText('令牌草稿')).toHaveValue('7')
    expect(mocks.get).toHaveBeenCalledTimes(4)
    expect(mocks.sectionMount).toHaveBeenCalledTimes(1)
    expect(mocks.deliveryMount).toHaveBeenCalledTimes(1)
    await act(async () => { await router.navigate('/') })
    expect(screen.getByRole('dialog', { name: '放弃未保存的修改？' })).toBeInTheDocument()
  })

  it('keeps unknown content distinct from empty and retries content and catalog failures without replacing basic edits', async () => {
    const user = userEvent.setup()
    let contentAttempt = 0, catalogAttempt = 0
    const content = pending<ReturnType<typeof ok>>()
    mocks.get.mockImplementation((path: string) => {
      if (path.endsWith('/form-items') && ++contentAttempt === 1) return content.promise
      if (path.startsWith('/scales?') && ++catalogAttempt === 1) return Promise.resolve({ code: 9, message: 'catalog offline' })
      return defaultGet(path)
    })
    mount()
    const name = await screen.findByLabelText('问卷名称 *')
    await user.clear(name); await user.type(name, '仍保留名称')
    await user.click(screen.getByRole('button', { name: '内容编排' }))
    expect(screen.queryByText('暂无内容')).toBeNull()
    expect(screen.queryByText('当前题目')).toBeNull()
    await act(async () => content.resolve({ code: 8, message: 'content offline' } as unknown as ReturnType<typeof ok>))
    expect(await screen.findByText('content offline')).toBeVisible()
    expect(screen.queryByText('暂无内容')).toBeNull()
    await user.click(screen.getByRole('button', { name: '重试问卷内容' }))
    expect(await screen.findByText('当前题目')).toBeVisible()
    expect(await screen.findByText('catalog offline')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '重试可用量表' }))
    expect(await screen.findByText('可选：可用量表')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '基本信息' }))
    expect(screen.getByLabelText('问卷名称 *')).toHaveValue('仍保留名称')
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('does not apply late metadata after route identity changes', async () => {
    const old = pending<ReturnType<typeof ok>>()
    mocks.get.mockImplementation((path: string) => path === '/general-questionnaires/q' ? old.promise : defaultGet(path))
    const router = mount()
    await act(async () => { await router.navigate('/general-questionnaires/new') })
    expect(await screen.findByLabelText('问卷名称 *')).toHaveValue('问卷-new')
    await act(async () => old.resolve(ok(questionnaire())))
    expect(screen.getByLabelText('问卷名称 *')).toHaveValue('问卷-new')
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })

  it('discards late content and catalog results and resets visited tabs when the id changes', async () => {
    const user = userEvent.setup()
    const oldContent = pending<ReturnType<typeof ok>>()
    const oldCatalog = pending<ReturnType<typeof ok>>()
    let catalogAttempt = 0
    mocks.get.mockImplementation((path: string) => {
      if (path === '/general-questionnaires/q/form-items') return oldContent.promise
      if (path.startsWith('/scales?') && ++catalogAttempt === 1) return oldCatalog.promise
      return defaultGet(path)
    })
    const router = mount()
    await screen.findByLabelText('问卷名称 *')
    await user.click(screen.getByRole('button', { name: '内容编排' }))
    await act(async () => { await router.navigate('/general-questionnaires/new') })
    expect(await screen.findByLabelText('问卷名称 *')).toHaveValue('问卷-new')
    expect(screen.getByRole('button', { name: '基本信息' })).toHaveAttribute('aria-pressed', 'true')
    expect(mocks.get).not.toHaveBeenCalledWith('/general-questionnaires/new/form-items')
    await user.click(screen.getByRole('button', { name: '内容编排' }))
    expect(await screen.findByText('当前题目')).toBeVisible()
    await act(async () => {
      oldContent.resolve(ok({ list: [item('迟到旧题目')] }))
      oldCatalog.resolve(ok({ list: [{ id: 'old', name: '迟到旧量表', status: 'PUBLISHED' }] }))
    })
    expect(screen.queryByText('迟到旧题目')).toBeNull()
    expect(screen.queryByText('可选：迟到旧量表')).toBeNull()
    expect(await screen.findByText('可选：可用量表')).toBeVisible()
  })

  it('publishes from basic by loading only validation content and retaining the shared synchronous operation lock', async () => {
    const content = pending<ReturnType<typeof ok>>()
    mocks.get.mockImplementation((path: string) => path.endsWith('/form-items') ? content.promise : defaultGet(path))
    mount()
    await screen.findByLabelText('问卷名称 *')
    const publish = screen.getByRole('button', { name: '发布问卷' })
    act(() => { fireEvent.click(publish); fireEvent.click(publish) })
    expect(screen.getByLabelText('问卷名称 *')).toBeDisabled()
    expect(mocks.post).not.toHaveBeenCalled()
    await act(async () => content.resolve(ok({ list: [item()] })))
    expect(await screen.findByText('发布成功')).toBeVisible()
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/general-questionnaires/q/publish')
    expect(mocks.get.mock.calls.map(([path]) => path)).toEqual([
      '/general-questionnaires/q', '/general-questionnaires/q/form-items', '/general-questionnaires/q/scales',
    ])
    expect(mocks.sectionMount).not.toHaveBeenCalled()
    expect(mocks.deliveryMount).not.toHaveBeenCalled()
  })

  it('shares an in-flight first content load with publishing instead of requesting the same data twice', async () => {
    const user = userEvent.setup()
    const content = pending<ReturnType<typeof ok>>()
    mocks.get.mockImplementation((path: string) => path.endsWith('/form-items') ? content.promise : defaultGet(path))
    mount()
    await screen.findByLabelText('问卷名称 *')
    await user.click(screen.getByRole('button', { name: '内容编排' }))
    await user.click(screen.getByRole('button', { name: '发布问卷' }))
    expect(mocks.get.mock.calls.filter(([path]) => path.endsWith('/form-items'))).toHaveLength(1)
    expect(mocks.get.mock.calls.filter(([path]) => path.endsWith('/scales'))).toHaveLength(1)
    await act(async () => content.resolve(ok({ list: [item()] })))
    expect(await screen.findByText('发布成功')).toBeVisible()
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/general-questionnaires/q/publish')
  })

  it('does not publish empty or failed unknown content and permits a later retry', async () => {
    const user = userEvent.setup()
    let attempt = 0
    mocks.get.mockImplementation((path: string) => {
      if (path.endsWith('/form-items')) {
        attempt += 1
        if (attempt === 1) return Promise.resolve({ code: 7, message: 'offline' })
        return Promise.resolve(ok({ list: [] }))
      }
      return defaultGet(path)
    })
    mount()
    await screen.findByLabelText('问卷名称 *')
    await user.click(screen.getByRole('button', { name: '发布问卷' }))
    expect(await screen.findByText('问卷内容加载失败，请重试发布或在内容编排中重试。')).toBeVisible()
    expect(mocks.post).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '发布问卷' }))
    expect(await screen.findByText('问卷必须包含至少一个量表或表单题目')).toBeVisible()
    expect(mocks.post).not.toHaveBeenCalled()
    expect(attempt).toBe(2)
  })
})
