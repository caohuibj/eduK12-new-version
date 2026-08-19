import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getBullRedisOptions, getRedisUrl } from '../../config/redis'

const ORIGINAL_ENV = { ...process.env }

describe('redis config (D0-9.1)', () => {
  beforeEach(() => {
    // 每个用例从干净环境开始
    delete process.env.REDIS_URL
    delete process.env.REDIS_HOST
    delete process.env.REDIS_PORT
    delete process.env.REDIS_PASSWORD
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('returns REDIS_URL when provided (any env)', () => {
    process.env.REDIS_URL = 'redis://redis:6379'
    expect(getRedisUrl()).toBe('redis://redis:6379')
  })

  it('builds URL from REDIS_HOST + REDIS_PORT + REDIS_PASSWORD', () => {
    process.env.REDIS_HOST = 'my-redis'
    process.env.REDIS_PORT = '6380'
    process.env.REDIS_PASSWORD = 'secret'
    expect(getRedisUrl()).toBe('redis://:secret@my-redis:6380')
  })

  it('falls back to localhost in non-production when no config', () => {
    process.env.NODE_ENV = 'development'
    expect(getRedisUrl()).toBe('redis://localhost:6379')
  })

  it('throws in production when neither REDIS_URL nor REDIS_HOST is set', () => {
    process.env.NODE_ENV = 'production'
    expect(() => getRedisUrl()).toThrow(/拒绝回退到 localhost/)
  })

  it('getBullRedisOptions never throws (Bull keeps existing fallback)', () => {
    process.env.NODE_ENV = 'production'
    expect(() => getBullRedisOptions()).not.toThrow()
    expect(getBullRedisOptions()).toBe('redis://localhost:6379')
  })

  it('getBullRedisOptions returns REDIS_URL when provided', () => {
    process.env.NODE_ENV = 'production'
    process.env.REDIS_URL = 'redis://redis:6379'
    expect(getBullRedisOptions()).toBe('redis://redis:6379')
  })
})
