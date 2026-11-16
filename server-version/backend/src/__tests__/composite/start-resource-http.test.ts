import { afterEach, describe, expect, it, vi } from 'vitest'

// Exercise the real host sampler and resource guard with controlled Linux
// procfs readings, then verify how the START controller serializes the error.
const proc = vi.hoisted(() => ({ meminfoReads: 0 }))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: ((path: unknown, ...args: unknown[]) => {
      if (path === '/proc/meminfo') {
        proc.meminfoReads += 1
        return 'MemAvailable: 665600 kB\n'
      }
      if (path === '/proc/stat') return 'cpu  100 0 100 900 0 0 0 0\n'
      return (actual.readFileSync as (...params: unknown[]) => unknown)(path, ...args)
    }) as typeof actual.readFileSync,
  }
})

// Keep database writes out of this contract test; the START handler delegates
// to the real resource guard rather than to a manufactured 503 exception.
vi.mock('../../modules/composite/composite.service', async (importOriginal) => ({
  ...(await importOriginal() as object),
  startUserAttempt: async () => {
    const { assertAssessmentStartResources } = await import('../../services/assessmentResourceProtection')
    assertAssessmentStartResources()
    throw new Error('expected low-memory resource guard to reject START')
  },
}))

import { compositeController } from '../../modules/composite/composite.controller'

const fakeRes = () => {
  const res: any = { headers: {} as Record<string, string>, statusCode: 200, body: undefined }
  res.setHeader = (key: string, value: string) => { res.headers[key] = value; return res }
  res.status = (statusCode: number) => { res.statusCode = statusCode; return res }
  res.json = (body: unknown) => { res.body = body; return res }
  return res
}

describe('START host-memory sample to HTTP retry response', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('samples low MemAvailable and returns a typed 503 with the default 10-second hint', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    const res = fakeRes()
    await compositeController.startAttempt({
      user: { userId: 'user-1', role: 'STUDENT' },
      params: { id: 'composite-1' },
      query: {},
      body: {},
    } as any, res)

    expect(proc.meminfoReads).toBeGreaterThan(0)
    expect(res.statusCode).toBe(503)
    expect(res.headers['Retry-After']).toBe('10')
    expect(res.body).toMatchObject({ code: 'INSTRUMENT_NOT_AVAILABLE', data: null })
  })
})
