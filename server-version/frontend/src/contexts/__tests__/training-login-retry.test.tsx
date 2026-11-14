import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ me: vi.fn(), csrf: vi.fn(), login: vi.fn(), logout: vi.fn(), sleep: vi.fn() }))
vi.mock('../../api/auth', () => ({ authApi: { me: mocks.me, csrf: mocks.csrf, login: mocks.login, logout: mocks.logout } }))
vi.mock('../../training/context', () => ({ isTrainingHost: () => true }))
vi.mock('../../services/trainingBusyRetry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/trainingBusyRetry')>()
  return { ...actual, runTrainingRetry: <T,>(operation: () => Promise<T>, decide: Parameters<typeof actual.runTrainingRetry<T>>[1], options: Parameters<typeof actual.runTrainingRetry<T>>[2]) =>
    actual.runTrainingRetry(operation, decide, { ...options, random: () => 0, sleep: mocks.sleep }) }
})

import { AuthProvider, useAuth } from '../AuthContext'

const Probe = () => {
  const { login, loginRetryMessage, user, setAuthenticatedUser } = useAuth()
  return <>
    <p role="status">{loginRetryMessage || user?.username || 'signed-out'}</p>
    <button onClick={() => void login('student', 'synthetic-password', 'STUDENT')}>login</button>
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
})
