import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const m = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  userFindUnique: vi.fn(),
  courseFindUnique: vi.fn(),
  teacherCodeFindUnique: vi.fn(),
  verifyToken: vi.fn(),
  comparePassword: vi.fn(),
  consumeRateLimit: vi.fn(),
  refundRateLimit: vi.fn(),
}))

vi.mock('../../config/database', () => ({
  prisma: {
    $queryRaw: m.queryRaw,
    user: { findUnique: m.userFindUnique },
    course: { findUnique: m.courseFindUnique },
    teacherCode: { findUnique: m.teacherCodeFindUnique },
  },
}))

vi.mock('../../utils/jwt', () => ({
  verifyToken: m.verifyToken,
  generateToken: vi.fn().mockReturnValue('mocked-token'),
}))

vi.mock('../../utils/password', () => ({
  comparePassword: m.comparePassword,
  hashPassword: vi.fn().mockResolvedValue('mocked-hash'),
  isValidPassword: vi.fn().mockReturnValue(true),
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
}))

vi.mock('../../services/cacheService', () => ({
  cacheService: {
    consumeRateLimit: m.consumeRateLimit,
    refundRateLimit: m.refundRateLimit,
  },
}))

vi.mock('../../utils/sessionRevocation', () => ({
  isSessionRevoked: vi.fn().mockResolvedValue(false),
}))

import { loadPrincipal, invalidatePrincipalCache, getPrincipalCacheSize, authenticate } from '../../middleware/auth'
import { passwordVerificationPool } from '../../services/passwordVerificationPool'
import { loginPasswordVerificationAdmission } from '../../middleware/loginRateLimit'
import { wholeSubmitAdmission } from '../../services/wholeSubmitAdmission'
import { resolveTrainingCode, findCachedCourse, invalidateCourseLookupCache, getCourseLookupCacheSize } from '../../modules/training/auth'
import { registrationRateLimit } from '../../middleware/registrationAdmission'

describe('PR-A: Training Gate & Auth Optimizations', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    invalidatePrincipalCache()
    invalidateCourseLookupCache()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    invalidatePrincipalCache()
    invalidateCourseLookupCache()
    process.env = { ...originalEnv }
  })

  describe('[EXEC-AUTH-01] loadPrincipal in-memory LRU cache', () => {
    const mockPrincipalRow = [{
      id: 'student-001',
      username: 'student_captest',
      accountDomain: 'TRAINING',
      role: UserRole.STUDENT,
      platformRole: 'STANDARD',
      tokenVersion: 1,
      mustChangePassword: false,
      isActive: true,
      isFrozen: false,
      expiresAt: null,
      teacherApproved: true,
      entryGrants: [],
      needsMfa: false,
    }]

    it('caches principal in memory within TTL to eliminate redundant queries', async () => {
      process.env.AUTH_PRINCIPAL_CACHE_TTL_MS = '15000'
      m.queryRaw.mockResolvedValue(mockPrincipalRow)

      const p1 = await loadPrincipal('student-001')
      expect(p1).not.toBeNull()
      expect(p1?.userId).toBe('student-001')
      expect(m.queryRaw).toHaveBeenCalledTimes(1)
      expect(getPrincipalCacheSize()).toBe(1)

      // Subsequent call within TTL returns cached result without querying DB
      const p2 = await loadPrincipal('student-001')
      expect(p2).toEqual(p1)
      expect(m.queryRaw).toHaveBeenCalledTimes(1)
    })

    it('invalidates cache by userId and queries DB afresh', async () => {
      process.env.AUTH_PRINCIPAL_CACHE_TTL_MS = '15000'
      m.queryRaw.mockResolvedValue(mockPrincipalRow)

      await loadPrincipal('student-001')
      expect(m.queryRaw).toHaveBeenCalledTimes(1)

      invalidatePrincipalCache('student-001')
      expect(getPrincipalCacheSize()).toBe(0)

      await loadPrincipal('student-001')
      expect(m.queryRaw).toHaveBeenCalledTimes(2)
    })

    it('re-queries DB when tokenVersion mismatches cached principal', async () => {
      process.env.AUTH_PRINCIPAL_CACHE_TTL_MS = '15000'
      m.queryRaw
        .mockResolvedValueOnce(mockPrincipalRow) // Initial load: tokenVersion = 1
        .mockResolvedValueOnce([{ ...mockPrincipalRow[0], tokenVersion: 2 }]) // Reload after version bump

      // Populate cache with tokenVersion = 1
      await loadPrincipal('student-001')
      expect(m.queryRaw).toHaveBeenCalledTimes(1)

      // Request with newer tokenVersion = 2 arrives
      m.verifyToken.mockReturnValue({
        userId: 'student-001',
        username: 'student_captest',
        role: UserRole.STUDENT,
        accountDomain: 'TRAINING',
        tokenVersion: 2,
      })

      const req: any = {
        headers: { cookie: 'ptool_session=new-jwt-token' },
        originalUrl: '/api/composite-assessments/available',
      }
      const res: any = { statusCode: 200, setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() }
      const next = vi.fn()

      await authenticate(req, res, next)

      // Must have reloaded fresh from DB because cached tokenVersion (1) !== payload tokenVersion (2)
      expect(m.queryRaw).toHaveBeenCalledTimes(2)
      expect(next).toHaveBeenCalledOnce()
      expect(req.user?.tokenVersion).toBe(2)
    })

    it('respects AUTH_PRINCIPAL_CACHE_MAX_ENTRIES bounds by evicting oldest entry', async () => {
      process.env.AUTH_PRINCIPAL_CACHE_TTL_MS = '15000'
      process.env.AUTH_PRINCIPAL_CACHE_MAX_ENTRIES = '2'

      m.queryRaw.mockImplementation(async (query: any, ...args: any[]) => {
        const id = args[0] || 'id'
        return [{ ...mockPrincipalRow[0], id, username: `user_${id}` }]
      })

      await loadPrincipal('user-A')
      await loadPrincipal('user-B')
      expect(getPrincipalCacheSize()).toBe(2)

      // Adding third should evict user-A
      await loadPrincipal('user-C')
      expect(getPrincipalCacheSize()).toBe(2)

      // Loading user-B should be a cache hit (MRU refreshed)
      m.queryRaw.mockClear()
      await loadPrincipal('user-B')
      expect(m.queryRaw).not.toHaveBeenCalled()

      // Loading user-A should be a cache miss (was evicted)
      await loadPrincipal('user-A')
      expect(m.queryRaw).toHaveBeenCalledTimes(1)
    })
  })

  describe('[EXEC-LOGIN-02] Worker pool expansion and gate concurrency', () => {
    it('allows LOGIN_PASSWORD_WORKERS up to 32', () => {
      process.env.LOGIN_PASSWORD_WORKERS = '16'
      const pool = passwordVerificationPool()
      expect(pool).toBeDefined()
    })

    it('rejects invalid LOGIN_PASSWORD_WORKERS above 32 or negative', () => {
      process.env.LOGIN_PASSWORD_WORKERS = '33'
      expect(() => passwordVerificationPool()).toThrow('Invalid LOGIN_PASSWORD_WORKERS')

      process.env.LOGIN_PASSWORD_WORKERS = '-1'
      expect(() => passwordVerificationPool()).toThrow('Invalid LOGIN_PASSWORD_WORKERS')
    })

    it('defaults login_password_verify admission gate maxConcurrent to 16', () => {
      const stats = loginPasswordVerificationAdmission.getStats()
      expect(stats.options.maxConcurrent).toBe(16)
      expect(stats.options.maxWaitMs).toBe(30_000)
    })
  })

  describe('[EXEC-LOGIN-03] resolveTrainingCode course lookup caching and 503 exemption', () => {
    const mockCourse = {
      id: 'course-captest-01',
      title: 'Training Concurrency Test Course',
      status: 'PUBLISHED',
      endedAt: null,
      isRecruiting: true,
      isLibrary: false,
    }

    it('caches course lookups for 30s when enabled to collapse repeated calls', async () => {
      process.env.TRAINING_COURSE_CACHE_TTL_MS = '30000'
      m.courseFindUnique.mockResolvedValue(mockCourse)

      const c1 = await findCachedCourse('GZ85ENTQN83X')
      expect(c1).toEqual(mockCourse)
      expect(m.courseFindUnique).toHaveBeenCalledTimes(1)
      expect(getCourseLookupCacheSize()).toBe(1)

      const c2 = await findCachedCourse('GZ85ENTQN83X')
      expect(c2).toEqual(mockCourse)
      expect(m.courseFindUnique).toHaveBeenCalledTimes(1)
    })

    it('invalidates course cache on demand', async () => {
      process.env.TRAINING_COURSE_CACHE_TTL_MS = '30000'
      m.courseFindUnique.mockResolvedValue(mockCourse)

      await findCachedCourse('GZ85ENTQN83X')
      expect(m.courseFindUnique).toHaveBeenCalledTimes(1)

      invalidateCourseLookupCache('GZ85ENTQN83X')
      expect(getCourseLookupCacheSize()).toBe(0)

      await findCachedCourse('GZ85ENTQN83X')
      expect(m.courseFindUnique).toHaveBeenCalledTimes(2)
    })

    it('exempts 503 busy responses by refunding consumed rate limit tokens', async () => {
      process.env.NODE_ENV = 'production'
      m.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 100, retryAfterSeconds: 900 })

      const req: any = {
        body: { code: 'GZ85ENTQN83X' },
        ip: '192.168.1.100',
        socket: { remoteAddress: '192.168.1.100' },
      }

      let finishListener: (() => void) | undefined
      const res: any = {
        statusCode: 200,
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        once: vi.fn((event: string, listener: () => void) => {
          if (event === 'finish') finishListener = listener
        }),
      }
      const next = vi.fn()

      await registrationRateLimit(req, res, next)
      expect(next).toHaveBeenCalledOnce()
      expect(res.once).toHaveBeenCalledWith('finish', expect.any(Function))
      expect(m.consumeRateLimit).toHaveBeenCalled()

      // When request finishes with 503 Busy, consumed tokens must be refunded
      res.statusCode = 503
      finishListener?.()
      expect(m.refundRateLimit).toHaveBeenCalled()
    })
  })

  describe('[EXEC-SUBMIT-02] whole_submit admission gate configuration', () => {
    it('sets maxQueue default to 300 and maxWaitMs default to 10000ms', () => {
      const stats = wholeSubmitAdmission.getStats()
      expect(stats.options.name).toBe('whole_submit')
      expect(stats.options.maxConcurrent).toBe(32)
      expect(stats.options.maxQueue).toBe(300)
      expect(stats.options.maxWaitMs).toBe(10000)
    })
  })
})
