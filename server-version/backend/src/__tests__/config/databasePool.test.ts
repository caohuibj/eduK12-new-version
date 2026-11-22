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

  it('supports optional statement_cache_size and connection-lifetime overrides while preserving URL precedence', () => {
    const injected = new URL(buildDatabaseUrl(
      'postgresql://user:pass@localhost:5432/ptool?schema=public',
      {
        PRISMA_STATEMENT_CACHE_SIZE: '60',
        PRISMA_MAX_IDLE_CONNECTION_LIFETIME_SECONDS: '120',
        PRISMA_MAX_CONNECTION_LIFETIME_SECONDS: '900',
      },
    )!)
    expect(injected.searchParams.get('statement_cache_size')).toBe('60')
    expect(injected.searchParams.get('max_idle_connection_lifetime')).toBe('120')
    expect(injected.searchParams.get('max_connection_lifetime')).toBe('900')

    const preserved = new URL(buildDatabaseUrl(
      'postgresql://user:pass@localhost:5432/ptool?statement_cache_size=0&max_idle_connection_lifetime=45',
      {
        PRISMA_STATEMENT_CACHE_SIZE: '80',
        PRISMA_MAX_IDLE_CONNECTION_LIFETIME_SECONDS: '120',
      },
    )!)
    expect(preserved.searchParams.get('statement_cache_size')).toBe('0')
    expect(preserved.searchParams.get('max_idle_connection_lifetime')).toBe('45')

    expect(detectDatabasePoolConfigConflicts(
      'postgresql://user:pass@localhost:5432/ptool?statement_cache_size=80&max_connection_lifetime=600',
      { PRISMA_STATEMENT_CACHE_SIZE: '60', PRISMA_MAX_CONNECTION_LIFETIME_SECONDS: '900' },
    )).toEqual([
      { parameter: 'statement_cache_size', urlValue: 80, envName: 'PRISMA_STATEMENT_CACHE_SIZE', envValue: 60 },
      { parameter: 'max_connection_lifetime', urlValue: 600, envName: 'PRISMA_MAX_CONNECTION_LIFETIME_SECONDS', envValue: 900 },
    ])

    expect(() => buildDatabaseUrl('postgresql://localhost/db', { PRISMA_STATEMENT_CACHE_SIZE: '-1' })).toThrow('PRISMA_STATEMENT_CACHE_SIZE')
    // Prisma's Rust pool explicitly accepts zero to disable each lifetime.
    const disabled = new URL(buildDatabaseUrl(
      'postgresql://localhost/db?max_idle_connection_lifetime=0',
      { PRISMA_MAX_CONNECTION_LIFETIME_SECONDS: '0' },
    )!)
    expect(disabled.searchParams.get('max_idle_connection_lifetime')).toBe('0')
    expect(disabled.searchParams.get('max_connection_lifetime')).toBe('0')
    expect(() => buildDatabaseUrl('postgresql://localhost/db', { PRISMA_MAX_IDLE_CONNECTION_LIFETIME_SECONDS: '-1' })).toThrow('PRISMA_MAX_IDLE_CONNECTION_LIFETIME_SECONDS')
    expect(() => buildDatabaseUrl('postgresql://localhost/db?max_connection_lifetime=-1', {})).toThrow('max_connection_lifetime')
  })
})
