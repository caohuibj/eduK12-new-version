import { createServer, type Server } from 'node:http'
import createExpress from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'

const {
  mockGetWholeQuestionnaireTemplate,
  mockAuthUser,
  mockRespondentGate,
} = vi.hoisted(() => ({
  mockGetWholeQuestionnaireTemplate: vi.fn(),
  mockAuthUser: { userId: 'student-1', role: 'STUDENT' },
  mockRespondentGate: vi.fn((_req: any, _res: any, next: any) => next()),
}))

vi.mock('../../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { ...mockAuthUser }
    next()
  },
  requireAdmin: (_req: any, _res: any, next: any) => next(),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireTeacher: (_req: any, _res: any, next: any) => next(),
}))

vi.mock('../../modules/assessment-run/runtimeAccess', () => ({
  runOrLegacyRespondentAccess: () => mockRespondentGate,
}))

vi.mock('../../services/wholeSubmissionPriority', () => ({
  prepareWholeSubmissionPriority: () => undefined,
  authenticatedWholeSubmissionPriority: (_req: any, _res: any, next: any) => next(),
}))

vi.mock('../../modules/composite/whole-questionnaire.service', () => ({
  getWholeQuestionnaireTemplate: (...args: any[]) => mockGetWholeQuestionnaireTemplate(...args),
}))

import compositeRoutes from '../../modules/composite/composite.routes'
import compositePublicRoutes from '../../modules/composite/composite.public.routes'

const hash = 'a'.repeat(64)
const templatePayload = {
  templateHash: hash,
  slotSetHash: 'b'.repeat(64),
  units: [],
  formSections: [],
}

describe('whole questionnaire HTTP template cache boundary', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    const app = createExpress()
    app.set('etag', false)
    app.use('/api/composite-assessments', compositeRoutes)
    app.use('/api/public/composite-assessments', compositePublicRoutes)
    server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(err => (err ? reject(err) : resolve())))
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser.userId = 'student-1'
    mockGetWholeQuestionnaireTemplate.mockResolvedValue(templatePayload)
  })

  it('serves authenticated template with Cache-Control: private, no-store and without ETag / 304', async () => {
    const response = await fetch(
      `${baseUrl}/api/composite-assessments/attempts/attempt-1/whole/template/${hash}`,
      {
        headers: {
          Cookie: 'ptool_session=opaque-cookie-a',
          'If-None-Match': `"${hash}"`,
        },
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('etag')).toBeNull()
    expect(response.headers.get('vary')).toBeNull()
    const body = await response.json() as any
    expect(body).toMatchObject({ code: 0, data: templatePayload })
    expect(mockGetWholeQuestionnaireTemplate).toHaveBeenCalledWith('attempt-1', hash, { userId: 'student-1' })
  })

  it('enforces cross-user 403 over HTTP for cookie-authenticated template reads', async () => {
    mockAuthUser.userId = 'student-attacker'
    mockGetWholeQuestionnaireTemplate.mockRejectedValue(
      new InstrumentFinalSubmitError('FORBIDDEN', '无权访问他人作答模板', 403),
    )

    const response = await fetch(
      `${baseUrl}/api/composite-assessments/attempts/attempt-1/whole/template/${hash}`,
      { headers: { Cookie: 'ptool_session=opaque-cookie-b' } },
    )

    expect(response.status).toBe(403)
    expect(mockGetWholeQuestionnaireTemplate).toHaveBeenCalledWith('attempt-1', hash, { userId: 'student-attacker' })
  })

  it('serves public recovery template with Cache-Control: private, no-store and forwards recovery principal', async () => {
    const recoveryToken = 'r'.repeat(43)
    const response = await fetch(
      `${baseUrl}/api/public/composite-assessments/attempts/attempt-pub/whole/template/${hash}`,
      { headers: { 'X-Recovery-Token': recoveryToken } },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('etag')).toBeNull()
    expect(response.headers.get('vary')).toBeNull()
    expect(mockGetWholeQuestionnaireTemplate).toHaveBeenCalledWith(
      'attempt-pub',
      hash,
      { recoveryTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
    )
  })
})
