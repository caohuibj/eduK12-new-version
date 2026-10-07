import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'

const { mockPublicApi, mockCompositeApi } = vi.hoisted(() => ({
  mockPublicApi: {
    info: vi.fn(),
    start: vi.fn(),
    getAttempt: vi.fn(),
  },
  mockCompositeApi: { start: vi.fn(), listAvailable: vi.fn() },
}))

vi.mock('../api', () => ({
  compositeApi: mockCompositeApi,
  publicCompositeApi: () => mockPublicApi,
}))

vi.mock('../../cognitive/core/recovery-credential', () => ({
  saveCognitiveRecoveryCredential: vi.fn(),
}))

import CompositeAssessmentPage from '../CompositeAssessmentPage'

const renderPublicPage = () =>
  render(
    <MemoryRouter initialEntries={['/public/composite/token-1']}>
      <Routes>
        <Route
          path="/public/composite/:token"
          element={<CompositeAssessmentPage />}
        />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  window.history.pushState({}, '', '/public/composite/token-1')
  window.sessionStorage.clear()
  mockPublicApi.info.mockResolvedValue({
    code: 0,
    data: {
      id: 'composite-1',
      name: '匿名综合测评',
      description: '说明',
      instruction: '请完成以下模块',
      expiresAt: '2030-01-01T00:00:00.000Z',
      maxUses: 0,
      usedCount: 0,
      items: [],
    },
  })
})

describe('CompositeAssessmentPage public entry', () => {
  it('clears the previous entry and credential when switching to a closed link in the same page', async () => {
    mockPublicApi.info.mockImplementation((token: string) => Promise.resolve(token === 'token-1'
      ? { code: 0, data: { name: '原开放入口', studyEntryPath: '/public/studies/waves/old/token-1' } }
      : { code: -1, message: '综合测评未开放公开参与', data: null }))
    render(<MemoryRouter initialEntries={['/public/composite/token-1']}>
      <Link to="/public/composite/closed">切换到已停用入口</Link>
      <Routes><Route path="/public/composite/:token" element={<CompositeAssessmentPage />} /></Routes>
    </MemoryRouter>)
    const user = userEvent.setup()
    await screen.findByRole('link', { name: '选择单次访客或保存研究内身份码' })
    await user.type(screen.getByPlaceholderText('粘贴保存时获得的恢复凭证（可选）'), 'previous-credential')
    await user.click(screen.getByRole('link', { name: '切换到已停用入口' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('未开放公开参与')
    expect(screen.getByRole('button', { name: '开始匿名测评' })).toBeDisabled()
    expect(screen.getByPlaceholderText('粘贴保存时获得的恢复凭证（可选）')).toHaveValue('')
    expect(screen.queryByRole('link', { name: '选择单次访客或保存研究内身份码' })).not.toBeInTheDocument()
    expect(mockPublicApi.start).not.toHaveBeenCalled()
  })
  it('disables a closed entry while allowing an explicit credential recovery', async () => {
    mockPublicApi.info.mockResolvedValue({ code: -1, message: '综合测评未开放公开参与', data: null })
    mockPublicApi.start.mockRejectedValue({ message: '凭证不属于此链接' })
    renderPublicPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('未开放公开参与')
    expect(screen.getByRole('button', { name: '开始匿名测评' })).toBeDisabled()
    expect(mockPublicApi.start).not.toHaveBeenCalled()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('粘贴保存时获得的恢复凭证（可选）'), 'saved-recovery')
    await user.click(screen.getByRole('button', { name: '继续作答' }))
    await waitFor(() => expect(mockPublicApi.start).toHaveBeenCalledWith('token-1', 'saved-recovery'))
  })
  it('makes study identity selection discoverable from a bound ordinary link', async () => {
    mockPublicApi.info.mockResolvedValue({ code: 0, data: { name: '波次测评', studyEntryPath: '/public/studies/waves/wave/token-1' } })
    renderPublicPage()
    expect(await screen.findByRole('link', { name: '选择单次访客或保存研究内身份码' })).toHaveAttribute('href', '/public/studies/waves/wave/token-1')
    expect(mockPublicApi.start).not.toHaveBeenCalled()
  })
  it('only loads public info until the participant explicitly starts', async () => {
    const user = userEvent.setup()
    mockPublicApi.start.mockResolvedValue({
      code: 0,
      data: {
        recoveryToken: 'recovery-1',
        attempt: {
          id: 'attempt-1',
          assessmentId: 'composite-1',
          name: '匿名综合测评',
          instruction: '请完成以下模块',
          status: 'IN_PROGRESS',
          progress: 0,
          completedItems: 0,
          totalItems: 0,
          currentIndex: 0,
          startedAt: '2030-01-01T00:00:00.000Z',
          lastSavedAt: '2030-01-01T00:00:00.000Z',
          completedAt: null,
          anonymousCode: 'ANON-1',
          items: [],
          currentItem: null,
        },
      },
    })

    renderPublicPage()

    expect(
      await screen.findByRole('button', { name: /开始匿名测评/ }),
    ).toBeInTheDocument()
    expect(mockPublicApi.info).toHaveBeenCalledWith('token-1')
    expect(mockPublicApi.start).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /开始匿名测评/ }))
    await waitFor(() => expect(mockPublicApi.start).toHaveBeenCalledTimes(1))
    expect(mockPublicApi.start).toHaveBeenCalledWith('token-1', undefined)
  })
})

it('offers the already completed report when authenticated participation attempts are exhausted', async () => {
  window.history.pushState({}, '', '/student/composite/c1')
  mockCompositeApi.start.mockRejectedValue(new Error('已达到综合测评最大次数'))
  mockCompositeApi.listAvailable.mockResolvedValue({
    code: 0,
    data: {
      list: [{ id: 'c1', latestCompletedAttempt: { id: 'completed-1' } }],
    },
  })
  render(
    <MemoryRouter initialEntries={['/student/composite/c1']}>
      <Routes>
        <Route
          path="/student/composite/:assessmentId"
          element={<CompositeAssessmentPage />}
        />
        <Route
          path="/student/composite/attempts/:attemptId/report"
          element={<p>已有报告</p>}
        />
      </Routes>
    </MemoryRouter>,
  )
  expect(
    await screen.findByText('本次测评的参与次数已用尽'),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '返回任务列表' })).toHaveAttribute(
    'href',
    '/student',
  )
  await userEvent.click(screen.getByRole('button', { name: '查看已有结果' }))
  expect(await screen.findByText('已有报告')).toBeInTheDocument()
})

it('does not offer the previous assessment report after switching assessment routes', async () => {
  window.history.pushState({}, '', '/student/composite/c1')
  mockCompositeApi.start.mockRejectedValue(new Error('已达到综合测评最大次数'))
  mockCompositeApi.listAvailable.mockResolvedValue({
    code: 0,
    data: {
      list: [
        { id: 'c1', latestCompletedAttempt: { id: 'completed-1' } },
        { id: 'c2' },
      ],
    },
  })
  render(
    <MemoryRouter initialEntries={['/student/composite/c1']}>
      <Link to="/student/composite/c2">切换测评</Link>
      <Routes>
        <Route
          path="/student/composite/:assessmentId"
          element={<CompositeAssessmentPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByRole('button', { name: '查看已有结果' })
  fireEvent.click(screen.getByText('切换测评'))
  await waitFor(() =>
    expect(mockCompositeApi.listAvailable).toHaveBeenCalledTimes(2),
  )
  expect(screen.queryByRole('button', { name: '查看已有结果' })).toBeNull()
})
it('does not redirect to a completed attempt after the participant leaves the page', async () => {
  window.history.pushState({}, '', '/student/composite/c1')
  let finish!: (value: unknown) => void
  mockCompositeApi.start.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  render(
    <MemoryRouter initialEntries={['/student/composite/c1']}>
      <Link to="/elsewhere">离开测评</Link>
      <Routes>
        <Route
          path="/student/composite/:assessmentId"
          element={<CompositeAssessmentPage />}
        />
        <Route path="/elsewhere" element={<p>其他页面</p>} />
        <Route
          path="/student/composite/attempts/:id/report"
          element={<p>旧测评报告</p>}
        />
      </Routes>
    </MemoryRouter>,
  )
  await waitFor(() => expect(mockCompositeApi.start).toHaveBeenCalledWith('c1'))
  fireEvent.click(screen.getByText('离开测评'))
  await act(async () =>
    finish({ code: 0, data: { attempt: { id: 'old', status: 'COMPLETED' } } }),
  )
  expect(screen.getByText('其他页面')).toBeInTheDocument()
})
