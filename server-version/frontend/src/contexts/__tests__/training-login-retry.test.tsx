import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeApiError as normalizeClientError } from '../../api/client'
import { TrainingRetryTimeoutError } from '../../services/trainingBusyRetry'

const mocks = vi.hoisted(() => ({ me: vi.fn(), csrf: vi.fn(), login: vi.fn(), logout: vi.fn(), sleep: vi.fn() }))
vi.mock('../../api/auth', () => ({ authApi: { me: mocks.me, csrf: mocks.csrf, login: mocks.login, logout: mocks.logout } }))
vi.mock('../../training/context', () => ({ isTrainingHost: () => true }))
vi.mock('../../services/trainingBusyRetry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/trainingBusyRetry')>()
  return { ...actual, runTrainingRetry: <T,>(operation: (signal: AbortSignal) => Promise<T>, decide: Parameters<typeof actual.runTrainingRetry<T>>[1], options: Parameters<typeof actual.runTrainingRetry<T>>[2]) =>
    actual.runTrainingRetry(operation, decide, { ...options, random: () => 0, sleep: mocks.sleep }) }
})

import { AuthProvider, useAuth } from '../AuthContext'

const Probe = () => {
  const { login, loginRetryMessage, user, setAuthenticatedUser } = useAuth()
  const [loginError, setLoginError] = useState('')
  return <>
    <p role="status">{loginRetryMessage || user?.username || loginError || 'signed-out'}</p>
    <button onClick={() => void login('student', 'synthetic-password', 'STUDENT').catch((err: Error) => setLoginError(err.message))}>login</button>
    <button onClick={() => setAuthenticatedUser({ id: 'new', username: 'new-user', role: 'STUDENT' })}>switch</button>
  </>
}

describe('training login busy recovery', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.me.mockResolvedValue({ code: -1, message: 'signed out', data: null })
    mocks.csrf.mockResolvedValue({ code: 0, message: 'ok', data: {} })
  })

  it('shows the delay and retries only the explicit busy login response', async () => {
    let resume!: () => void
    mocks.sleep.mockImplementation(() => new Promise<void>((resolve) => { resume = resolve }))
    mocks.login.mockRejectedValueOnce({ status: 503, code: 'LOGIN_VERIFY_BUSY', retryAfterMs: 1_000 })
      .mockResolvedValueOnce({ code: 0, message: 'ok', data: { user: { id: 'student', username: 'student', role: 'STUDENT' } } })
    render(<AuthProvider><Probe /></AuthProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'login' }))
    await screen.findByText('登录繁忙，1 秒后自动重试。')
    expect(mocks.login).toHaveBeenCalledTimes(1)
    await act(async () => resume())
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('student'))
    expect(mocks.login).toHaveBeenCalledTimes(2)
  })

  it('does not resend a login after the user switches identity', async () => {
    let resume!: () => void
    mocks.sleep.mockImplementation(() => new Promise<void>((resolve) => { resume = resolve }))
    mocks.login.mockRejectedValue({ status: 503, code: 'LOGIN_VERIFY_BUSY', retryAfterMs: 1_000 })
    render(<AuthProvider><Probe /></AuthProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'login' }))
    await screen.findByText('登录繁忙，1 秒后自动重试。')
    fireEvent.click(screen.getByRole('button', { name: 'switch' }))
    await act(async () => resume())
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('new-user'))
    expect(mocks.login).toHaveBeenCalledTimes(1)
  })

  it('probes /auth/me after login timeout and reuses matching session without re-POSTing login', async () => {
    mocks.sleep.mockResolvedValue(undefined)
    mocks.login.mockRejectedValueOnce(new TrainingRetryTimeoutError())
    mocks.me
      .mockResolvedValueOnce({ code: -1, message: 'signed out', data: null })
      .mockResolvedValueOnce({ code: 0, message: 'ok', data: { id: 'student', username: 'student', role: 'STUDENT' } })

    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(mocks.me).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('student'))
    expect(mocks.login).toHaveBeenCalledTimes(1)
    expect(mocks.me).toHaveBeenCalledTimes(2)
  })

  it('aborts the active login request on unmount without resending credentials', async () => {
    let capturedSignal: AbortSignal | undefined
    mocks.login.mockImplementation((_data: unknown, _entrance: unknown, _mfa: unknown, cfg?: { signal?: AbortSignal }) => {
      capturedSignal = cfg?.signal
      return new Promise(() => {})
    })
    const { unmount } = render(<AuthProvider><Probe /></AuthProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(1))
    expect(capturedSignal?.aborted).toBe(false)
    unmount()
    expect(capturedSignal?.aborted).toBe(true)
    expect(mocks.login).toHaveBeenCalledTimes(1)
  })

  it('stops without re-POSTing login when the /auth/me probe fails after a timeout', async () => {
    mocks.sleep.mockResolvedValue(undefined)
    mocks.login.mockRejectedValueOnce(new TrainingRetryTimeoutError())
    mocks.me
      .mockResolvedValueOnce({ code: -1, message: 'signed out', data: null })
      .mockRejectedValueOnce(new Error('auth me transient error'))

    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(mocks.me).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('请求超时，请稍后重试'))
    expect(mocks.me).toHaveBeenCalledTimes(2)
    expect(mocks.login).toHaveBeenCalledTimes(1)
  })

  it('safely retries login when /auth/me throws a real client-normalized HTTP 401 after timeout', async () => {
    mocks.sleep.mockResolvedValue(undefined)
    mocks.login
      .mockRejectedValueOnce(new TrainingRetryTimeoutError())
      .mockResolvedValueOnce({ code: 0, message: 'ok', data: { user: { id: 'student', username: 'student', role: 'STUDENT' } } })
    const normalized401 = normalizeClientError({
      name: 'AxiosError',
      message: 'Request failed with status code 401',
      response: { status: 401, data: { code: -1, message: '缺少认证令牌', data: null } },
    })
    mocks.me
      .mockResolvedValueOnce({ code: -1, message: 'signed out', data: null })
      .mockRejectedValueOnce(normalized401)

    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(mocks.me).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('student'))
    expect(mocks.me).toHaveBeenCalledTimes(2)
    expect(mocks.login).toHaveBeenCalledTimes(2)
  })

  it('stops without re-POSTing login when /auth/me returns a mismatched signed-in identity', async () => {
    mocks.sleep.mockResolvedValue(undefined)
    mocks.login.mockRejectedValueOnce(new TrainingRetryTimeoutError())
    mocks.me
      .mockResolvedValueOnce({ code: -1, message: 'signed out', data: null })
      .mockResolvedValueOnce({ code: 0, message: 'ok', data: { id: 'other', username: 'other-student', role: 'STUDENT' } })

    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(mocks.me).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('请求超时，请稍后重试'))
    expect(mocks.me).toHaveBeenCalledTimes(2)
    expect(mocks.login).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['HTTP 503', normalizeClientError({
      name: 'AxiosError',
      message: 'Request failed with status code 503',
      response: { status: 503, data: { code: -1, message: '会话状态暂不可用', data: null } },
    })],
    ['non-JSON HTML 401 proxy page', normalizeClientError({
      name: 'AxiosError',
      message: 'Request failed with status code 401',
      response: { status: 401, data: '<html><body>401 Unauthorized</body></html>' },
    })],
    ['HTTP 401 with no response body', normalizeClientError({
      name: 'AxiosError',
      message: 'Request failed with status code 401',
      response: { status: 401 },
    })],
    ['HTTP 401 with noncanonical JSON envelope', normalizeClientError({
      name: 'AxiosError',
      message: 'Request failed with status code 401',
      response: { status: 401, data: { error: 'Unauthorized' } },
    })],
  ])('stops without re-POSTing login when /auth/me fails with %s', async (_label, err) => {
    mocks.sleep.mockResolvedValue(undefined)
    mocks.login.mockRejectedValueOnce(new TrainingRetryTimeoutError())
    mocks.me
      .mockResolvedValueOnce({ code: -1, message: 'signed out', data: null })
      .mockRejectedValueOnce(err)

    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(mocks.me).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('请求超时，请稍后重试'))
    expect(mocks.me).toHaveBeenCalledTimes(2)
    expect(mocks.login).toHaveBeenCalledTimes(1)
  })

  it('aborts a hung /auth/csrf request within bounded timeout without calling login', async () => {
    vi.useFakeTimers()
    let csrfSignal: AbortSignal | undefined
    mocks.csrf.mockImplementation((cfg?: { signal?: AbortSignal }) => {
      csrfSignal = cfg?.signal
      return new Promise(() => {})
    })

    render(<AuthProvider><Probe /></AuthProvider>)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'login' }))
    await act(async () => {})
    expect(mocks.csrf).toHaveBeenCalledTimes(1)
    expect(csrfSignal?.aborted).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(csrfSignal?.aborted).toBe(true)
    expect(mocks.login).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('请求超时，请稍后重试')
  })

  it('deducts slow /auth/csrf time from the 35s training login total budget', async () => {
    vi.useFakeTimers()
    let meSignal: AbortSignal | undefined
    mocks.csrf.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({ code: 0, message: 'ok', data: {} }), 6_000)
    }))
    mocks.login.mockImplementation(() => new Promise(() => {}))
    mocks.me
      .mockResolvedValueOnce({ code: -1, message: 'signed out', data: null })
      .mockImplementationOnce((cfg?: { signal?: AbortSignal }) => {
        meSignal = cfg?.signal
        return new Promise(() => {})
      })

    render(<AuthProvider><Probe /></AuthProvider>)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'login' }))

    // CSRF takes 6s -> leaves 29s budget for login + /auth/me probe
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000)
    })
    expect(mocks.login).toHaveBeenCalledTimes(1)

    // Login hangs 25s -> leaves 4s (35 - 6 - 25 = 4s) for /auth/me probe
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000)
    })
    expect(mocks.me).toHaveBeenCalledTimes(2)
    expect(meSignal?.aborted).toBe(false)

    // At exactly 35s total (+4s), /auth/me probe aborts cleanly without overflowing budget
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000)
    })
    expect(meSignal?.aborted).toBe(true)
    expect(mocks.login).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('请求超时，请稍后重试')
  })
})
