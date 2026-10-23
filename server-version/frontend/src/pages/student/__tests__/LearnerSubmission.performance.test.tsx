import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), sanitize: vi.fn(), parse: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: { get: mocks.get, post: mocks.post } }))
vi.mock('../../../training/context', () => ({ isTrainingHost: () => false }))
vi.mock('../../../utils/sanitize', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../utils/sanitize')>()
  return { ...actual, sanitizeHtml: mocks.sanitize.mockImplementation(actual.sanitizeHtml) }
})
vi.mock('../../../utils/mediaUtils', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../utils/mediaUtils')>()
  return { ...actual, parseMediaItems: mocks.parse.mockImplementation(actual.parseMediaItems) }
})
import AssignmentSubmit from '../AssignmentSubmit'
import CheckinSubmit from '../CheckinSubmit'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}
let navigate: ReturnType<typeof useNavigate>
function Navigation() { navigate = useNavigate(); return null }
const fixtures = [
  { name: 'assignment', path: 'assignments', param: 'assignmentId', component: AssignmentSubmit, label: '作答内容', button: '提交练习' },
  { name: 'checkin', path: 'checkins', param: 'checkinId', component: CheckinSubmit, label: '打卡内容', button: '提交打卡' },
]
const detail = (id = 'one') => ({ id, title: `任务 ${id}`, content: '<p>安全说明</p><script>bad()</script>', questions: [], allowViewOthers: false, mySubmission: null,
  videos: [{ url: '/uploads/video.mp4' }], images: [{ url: '/uploads/image.png' }] })
function show(fixture: typeof fixtures[number]) {
  const Component = fixture.component
  return render(<MemoryRouter initialEntries={[`/student/${fixture.path}/one`]}><Navigation /><Routes>
    <Route path={`/student/${fixture.path}/:${fixture.param}`} element={<Component />} />
  </Routes></MemoryRouter>)
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockImplementation(async (url: string) => ({ code: 0, data: url.endsWith('/my-submission') ? null : detail(url.split('/').pop()) }))
  mocks.post.mockReset()
  vi.spyOn(window, 'alert').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe.each(fixtures)('$name learner input and route isolation', fixture => {
  it('does not sanitize, parse static media or render media again for 20 input updates', async () => {
    const { container } = show(fixture)
    const input = await screen.findByRole('textbox', { name: fixture.label })
    await screen.findByRole('heading', { name: /相关图片/ })
    await screen.findByRole('heading', { name: /关联视频|相关视频/ })
    expect(container.querySelector('script')).toBeNull()
    const baseline = [mocks.sanitize.mock.calls.length, mocks.parse.mock.calls.length]
    for (let index = 1; index <= 20; index += 1) fireEvent.change(input, { target: { value: '答'.repeat(index) } })
    expect(input).toHaveValue('答'.repeat(20))
    expect([mocks.sanitize.mock.calls.length, mocks.parse.mock.calls.length]).toEqual(baseline)
    expect(mocks.post).not.toHaveBeenCalled()
    expect(mocks.get).toHaveBeenCalledTimes(fixture.name === 'assignment' ? 1 : 2)
  })

  it.each(['success', 'failure'])('ignores a late old-route detail %s without replacing the new draft', async outcome => {
    const old = deferred<any>()
    mocks.get.mockImplementation(async (url: string) => {
      if (url === `/${fixture.path}/one`) return old.promise
      return { code: 0, data: url.endsWith('/my-submission') ? null : detail('two') }
    })
    show(fixture)
    await act(async () => navigate(`/student/${fixture.path}/two`))
    const input = await screen.findByRole('textbox', { name: fixture.label })
    fireEvent.change(input, { target: { value: '新任务草稿' } })
    await act(async () => outcome === 'success' ? old.resolve({ code: 0, data: { ...detail('one'), mySubmission: { id: 'old-submission', content: '旧答案', revision: 8 } } }) : old.reject(new Error('old request failed')))
    expect(screen.getByText('任务 two')).toBeInTheDocument()
    expect(input).toHaveValue('新任务草稿')
    expect(screen.queryByText('任务 one')).not.toBeInTheDocument()
  })

  it.each(['success', 'failure'])('ignores old-route submit %s without refreshing or altering a new pending submit', async outcome => {
    const oldPost = deferred<any>()
    const newPost = deferred<any>()
    mocks.post.mockImplementationOnce(() => oldPost.promise).mockImplementationOnce(() => newPost.promise)
    show(fixture)
    fireEvent.change(await screen.findByRole('textbox', { name: fixture.label }), { target: { value: '旧答案' } })
    fireEvent.submit(screen.getByRole('button', { name: fixture.button }).closest('form')!)
    await act(async () => navigate(`/student/${fixture.path}/two`))
    const input = await screen.findByRole('textbox', { name: fixture.label })
    expect(input).toHaveValue('')
    fireEvent.change(input, { target: { value: '新任务草稿' } })
    const form = screen.getByRole('button', { name: fixture.button }).closest('form')!
    fireEvent.submit(form)
    const gets = mocks.get.mock.calls.length
    await act(async () => outcome === 'success' ? oldPost.resolve({ code: 0 }) : oldPost.reject(new Error('old failure')))
    expect(input).toHaveValue('新任务草稿')
    expect(screen.getByRole('button', { name: /提交中/ })).toBeDisabled()
    fireEvent.submit(form)
    expect(mocks.post).toHaveBeenCalledTimes(2)
    expect(mocks.get).toHaveBeenCalledTimes(gets)
    expect(window.alert).not.toHaveBeenCalled()
    expect(mocks.post.mock.calls[0][2].headers['Idempotency-Key']).not.toBe(mocks.post.mock.calls[1][2].headers['Idempotency-Key'])
    await act(async () => newPost.reject(new Error('retry new request')))
  })

  it('re-sanitizes changed instructions on the retained fresh post-submit read', async () => {
    show(fixture)
    fireEvent.change(await screen.findByRole('textbox', { name: fixture.label }), { target: { value: '完整答案' } })
    const revisedContent = '<strong>更新说明</strong><img src=x onerror="bad()">'
    mocks.get.mockImplementation(async (url: string) => ({ code: 0, data: url.endsWith('/my-submission') ? null : { ...detail(), content: revisedContent } }))
    mocks.post.mockResolvedValue({ code: 0 })
    fireEvent.submit(screen.getByRole('button', { name: fixture.button }).closest('form')!)
    await screen.findByText('更新说明')
    expect(mocks.sanitize).toHaveBeenCalledWith(revisedContent)
    expect(document.querySelector('[onerror]')).toBeNull()
    expect(mocks.get).toHaveBeenCalledTimes(fixture.name === 'assignment' ? 2 : 4)
  })
})

it('does not attach a late uploaded image to another checkin', async () => {
  const pending = deferred<any>()
  mocks.post.mockReturnValue(pending.promise)
  const { container } = show(fixtures[1])
  await screen.findByRole('textbox', { name: '打卡内容' })
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['x'], 'one.png', { type: 'image/png' })] } })
  await act(async () => navigate('/student/checkins/two'))
  fireEvent.change(await screen.findByRole('textbox', { name: '打卡内容' }), { target: { value: '新草稿' } })
  await act(async () => pending.resolve({ code: 0, data: { assetId: 'old-asset', url: '/uploads/old.png' } }))
  expect(screen.queryByRole('button', { name: '移除打卡图片 1' })).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '打卡内容' })).toHaveValue('新草稿')
  expect(screen.getByRole('button', { name: '添加图片' })).toBeEnabled()
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1))
})

it('ignores a late legacy raw-answer fallback after changing assignments', async () => {
  const raw = deferred<any>()
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/assignments/one/my-submission') return raw.promise
    if (url === '/assignments/one') return { code: 0, data: { ...detail('one'), mySubmission: { id: 'legacy', answers: { assetId: '旧答案', url: null } } } }
    return { code: 0, data: detail('two') }
  })
  show(fixtures[0])
  await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/assignments/one/my-submission'))
  await act(async () => navigate('/student/assignments/two'))
  const input = await screen.findByRole('textbox', { name: '作答内容' })
  fireEvent.change(input, { target: { value: '新草稿' } })
  await act(async () => raw.resolve({ code: 0, data: { id: 'legacy', content: '旧内容', answers: { assetId: '旧答案', url: '旧答案二' }, revision: 7 } }))
  expect(screen.getByText('任务 two')).toBeInTheDocument()
  expect(input).toHaveValue('新草稿')
})
