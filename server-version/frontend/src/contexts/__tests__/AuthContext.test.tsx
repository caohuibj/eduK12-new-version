import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockMe } = vi.hoisted(() => ({ mockMe: vi.fn() }))

vi.mock('../../api/auth', () => ({
  authApi: {
    me: mockMe,
    csrf: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
  },
}))

import { AuthProvider, useAuth } from '../AuthContext'

const Probe = () => {
  const { user, isLoading } = useAuth()
  return <output>{isLoading ? 'loading' : user ? `signed-in:${user.username}` : 'signed-out'}</output>
}

describe('AuthContext session expiry handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMe.mockResolvedValue({
      code: 0,
      message: 'ok',
      data: { id: 'user-1', username: 'teacher-1', role: 'TEACHER' },
    })
  })

  it('clears the in-memory identity when a protected request reports expiry', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('signed-in:teacher-1'))

    act(() => {
      window.dispatchEvent(new CustomEvent('auth:expired'))
    })

    expect(screen.getByRole('status')).toHaveTextContent('signed-out')
  })
})
