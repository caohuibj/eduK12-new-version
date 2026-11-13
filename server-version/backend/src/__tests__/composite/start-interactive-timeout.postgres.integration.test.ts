import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {PrismaClient} from '@prisma/client'
import {START_INTERACTIVE_TRANSACTION} from '../../modules/composite/start-transient'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'

// Proves the START interactive timeout (15s) lets a transaction that exceeds
// Prisma's default 5s timeout complete, and that the default still fails.
// Opt-in via START_TX_TIMEOUT_DATABASE_URL on an isolated loopback test DB.
const url=integrationDatabaseUrl('START_TX_TIMEOUT_DATABASE_URL')
const suite=url?describe:describe.skip

suite('START interactive transaction timeout (real PostgreSQL)',()=>{
  let client:PrismaClient
  beforeAll(()=>{
    requireIsolatedReleaseDatabase(url as string)
    client=new PrismaClient({datasources:{db:{url:url as string}}})
  })
  afterAll(async()=>{await client.$disconnect().catch(()=>undefined)})

  it('Prisma default 5s timeout rolls back a 6s in-tx sleep with P2028',async()=>{
    const started=Date.now()
    await expect(client.$transaction(async(tx)=>{
      await tx.$executeRaw`SELECT pg_sleep(6)`
      return 1
    })).rejects.toMatchObject({code:'P2028'})
    const elapsed=Date.now()-started
    expect(elapsed).toBeGreaterThan(4500)
    expect(elapsed).toBeLessThan(10_000)
  },20_000)

  it('START_INTERACTIVE_TRANSACTION lets a 6s in-tx sleep complete under 15s',async()=>{
    const started=Date.now()
    const result=await client.$transaction(async(tx)=>{
      await tx.$executeRaw`SELECT pg_sleep(6)`
      return 1
    },START_INTERACTIVE_TRANSACTION)
    const elapsed=Date.now()-started
    expect(result).toBe(1)
    expect(elapsed).toBeGreaterThan(5_500)
    expect(elapsed).toBeLessThan(15_000)
  },20_000)
})
