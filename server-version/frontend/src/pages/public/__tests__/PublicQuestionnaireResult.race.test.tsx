import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import PublicQuestionnaireResult from '../PublicQuestionnaireResult'
import { saveQuestionnaireResumeToken } from '../../../utils/questionnaireResume'

const report = (name: string) => ({ questionnaireName: name, completedAt: '2026-10-31T00:00:00Z', totalTime: 0, totalDimensions: 0, backgroundValues: [], unitReports: [] })
const response = (name: string) => new Response(JSON.stringify({ code: 0, message: 'ok', data: report(name) }), { status: 200, headers: { 'content-type': 'application/json' } })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  window.sessionStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
function page(change: 'session' | 'token') {
  const first = { token: 'first-token', session: 'first-session' }
  const second = change === 'session' ? { token: first.token, session: 'second-session' } : { token: 'second-token', session: first.session }
  saveQuestionnaireResumeToken(first.token, first.session, 'synthetic-first-resume')
  render(<MemoryRouter initialEntries={[`/public/questionnaire/${first.token}/result?sessionId=${first.session}`]}>
    <Link to={`/public/questionnaire/${second.token}/result?sessionId=${second.session}`}>切换结果</Link>
    <Routes><Route path="/public/questionnaire/:token/result" element={<PublicQuestionnaireResult />} /></Routes>
  </MemoryRouter>)
  return {
    first, second,
    switch: (capability = true) => {
      if (capability) saveQuestionnaireResumeToken(second.token, second.session, 'synthetic-second-resume')
      fireEvent.click(screen.getByRole('link', { name: '切换结果' }))
    },
  }
}
function assertReads(first: string, second: string) {
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`/api/public/assessments/${first}/report`, `/api/public/assessments/${second}/report`])
  for (const [index, [, init]] of fetchMock.mock.calls.entries()) {
    expect(init?.method).toBe('GET')
    expect(init?.credentials).toBe('omit')
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer synthetic-${index === 0 ? 'first' : 'second'}-resume`)
  }
}

it.each(['session', 'token'] as const)('ignores an old report success after the %s changes', async change => {
  const old = deferred<Response>()
  fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response('当前报告'))
  const view = page(change)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  view.switch()
  expect(await screen.findByRole('heading', { level: 1, name: '当前报告' })).toBeInTheDocument()
  await act(async () => { old.resolve(response('过期报告')) })
  expect(screen.queryByText('过期报告')).toBeNull()
  expect(screen.getByRole('heading', { level: 1, name: '当前报告' })).toBeInTheDocument()
  assertReads(view.first.session, view.second.session)
})

it.each(['session', 'token'] as const)('ignores an old report failure after the %s changes', async change => {
  const old = deferred<Response>()
  fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response('当前报告'))
  page(change).switch()
  expect(await screen.findByRole('heading', { level: 1, name: '当前报告' })).toBeInTheDocument()
  await act(async () => { old.reject(new Error('过期请求失败')) })
  expect(screen.queryByText('过期请求失败')).toBeNull()
  expect(screen.getByRole('heading', { level: 1, name: '当前报告' })).toBeInTheDocument()
})

it('keeps the current report loading when the previous read settles first', async () => {
  const old = deferred<Response>(), current = deferred<Response>()
  fetchMock.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  page('session').switch()
  await act(async () => { old.resolve(response('过期报告')) })
  expect(screen.queryByText('过期报告')).toBeNull()
  expect(screen.getByText('正在生成报告')).toBeInTheDocument()
  await act(async () => { current.resolve(response('当前报告')) })
  expect(await screen.findByRole('heading', { level: 1, name: '当前报告' })).toBeInTheDocument()
})

it('does not issue a new read without the current resume capability', async () => {
  const old = deferred<Response>()
  fetchMock.mockReturnValueOnce(old.promise)
  page('session').switch(false)
  expect(await screen.findByText(/缺少本次问卷的恢复凭据/)).toBeInTheDocument()
  await act(async () => { old.resolve(response('过期报告')) })
  expect(screen.queryByText('过期报告')).toBeNull()
  expect(screen.queryByRole('button', { name: '重试读取报告' })).toBeNull()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('retains an explicit same-session retry using only the current bearer GET', async () => {
  fetchMock.mockRejectedValueOnce(new Error('暂时读取失败')).mockResolvedValueOnce(response('重试后的报告'))
  page('session')
  fireEvent.click(await screen.findByRole('button', { name: '重试读取报告' }))
  expect(await screen.findByRole('heading', { level: 1, name: '重试后的报告' })).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  for (const [url, init] of fetchMock.mock.calls) {
    expect(url).toBe('/api/public/assessments/first-session/report')
    expect(init?.method).toBe('GET')
    expect(init?.credentials).toBe('omit')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-first-resume')
  }
})
