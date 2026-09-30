import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
const holder = vi.hoisted(() => ({ client: null as any }))
vi.mock('redis', () => ({ createClient: () => holder.client }))
import { cacheService } from '../../services/cacheService'
describe('cache runtime recovery', () => {
  beforeEach(() => { holder.client = Object.assign(new EventEmitter(), { connect: vi.fn().mockResolvedValue(undefined), eval: vi.fn().mockResolvedValue([1, 60]) }) })
  it('fails closed during outage and restores shared limiter after reconnect without restart', async () => {
    await cacheService.initialize()
    expect(cacheService.getStatus().connected).toBe(true)
    holder.client.emit('error', new Error('transient'))
    expect(cacheService.getStatus().connected).toBe(false)
    expect(await cacheService.consumeRateLimit('recovery', 10, 60)).toBeNull()
    holder.client.emit('reconnecting')
    holder.client.emit('ready')
    expect(cacheService.getStatus().connected).toBe(true)
    expect(await cacheService.consumeRateLimit('recovery', 10, 60)).toMatchObject({ allowed: true })
  })
})
