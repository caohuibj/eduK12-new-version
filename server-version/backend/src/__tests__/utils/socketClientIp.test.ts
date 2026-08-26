import { describe, expect, it } from 'vitest'
import { resolveSocketClientIp } from '../../utils/socketClientIp'

const socket = (remoteAddress: string, forwardedFor?: string) => ({
  conn: { remoteAddress },
  handshake: {
    address: remoteAddress,
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
  },
})

describe('Socket.IO client IP resolution', () => {
  it('ignores forwarded headers when no proxy hop is trusted', () => {
    expect(resolveSocketClientIp(socket('10.0.0.2', '203.0.113.10'), 0)).toBe(
      '10.0.0.2'
    )
  })

  it('uses the nearest forwarded client address for one trusted proxy hop', () => {
    expect(resolveSocketClientIp(socket('10.0.0.2', '203.0.113.10'), 1)).toBe(
      '203.0.113.10'
    )
  })

  it('does not let extra untrusted forwarded values replace the client key', () => {
    expect(
      resolveSocketClientIp(
        socket('10.0.0.2', '198.51.100.20, 203.0.113.10'),
        1
      )
    ).toBe('203.0.113.10')
  })
})
