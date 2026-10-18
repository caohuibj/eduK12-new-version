import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }))
vi.mock('../../api/client', () => ({ default: api }))
import ScaleEdit from '../ScaleEdit'

const definition = () => ({
  schemaVersion: 2,
  source: { title: '教师自建量表', citation: '原始出处', url: 'https://example.com/source' },
  license: { status: 'self_authored', redistribution: 'allowed', note: '允许在本系统内使用' },
  responseSets: [
    { key: 'default', options: [{ value: 'a', label: '没有', score: 1 }, { value: 'b', label: '有时', score: 2 }, { value: 'c', label: '经常', score: 3 }] },
    { key: 'secondary', options: [{ value: 'no', label: '否', score: 0 }, { value: 'yes', label: '是', score: 1 }] },
  ],
  items: [
    { itemCode: 'Q1', content: '第一题', required: true, sortOrder: 1, type: 'single', responseSetKey: 'default', images: [{ asset: { assetId: 'image-asset', contentHash: 'e'.repeat(64), mimeType: 'image/png' }, altText: '题目图片', order: 0 }] },
    { itemCode: 'Q2', content: '第二题', required: true, sortOrder: 2, type: 'single', responseSetKey: 'secondary', video: { schemaVersion: 1, video: { assetId: 'video-asset', contentHash: 'f'.repeat(64), mimeType: 'video/mp4' }, transcript: { language: 'zh', text: '题目视频文字稿' } } },
  ],
  scoring: {
    itemRules: [{ itemCode: 'Q1', transform: { type: 'identity' } }, { itemCode: 'Q2', transform: { type: 'reverse' } }],
    scores: [{ key: 'total', type: 'total', label: '总分', canonical: true, direction: 'descriptive', source: { type: 'items', aggregation: 'sum', items: [{ itemCode: 'Q1', weight: 1 }, { itemCode: 'Q2', weight: 2 }] } }],
  },
  report: { interpretations: [{ scoreKey: 'total', headline: '总分解释', summary: '描述结果', source: { type: 'score_only' }, bands: [], guidance: [] }] },
})
const provenance = {
  schemaVersion: 1, parentId: 'source', parentCode: 'OWN_SCALE', parentVersion: '2.0.0',
  parentDefinitionHash: 'a'.repeat(64), parentScoringHash: 'b'.repeat(64),
  parentCreatorId: 'author', parentSourceHash: 'c'.repeat(64), parentLicenseHash: 'd'.repeat(64),
}
const scale = (overrides: Record<string, unknown> = {}) => ({
  id: 'source', code: 'OWN_SCALE', name: '原始量表', status: 'PUBLISHED', visibility: 'PUBLIC',
  instrumentClass: 'CUSTOM_DESCRIPTIVE', instrumentVersion: '2.0.0', description: '原始说明',
  estimatedTime: 10, instruction: '认真作答', tags: ['自建'], definition: definition(),
  updatedAt: '2026-10-18T01:00:00.000Z', copyEligibility: { allowed: true }, copySource: null,
  ...overrides,
})
const draft = (overrides: Record<string, unknown> = {}) => scale({
  id: 'copy', code: 'OWN_SCALE_COPY', name: '原始量表（副本）', status: 'DRAFT', visibility: 'HIDDEN',
  copyEligibility: { allowed: false }, copySource: provenance, ...overrides,
})
const ok = (data: unknown) => ({ code: 0, data })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
function Navigation() {
  const location = useLocation()
  return <><span data-testid="location">{location.pathname}</span><Link to="/scales/other">查看另一量表</Link><Link to="/elsewhere">离开编辑器</Link></>
}
const editor = (path = '/scales/source') => <MemoryRouter initialEntries={[path]}><Navigation /><Routes><Route path="/scales/:id" element={<ScaleEdit />} /><Route path="/elsewhere" element={<p>其他页面</p>} /><Route path="/scales" element={<p>量表列表</p>} /></Routes></MemoryRouter>

beforeEach(() => {
  vi.resetAllMocks()
  api.get.mockImplementation(async (url: string) => ok(url.endsWith('/copy') ? draft() : scale()))
  api.post.mockResolvedValue(ok(draft()))
})

describe('ScaleEdit safe copy, draft editing and publication', () => {
  it('copies once, edits the independent hidden draft, saves both parts and publishes without changing the original', async () => {
    const original = structuredClone(scale())
    let stored: any = structuredClone(draft())
    const pending = deferred<ReturnType<typeof ok>>()
    let revision = 0
    const nextVersion = () => `2026-10-18T01:00:0${++revision}.000Z`
    api.get.mockImplementation(async (url: string) => ok(structuredClone(url.endsWith('/source') ? original : stored)))
    api.put.mockImplementation(async (url: string, body: any) => {
      expect(body.expectedUpdatedAt).toBe(stored.updatedAt)
      if (url.endsWith('/definition')) stored.definition = structuredClone(body.definition)
      else { const { expectedUpdatedAt: _, ...metadata } = body; stored = { ...stored, ...metadata } }
      stored.updatedAt = nextVersion()
      return ok(structuredClone(stored))
    })
    api.post.mockImplementation((url: string, body: any) => {
      if (url.endsWith('/copy')) return pending.promise
      expect(url).toBe('/scales/copy/publish')
      expect(body.expectedUpdatedAt).toBe(stored.updatedAt)
      stored = { ...stored, status: 'PUBLISHED', copyEligibility: { allowed: true }, updatedAt: nextVersion() }
      return Promise.resolve(ok(structuredClone(stored)))
    })
    const user = userEvent.setup()
    render(editor())
    const copy = await screen.findByRole('button', { name: '复制为新草稿' })
    expect(screen.getByLabelText('量表名称')).toBeDisabled()
    expect(screen.queryByRole('button', { name: '保存草稿' })).not.toBeInTheDocument()
    fireEvent.click(copy)
    fireEvent.click(copy)
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith('/scales/source/copy', {})
    expect(screen.getByRole('button', { name: '正在创建新草稿…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '计分预览' })).toBeDisabled()
    await act(async () => pending.resolve(ok(structuredClone(stored))))
    await screen.findByDisplayValue('原始量表（副本）')
    expect(screen.getByTestId('location')).toHaveTextContent('/scales/copy')
    expect(screen.getByLabelText('量表名称')).toBeEnabled()
    expect(screen.getByLabelText('可见性')).toHaveValue('HIDDEN')
    const source = screen.getByRole('complementary', { name: '量表副本来源' })
    expect(within(source).getByRole('link', { name: 'OWN_SCALE' })).toHaveAttribute('href', '/scales/source')
    expect(within(source).getByText('版本 2.0.0', { exact: false })).toBeInTheDocument()
    await user.clear(screen.getByLabelText('量表名称'))
    await user.type(screen.getByLabelText('量表名称'), '修改后的独立量表')
    expect(screen.getByText('基本信息待保存')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '题目' }))
    await user.clear(screen.getAllByPlaceholderText('题目内容')[0])
    await user.type(screen.getAllByPlaceholderText('题目内容')[0], '修改后的第一题')
    await user.click(screen.getByRole('button', { name: '保存草稿' }))
    await screen.findByText(/基本信息、题目与定义已保存/)
    expect(api.put.mock.calls.map(([url]) => url)).toEqual(['/scales/copy', '/scales/copy/definition'])
    expect(stored.name).toBe('修改后的独立量表')
    expect(stored.definition.items[0].content).toBe('修改后的第一题')
    expect(stored.definition.items[0].images).toEqual(original.definition.items[0].images)
    expect(stored.definition.items[1].video).toEqual(original.definition.items[1].video)
    expect(stored.copySource).toEqual(provenance)
    expect(screen.getByText('草稿内容已保存')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '发布描述性量表' }))
    await screen.findByText(/量表已发布。/)
    expect(screen.getByText('已发布 · 只读')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存草稿' })).not.toBeInTheDocument()
    await user.click(within(source).getByRole('link', { name: 'OWN_SCALE' }))
    await screen.findByDisplayValue('原始量表')
    expect(screen.getByLabelText('量表名称')).toBeDisabled()
    expect(original).toEqual(scale())
    expect(api.put.mock.calls.every(([url]) => url.startsWith('/scales/copy'))).toBe(true)
  })

  it.each([
    ['shared', { copyEligibility: { allowed: false, reason: '仅创建者可复制此量表' } }],
    ['standard', { instrumentClass: 'STANDARD', copyEligibility: { allowed: true } }],
    ['unknown eligibility', { copyEligibility: undefined }],
    ['restricted license', { copyEligibility: { allowed: false, reason: '当前授权不允许复制' } }],
    ['draft', { status: 'DRAFT', copyEligibility: { allowed: true } }],
    ['archived', { status: 'ARCHIVED', copyEligibility: { allowed: true } }],
  ])('does not offer copy for %s content', async (_name, overrides) => {
    api.get.mockResolvedValue(ok(scale(overrides)))
    render(editor())
    await screen.findByLabelText('量表名称')
    expect(screen.queryByRole('button', { name: '复制为新草稿' })).not.toBeInTheDocument()
    if (!('status' in overrides) || overrides.status !== 'DRAFT') expect(screen.getByLabelText('量表名称')).toBeDisabled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows a copy failure without changing the original and permits an explicit retry', async () => {
    api.post.mockRejectedValueOnce(new Error('连接中断，复制失败')).mockResolvedValueOnce(ok(draft()))
    const user = userEvent.setup()
    render(editor())
    await user.click(await screen.findByRole('button', { name: '复制为新草稿' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent('连接中断，复制失败')
    expect(screen.getByTestId('location')).toHaveTextContent('/scales/source')
    expect(screen.getByLabelText('量表名称')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '复制为新草稿' }))
    await screen.findByDisplayValue('原始量表（副本）')
    expect(api.post).toHaveBeenCalledTimes(2)
    expect(api.put).not.toHaveBeenCalled()
  })

  it.each([403, 409])('refreshes and removes stale copy permission after HTTP %i', async status => {
    api.get.mockResolvedValueOnce(ok(scale())).mockResolvedValueOnce(ok(scale({ copyEligibility: { allowed: false, reason: '当前授权不允许复制' } })))
    api.post.mockRejectedValue({ status, message: '复制权限已变更' })
    const user = userEvent.setup()
    render(editor())
    await user.click(await screen.findByRole('button', { name: '复制为新草稿' }))
    await screen.findByText(/复制权限已变更/)
    expect(screen.queryByRole('button', { name: '复制为新草稿' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('量表名称')).toBeDisabled()
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it.each([
    { id: 'source' }, { id: '' }, { status: 'PUBLISHED' }, { visibility: 'PUBLIC' }, { instrumentClass: 'STANDARD' },
  ])('rejects an unsafe copy response %j', async overrides => {
    api.post.mockResolvedValue(ok(draft(overrides)))
    const user = userEvent.setup()
    render(editor())
    await user.click(await screen.findByRole('button', { name: '复制为新草稿' }))
    await screen.findByText(/未能确认新草稿/)
    expect(screen.getByTestId('location')).toHaveTextContent('/scales/source')
    expect(screen.getByLabelText('量表名称')).toBeDisabled()
  })

  it.each(['resolve', 'reject'])('ignores a late copy %s after a newer scale route', async completion => {
    const pending = deferred<ReturnType<typeof ok>>()
    api.post.mockReturnValue(pending.promise)
    api.get.mockImplementation(async (url: string) => ok(url.endsWith('/other') ? draft({ id: 'other', name: '另一量表' }) : scale()))
    const user = userEvent.setup()
    render(editor())
    await user.click(await screen.findByRole('button', { name: '复制为新草稿' }))
    await user.click(screen.getByRole('link', { name: '查看另一量表' }))
    await screen.findByDisplayValue('另一量表')
    await act(async () => completion === 'resolve' ? pending.resolve(ok(draft())) : pending.reject({ status: 403, message: '旧请求拒绝' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/scales/other')
    expect(screen.getByLabelText('量表名称')).toHaveValue('另一量表')
    expect(screen.queryByText(/旧请求拒绝/)).not.toBeInTheDocument()
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('does not navigate after the editor unmounts while copying', async () => {
    const pending = deferred<ReturnType<typeof ok>>()
    api.post.mockReturnValue(pending.promise)
    const user = userEvent.setup()
    render(editor())
    await user.click(await screen.findByRole('button', { name: '复制为新草稿' }))
    await user.click(screen.getByRole('link', { name: '离开编辑器' }))
    await screen.findByText('其他页面')
    await act(async () => pending.resolve(ok(draft())))
    expect(screen.getByTestId('location')).toHaveTextContent('/elsewhere')
    expect(screen.queryByLabelText('量表名称')).not.toBeInTheDocument()
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('preserves pending metadata when saving definitions and preserves all response sets and media', async () => {
    const stored: any = draft()
    api.get.mockImplementation(async () => ok(structuredClone(stored)))
    api.put.mockImplementation(async (_url, body) => { stored.definition = structuredClone(body.definition); return ok(structuredClone(stored)) })
    const user = userEvent.setup()
    render(editor('/scales/copy'))
    await screen.findByLabelText('量表名称')
    await user.clear(screen.getByLabelText('量表名称'))
    await user.type(screen.getByLabelText('量表名称'), '待保存的名称')
    await user.click(screen.getByRole('button', { name: '响应选项' }))
    expect(screen.getByText(/其余响应集将完整保留/)).toBeInTheDocument()
    await user.clear(screen.getAllByPlaceholderText('显示标签')[0])
    await user.type(screen.getAllByPlaceholderText('显示标签')[0], '从不')
    await user.click(screen.getByRole('button', { name: '增加选项' }))
    const remove = screen.getAllByRole('button').find(button => button.className.includes('text-red-500'))!
    await user.click(remove)
    await user.click(screen.getByRole('button', { name: '保存响应集' }))
    await screen.findByText(/已保存，并重新读取确认/)
    expect(stored.definition.responseSets[1]).toEqual(definition().responseSets[1])
    expect(stored.definition.items[0].images).toEqual(definition().items[0].images)
    expect(stored.definition.items[1].video).toEqual(definition().items[1].video)
    expect(stored.definition.source).toEqual(definition().source)
    expect(stored.definition.license).toEqual(definition().license)
    await user.click(screen.getByRole('button', { name: '基本信息' }))
    expect(screen.getByLabelText('量表名称')).toHaveValue('待保存的名称')
    expect(screen.getByText('基本信息待保存')).toBeInTheDocument()
    expect(stored.name).toBe('原始量表（副本）')
  })

  it('saves edited metadata before publishing and carries each fresh version into the next write', async () => {
    let stored: any = draft()
    api.get.mockImplementation(async () => ok(structuredClone(stored)))
    api.put.mockImplementation(async (url, body) => {
      expect(body.expectedUpdatedAt).toBe(stored.updatedAt)
      if (url.endsWith('/definition')) {
        stored.definition = structuredClone(body.definition)
        stored.updatedAt = '2026-10-18T01:02:00.000Z'
      } else {
        stored.name = body.name
        stored.updatedAt = '2026-10-18T01:01:00.000Z'
      }
      return ok(structuredClone(stored))
    })
    api.post.mockImplementation(async (_url, body) => {
      expect(body.expectedUpdatedAt).toBe('2026-10-18T01:02:00.000Z')
      stored = { ...stored, status: 'PUBLISHED' }
      return ok(structuredClone(stored))
    })
    const user = userEvent.setup()
    render(editor('/scales/copy'))
    await screen.findByLabelText('量表名称')
    await user.clear(screen.getByLabelText('量表名称'))
    await user.type(screen.getByLabelText('量表名称'), '直接发布新名称')
    await user.click(screen.getByRole('button', { name: '发布描述性量表' }))
    await screen.findByText(/量表已发布。/)
    expect(api.put.mock.calls.map(([url]) => url)).toEqual(['/scales/copy', '/scales/copy/definition'])
    expect(stored.name).toBe('直接发布新名称')
    expect(screen.getByLabelText('量表名称')).toBeDisabled()
  })

  it('pauses publication when a concurrent write lands between definition save and readback', async () => {
    const written = draft({ updatedAt: '2026-10-18T01:01:00.000Z' })
    const newer = draft({ updatedAt: '2026-10-18T01:02:00.000Z' })
    api.get.mockResolvedValueOnce(ok(draft())).mockResolvedValue(ok(newer))
    api.put.mockResolvedValue(ok(written))
    const user = userEvent.setup()
    render(editor('/scales/copy'))
    await user.click(await screen.findByRole('button', { name: '题目' }))
    await user.clear(screen.getAllByPlaceholderText('题目内容')[0])
    await user.type(screen.getAllByPlaceholderText('题目内容')[0], '仍需核对的本页编辑')
    await user.click(screen.getByRole('button', { name: '发布描述性量表' }))
    await screen.findByText(/保存后量表又发生了修改，发布已暂停/)
    expect(api.post).not.toHaveBeenCalled()
    expect(api.put).toHaveBeenCalledTimes(1)
    expect(screen.getAllByPlaceholderText('题目内容')[0]).toHaveValue('仍需核对的本页编辑')
  })

  it('keeps local edits visible but locked when a conflict reveals an already published scale', async () => {
    api.get.mockResolvedValueOnce(ok(draft())).mockResolvedValue(ok(draft({ status: 'PUBLISHED' })))
    api.put.mockRejectedValue({ status: 409, message: '另一窗口已发布量表' })
    const user = userEvent.setup()
    render(editor('/scales/copy'))
    await screen.findByLabelText('量表名称')
    await user.clear(screen.getByLabelText('量表名称'))
    await user.type(screen.getByLabelText('量表名称'), '本页未提交名称')
    await user.click(screen.getByRole('button', { name: '题目' }))
    await user.clear(screen.getAllByPlaceholderText('题目内容')[0])
    await user.type(screen.getAllByPlaceholderText('题目内容')[0], '本页未提交题目')
    await user.click(screen.getByRole('button', { name: '保存草稿' }))
    await screen.findByText(/另一窗口已发布量表/)
    expect(screen.getAllByPlaceholderText('题目内容')[0]).toHaveValue('本页未提交题目')
    expect(screen.getAllByPlaceholderText('题目内容')[0]).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '基本信息' }))
    expect(screen.getByLabelText('量表名称')).toHaveValue('本页未提交名称')
    expect(screen.getByLabelText('量表名称')).toBeDisabled()
    expect(screen.queryByRole('button', { name: '保存草稿' })).not.toBeInTheDocument()
  })

  it('previews each item using its own response set', async () => {
    api.post.mockResolvedValue(ok({ scores: [] }))
    const user = userEvent.setup()
    render(editor())
    await user.click(await screen.findByRole('button', { name: '计分预览' }))
    expect(api.post).toHaveBeenCalledWith('/scales/source/preview', { answers: [
      { itemCode: 'Q1', responseValue: 'a' }, { itemCode: 'Q2', responseValue: 'no' },
    ] })
  })

  it('retains metadata and definition on a 409, does not publish, and uses the refreshed version only after explicit retry', async () => {
    const refreshed = draft({ name: '其他窗口名称', updatedAt: '2026-10-18T01:01:00.000Z' })
    api.get.mockResolvedValueOnce(ok(draft())).mockResolvedValue(ok(refreshed))
    api.put.mockRejectedValueOnce({ status: 409, message: '量表已由其他窗口修改' }).mockResolvedValue(ok(refreshed))
    const user = userEvent.setup()
    render(editor('/scales/copy'))
    await screen.findByLabelText('量表名称')
    await user.clear(screen.getByLabelText('量表名称'))
    await user.type(screen.getByLabelText('量表名称'), '本页待保存名称')
    await user.click(screen.getByRole('button', { name: '题目' }))
    await user.clear(screen.getAllByPlaceholderText('题目内容')[0])
    await user.type(screen.getAllByPlaceholderText('题目内容')[0], '本页待保存题目')
    await user.click(screen.getByRole('button', { name: '发布描述性量表' }))
    await screen.findByText(/未自动重试/)
    expect(api.put).toHaveBeenCalledTimes(1)
    expect(api.post).not.toHaveBeenCalled()
    expect(screen.getAllByPlaceholderText('题目内容')[0]).toHaveValue('本页待保存题目')
    await user.click(screen.getByRole('button', { name: '基本信息' }))
    expect(screen.getByLabelText('量表名称')).toHaveValue('本页待保存名称')
    await user.click(screen.getByRole('button', { name: '保存基本信息' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2))
    expect(api.put.mock.calls[1][1]).toMatchObject({ name: '本页待保存名称', expectedUpdatedAt: refreshed.updatedAt })
  })
})
