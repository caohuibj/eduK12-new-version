import { describe, expect, it } from 'vitest'
import {
  csrfTokensMatch,
  getCookieValue,
  parseCookieHeader,
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
})
