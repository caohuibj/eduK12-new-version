import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { mockPublicApi, mockCompositeApi } = vi.hoisted(() => ({
  mockPublicApi: {
    info: vi.fn(),
    start: vi.fn(),
    getAttempt: vi.fn(),
  },
  mockCompositeApi: {},
}))

vi.mock('../api', () => ({
  compositeApi: mockCompositeApi,
  publicCompositeApi: () => mockPublicApi,
}))

vi.mock('../../cognitive/core/recovery-credential', () => ({
  saveCognitiveRecoveryCredential: vi.fn(),
}))

import CompositeAssessmentPage from '../CompositeAssessmentPage'

const renderPublicPage = () => render(
  <MemoryRouter initialEntries={['/public/composite/token-1']}>
    <Routes>
      <Route path="/public/composite/:token" element={<CompositeAssessmentPage />} />
    </Routes>
  </MemoryRouter>
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

    expect(await screen.findByRole('button', { name: /开始匿名测评/ })).toBeInTheDocument()
    expect(mockPublicApi.info).toHaveBeenCalledWith('token-1')
    expect(mockPublicApi.start).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /开始匿名测评/ }))
    await waitFor(() => expect(mockPublicApi.start).toHaveBeenCalledTimes(1))
    expect(mockPublicApi.start).toHaveBeenCalledWith('token-1', undefined)
  })
})
