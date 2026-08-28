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
  async generateChallenge(difficulty: number = 4): Promise<POWChallenge> {
    const challenge: POWChallenge = { challenge: nanoid(), difficulty, timestamp: Date.now() }
    const redis = await getRedis()
    if (redis) await redis.setEx(keyFor(challenge.challenge), TTL_SECONDS, JSON.stringify(challenge))
    else if (process.env.NODE_ENV !== 'production') challengeCache.set(keyFor(challenge.challenge), challenge, TTL_SECONDS)
    else throw new Error('POW 服务暂不可用')
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
      const raw = await redis.eval('local v=redis.call("GET",KEYS[1]); if v then redis.call("DEL",KEYS[1]); end; return v', { keys: [keyFor(challenge)] }) as string | null
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
