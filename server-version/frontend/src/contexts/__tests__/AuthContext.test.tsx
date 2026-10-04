import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockMe, mockLogin, mockCsrf, mockLogout } = vi.hoisted(() => ({
  mockMe: vi.fn(),
  mockLogin: vi.fn(),
  mockCsrf: vi.fn(),
  mockLogout: vi.fn(),
}))

vi.mock('../../api/auth', () => ({
  authApi: {
    me: mockMe,
    csrf: mockCsrf,
    login: mockLogin,
    logout: mockLogout,
    changePassword: vi.fn(),
  },
}))

import { AUTH_SESSION_SIGNAL, AuthProvider, useAuth } from '../AuthContext'

const Probe = () => {
  const { user, isLoading } = useAuth()
  return (
    <output>
      {isLoading
        ? 'loading'
        : user
          ? `signed-in:${user.username}`
          : 'signed-out'}
    </output>
  )
}

describe('AuthContext session expiry handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    window.history.replaceState(null, '', '/')
    mockMe.mockResolvedValue({
      code: 0,
      message: 'ok',
      data: { id: 'user-1', username: 'teacher-1', role: 'TEACHER' },
    })
    mockCsrf.mockResolvedValue({
      code: 0,
      message: 'ok',
      data: { csrfToken: 'csrf' },
    })
    mockLogout.mockResolvedValue({ code: 0 })
    mockLogin.mockResolvedValue({
      code: 0,
      message: 'ok',
      data: { user: { id: 'user-2', username: 'teacher-2', role: 'TEACHER' } },
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('retains the interrupted account in AuthContext when hint storage is denied', async () => {
    const ReturnProbe = () => {
      const { user, reauthReturn } = useAuth()
      return (
        <output>
          {user?.id || 'out'}:{reauthReturn?.userId || 'none'}
        </output>
      )
    }
    render(
      <AuthProvider>
        <ReturnProbe />
      </AuthProvider>,
    )
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('user-1:none'),
    )
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    act(() => window.dispatchEvent(new CustomEvent('auth:expired')))
    expect(screen.getByRole('status')).toHaveTextContent('out:user-1')
  })

  it('clears both in-memory and stored reauth context after safe consumption', async () => {
    const ReturnProbe = () => {
      const {
        user,
        reauthReturn,
        prepareReauthentication,
        clearReauthentication,
      } = useAuth()
      return (
        <>
          <output>
            {user?.id || 'out'}:{reauthReturn?.userId || 'none'}
          </output>
          <button onClick={() => prepareReauthentication('/dashboard')}>
            remember
          </button>
          <button onClick={clearReauthentication}>clear</button>
        </>
      )
    }
    render(
      <AuthProvider>
        <ReturnProbe />
      </AuthProvider>,
    )
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('user-1:none'),
    )

    act(() => screen.getByRole('button', { name: 'remember' }).click())
    expect(screen.getByRole('status')).toHaveTextContent('user-1:user-1')
    expect(sessionStorage.getItem('huisurvey:reauth-return')).not.toBeNull()

    act(() => screen.getByRole('button', { name: 'clear' }).click())
    expect(screen.getByRole('status')).toHaveTextContent('user-1:none')
    expect(sessionStorage.getItem('huisurvey:reauth-return')).toBeNull()
  })

  it('clears the in-memory identity when a protected request reports expiry', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'signed-in:teacher-1',
      ),
    )

    act(() => {
      window.dispatchEvent(new CustomEvent('auth:expired'))
    })

    expect(screen.getByRole('status')).toHaveTextContent('signed-out')
  })

  it('does not let an in-flight initial session replace a newer login', async () => {
    let resolveMe: ((value: unknown) => void) | undefined
    mockMe.mockReturnValue(
      new Promise((resolve) => {
        resolveMe = resolve
      }),
    )

    const LoginProbe = () => {
      const { user, isLoading, login } = useAuth()
      return (
        <>
          <output>
            {isLoading
              ? 'loading'
              : user
                ? `signed-in:${user.username}`
                : 'signed-out'}
          </output>
          <button onClick={() => void login('teacher-2', 'password')}>
            login
          </button>
        </>
      )
    }

    render(
      <AuthProvider>
        <LoginProbe />
      </AuthProvider>,
    )
    await act(async () => {
      screen.getByRole('button', { name: 'login' }).click()
    })
    resolveMe?.({
      code: 0,
      message: 'ok',
      data: { id: 'user-1', username: 'teacher-1', role: 'TEACHER' },
    })

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'signed-in:teacher-2',
      ),
    )
  })
  it('keeps a pending login when the anonymous initial session returns 401', async () => {
    let resolveMe: ((value: unknown) => void) | undefined
    let resolveLogin: ((value: unknown) => void) | undefined
    mockMe.mockReturnValue(
      new Promise((resolve) => {
        resolveMe = resolve
      }),
    )
    mockLogin.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve
      }),
    )
    const LoginProbe = () => {
      const { user, login } = useAuth()
      return (
        <>
          <output>{user ? `signed-in:${user.username}` : 'signed-out'}</output>
          <button onClick={() => void login('teacher-2', 'password')}>
            login
          </button>
        </>
      )
    }
    render(
      <AuthProvider>
        <LoginProbe />
      </AuthProvider>,
    )
    act(() => screen.getByRole('button', { name: 'login' }).click())
    await waitFor(() => expect(mockLogin).toHaveBeenCalled())
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('auth:expired', {
          detail: { requestStartedAt: Date.now() - 1000 },
        }),
      )
      resolveMe?.({ code: -1, message: 'unauthorized' })
    })
    await act(async () =>
      resolveLogin?.({
        code: 0,
        message: 'ok',
        data: {
          user: { id: 'user-2', username: 'teacher-2', role: 'TEACHER' },
        },
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent('signed-in:teacher-2')
    expect(sessionStorage.getItem('huisurvey:reauth-return')).toBeNull()
  })

  it('removes the old form immediately when another tab signals a changed session', async () => {
    const Form = () => {
      const { user, isLoading } = useAuth()
      return (
        <>
          {isLoading ? <p>checking</p> : <output>{user?.role || 'out'}</output>}
          {user?.role === 'TEACHER' && (
            <input aria-label="teacher draft" defaultValue="old draft" />
          )}
        </>
      )
    }
    render(
      <AuthProvider>
        <Form />
      </AuthProvider>,
    )
    await screen.findByLabelText('teacher draft')
    let resolve!: (value: unknown) => void
    mockMe.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    act(() =>
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: AUTH_SESSION_SIGNAL,
          newValue: 'nonce-only',
        }),
      ),
    )
    expect(screen.queryByLabelText('teacher draft')).toBeNull()
    expect(screen.getByText('checking')).toBeInTheDocument()
    await act(async () =>
      resolve({
        code: 0,
        data: { id: 'student', username: 'student', role: 'STUDENT' },
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent('STUDENT')
  })
  it('rechecks cookies on focus and resets forms even when the new account has the same role', async () => {
    const Form = () => {
      const { user } = useAuth()
      return (
        <>{user && <input aria-label="draft" defaultValue={user.username} />}</>
      )
    }
    render(
      <AuthProvider>
        <Form />
      </AuthProvider>,
    )
    await screen.findByLabelText('draft')
    mockMe.mockResolvedValueOnce({
      code: 0,
      data: { id: 'other', username: 'other-teacher', role: 'TEACHER' },
    })
    act(() => window.dispatchEvent(new Event('focus')))
    await waitFor(() =>
      expect(screen.getByLabelText('draft')).toHaveValue('other-teacher'),
    )
  })
  it('keeps same-account edits on focus and ignores a late focus response after a newer login', async () => {
    const Form = () => {
      const { user, login } = useAuth()
      return (
        <>
          <output>{user?.username}</output>
          <button onClick={() => void login('teacher-2', 'password')}>
            login
          </button>
          {user && <input aria-label="draft" defaultValue="edited" />}
        </>
      )
    }
    render(
      <AuthProvider>
        <Form />
      </AuthProvider>,
    )
    const draft = await screen.findByLabelText('draft')
    act(() => window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(mockMe).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText('draft')).toBe(draft)
    let resolve!: (value: unknown) => void
    mockMe.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    act(() => window.dispatchEvent(new Event('focus')))
    await act(async () => screen.getByRole('button', { name: 'login' }).click())
    await act(async () =>
      resolve({
        code: 0,
        data: { id: 'user-1', username: 'old', role: 'TEACHER' },
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent('teacher-2')
  })
  it('keeps the initial login completion state until its navigation effect can run', async () => {
    mockMe.mockResolvedValue({ code: -1, data: null })
    const Login = () => {
      const { user, login } = useAuth()
      const [completed, setCompleted] = useState(false)
      return (
        <>
          <output>
            {user?.username}:{completed ? 'completed' : 'waiting'}
          </output>
          <button
            onClick={async () => {
              await login('teacher-2', 'password')
              setCompleted(true)
            }}
          >
            login
          </button>
        </>
      )
    }
    render(
      <AuthProvider>
        <Login />
      </AuthProvider>,
    )
    await act(async () => screen.getByRole('button', { name: 'login' }).click())
    expect(screen.getByRole('status')).toHaveTextContent('teacher-2:completed')
  })
  it('preserves login navigation when intentionally switching an already signed-in account', async () => {
    window.history.replaceState(null, '', '/student/login')
    const Login = () => {
      const { user, login } = useAuth()
      const [completed, setCompleted] = useState(false)
      return (
        <>
          <output>
            {user?.username}:{completed ? 'completed' : 'waiting'}
          </output>
          <button
            onClick={async () => {
              await login('teacher-2', 'password')
              setCompleted(true)
            }}
          >
            login
          </button>
        </>
      )
    }
    render(
      <AuthProvider>
        <Login />
      </AuthProvider>,
    )
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('teacher-1'),
    )
    await act(async () => screen.getByRole('button', { name: 'login' }).click())
    expect(screen.getByRole('status')).toHaveTextContent('teacher-2:completed')
    window.history.replaceState(null, '', '/')
  })
  it('does not broadcast profile refreshes or let a late previous-account profile restore its identity', async () => {
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const Profile = () => {
      const { user, setUser } = useAuth()
      return (
        <>
          <output>{user?.username || 'out'}</output>
          <button
            onClick={() =>
              setUser({
                id: 'user-1',
                username: 'updated',
                role: 'TEACHER',
              } as any)
            }
          >
            profile
          </button>
          <button
            onClick={() =>
              setUser({ id: 'old', username: 'old', role: 'TEACHER' } as any)
            }
          >
            late profile
          </button>
          <button onClick={() => setUser(null)}>clear</button>
        </>
      )
    }
    render(
      <AuthProvider>
        <Profile />
      </AuthProvider>,
    )
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('teacher-1'),
    )
    act(() => screen.getByRole('button', { name: 'profile' }).click())
    expect(screen.getByRole('status')).toHaveTextContent('updated')
    expect(
      write.mock.calls.filter(([key]) => key === AUTH_SESSION_SIGNAL),
    ).toHaveLength(0)
    act(() => screen.getByRole('button', { name: 'late profile' }).click())
    expect(screen.getByRole('status')).toHaveTextContent('updated')
    act(() => screen.getByRole('button', { name: 'clear' }).click())
    expect(
      write.mock.calls.filter(([key]) => key === AUTH_SESSION_SIGNAL),
    ).toHaveLength(1)
    act(() => screen.getByRole('button', { name: 'profile' }).click())
    expect(screen.getByRole('status')).toHaveTextContent('out')
  })
})

describe('late local session actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCsrf.mockResolvedValue({ code: 0 })
    mockLogout.mockResolvedValue({ code: 0 })
    window.history.replaceState(null, '', '/')
  })
  it('does not let an old logout completion clear a newer authenticated account', async () => {
    let resolve: (v: unknown) => void = () => {}
    mockMe.mockResolvedValue({
      code: 0,
      data: { id: 'old', username: 'old', role: 'TEACHER' },
    })
    mockCsrf.mockResolvedValue({ code: 0 })
    mockLogout.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r
      }),
    )
    const Actions = () => {
      const { user, logout, setAuthenticatedUser } = useAuth()
      return (
        <>
          <output>{user?.id ?? 'out'}</output>
          <button onClick={() => void logout()}>exit</button>
          <button
            onClick={() =>
              setAuthenticatedUser({
                id: 'new',
                username: 'new',
                role: 'STUDENT',
              } as any)
            }
          >
            switch
          </button>
        </>
      )
    }
    render(
      <AuthProvider>
        <Actions />
      </AuthProvider>,
    )
    await screen.findByText('old')
    act(() => screen.getByRole('button', { name: 'exit' }).click())
    await waitFor(() => expect(mockLogout).toHaveBeenCalled())
    act(() => screen.getByRole('button', { name: 'switch' }).click())
    await screen.findByText('new')
    await act(async () => resolve({ code: 0 }))
    expect(screen.getByRole('status')).toHaveTextContent('new')
  })

  it('rejects a departed profile callback clearing another account', async () => {
    mockMe.mockResolvedValue({
      code: 0,
      data: { id: 'old', username: 'old', role: 'TEACHER' },
    })
    let departedClear: () => void = () => {}
    const Actions = () => {
      const { user, setUser, setAuthenticatedUser } = useAuth()
      return (
        <>
          <output>{user?.id ?? 'out'}</output>
          <button
            onClick={() => {
              departedClear = () => setUser(null)
            }}
          >
            retain
          </button>
          <button
            onClick={() =>
              setAuthenticatedUser({
                id: 'new',
                username: 'new',
                role: 'STUDENT',
              } as any)
            }
          >
            switch
          </button>
        </>
      )
    }
    render(
      <AuthProvider>
        <Actions />
      </AuthProvider>,
    )
    await screen.findByText('old')
    act(() => screen.getByRole('button', { name: 'retain' }).click())
    act(() => screen.getByRole('button', { name: 'switch' }).click())
    await screen.findByText('new')
    act(departedClear)
    expect(screen.getByRole('status')).toHaveTextContent('new')
  })
  it('does not issue a superseded login after CSRF finishes loading', async () => {
    let resolve: (v: unknown) => void = () => {}
    mockMe.mockResolvedValue({ code: 0, data: { id: 'old', username: 'old', role: 'TEACHER' } })
    mockCsrf.mockReturnValueOnce(new Promise(r => { resolve = r }))
    const Actions = () => {
      const { user, login, setAuthenticatedUser } = useAuth()
      return <><output>{user?.id ?? 'out'}</output><button onClick={() => void login('pending', 'password')}>login</button><button onClick={() => setAuthenticatedUser({ id: 'new', username: 'new', role: 'STUDENT' } as any)}>switch</button></>
    }
    render(<AuthProvider><Actions /></AuthProvider>)
    await screen.findByText('old')
    act(() => screen.getByRole('button', { name: 'login' }).click())
    act(() => screen.getByRole('button', { name: 'switch' }).click())
    await act(async () => resolve({ code: 0 }))
    expect(mockLogin).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('new')
  })

})
