import { describe, expect, it } from 'vitest'
import { encodeTotpSecret, matchTotpStep, totpAtStep } from '../../utils/totp'

describe('Authenticator RFC interoperability', () => {
  const secret = Buffer.from('12345678901234567890')
  // RFC 6238 Appendix B SHA-1 vectors, reduced to the six-digit profile.
  it.each([[59, '287082'], [1111111109, '081804'], [1111111111, '050471'],
    [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']])('matches RFC timestamp %s', (seconds, expected) => {
    expect(totpAtStep(secret, Math.floor(Number(seconds) / 30))).toBe(expected)
  })
  it('uses unpadded RFC 4648 Base32 for Authenticator QR secrets', () => {
    expect(encodeTotpSecret(Buffer.from('foobar'))).toBe('MZXW6YTBOI')
  })
  it('limits skew, rejects malformed codes and consumes a time step across future challenges', () => {
    const now = 1_234_567_890_000, step = Math.floor(now / 30_000)
    for (const offset of [-1, 0, 1]) expect(matchTotpStep(secret, totpAtStep(secret, step + offset), -1n, now)).toBe(step + offset)
    expect(matchTotpStep(secret, totpAtStep(secret, step - 2), -1n, now)).toBeNull()
    expect(matchTotpStep(secret, totpAtStep(secret, step), BigInt(step), now)).toBeNull()
    expect(matchTotpStep(secret, ' 123456', -1n, now)).toBeNull()
  })
})
