import { describe, expect, it } from 'vitest'
import { shouldInvalidateSession } from '../client'

describe('API session invalidation boundary', () => {
  it('only invalidates an authenticated session for protected 401 responses', () => {
    expect(shouldInvalidateSession({ response: { status: 401 }, config: { url: '/users/me' } })).toBe(true)
    expect(shouldInvalidateSession({ response: { status: 401 }, config: { url: '/api/courses' } })).toBe(true)
    expect(shouldInvalidateSession({ response: { status: 401 }, config: { url: 'http://localhost/api/auth/me' } })).toBe(true)
  })

  it('does not treat login, registration, CSRF, or public access failures as session expiry', () => {
    for (const url of [
      '/auth/login',
      '/auth/register',
      '/auth/csrf',
      '/auth/student-register',
      '/auth/verify-teacher-code',
      '/auth/teacher-register',
      '/public/questionnaires/token/start',
      '/checkins/public/token',
    ]) {
      expect(shouldInvalidateSession({ response: { status: 401 }, config: { url } })).toBe(false)
    }
  })

  it('does not invalidate a session for non-401 responses', () => {
    expect(shouldInvalidateSession({ response: { status: 403 }, config: { url: '/users/me' } })).toBe(false)
    expect(shouldInvalidateSession({ response: { status: 500 }, config: { url: '/users/me' } })).toBe(false)
  })
})
