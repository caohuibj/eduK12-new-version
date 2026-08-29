import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockMe, mockLogin, mockCsrf } = vi.hoisted(() => ({
  mockMe: vi.fn(),
  mockLogin: vi.fn(),
  mockCsrf: vi.fn(),
}))

vi.mock('../../api/auth', () => ({
  authApi: {
    me: mockMe,
    csrf: mockCsrf,
    login: mockLogin,
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
    mockCsrf.mockResolvedValue({ code: 0, message: 'ok', data: { csrfToken: 'csrf' } })
    mockLogin.mockResolvedValue({
      code: 0,
      message: 'ok',
      data: { user: { id: 'user-2', username: 'teacher-2', role: 'TEACHER' } },
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

  it('does not let an in-flight initial session replace a newer login', async () => {
    let resolveMe: ((value: unknown) => void) | undefined
    mockMe.mockReturnValue(new Promise((resolve) => { resolveMe = resolve }))

    const LoginProbe = () => {
      const { user, isLoading, login } = useAuth()
      return (
        <>
          <output>{isLoading ? 'loading' : user ? `signed-in:${user.username}` : 'signed-out'}</output>
          <button onClick={() => void login('teacher-2', 'password')}>login</button>
        </>
      )
    }

    render(<AuthProvider><LoginProbe /></AuthProvider>)
    await act(async () => {
      screen.getByRole('button', { name: 'login' }).click()
    })
    resolveMe?.({
      code: 0,
      message: 'ok',
      data: { id: 'user-1', username: 'teacher-1', role: 'TEACHER' },
    })

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('signed-in:teacher-2'))
  })
})
