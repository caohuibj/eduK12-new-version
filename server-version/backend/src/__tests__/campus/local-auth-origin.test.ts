import express, { type Request, type Response, type NextFunction } from 'express'
import type { Server } from 'node:http'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The router's real origin guard runs before an explicitly synthetic controller.
// Account/password/realm behavior remains covered by the isolated DB contracts.
const state = vi.hoisted(() => ({ reached: vi.fn() }))
vi.mock('../../controllers/authController', () => {
  const handler = (_req: Request, res: Response) => {
    state.reached()
    res.cookie('synthetic_controller_cookie', 'fixture')
    res.json({ controllerReached: true })
  }
  return { authController: Object.fromEntries([
    'login', 'register', 'studentRegister', 'verifyTeacherCode', 'teacherRegister',
    'me', 'changePassword', 'logout', 'extendAccount',
  ].map(name => [name, handler])) }
})
vi.mock('../../middleware/auth', () => ({
  authenticate: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}))
vi.mock('../../utils/authCookies', () => ({ issueCsrfToken: () => 'synthetic-csrf' }))
vi.mock('../../middleware/loginRateLimit', () => ({
  loginRateLimit: (_req: Request, _res: Response, next: NextFunction) => next(),
  withLoginAccountFailureThrottle: (handler: unknown) => handler,
}))
vi.mock('../../middleware/registrationAdmission', () => ({
  registrationRateLimit: (_req: Request, _res: Response, next: NextFunction) => next(),
  withRegistrationAdmission: (handler: unknown) => handler,
}))
vi.mock('../../middleware/passwordChangeAdmission', () => ({
  passwordChangeRateLimit: (_req: Request, _res: Response, next: NextFunction) => next(),
  withPasswordChangeAdmission: (handler: unknown) => handler,
}))
vi.mock('../../middleware/accountExtensionValidation', () => ({
  requirePositiveAccountExtension: (_req: Request, _res: Response, next: NextFunction) => next(),
}))
import authRoutes from '../../routes/auth'

let server: Server, endpoint: string
const cases = [
  { label: 'local school Host without Origin', env: 'test', host: 'school.localhost:5191', status: 403 },
  { label: 'local school HTTP Origin through proxy', env: 'test', origin: 'http://school.localhost:5191', status: 403 },
  { label: 'local school HTTPS Origin and case', env: 'development', origin: 'HTTPS://SCHOOL.LOCALHOST:5191', status: 403 },
  { label: 'production school Host', env: 'production', host: 'school.eduk12.top:443', status: 403 },
  { label: 'production school Origin', env: 'production', origin: 'https://school.eduk12.top', status: 403 },
  { label: 'existing school Origin in local environment', env: 'test', origin: 'https://school.eduk12.top', status: 403 },
  { label: 'training local Host and Origin', env: 'test', host: 'training.localhost:5191', origin: 'http://training.localhost:5191', status: 200 },
  { label: 'platform local Host', env: 'test', host: 'localhost:5191', status: 200 },
  { label: 'production behavior for development Host remains unchanged', env: 'production', host: 'school.localhost:5191', origin: 'http://school.localhost:5191', status: 200 },
  { label: 'lookalike school suffix', env: 'test', origin: 'http://school.localhost.example.invalid:5191', status: 200 },
  { label: 'lookalike school userinfo', env: 'test', origin: 'http://school.localhost:5191@example.invalid', status: 200 },
  { label: 'lookalike Host suffix', env: 'test', host: 'school.localhost.example.invalid:5191', status: 200 },
]

describe('legacy authentication campus origin guard', () => {
  beforeAll(async () => {
    const app = express()
    app.use('/api/auth', authRoutes)
    server = app.listen(0, '127.0.0.1')
    await new Promise<void>(resolve => server.once('listening', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('missing fixture port')
    endpoint = `http://127.0.0.1:${address.port}/api/auth/login`
  })
  afterAll(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })
  beforeEach(() => state.reached.mockClear())
  afterEach(() => vi.unstubAllEnvs())
  it.each(cases)('$label', async ({ env, host, origin, status }) => {
    vi.stubEnv('NODE_ENV', env)
    const headers: Record<string, string> = {}
    if (host) headers.Host = host
    if (origin) headers.Origin = origin
    const response = await fetch(endpoint, { method: 'POST', headers })
    expect(response.status).toBe(status)
    if (status === 403) {
      expect(state.reached).not.toHaveBeenCalled()
      expect(response.headers.get('set-cookie')).toBeNull()
      expect((await response.json()).message).toContain('校园版请使用独立账号入口')
    } else {
      expect(state.reached).toHaveBeenCalledOnce()
      expect((await response.json()).controllerReached).toBe(true)
    }
  })
})
