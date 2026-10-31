import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import PublicQuestionnaire from '../PublicQuestionnaire'
import type { POWResponse } from '../../../utils/powService'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), pow: vi.fn() }))
vi.mock('../../../api/publicCapabilityClient', () => ({ createPublicCapabilityClient: () => mocks }))
vi.mock('../../../utils/powService', () => ({ completePOW: mocks.pow }))
const proof: POWResponse = { challenge: 'synthetic-challenge', proof: 'synthetic-proof', difficulty: 1 }
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function page() {
  return render(<MemoryRouter initialEntries={['/public/questionnaire/link']}><Navigation /><Routes>
    <Route path="/public/questionnaire/:token" element={<PublicQuestionnaire />} />
  </Routes></MemoryRouter>)
}
function Navigation() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/public/questionnaire/b')}>切换入口 B</button>
}
beforeEach(() => {
  window.sessionStorage.clear()
  mocks.get.mockReset().mockResolvedValue({ data: { questionnaire: { name: '合成问卷' } } })
  mocks.post.mockReset()
  mocks.pow.mockReset().mockResolvedValue(proof)
})

it('keeps START single-flight after POW finishes and restores the explicit retry after rejection', async () => {
  const start = deferred<never>()
  mocks.post.mockReturnValue(start.promise)
  page()
  fireEvent.click(await screen.findByRole('button', { name: '开始测评' }))
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1))
  await act(async () => {
    const repeated = screen.queryByRole('button', { name: '开始测评' })
    if (repeated) fireEvent.click(repeated)
  })
  expect.soft(mocks.post).toHaveBeenCalledTimes(1)
  expect.soft(mocks.pow).toHaveBeenCalledTimes(1)
  await act(async () => { start.reject(Error('开始请求被拒绝')) })
  expect(await screen.findByText('开始请求被拒绝')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '开始测评' })).toBeEnabled()
})

it('starts one POW for repeated clicks before the first loading render', async () => {
  const pending = deferred<POWResponse>()
  mocks.pow.mockReturnValue(pending.promise)
  mocks.post.mockRejectedValue(Error('合成开始拒绝'))
  page()
  const button = await screen.findByRole('button', { name: '开始测评' })
  act(() => { fireEvent.click(button); fireEvent.click(button) })
  expect.soft(mocks.pow).toHaveBeenCalledTimes(1)
  expect(mocks.post).not.toHaveBeenCalled()
  await act(async () => { pending.resolve(proof) })
  expect(await screen.findByText('合成开始拒绝')).toBeInTheDocument()
})

it('allows an explicit new attempt to enter after POW failure without posting the failed proof', async () => {
  mocks.pow.mockRejectedValueOnce(Error('合成 POW 失败')).mockResolvedValueOnce(proof)
  mocks.post.mockRejectedValueOnce(Error('合成开始拒绝'))
  page()
  fireEvent.click(await screen.findByRole('button', { name: '开始测评' }))
  expect(await screen.findByText('合成 POW 失败')).toBeInTheDocument()
  expect(mocks.post).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '开始测评' }))
  expect(await screen.findByText('合成开始拒绝')).toBeInTheDocument()
  expect(mocks.pow).toHaveBeenCalledTimes(2)
  expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/questionnaires/link/start', { sessionId: null, challenge: proof.challenge, proof: proof.proof })
})

it('allows a new entry to load while the old POW waits and does not START the old entry after leaving', async () => {
  const pending = deferred<POWResponse>()
  mocks.pow.mockReturnValue(pending.promise)
  mocks.post.mockRejectedValue(Error('旧入口不应开始'))
  mocks.get.mockImplementation(async (path: string) => ({ data: { questionnaire: { name: path.endsWith('/b') ? '问卷 B' : '问卷 A' } } }))
  page()
  fireEvent.click(await screen.findByRole('button', { name: '开始测评' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '切换入口 B' })) })
  expect.soft(screen.queryByRole('heading', { name: '问卷 B' })).not.toBeNull()
  await act(async () => { pending.resolve(proof) })
  expect.soft(mocks.post).not.toHaveBeenCalled()
  expect.soft(screen.queryByRole('alert')).toBeNull()
})

it('does not let an old START error release or replace the new entry opening', async () => {
  const old = deferred<never>(), current = deferred<never>()
  mocks.post.mockImplementation((path: string) => path === '/questionnaires/link/start' ? old.promise : current.promise)
  mocks.get.mockImplementation(async (path: string) => ({ data: { questionnaire: { name: path.endsWith('/b') ? '问卷 B' : '问卷 A' } } }))
  page()
  fireEvent.click(await screen.findByRole('button', { name: '开始测评' }))
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '切换入口 B' })) })
  await act(async () => {
    const button = screen.queryByRole('button', { name: '开始测评' })
    if (button) fireEvent.click(button)
  })
  expect.soft(mocks.post.mock.calls.map(([path]) => path)).toEqual(['/questionnaires/link/start', '/questionnaires/b/start'])
  await act(async () => { old.reject(Error('旧入口失败')) })
  expect.soft(screen.queryByRole('alert')).toBeNull()
  expect.soft(screen.queryByRole('button', { name: '开始测评' })).toBeNull()
  await act(async () => { current.reject(Error('新入口失败')) })
})
