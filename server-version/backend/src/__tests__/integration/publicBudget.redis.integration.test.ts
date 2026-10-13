import express from 'express'
import type { Server } from 'node:http'
import { createClient } from 'redis'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cacheService } from '../../services/cacheService'
import { createBudgetLimiter } from '../../middleware/publicAssessmentRateLimit'
const suite = process.env.REDIS_URL ? describe : describe.skip
const servers: Server[] = []
let redis: ReturnType<typeof createClient>
let urls: string[] = []
suite('shared public assessment production budget on isolated Redis', () => {
  beforeAll(async () => {
    const target = new URL(process.env.REDIS_URL!)
    if (!['127.0.0.1','localhost'].includes(target.hostname)) throw new Error('isolated loopback Redis required')
    vi.stubEnv('NODE_ENV', 'production')
    await cacheService.initialize()
    redis = createClient({ url: process.env.REDIS_URL }); await redis.connect()
    for (let index = 0; index < 2; index++) {
      const app = express()
      app.get('/budget', createBudgetLimiter({ name: 'synthetic-public-followup', budget: 'get', limit: 3, key: () => 'same-classroom' }), (_req, res) => res.json({ ok: true }))
      const server = app.listen(0, '127.0.0.1'); servers.push(server)
      await new Promise<void>(resolve => server.once('listening', resolve))
      urls.push(`http://127.0.0.1:${(server.address() as { port: number }).port}/budget`)
    }
  })
  afterAll(async () => {
    await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))))
    const keys = await redis.keys('ratelimit:synthetic-public-followup:*'); if (keys.length) await redis.del(keys)
    if (cacheService.getStatus().connected) await cacheService.close(); await redis.quit(); vi.unstubAllEnvs()
  })
  it('shares one exact quota across independently constructed API limiters', async () => {
    expect((await fetch(urls[0])).status).toBe(200)
    expect((await fetch(urls[1])).status).toBe(200)
    expect((await fetch(urls[0])).status).toBe(200)
    const denied = await fetch(urls[1]); expect(denied.status).toBe(429)
    expect(denied.headers.get('retry-after')).toBeTruthy()
    expect(denied.headers.get('ratelimit')).toContain('remaining=0')
  })
  it('fails closed after shared Redis becomes unavailable', async () => {
    await cacheService.close()
    expect((await fetch(urls[0])).status).toBe(503)
  })
})
