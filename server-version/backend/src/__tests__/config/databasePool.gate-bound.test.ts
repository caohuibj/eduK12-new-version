import { describe, expect, it } from 'vitest'
import { boundedTrainingStartConcurrency, defaultStartAdmissionBound, effectivePrismaPoolSize } from '../../config/databasePool'

describe('bounded START admission default bound vs effective pool', () => {
  it('with no explicit pool configuration the bound stays inside the default pool', () => {
    // No connection_limit in DATABASE_URL, no PRISMA_CONNECTION_POOL_SIZE:
    // the effective pool is the default 10, so the gate must never admit more.
    const bound = defaultStartAdmissionBound('postgresql://u:p@127.0.0.1:5568/db?schema=public', {})
    expect(effectivePrismaPoolSize('postgresql://u:p@127.0.0.1:5568/db?schema=public', {})).toBe(10)
    expect(bound).toBeLessThanOrEqual(10)
    expect(bound).toBeGreaterThanOrEqual(1)
  })

  it('a DATABASE_URL connection_limit wins over the env default', () => {
    const url = 'postgresql://u:p@127.0.0.1:5568/db?connection_limit=24&schema=public'
    expect(effectivePrismaPoolSize(url, {})).toBe(24)
    expect(defaultStartAdmissionBound(url, {})).toBeLessThanOrEqual(24)
  })

  it('PRISMA_CONNECTION_POOL_SIZE applies when the URL has no connection_limit', () => {
    expect(effectivePrismaPoolSize('postgresql://u:p@127.0.0.1:5568/db?schema=public', { PRISMA_CONNECTION_POOL_SIZE: '40' })).toBe(40)
    expect(defaultStartAdmissionBound('postgresql://u:p@127.0.0.1:5568/db?schema=public', { PRISMA_CONNECTION_POOL_SIZE: '40' })).toBeLessThanOrEqual(40)
  })

  it('the bound reserves connections for other business (3/4 of the pool)', () => {
    expect(defaultStartAdmissionBound('postgresql://u:p@127.0.0.1:5568/db?connection_limit=24&schema=public', {})).toBe(18)
  })
})


describe('explicit Training START headroom cap',()=>{
 it.each([[30,25,15],[20,35,20],[40,40,24],[1,10,1],[4,1,1]])('requested %i / pool %i -> %i',(requested,pool,expected)=>{
  expect(boundedTrainingStartConcurrency(requested,`postgresql://u:p@localhost/test?connection_limit=${pool}`,{})).toBe(expected)
 })
 it('uses URL pool precedence when old env pool is larger',()=>{
  expect(boundedTrainingStartConcurrency(30,'postgresql://u:p@localhost/test?connection_limit=10',{PRISMA_CONNECTION_POOL_SIZE:'40'})).toBe(6)
 })
})
