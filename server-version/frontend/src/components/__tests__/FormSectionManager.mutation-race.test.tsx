import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import FormSectionManager from '../FormSectionManager'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../../api/client', () => ({ default: { get, post } }))
function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const a = '/general-questionnaires/A', b = '/questionnaires/B'
beforeEach(() => {
  get.mockReset().mockImplementation(async (path: string) => {
    if (![a, b].some(base => path === `${base}/form-sections?include=units`)) throw Error('Unexpected synthetic GET: ' + path)
    const id = path.startsWith(a) ? 'A' : 'B'
    return { code: 0, data: { list: [], units: [{ id, type: 'scale', label: `${id} current content`, position: 0, contextSection: false }] } }
  })
  post.mockReset()
})

it('does not start an obsolete reload after a previous resource save succeeds', async () => {
  const pending = deferred(), changedA = vi.fn(), changedB = vi.fn()
  post.mockReturnValueOnce(pending.promise)
  const view = render(<FormSectionManager basePath={a} onChange={changedA} />)
  await screen.findByText('A current content')
  fireEvent.click(screen.getByRole('button', { name: '新增区段' }))
  expect(post).toHaveBeenCalledWith(`${a}/form-sections`, { title: '新表单区段' })
  view.rerender(<FormSectionManager basePath={b} onChange={changedB} />)
  await screen.findByText('B current content')
  await act(async () => { pending.resolve({ code: 0 }) })
  expect(get).toHaveBeenCalledTimes(2)
  expect(screen.getByText('B current content')).toBeInTheDocument()
  expect(screen.queryByText('A current content')).toBeNull()
  expect(changedA).not.toHaveBeenCalled()
  expect(changedB).not.toHaveBeenCalled()
})

it('does not publish a previous resource save failure into the current editor', async () => {
  const pending = deferred()
  post.mockReturnValueOnce(pending.promise)
  const view = render(<FormSectionManager basePath={a} />)
  await screen.findByText('A current content')
  fireEvent.click(screen.getByRole('button', { name: '新增区段' }))
  view.rerender(<FormSectionManager basePath={b} />)
  await screen.findByText('B current content')
  await act(async () => { pending.reject({ status: 400, message: '旧编辑器保存失败' }) })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByText('B current content')).toBeInTheDocument()
})

it('keeps a new resource save busy when the old resource save settles', async () => {
  const old = deferred(), current = deferred(), changed = vi.fn()
  post.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  const view = render(<FormSectionManager basePath={a} />)
  await screen.findByText('A current content')
  fireEvent.click(screen.getByRole('button', { name: '新增区段' }))
  view.rerender(<FormSectionManager basePath={b} onChange={changed} />)
  await screen.findByText('B current content')
  expect(screen.getByRole('button', { name: '新增区段' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: '新增区段' }))
  await act(async () => { old.resolve({ code: 0 }) })
  expect(screen.getByRole('button', { name: '新增区段' })).toBeDisabled()
  expect(changed).not.toHaveBeenCalled()
  await act(async () => { current.resolve({ code: 0 }) })
  await waitFor(() => expect(screen.getByRole('button', { name: '新增区段' })).toBeEnabled())
  expect(changed).toHaveBeenCalledTimes(1)
})

it('does not reload or notify a parent after the saving editor unmounts', async () => {
  const pending = deferred(), changed = vi.fn()
  post.mockReturnValueOnce(pending.promise)
  const view = render(<FormSectionManager basePath={a} onChange={changed} />)
  await screen.findByText('A current content')
  fireEvent.click(screen.getByRole('button', { name: '新增区段' }))
  view.unmount()
  await act(async () => { pending.resolve({ code: 0 }) })
  expect(get).toHaveBeenCalledTimes(1)
  expect(changed).not.toHaveBeenCalled()
})

it('retains same-resource save completion across a parent refresh', async () => {
  const pending = deferred(), changed = vi.fn()
  post.mockReturnValueOnce(pending.promise)
  const view = render(<FormSectionManager basePath={a} refreshKey={0} onChange={changed} />)
  await screen.findByText('A current content')
  fireEvent.click(screen.getByRole('button', { name: '新增区段' }))
  view.rerender(<FormSectionManager basePath={a} refreshKey={1} onChange={changed} />)
  await screen.findByText('A current content')
  expect(screen.getByRole('button', { name: '新增区段' })).toBeDisabled()
  await act(async () => { pending.resolve({ code: 0 }) })
  expect(changed).toHaveBeenCalledTimes(1)
  expect(get).toHaveBeenCalledTimes(3)
})
