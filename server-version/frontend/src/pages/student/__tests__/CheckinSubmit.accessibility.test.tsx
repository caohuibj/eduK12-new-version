import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CheckinSubmission, DocumentItem } from '../../../types'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), training: vi.fn(), preview: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: { get: mocks.get, post: mocks.post } }))
vi.mock('../../../training/context', () => ({ isTrainingHost: mocks.training }))
vi.mock('../../../components/MediaRenderer', () => ({ VideoList: () => null, ImageList: () => null }))
vi.mock('../../../components/PdfViewer', () => ({ default: (props: { isOpen: boolean; title: string; onClose: () => void }) => {
  mocks.preview(props)
  return props.isOpen ? <div role="dialog" aria-label={props.title}><button type="button" onClick={props.onClose}>关闭合成文档</button></div> : null
} }))
import CheckinSubmit from '../CheckinSubmit'

const checkin = { id: 'c1', title: '合成打卡', allowViewOthers: false, documents: [] as DocumentItem[] }
type SubmissionFixture = Pick<CheckinSubmission, 'id' | 'content' | 'images' | 'revision' | 'createdAt'>
function load(data = checkin, submission: SubmissionFixture | null = null) {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/checkins/c1') return { code: 0, data }
    if (url === '/checkins/c1/my-submission') return { code: 0, data: submission }
    throw new Error(`Unexpected request: ${url}`)
  })
}
function show() {
  return render(<MemoryRouter initialEntries={['/student/checkins/c1']}><Routes><Route path="/student/checkins/:checkinId" element={<CheckinSubmit />} /></Routes></MemoryRouter>)
}
function fileInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('input[type="file"]')!
}
function uploadFile(input: HTMLInputElement, name = 'image.png') {
  const file = new File(['image'], name, { type: 'image/png' })
  fireEvent.change(input, { target: { files: [file] } })
  return file
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.training.mockReturnValue(true)
  mocks.post.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  load()
})
afterEach(() => vi.restoreAllMocks())

it.each([true, false])('keeps the content label, native required validation and picker keyboard operation on both hosts (Training=%s)', async training => {
  mocks.training.mockReturnValue(training)
  const user = userEvent.setup()
  const initialFocus = document.activeElement
  const { container } = show()
  const content = await screen.findByRole('textbox', { name: '打卡内容' })
  expect(document.activeElement).toBe(initialFocus)
  expect(content).toBeRequired()
  expect(screen.getByText('打卡内容', { selector: 'label' })).toHaveAttribute('for', content.id)
  await user.click(screen.getByRole('button', { name: '提交打卡' }))
  expect(mocks.post).not.toHaveBeenCalled()
  const add = screen.getByRole('button', { name: '添加图片' })
  const input = fileInput(container)
  expect(add).toHaveAttribute('type', 'button')
  expect(add).toHaveAccessibleDescription('最多上传 9 张图片')
  expect(input).toHaveAttribute('accept', 'image/*')
  expect(input.closest('button')).toBeNull()
  const click = vi.spyOn(input, 'click').mockImplementation(() => {})
  content.focus()
  await user.tab()
  expect(add).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(click).toHaveBeenCalledTimes(1)
  await user.keyboard(' ')
  expect(click).toHaveBeenCalledTimes(2)
  fireEvent(input, new Event('cancel', { bubbles: true }))
  fireEvent.change(input, { target: { files: [] } })
  expect(mocks.post).not.toHaveBeenCalled()
  expect(screen.getByRole('textbox', { name: '打卡内容' })).toBeInTheDocument()
})

it.each([true, false])('opens the same authorized document with Enter and Space on both hosts (Training=%s)', async training => {
  mocks.training.mockReturnValue(training)
  const user = userEvent.setup()
  const doc = { id: 'document-1', title: '打卡附件', fileName: 'notes.pdf', url: '/api/assets/document-1/content', allowDownload: false }
  load({ ...checkin, documents: [doc] }); show()
  const trigger = await screen.findByRole('button', { name: /打卡附件/ })
  await user.tab()
  await user.tab()
  expect(trigger).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(screen.getByRole('dialog', { name: doc.title })).toBeInTheDocument()
  expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ url: doc.url, title: doc.title, allowDownload: false, isOpen: true }))
  await user.click(screen.getByRole('button', { name: '关闭合成文档' }))
  trigger.focus()
  await user.keyboard(' ')
  expect(screen.getByRole('dialog', { name: doc.title })).toBeInTheDocument()
  expect(mocks.post).not.toHaveBeenCalled()
})

it.each([true, false])('focuses repeated upload errors only in Training and preserves the upload contract (Training=%s)', async training => {
  mocks.training.mockReturnValue(training)
  const user = userEvent.setup()
  const { container } = show()
  const content = await screen.findByRole('textbox', { name: '打卡内容' })
  await user.type(content, '保留学习记录')
  const input = fileInput(container)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let reject!: (reason: unknown) => void
    mocks.post.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
    content.focus()
    const file = uploadFile(input, `image-${attempt}.png`)
    expect(screen.getByRole('button', { name: '添加图片' })).toBeDisabled()
    expect(input).toBeDisabled()
    await act(async () => reject(new Error('Network Error')))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('图片上传失败，请重试。')
    if (training) expect(alert.parentElement).toHaveFocus()
    else { expect(content).toHaveFocus(); expect(alert.parentElement).not.toHaveAttribute('tabindex') }
    expect(content).toHaveValue('保留学习记录')
    expect(screen.getByRole('button', { name: '添加图片' })).toBeEnabled()
    const [url, body, options] = mocks.post.mock.calls[attempt]
    expect(url).toBe('/checkins/c1/submission-image')
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('image')).toBe(file)
    expect(options).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
  }
  expect(mocks.post).toHaveBeenCalledTimes(2)
})

it('keeps the nine-image cap, named removals and asset-only submission payload', async () => {
  const user = userEvent.setup()
  const { container } = show()
  const content = await screen.findByRole('textbox', { name: '打卡内容' })
  for (let index = 1; index <= 9; index += 1) {
    mocks.post.mockResolvedValueOnce({ code: 0, data: { assetId: `asset-${index}`, url: `/api/assets/asset-${index}/content` } })
    content.focus()
    uploadFile(fileInput(container), `image-${index}.png`)
    expect(await screen.findByRole('button', { name: `移除打卡图片 ${index}` })).toBeInTheDocument()
    expect(content).toHaveFocus()
  }
  expect(screen.queryByRole('button', { name: '添加图片' })).not.toBeInTheDocument()
  expect(container.querySelector('input[type="file"]')).toBeNull()
  await user.click(screen.getByRole('button', { name: '移除打卡图片 4' }))
  expect(screen.getAllByRole('button', { name: /^移除打卡图片/ })).toHaveLength(8)
  expect(screen.getByRole('button', { name: '添加图片' })).toBeEnabled()
  await user.type(screen.getByRole('textbox', { name: '打卡内容' }), '附图记录')
  mocks.post.mockResolvedValueOnce({ code: 1, message: '暂未提交' })
  await user.click(screen.getByRole('button', { name: '提交打卡' }))
  await screen.findByRole('alert')
  expect(mocks.post.mock.calls[9][0]).toBe('/checkins/c1/submit')
  expect(mocks.post.mock.calls[9][1]).toEqual({ content: '附图记录', images: [1, 2, 3, 5, 6, 7, 8, 9].map(index => ({ assetId: `asset-${index}` })), expectedRevision: 0 })
  expect(mocks.post.mock.calls[9][2].headers['Idempotency-Key']).toEqual(expect.any(String))
})

it.each([true, false])('preserves pending and same-payload retry identity while focusing submission errors only in Training (Training=%s)', async training => {
  mocks.training.mockReturnValue(training)
  const user = userEvent.setup()
  show()
  const content = await screen.findByRole('textbox', { name: '打卡内容' })
  await user.type(content, '保留学习记录')
  const submit = screen.getByRole('button', { name: '提交打卡' })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let reject!: (reason: unknown) => void
    mocks.post.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
    content.focus()
    fireEvent.submit(submit.closest('form')!)
    fireEvent.submit(submit.closest('form')!)
    expect(submit).toBeDisabled()
    expect(mocks.post).toHaveBeenCalledTimes(attempt + 1)
    await act(async () => reject({ status: 500, message: '稍后重试' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('稍后重试')
    if (training) expect(alert.parentElement).toHaveFocus()
    else expect(content).toHaveFocus()
    expect(content).toHaveValue('保留学习记录')
    expect(submit).toBeEnabled()
  }
  expect(mocks.post.mock.calls[1]).toEqual(mocks.post.mock.calls[0])
  expect(mocks.post.mock.calls[0]).toEqual(['/checkins/c1/submit', { content: '保留学习记录', images: [], expectedRevision: 0 }, { headers: { 'Idempotency-Key': expect.any(String) } }])
})

it.each([
  [true, true], [false, true], [true, false],
])('keeps accepted-write success through hydration without refocusing or resubmitting (Training=%s, hydration=%s)', async (training, hydrates) => {
  mocks.training.mockReturnValue(training)
  const user = userEvent.setup()
  show()
  await user.type(await screen.findByRole('textbox', { name: '打卡内容' }), '已接收记录')
  let accept!: (value: unknown) => void
  mocks.post.mockImplementationOnce(() => new Promise(resolve => { accept = resolve }))
  await user.click(screen.getByRole('button', { name: '提交打卡' }))
  if (hydrates) load(checkin, { id: 's1', content: '已接收记录', images: [], revision: 1, createdAt: '2026-10-19T00:00:00Z' })
  else mocks.get.mockRejectedValue(new Error('Hydration unavailable'))
  const focus = vi.spyOn(HTMLElement.prototype, 'focus')
  await act(async () => accept({ code: 0 }))
  expect(await screen.findByRole('status')).toHaveTextContent('打卡已成功提交。')
  if (hydrates) expect(await screen.findByText('我的打卡')).toBeInTheDocument()
  else expect(screen.getByRole('textbox', { name: '打卡内容' })).toHaveValue('已接收记录')
  expect(focus).not.toHaveBeenCalled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(mocks.post).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(mocks.get.mock.calls.filter(([url]) => url === '/checkins/c1/my-submission')).toHaveLength(2))
})
