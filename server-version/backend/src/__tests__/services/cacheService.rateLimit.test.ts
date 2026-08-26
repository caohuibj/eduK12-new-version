import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheService } from '../../services/cacheService'

describe('CacheService rate-limit consumption', () => {
  const service = cacheService as any

  beforeEach(() => {
    service.isConnected = true
    service.client = { eval: vi.fn() }
  })

  it('increments and sets the first expiry in one Redis script', async () => {
    service.client.eval.mockResolvedValue([2, 58])

    await expect(service.consumeRateLimit('classroom:key', 60, 60)).resolves.toEqual({
      allowed: true,
      remaining: 58,
      retryAfterSeconds: 58,
    })

    expect(service.client.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('EXPIRE', KEYS[1], ARGV[1])"),
      {
        keys: ['classroom:key'],
        arguments: ['60'],
      }
    )
  })

  it('fails closed when the atomic script returns an invalid result', async () => {
    service.client.eval.mockResolvedValue(['not-a-count'])

    await expect(service.consumeRateLimit('classroom:key', 60, 60)).resolves.toBeNull()
  })
})
