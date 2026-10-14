import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../config/database'
import { cacheService } from '../../services/cacheService'
import { createMfaAttemptRateLimiter } from '../../middleware/mfaAttemptRateLimit'
import { integrationDatabaseUrl } from './integration-env'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
if (!url || !new URL(url).pathname.includes('_ci') || new URL(url).hostname !== '127.0.0.1') throw new Error('Explicit isolated loopback database required')
if (!process.env.REDIS_URL || new URL(process.env.REDIS_URL).hostname !== '127.0.0.1') throw new Error('Explicit isolated loopback Redis required')
const previousNodeEnv = process.env.NODE_ENV
const ip = 'isolated-mfa-' + randomUUID()
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const res = () => {
  const value: any = { statusCode: 0, setHeader: vi.fn() }
  value.status = (code: number) => { value.statusCode = code; return value }
  value.json = (body: unknown) => { value.body = body; return value }
  return value
}
beforeAll(async () => { await cacheService.initialize(); process.env.NODE_ENV = 'production' })
afterAll(async () => {
  process.env.NODE_ENV = previousNodeEnv
  await cacheService.close()
  await prisma.$disconnect()
})
describe('MFA account budgets with real PostgreSQL and Redis', () => {
  it('keeps different pending accounts independent and shares each account across School and Teacher', async () => {
    const school = createMfaAttemptRateLimiter({ realm: 'SCHOOL', ipName: 'campus-mfa-challenge', pendingCookieName: 'huischool_mfa_pending' })
    const teacher = createMfaAttemptRateLimiter({ realm: 'SCHOOL', ipName: 'huiteacher-mfa-challenge', pendingCookieName: 'huischool_mfa_pending' })
    const users = await Promise.all(Array.from({ length: 30 }, () => prisma.user.create({ data: {
      username: 'isolated-mfa-' + randomUUID(), accountDomain: 'SCHOOL', role: 'TEACHER', passwordHash: 'synthetic-only',
    } })))
    const challenges: string[] = []
    for (const user of users) {
      const raw = randomBytes(32).toString('base64url'); challenges.push(raw)
      await prisma.campusMfaChallenge.create({ data: {
        id: randomUUID(), userId: user.id, challengeHash: digest(raw), tokenVersion: 0,
        expiresAt: new Date(Date.now() + 300000),
      } })
    }
    const next = vi.fn()
    for (const raw of challenges) await school({
      ip, socket: {}, headers: { cookie: 'huischool_mfa_pending=' + raw },
    } as any, res(), next)
    expect(next).toHaveBeenCalledTimes(30)
    const req: any = { ip, socket: {}, headers: { cookie: 'huischool_mfa_pending=' + challenges[0] } }
    // This account already consumed one setup/verification request above.
    for (let i = 0; i < 19; i++) {
      const response = res()
      await teacher(req, response, next)
      expect(response.statusCode).toBe(0)
    }
    const rejected = res()
    await school(req, rejected, next)
    expect(rejected.statusCode).toBe(429)
    const other = res()
    await school({ ...req, headers: { cookie: 'huischool_mfa_pending=' + challenges[1] } }, other, next)
    expect(other.statusCode).toBe(0)
    expect(next).toHaveBeenCalledTimes(50)
  })
})
