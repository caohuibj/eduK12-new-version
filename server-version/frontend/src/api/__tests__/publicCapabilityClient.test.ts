import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPublicCapabilityClient } from '../publicCapabilityClient'

describe('public capability client', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('sends only the resume bearer and omits cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ code: 0, message: 'ok', data: { id: 'session-1' } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(createPublicCapabilityClient('resume-secret').get('/assessments/session-1')).resolves.toMatchObject({
      code: 0,
      data: { id: 'session-1' },
    })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.credentials).toBe('omit')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer resume-secret')
  })

  it('raises application-level API errors even when HTTP status is 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ code: -1, message: '能力已失效' }),
    }))

    await expect(createPublicCapabilityClient('resume-secret').get('/assessments/session-1'))
      .rejects.toMatchObject({ message: '能力已失效', code: -1 })
  })
})
