import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRISMA_CONNECTION_POOL_SIZE,
  DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS,
  buildDatabaseUrl,
  detectDatabasePoolConfigConflicts,
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

  it('uses conservative defaults only when environment values are absent', () => {
    const result = new URL(buildDatabaseUrl(
      'postgresql://user:pass@localhost:5432/ptool',
      {},
    )!)

    expect(result.searchParams.get('connection_limit')).toBe(String(DEFAULT_PRISMA_CONNECTION_POOL_SIZE))
    expect(result.searchParams.get('pool_timeout')).toBe(String(DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS))
  })
})

it.each(['0', '-1', 'NaN', '1.2', '999999'])('rejects malformed pool configuration %s', value => {
  expect(() => buildDatabaseUrl('postgresql://localhost/db', { PRISMA_CONNECTION_POOL_SIZE: value })).toThrow('PRISMA_CONNECTION_POOL_SIZE')
  expect(() => buildDatabaseUrl(`postgresql://localhost/db?pool_timeout=${value}`, {})).toThrow('pool_timeout')
})

describe('detectDatabasePoolConfigConflicts', () => {
  it('reports mismatches between explicit DATABASE_URL pool params and env vars', () => {
    expect(detectDatabasePoolConfigConflicts(
      'postgresql://user:pass@localhost:5432/ptool?connection_limit=20&pool_timeout=15',
      { PRISMA_CONNECTION_POOL_SIZE: '10', PRISMA_POOL_TIMEOUT: '30' },
    )).toEqual([
      { parameter: 'connection_limit', urlValue: 20, envName: 'PRISMA_CONNECTION_POOL_SIZE', envValue: 10 },
      { parameter: 'pool_timeout', urlValue: 15, envName: 'PRISMA_POOL_TIMEOUT', envValue: 30 },
    ])
  })

  it('returns empty when aligned or omitted', () => {
    expect(detectDatabasePoolConfigConflicts(
      'postgresql://user:pass@localhost:5432/ptool?connection_limit=10&pool_timeout=30',
      { PRISMA_CONNECTION_POOL_SIZE: '10', PRISMA_POOL_TIMEOUT: '30' },
    )).toEqual([])
    expect(detectDatabasePoolConfigConflicts(
      'postgresql://user:pass@localhost:5432/ptool',
      { PRISMA_CONNECTION_POOL_SIZE: '10' },
    )).toEqual([])
  })
})
