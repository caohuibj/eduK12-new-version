import { describe, expect, it, vi } from 'vitest'

vi.mock('../../config', () => ({ config: { cookieSecure: false } }))

import {
  csrfTokensMatch,
  getCookieValue,
  parseCookieHeader,
  setSessionCookie,
} from '../../utils/authCookies'

describe('cookie authentication helpers', () => {
  it('parses URL-encoded cookie values without accepting malformed pairs', () => {
    expect(parseCookieHeader('ptool_session=abc%2B123; ptool_csrf=csrf-token; malformed')).toEqual({
      ptool_session: 'abc+123',
      ptool_csrf: 'csrf-token',
    })
    expect(getCookieValue('ptool_session=abc%2B123', 'ptool_session')).toBe('abc+123')
  })

  it('requires both equal CSRF values and compares them in constant-time form', () => {
    expect(csrfTokensMatch('csrf-token', 'csrf-token')).toBe(true)
    expect(csrfTokensMatch('csrf-token', 'different-token')).toBe(false)
    expect(csrfTokensMatch(null, 'csrf-token')).toBe(false)
    expect(csrfTokensMatch('csrf-token', null)).toBe(false)
  })

  it('does not mark local HTTP cookies Secure, but honors an explicitly secure request', () => {
    const headers = new Map<string, unknown>()
    const res = {
      getHeader: (name: string) => headers.get(name),
      setHeader: (name: string, value: unknown) => headers.set(name, value),
    }

    setSessionCookie({ secure: false } as any, res as any, 'session-token')
    expect(String(headers.get('Set-Cookie'))).not.toContain('Secure')

    headers.clear()
    setSessionCookie({ secure: true } as any, res as any, 'session-token')
    expect(String(headers.get('Set-Cookie'))).toContain('Secure')
  })
})
