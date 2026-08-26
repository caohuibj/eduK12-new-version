import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCacheService } = vi.hoisted(() => ({
  mockCacheService: {
    consumeRateLimit: vi.fn(),
  },
}))

vi.mock('../../services/cacheService', () => ({
  cacheService: mockCacheService,
}))

import {
  checkClassroomLookupRateLimit,
  checkFailedClassroomCodeRateLimit,
} from '../../utils/classroomRateLimiter'

describe('classroom public lookup rate limits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps a Redis allowance to an available request', async () => {
    mockCacheService.consumeRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 59,
      retryAfterSeconds: 60,
    })

    await expect(checkClassroomLookupRateLimit('127.0.0.1')).resolves.toEqual({
      available: true,
      allowed: true,
      remaining: 59,
      retryAfterSeconds: 60,
    })
  })

  it('maps a blocked code bucket without exposing the code', async () => {
    mockCacheService.consumeRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
    })

    await expect(checkFailedClassroomCodeRateLimit('127.0.0.1', '123456')).resolves.toEqual({
      available: true,
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
    })
    expect(mockCacheService.consumeRateLimit).toHaveBeenCalledWith(
      'classroom:lookup:failed:127.0.0.1:123456',
      5,
      60
    )
  })

  it('fails closed when Redis is unavailable', async () => {
    mockCacheService.consumeRateLimit.mockResolvedValue(null)

    await expect(checkClassroomLookupRateLimit('127.0.0.1')).resolves.toEqual({
      available: false,
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    })
  })

  it('keeps a shared-NAT budget for 100 students doing lookup and join', async () => {
    mockCacheService.consumeRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 299,
      retryAfterSeconds: 60,
    })

    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        Promise.all([
          checkClassroomLookupRateLimit('198.51.100.10'),
          checkClassroomLookupRateLimit('198.51.100.10'),
        ])
      )
    )

    expect(results.flat().every((result) => result.allowed)).toBe(true)
    expect(mockCacheService.consumeRateLimit).toHaveBeenCalledTimes(200)
    expect(
      new Set(
        mockCacheService.consumeRateLimit.mock.calls.map(
          ([, limit]: [string, number]) => limit
        )
      )
    ).toEqual(new Set([300]))
  })
})
