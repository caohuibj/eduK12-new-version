import { afterEach, describe, expect, it, vi } from 'vitest'

// HTTP contract with a real Linux host resource sampler and guard, but no DB
// writes: the START handler invokes the guard through its service boundary.
const host = vi.hoisted(() => ({ meminfoReads: 0, missing: false }))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: ((path: unknown, ...args: unknown[]) => {
      if (path === '/proc/meminfo') {
        host.meminfoReads += 1
        if (host.missing) throw new Error('missing synthetic MemAvailable')
        return 'MemAvailable: 614400 kB\n'
      }
      if (path === '/proc/stat') return 'cpu  100 0 100 900 0 0 0 0\n'
      return (actual.readFileSync as (...params: unknown[]) => unknown)(path, ...args)
    }) as typeof actual.readFileSync,
  }
})
vi.mock('../../modules/composite/composite.service', async (importOriginal) => ({
  ...(await importOriginal() as object),
  startPublicAttempt: async () => {
    const { assertAnonymousStartCriticalMemory } = await import('../../services/assessmentResourceProtection')
    assertAnonymousStartCriticalMemory()
    throw new Error('expected early anonymous memory guard to reject START')
  },
}))
const fakeRes = () => {
  const res: any = { headers: {} as Record<string, string>, statusCode: 200, body: undefined }
  res.setHeader = (key: string, value: string) => { res.headers[key] = value; return res }
  res.status = (statusCode: number) => { res.statusCode = statusCode; return res }
  res.json = (body: unknown) => { res.body = body; return res }
  return res
}
describe('public START host-memory sampling to HTTP response', () => {
  afterEach(() => { vi.unstubAllEnvs(); host.missing = false; vi.resetModules() })
  it.each([false, true])('serializes low or missing memory into a typed 503 and configured retry (missing=%s)', async missing => {
    host.missing = missing
    host.meminfoReads = 0
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_ANONYMOUS_EARLY_MEMORY_GUARD_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_HOST_MEMORY_RETRY_AFTER_SECONDS', '8')
    vi.resetModules()
    const { compositeController } = await import('../../modules/composite/composite.controller')
    const res = fakeRes()
    await compositeController.publicStart({ params: { token: 'public-token' }, body: {}, query: {} } as any, res)
    expect(host.meminfoReads).toBeGreaterThan(0)
    expect(res.statusCode).toBe(503)
    expect(res.headers['Retry-After']).toBe('8')
    expect(res.body).toMatchObject({ code: 'INSTRUMENT_NOT_AVAILABLE', data: null })
  })
})
