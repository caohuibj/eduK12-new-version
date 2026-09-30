import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from './integration-env'
import { prismaPoolMetricLines } from '../../services/resourceMetrics'
const databaseUrl = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = databaseUrl ? describe : describe.skip
suite('actual Prisma engine pool observability', () => {
  it('distinguishes busy connections from queries waiting for a single pool slot', async () => {
    const url = new URL(databaseUrl!)
    url.searchParams.set('connection_limit', '1')
    const db = new PrismaClient({ datasources: { db: { url: url.toString() } } })
    try {
      await db.$connect()
      const work = Promise.all(Array.from({ length: 3 }, () => db.$executeRaw`SELECT pg_sleep(0.15)`))
      await new Promise(resolve => setTimeout(resolve, 80))
      const active = (await prismaPoolMetricLines(db)).join('\n')
      expect(active).toMatch(/prisma_pool_connections_busy 1/)
      expect(active).toMatch(/prisma_client_queries_wait [12]/)
      await work
      expect((await prismaPoolMetricLines(db)).join('\n')).toMatch(/prisma_client_queries_wait 0/)
    } finally { await db.$disconnect() }
  }, 15000)
})
