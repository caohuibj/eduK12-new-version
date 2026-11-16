import { afterEach, describe, expect, it, vi } from 'vitest'
import { hashPublicAccessToken } from '../../services/publicAccessTokenCrypto'

// End-to-end HTTP controller -> real startPublicAttempt -> real procfs sampler
// and early memory guard: proves low/missing memory rejects before fat composite
// loading and before any DB write transaction.
const state = vi.hoisted(() => ({
  meminfoReads: 0,
  missing: false,
  availableKiB: 649 * 1024,
  prisma: {
    compositeAssessmentAccessToken: { findUnique: vi.fn() },
    compositeAssessment: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: ((path: unknown, ...args: unknown[]) => {
      if (path === '/proc/meminfo') {
        state.meminfoReads += 1
        if (state.missing) throw new Error('missing synthetic MemAvailable')
        return `MemAvailable: ${state.availableKiB} kB\n`
      }
      if (path === '/proc/stat') return 'cpu  100 0 100 900 0 0 0 0\n'
      return (actual.readFileSync as (...params: unknown[]) => unknown)(path, ...args)
    }) as typeof actual.readFileSync,
  }
})
vi.mock('../../config/database', () => ({ prisma: state.prisma }))

const fakeRes = () => {
  const res: any = { headers: {} as Record<string, string>, statusCode: 200, body: undefined }
  res.setHeader = (key: string, value: string) => { res.headers[key] = value; return res }
  res.status = (statusCode: number) => { res.statusCode = statusCode; return res }
  res.json = (body: unknown) => { res.body = body; return res }
  return res
}

const seedValidToken = () => {
  const tokenValue = 'public-token-123456'
  state.prisma.compositeAssessmentAccessToken.findUnique.mockResolvedValue({
    id: 'tok-1',
    tokenHash: hashPublicAccessToken(tokenValue),
    isActive: true,
    expiresAt: new Date('2030-01-01T00:00:00Z'),
    maxUses: 0,
    usedCount: 0,
    compositeAssessment: {
      id: 'comp-1',
      status: 'PUBLISHED',
      publicEnabled: true,
      opensAt: null,
      expiresAt: null,
    },
  })
  return tokenValue
}

describe('public START host-memory sampling to HTTP response', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
    state.missing = false
    state.availableKiB = 649 * 1024
    state.meminfoReads = 0
    vi.resetModules()
  })

  it.each([
    { missing: false, availableKiB: 649 * 1024, retryAfter: undefined, expectedRetryAfter: '10' },
    { missing: false, availableKiB: 649 * 1024, retryAfter: '8', expectedRetryAfter: '8' },
    { missing: true, availableKiB: 649 * 1024, retryAfter: '8', expectedRetryAfter: '8' },
  ])('rejects before loadStartComposite and transaction on low/missing telemetry (missing=$missing, hint=$expectedRetryAfter)', async (tc) => {
    state.missing = tc.missing
    state.availableKiB = tc.availableKiB
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_ANONYMOUS_EARLY_MEMORY_GUARD_ENABLED', 'true')
    if (tc.retryAfter) vi.stubEnv('ASSESSMENT_HOST_MEMORY_RETRY_AFTER_SECONDS', tc.retryAfter)
    vi.resetModules()

    const tokenValue = seedValidToken()
    const { compositeController } = await import('../../modules/composite/composite.controller')
    const res = fakeRes()
    await compositeController.publicStart({ params: { token: tokenValue }, body: {}, query: {} } as any, res)

    expect(state.meminfoReads).toBeGreaterThan(0)
    expect(state.prisma.compositeAssessment.findUnique).not.toHaveBeenCalled()
    expect(state.prisma.$transaction).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(503)
    expect(res.headers['Retry-After']).toBe(tc.expectedRetryAfter)
    expect(res.body).toMatchObject({ code: 'INSTRUMENT_NOT_AVAILABLE', data: null })
  }, 20_000)

  it('allows exact 650 MiB threshold past the early guard to loadStartComposite', async () => {
    state.availableKiB = 650 * 1024
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_ANONYMOUS_EARLY_MEMORY_GUARD_ENABLED', 'true')
    vi.resetModules()

    const tokenValue = seedValidToken()
    const sentinel = Object.assign(new Error('reached loadStartComposite'), { statusCode: 499 })
    state.prisma.compositeAssessment.findUnique.mockRejectedValueOnce(sentinel)
    const { compositeController } = await import('../../modules/composite/composite.controller')
    const res = fakeRes()
    await compositeController.publicStart({ params: { token: tokenValue }, body: {}, query: {} } as any, res)

    expect(state.meminfoReads).toBeGreaterThan(0)
    expect(state.prisma.compositeAssessment.findUnique).toHaveBeenCalledTimes(1)
    expect(state.prisma.$transaction).not.toHaveBeenCalled()
    expect(res.statusCode).not.toBe(503)
  }, 20_000)

  it('keeps default-off behavior at 649 MiB unless the opt-in guard flag is enabled', async () => {
    state.availableKiB = 649 * 1024
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_ANONYMOUS_EARLY_MEMORY_GUARD_ENABLED', '')
    vi.resetModules()

    const tokenValue = seedValidToken()
    const sentinel = Object.assign(new Error('reached loadStartComposite'), { statusCode: 499 })
    state.prisma.compositeAssessment.findUnique.mockRejectedValueOnce(sentinel)
    const { compositeController } = await import('../../modules/composite/composite.controller')
    const res = fakeRes()
    await compositeController.publicStart({ params: { token: tokenValue }, body: {}, query: {} } as any, res)

    expect(state.prisma.compositeAssessment.findUnique).toHaveBeenCalledTimes(1)
    expect(res.statusCode).not.toBe(503)
  }, 20_000)
})
