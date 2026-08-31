import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRISMA_CONNECTION_POOL_SIZE,
  DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS,
  buildDatabaseUrl,
} from '../../config/databasePool'

describe('Prisma database pool contract', () => {
  it('injects the configured pool settings when the URL omits them', () => {
    const result = new URL(buildDatabaseUrl(
      'postgresql://user:pass@localhost:5432/ptool?schema=public',
      { PRISMA_CONNECTION_POOL_SIZE: '15', PRISMA_POOL_TIMEOUT: '12' },
    )!)

    expect(result.searchParams.get('connection_limit')).toBe('15')
    expect(result.searchParams.get('pool_timeout')).toBe('12')
  })

  it('preserves explicit DATABASE_URL values', () => {
    const result = new URL(buildDatabaseUrl(
      'postgresql://user:pass@localhost:5432/ptool?schema=public&connection_limit=24&pool_timeout=7',
      { PRISMA_CONNECTION_POOL_SIZE: '2', PRISMA_POOL_TIMEOUT: '3' },
    )!)

    expect(result.searchParams.get('connection_limit')).toBe('24')
    expect(result.searchParams.get('pool_timeout')).toBe('7')
  })

  it('falls back safely for missing or invalid environment values', () => {
    const result = new URL(buildDatabaseUrl(
      'postgresql://user:pass@localhost:5432/ptool',
      { PRISMA_CONNECTION_POOL_SIZE: 'not-a-number', PRISMA_POOL_TIMEOUT: '0' },
    )!)

    expect(result.searchParams.get('connection_limit')).toBe(String(DEFAULT_PRISMA_CONNECTION_POOL_SIZE))
    expect(result.searchParams.get('pool_timeout')).toBe(String(DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS))
  })
})
