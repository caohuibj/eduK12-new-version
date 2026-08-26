import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { mockPublicAssignmentApi, mockSaveCredential } = vi.hoisted(() => ({
  mockPublicAssignmentApi: {
    info: vi.fn(),
    start: vi.fn(),
  },
  mockSaveCredential: vi.fn(),
}))

vi.mock('../api', () => ({ publicCognitiveAssignmentApi: mockPublicAssignmentApi }))
vi.mock('../core/recovery-credential', () => ({ saveCognitiveRecoveryCredential: mockSaveCredential }))

import PublicCognitiveAssignment from '../pages/PublicCognitiveAssignment'

const renderAt = (token = 'public-token') => render(
  <MemoryRouter initialEntries={[`/public/cognitive/assignments/${token}`]}>
    <Routes>
      <Route path="/public/cognitive/assignments/:token" element={<PublicCognitiveAssignment />} />
      <Route path="/public/cognitive/sessions/:sessionId" element={<div>RUNNER_PAGE</div>} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
})

describe('PublicCognitiveAssignment recovery flow', () => {
  it('keeps an existing recovery credential usable when the public link is exhausted', async () => {
    const credential = 'recovery-token-1234567890'
    window.sessionStorage.setItem('cognitive:recovery:access:public-token', credential)
    mockPublicAssignmentApi.info.mockResolvedValue({ code: 1, message: 'Public link reached its maximum uses' })
    mockPublicAssignmentApi.start.mockResolvedValue({
      code: 0,
      message: 'resumed',
      data: { session: { sessionId: 'session-1' }, recoveryToken: null, anonymousCode: 'ANON-1234ABCD' },
    })

    renderAt()

    const button = await screen.findByRole('button', { name: '继续测评' })
    expect(button).toBeEnabled()
    expect(screen.getByText(/已有恢复凭证仍可继续/)).toBeTruthy()

    await userEvent.click(button)
    await waitFor(() => expect(mockPublicAssignmentApi.start).toHaveBeenCalledWith('public-token', credential))
    expect(mockSaveCredential).toHaveBeenCalledWith('session-1', credential)
  })
})
