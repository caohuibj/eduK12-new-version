import { describe, expect, it } from 'vitest'
import {
  createAccessToken,
  createRecoveryCredential,
  hashRecoveryToken,
  isValidRecoveryToken,
} from '../../services/anonymousAccess'

describe('anonymous access credentials', () => {
  it('stores only a one-way recovery hash while returning a usable credential', () => {
    const credential = createRecoveryCredential()

    expect(credential.token).toHaveLength(32)
    expect(credential.anonymousCode).toMatch(/^ANON-[0-9A-F]{8}$/)
    expect(credential.participantKey).toMatch(/^anonymous:[0-9a-f]{36}$/)
    expect(credential.hash).toBe(hashRecoveryToken(credential.token))
    expect(credential.hash).not.toContain(credential.token)
    expect(isValidRecoveryToken(credential.token)).toBe(true)
  })

  it('uses independent opaque public entry tokens', () => {
    const first = createAccessToken()
    const second = createAccessToken()

    expect(first).not.toBe(second)
    expect(first).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(second).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(isValidRecoveryToken(first)).toBe(true)
    expect(isValidRecoveryToken('short')).toBe(false)
  })
})
