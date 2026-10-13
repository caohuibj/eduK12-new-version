/** Redis-backed proof-of-work challenge store.
 *
 * Production never falls back to process-local state: if Redis is unavailable
 * challenge issuance/verification fails closed. Development and tests retain
 * a small in-memory fallback so the public flow remains usable offline.
 */
import crypto from 'crypto'
import { customAlphabet } from 'nanoid'
import NodeCache from 'node-cache'
import { createClient, type RedisClientType } from 'redis'
import { logger } from '../utils/logger'
import { getRedisUrl } from '../config/redis'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 32)
const TTL_SECONDS = 300
const INVENTORY_KEY = 'pow:active:v1'
const MAX_ACTIVE_CHALLENGES = 12_000

export class POWCapacityError extends Error {
  constructor(readonly retryAfterSeconds: number = TTL_SECONDS) {
    super('POW challenge capacity reached')
    this.name = 'POWCapacityError'
  }
}

function activeChallengeLimit(): number {
  const configured = process.env.POW_MAX_ACTIVE_CHALLENGES
  const limit = configured === undefined ? MAX_ACTIVE_CHALLENGES : Number(configured)
  // The default fits a small shared Redis instance. Operators may lower the
  // budget; raising its memory ceiling requires an explicit capacity review.
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_ACTIVE_CHALLENGES)
    throw new Error('Invalid POW_MAX_ACTIVE_CHALLENGES')
  return limit
}

const ISSUE_SCRIPT = `
local clock = redis.call('TIME')
local now_ms = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local ttl = tonumber(ARGV[1])
if redis.call('EXISTS', KEYS[1]) == 1 then return { -1, 0 } end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now_ms)
if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[2]) then
  local first = redis.call('ZRANGE', KEYS[2], 0, 0, 'WITHSCORES')
  return { 0, math.max(1, math.ceil((tonumber(first[2]) - now_ms) / 1000)) }
end
-- Reserve before allocating a challenge key. A failed SET releases its slot.
redis.call('ZADD', KEYS[2], now_ms + ttl * 1000, ARGV[3])
local stored = redis.pcall('SET', KEYS[1], ARGV[4], 'EX', ttl, 'NX')
if not stored or (type(stored) == 'table' and stored.err) then
  redis.call('ZREM', KEYS[2], ARGV[3])
  return { -1, 0 }
end
redis.call('EXPIRE', KEYS[2], ttl)
return { 1, 0 }
`
const EMISSION_SCRIPT = `
local global = tonumber(redis.call('GET', KEYS[1]) or '0')
local ip = tonumber(redis.call('GET', KEYS[2]) or '0')
if global >= 12000 or ip >= 1200 then return 0 end
local g = redis.call('INCR', KEYS[1])
if g == 1 then redis.call('EXPIRE', KEYS[1], 60) end
local i = redis.call('INCR', KEYS[2])
if i == 1 then redis.call('EXPIRE', KEYS[2], 60) end
return 1
`
const CONSUME_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if value then redis.call('DEL', KEYS[1]) end
redis.call('ZREM', KEYS[2], ARGV[1])
return value
`
const challengeCache = new NodeCache({ stdTTL: TTL_SECONDS, checkperiod: 60 })
let redisClient: RedisClientType | null = null
let redisConnectPromise: Promise<RedisClientType | null> | null = null

export interface POWChallenge {
  challenge: string
  difficulty: number
  timestamp: number
}

async function getRedis(): Promise<RedisClientType | null> {
  if (redisClient?.isReady) return redisClient
  if (!redisConnectPromise) {
    redisConnectPromise = (async () => {
      try {
        const client = createClient({ url: getRedisUrl() }) as RedisClientType
        client.on('error', () => logger.warn('POW Redis 客户端错误'))
        await client.connect()
        redisClient = client
        return client
      } catch {
        redisConnectPromise = null
        if (process.env.NODE_ENV === 'production') logger.error('POW Redis 不可用，生产环境拒绝使用进程内缓存')
        return null
      }
    })()
  }
  return redisConnectPromise
}

const keyFor = (challenge: string) => `pow:${challenge}`

export const powService = {
  async generateChallenge(difficulty: number = 4, issuer = 'unspecified'): Promise<POWChallenge> {
    const limit = activeChallengeLimit()
    const challenge: POWChallenge = { challenge: nanoid(), difficulty, timestamp: Date.now() }
    const redis = await getRedis()
    if (redis) {
      // Global admission bounds both issuance rate and the number of IP counter
      // keys. Rejected requests never allocate a new IP or challenge key.
      const emitted = await redis.eval(EMISSION_SCRIPT, {
        keys: ['pow-issue:global:v1', `pow-issue:ip:${crypto.createHash('sha256').update(issuer).digest('hex')}`], arguments: [],
      })
      if (Number(emitted) !== 1) throw new POWCapacityError(60)
      // One fixed inventory key bounds cardinality across backend processes;
      // unsuccessful requests create no per-request or per-IP budget keys.
      const result = await redis.eval(ISSUE_SCRIPT, {
        keys: [keyFor(challenge.challenge), INVENTORY_KEY],
        arguments: [String(TTL_SECONDS), String(limit), challenge.challenge, JSON.stringify(challenge)],
      }) as unknown
      if (!Array.isArray(result) || result.length !== 2) throw new Error('POW 服务暂不可用')
      if (Number(result[0]) === 0) {
        const wait = Number(result[1])
        if (!Number.isSafeInteger(wait) || wait < 1 || wait > TTL_SECONDS) throw new Error('POW 服务暂不可用')
        throw new POWCapacityError(wait)
      }
      if (Number(result[0]) !== 1) throw new Error('POW 服务暂不可用')
    } else if (process.env.NODE_ENV !== 'production') {
      // NodeCache sweeps only once a minute: reclaim expired slots before
      // admission so the fallback has the same exact expiry behavior.
      for (const key of challengeCache.keys()) {
        const expiry = challengeCache.getTtl(key)
        if (expiry !== undefined && expiry <= Date.now()) challengeCache.del(key)
      }
      if (challengeCache.keys().length >= limit) throw new POWCapacityError()
      challengeCache.set(keyFor(challenge.challenge), challenge, TTL_SECONDS)
    } else throw new Error('POW 服务暂不可用')
    return challenge
  },

  async getChallenge(challenge: string): Promise<POWChallenge | undefined> {
    const redis = await getRedis()
    if (redis) {
      const raw = await redis.get(keyFor(challenge))
      if (!raw) return undefined
      try { return JSON.parse(raw) as POWChallenge } catch { return undefined }
    }
    if (process.env.NODE_ENV !== 'production') return challengeCache.get(keyFor(challenge)) as POWChallenge | undefined
    return undefined
  },

  async verifyPOW(challenge: string, proof: string, difficulty: number): Promise<boolean> {
    const hash = crypto.createHash('sha256').update(`${challenge}${proof}`).digest('hex')
    if (!hash.startsWith('0'.repeat(difficulty))) return false
    const redis = await getRedis()
    if (redis) {
      // GET+DEL in one Lua script makes a successful challenge single-use
      // across all backend processes.
      const raw = await redis.eval(CONSUME_SCRIPT, {
        keys: [keyFor(challenge), INVENTORY_KEY], arguments: [challenge],
      }) as string | null
      if (!raw) return false
      try {
        const stored = JSON.parse(raw) as POWChallenge
        return stored.difficulty === difficulty
      } catch { return false }
    }
    if (process.env.NODE_ENV !== 'production') {
      const stored = challengeCache.get(keyFor(challenge)) as POWChallenge | undefined
      if (!stored || stored.difficulty !== difficulty) return false
      challengeCache.del(keyFor(challenge))
      return true
    }
    return false
  },

  async isChallengeValid(challenge: string): Promise<boolean> { return Boolean(await this.getChallenge(challenge)) },

  calculateHash(challenge: string, proof: string): string { return crypto.createHash('sha256').update(`${challenge}${proof}`).digest('hex') },

  getStats() { return { totalChallenges: challengeCache.keys().length, stats: challengeCache.getStats() } },
}
