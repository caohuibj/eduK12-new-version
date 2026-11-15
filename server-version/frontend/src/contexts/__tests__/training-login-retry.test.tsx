import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
})
