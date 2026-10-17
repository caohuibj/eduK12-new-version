import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const { api, route, navigate } = vi.hoisted(() => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
  route: { id: 'scale-1' },
  navigate: vi.fn(),
}))
vi.mock('../../api/client', () => ({ default: api }))
vi.mock('react-router-dom', async () => ({
  ...await vi.importActual('react-router-dom'), useParams: () => route, useNavigate: () => navigate,
}))
import ScaleEdit from '../ScaleEdit'

const definition = () => ({
  schemaVersion: 2,
  items: [{ itemCode: 'Q1', content: '第一题', required: true, sortOrder: 1, type: 'single', responseSetKey: 'default' }],
  scoring: {
    itemRules: [{ itemCode: 'Q1', transform: { type: 'identity' } }],
    scores: [{ key: 'total', type: 'total', label: '总分', canonical: true, direction: 'descriptive', source: { type: 'items', aggregation: 'sum', items: [{ itemCode: 'Q1', weight: 1 }] } }],
  },
  report: { interpretations: [{ scoreKey: 'total', headline: '总分解释', summary: '描述结果' }] },
})
const scale = (overrides: Record<string, unknown> = {}) => ({
  id: 'scale-1', code: 'S1', name: '自建量表', status: 'DRAFT', visibility: 'HIDDEN',
  instrumentClass: 'CUSTOM_DESCRIPTIVE', definition: definition(), ...overrides,
})
const ok = (data: unknown) => ({ code: 0, data })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const editor = () => <MemoryRouter><ScaleEdit /></MemoryRouter>

beforeEach(() => {
  vi.resetAllMocks()
  route.id = 'scale-1'
  api.get.mockResolvedValue(ok(scale()))
  api.put.mockResolvedValue(ok(scale()))
  api.post.mockResolvedValue(ok(scale()))
})

describe('ScaleEdit frozen definition and request ownership', () => {
  it.each([
    ['PUBLISHED', 'CUSTOM_DESCRIPTIVE'], ['DEPRECATED', 'CUSTOM_DESCRIPTIVE'],
    ['ARCHIVED', 'CUSTOM_DESCRIPTIVE'], ['DRAFT', 'STANDARD'],
  ])('keeps all %s %s editing controls and saves disabled', async (status, instrumentClass) => {
    api.get.mockResolvedValue(ok(scale({ status, instrumentClass })))
    const user = userEvent.setup()
    const view = render(editor())
    await screen.findByLabelText('量表名称')
    expect(screen.queryByRole('button', { name: '保存草稿' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '发布描述性量表' })).not.toBeInTheDocument()
    for (const tab of ['基本信息', '响应选项', '题目', '计分', '报告文案']) {
      await user.click(screen.getByRole('button', { name: tab }))
      const controls = view.container.querySelectorAll('section input, section textarea, section select, section button')
      expect(controls.length).toBeGreaterThan(0)
      controls.forEach(control => expect(control).toBeDisabled())
      const save = Array.from(controls).find(control => control.textContent?.startsWith('保存'))!
      fireEvent.click(save)
    }
    expect(api.put).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('waits for authoritative status before showing editable controls', async () => {
    const load = deferred<ReturnType<typeof ok>>()
    api.get.mockReturnValue(load.promise)
    render(editor())
    expect(screen.getByText('正在加载量表编辑器')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存草稿' })).not.toBeInTheDocument()
    await act(async () => load.resolve(ok(scale({ status: 'PUBLISHED' }))))
    expect(screen.getByLabelText('量表名称')).toBeDisabled()
  })

  it('leaves a failed initial load read-only instead of editing an empty draft', async () => {
    api.get.mockRejectedValue({ status: 403, message: '无权查看量表' })
    render(editor())
    await screen.findByText(/无权查看量表/)
    expect(screen.getByLabelText('量表名称')).toBeDisabled()
    expect(screen.queryByRole('button', { name: '保存草稿' })).not.toBeInTheDocument()
  })

  it('ignores an older same-route load that resolves after the current published status', async () => {
    const stale = deferred<ReturnType<typeof ok>>()
    const current = deferred<ReturnType<typeof ok>>()
    api.get.mockReset().mockReturnValueOnce(stale.promise).mockReturnValueOnce(current.promise)
    render(<React.StrictMode>{editor()}</React.StrictMode>)
    await act(async () => current.resolve(ok(scale({ status: 'PUBLISHED', name: '已发布版本' }))))
    expect(screen.getByLabelText('量表名称')).toHaveValue('已发布版本')
    await act(async () => stale.resolve(ok(scale({ name: '旧草稿' }))))
    expect(screen.getByLabelText('量表名称')).toHaveValue('已发布版本')
    expect(screen.getByLabelText('量表名称')).toBeDisabled()
  })

  it('resets immediately for another route and ignores the previous route late load', async () => {
    const old = deferred<ReturnType<typeof ok>>()
    const current = deferred<ReturnType<typeof ok>>()
    api.get.mockImplementation((url: string) => url === '/scales/scale-1' ? old.promise : current.promise)
    const view = render(editor())
    route.id = 'scale-2'
    view.rerender(editor())
    expect(screen.getByText('正在加载量表编辑器')).toBeInTheDocument()
    await act(async () => current.resolve(ok(scale({ id: 'scale-2', name: '另一量表', status: 'PUBLISHED' }))))
    await act(async () => old.resolve(ok(scale({ name: '旧草稿' }))))
    expect(screen.getByLabelText('量表名称')).toHaveValue('另一量表')
    expect(screen.getByLabelText('量表名称')).toBeDisabled()
  })

  it('locks every response control while saving and sends a single definition write', async () => {
    const pending = deferred<ReturnType<typeof ok>>()
    api.put.mockReturnValue(pending.promise)
    const user = userEvent.setup()
    const view = render(editor())
    await user.click(await screen.findByRole('button', { name: '响应选项' }))
    await user.click(screen.getByRole('button', { name: '保存响应集' }))
    view.container.querySelectorAll('section input, section button').forEach(control => expect(control).toBeDisabled())
    await user.click(screen.getByRole('button', { name: '保存响应集' }))
    expect(api.put).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve(ok(scale())))
    await screen.findByText(/已保存，并重新读取确认/)
  })

  it.each([403, 409])('refreshes server state after HTTP %i and freezes a published definition', async status => {
    api.get.mockResolvedValueOnce(ok(scale())).mockResolvedValueOnce(ok(scale({ status: 'PUBLISHED' })))
    api.put.mockRejectedValue({ status, message: '量表已冻结或无权修改' })
    const user = userEvent.setup()
    render(editor())
    await user.click(await screen.findByRole('button', { name: '保存草稿' }))
    await screen.findByText(/量表已冻结或无权修改/)
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('量表名称')).toBeDisabled()
    expect(screen.queryByRole('button', { name: '保存草稿' })).not.toBeInTheDocument()
  })

  it('accepts a conflict envelope, refreshes DRAFT status, and retains edits for an explicit retry', async () => {
    api.put.mockResolvedValueOnce({ code: 409, message: '请重新检查量表状态' }).mockResolvedValueOnce(ok(scale()))
    const user = userEvent.setup()
    render(editor())
    await user.click(await screen.findByRole('button', { name: '题目' }))
    const content = screen.getByPlaceholderText('题目内容')
    await user.clear(content)
    await user.type(content, '保留的本机编辑')
    await user.click(screen.getByRole('button', { name: '保存题目' }))
    await screen.findByText(/请重新检查量表状态/)
    expect(content).toHaveValue('保留的本机编辑')
    expect(content).toBeEnabled()
    expect(api.get).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('button', { name: '保存题目' }))
    await screen.findByText(/已保存，并重新读取确认/)
    expect(api.put).toHaveBeenCalledTimes(2)
    expect(api.put.mock.calls[1][1].definition.items[0].content).toBe('保留的本机编辑')
  })

  it('does not infer write permission from a readable DRAFT after a basic-save 403', async () => {
    api.put.mockRejectedValue({ status: 403, message: '无权限修改此量表' })
    const user = userEvent.setup()
    render(editor())
    await user.click(await screen.findByRole('button', { name: '保存基本信息' }))
    await screen.findByText(/无权限修改此量表/)
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('量表名称')).toBeDisabled()
  })

  it('keeps editing blocked when a conflict refresh fails', async () => {
    api.get.mockResolvedValueOnce(ok(scale())).mockRejectedValueOnce(new Error('网络中断'))
    api.put.mockRejectedValue({ status: 409, message: '量表状态已变更' })
    const user = userEvent.setup()
    render(editor())
    await user.click(await screen.findByRole('button', { name: '保存草稿' }))
    await screen.findByText(/未能刷新状态，已暂停编辑/)
    expect(screen.getByLabelText('量表名称')).toBeDisabled()
  })

  it('does not publish when save readback reports a newly frozen definition', async () => {
    api.get.mockResolvedValueOnce(ok(scale())).mockResolvedValueOnce(ok(scale({ status: 'PUBLISHED' })))
    const user = userEvent.setup()
    render(editor())
    await user.click(await screen.findByRole('button', { name: '发布描述性量表' }))
    await screen.findByText(/量表状态已变更，当前定义只读/)
    expect(api.post).not.toHaveBeenCalled()
    expect(screen.getByLabelText('量表名称')).toBeDisabled()
  })

  it('keeps save and publish one pending action, then locks the published editor', async () => {
    const pending = deferred<ReturnType<typeof ok>>()
    api.post.mockReturnValue(pending.promise)
    const user = userEvent.setup()
    render(editor())
    await user.click(await screen.findByRole('button', { name: '发布描述性量表' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/scales/scale-1/publish', {}))
    expect(screen.getByRole('button', { name: '保存基本信息' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '保存草稿' })).toBeDisabled()
    await act(async () => pending.resolve(ok(scale({ status: 'PUBLISHED' }))))
    await screen.findByText(/量表已发布/)
    expect(screen.getByLabelText('量表名称')).toBeDisabled()
  })

  it.each(['basic', 'definition', 'publish'])('ignores a pending %s write after route change', async action => {
    const pending = deferred<ReturnType<typeof ok>>()
    api.put.mockReturnValue(pending.promise)
    api.get.mockImplementation((url: string) => Promise.resolve(ok(scale(url.endsWith('scale-2') ? { id: 'scale-2', name: '另一量表' } : {}))))
    const user = userEvent.setup()
    const view = render(editor())
    const button = action === 'basic' ? '保存基本信息' : action === 'definition' ? '保存草稿' : '发布描述性量表'
    await user.click(await screen.findByRole('button', { name: button }))
    route.id = 'scale-2'
    view.rerender(editor())
    await screen.findByDisplayValue('另一量表')
    await act(async () => pending.resolve(ok(scale({ status: 'PUBLISHED', name: '旧量表' }))))
    expect(screen.getByLabelText('量表名称')).toHaveValue('另一量表')
    expect(screen.getByLabelText('量表名称')).toBeEnabled()
    expect(api.get.mock.calls.map(([url]) => url)).toEqual(['/scales/scale-1', '/scales/scale-2'])
    expect(api.post).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('ignores an old save readback after navigating away', async () => {
    const pending = deferred<ReturnType<typeof ok>>()
    api.get.mockResolvedValueOnce(ok(scale())).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(ok(scale({ id: 'scale-2', name: '另一量表' })))
    const user = userEvent.setup()
    const view = render(editor())
    await user.click(await screen.findByRole('button', { name: '发布描述性量表' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    route.id = 'scale-2'
    view.rerender(editor())
    await screen.findByDisplayValue('另一量表')
    await act(async () => pending.resolve(ok(scale())))
    expect(api.post).not.toHaveBeenCalled()
    expect(screen.getByLabelText('量表名称')).toHaveValue('另一量表')
    expect(screen.queryByText(/已保存，并重新读取确认/)).not.toBeInTheDocument()
  })

  it('does not navigate back when a previous new-scale create finishes late', async () => {
    route.id = 'new'
    const pending = deferred<ReturnType<typeof ok>>()
    api.post.mockReturnValue(pending.promise)
    const user = userEvent.setup()
    const view = render(editor())
    await user.type(screen.getByLabelText('量表编码'), 'new-scale')
    await user.type(screen.getByLabelText('量表名称'), '新量表')
    await user.click(screen.getByRole('button', { name: '保存基本信息' }))
    expect(screen.getByLabelText('量表编码')).toBeDisabled()
    route.id = 'scale-1'
    view.rerender(editor())
    await screen.findByDisplayValue('自建量表')
    await act(async () => pending.resolve(ok(scale({ id: 'created' }))))
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.getByLabelText('量表名称')).toHaveValue('自建量表')
  })
})
