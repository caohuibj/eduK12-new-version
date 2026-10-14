import express, { type Request, type Response, type NextFunction } from 'express'
import { request as httpRequest, type Server } from 'node:http'
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
const cases: Array<{
  label: string; env: string; host?: string; origin?: string; status: number
  path?: string; method?: string; deniedMessage?: string
}> = [
  { label: 'local school Host without Origin', env: 'test', host: 'school.localhost:5191', status: 403 },
  { label: 'local school HTTP Origin through proxy', env: 'test', origin: 'http://school.localhost:5191', status: 403 },
  { label: 'local school HTTPS Origin and case', env: 'development', origin: 'HTTPS://SCHOOL.LOCALHOST:5191', status: 403 },
  { label: 'production school Host', env: 'production', host: 'school.eduk12.top:443', status: 403 },
  { label: 'production school Origin', env: 'production', origin: 'https://school.eduk12.top', status: 403 },
  { label: 'existing school Origin in local environment', env: 'test', origin: 'https://school.eduk12.top', status: 403 },
  { label: 'production teacher Host', env: 'production', host: 'teacher.eduk12.top:443', status: 403, deniedMessage: '教师版请使用独立账号入口' },
  { label: 'production survey Host', env: 'production', host: 'survey.eduk12.top', status: 403, deniedMessage: '研究版请使用独立账号入口' },
  { label: 'production teacher Origin through shared API', env: 'production', host: 'api.eduk12.top', origin: 'https://teacher.eduk12.top', status: 403, deniedMessage: '教师版请使用独立账号入口' },
  { label: 'production survey Origin through shared API', env: 'production', host: 'api.eduk12.top', origin: 'https://survey.eduk12.top', status: 403, deniedMessage: '研究版请使用独立账号入口' },
  { label: 'teacher origin with explicit HTTPS default port', env: 'production', origin: 'https://teacher.eduk12.top:443', status: 403, deniedMessage: '教师版请使用独立账号入口' },
  { label: 'survey Host with final dot', env: 'production', host: 'survey.eduk12.top.:443', status: 403, deniedMessage: '研究版请使用独立账号入口' },
  { label: 'teacher registration route', env: 'production', host: 'teacher.eduk12.top', path: '/register', status: 403, deniedMessage: '教师版请使用独立账号入口' },
  { label: 'survey existing-session route', env: 'production', host: 'survey.eduk12.top', path: '/me', method: 'GET', status: 403, deniedMessage: '研究版请使用独立账号入口' },
  { label: 'local teacher Host without Origin', env: 'test', host: 'teacher.localhost:5191', status: 403, deniedMessage: '教师版请使用独立账号入口' },
  { label: 'local survey HTTP Origin through shared API', env: 'test', host: 'localhost:5191', origin: 'http://survey.localhost:5191', status: 403, deniedMessage: '研究版请使用独立账号入口' },
  { label: 'local teacher HTTPS Origin in different case', env: 'development', origin: 'HTTPS://TEACHER.LOCALHOST:5191', status: 403, deniedMessage: '教师版请使用独立账号入口' },
  { label: 'training local Host and Origin', env: 'test', host: 'training.localhost:5191', origin: 'http://training.localhost:5191', status: 200 },
  { label: 'production training hostname stays permitted', env: 'production', host: 'training.eduk12.top:443', origin: 'https://training.eduk12.top', status: 200 },
  { label: 'production main site stays permitted', env: 'production', host: 'eduk12.top', origin: 'https://eduk12.top', status: 200 },
  { label: 'production API host stays permitted for mobile clients', env: 'production', host: 'api.eduk12.top', status: 200 },
  { label: 'production API host accepts training site origin', env: 'production', host: 'api.eduk12.top', origin: 'https://training.eduk12.top', status: 200 },
  { label: 'teacher development hostname ignored in production', env: 'production', host: 'teacher.localhost:5191', origin: 'http://teacher.localhost:5191', status: 200 },
  { label: 'survey development hostname ignored in production', env: 'production', origin: 'http://survey.localhost:5191', status: 200 },
  { label: 'lookalike teacher hostname remains unrelated', env: 'production', host: 'teacher.eduk12.top.invalid', status: 200 },
  { label: 'lookalike survey hostname remains unrelated', env: 'production', origin: 'https://survey.eduk12.top.invalid', status: 200 },
  { label: 'teacher origin userinfo spoof remains unrelated', env: 'production', origin: 'https://teacher.eduk12.top@example.invalid', status: 200 },

  { label: 'platform local Host', env: 'test', host: 'localhost:5191', status: 200 },
  { label: 'production behavior for development Host remains unchanged', env: 'production', host: 'school.localhost:5191', origin: 'http://school.localhost:5191', status: 200 },
  { label: 'lookalike school suffix', env: 'test', origin: 'http://school.localhost.example.invalid:5191', status: 200 },
  { label: 'lookalike school userinfo', env: 'test', origin: 'http://school.localhost:5191@example.invalid', status: 200 },
  { label: 'lookalike Host suffix', env: 'test', host: 'school.localhost.example.invalid:5191', status: 200 },
]

describe('legacy authentication product origin guard', () => {
  beforeAll(async () => {
    const app = express()
    app.use('/api/auth', authRoutes)
    server = app.listen(0, '127.0.0.1')
    await new Promise<void>(resolve => server.once('listening', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('missing fixture port')
    endpoint = `http://127.0.0.1:${address.port}/api/auth`
  })
  afterAll(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })
  beforeEach(() => state.reached.mockClear())
  afterEach(() => vi.unstubAllEnvs())
  it.each(cases)('$label', async ({ env, host, origin, status, path, method, deniedMessage }) => {
    vi.stubEnv('NODE_ENV', env)
    const headers: Record<string, string> = {}
    if (host) headers.Host = host
    if (origin) headers.Origin = origin
    // Use the wire HTTP client: fetch/Undici can replace a supplied Host.
    const response = await new Promise<{ status: number; setCookie?: string[]; body: Record<string, unknown> }>((resolve, reject) => {
      const request = httpRequest(endpoint + (path ?? '/login'), { method: method ?? 'POST', headers }, res => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', chunk => { body += chunk })
        res.on('end', () => {
          try { resolve({ status: res.statusCode!, setCookie: res.headers['set-cookie'], body: JSON.parse(body) }) }
          catch (error) { reject(error) }
        })
        res.on('error', reject)
      })
      request.on('error', reject)
      request.end()
    })
    expect(response.status).toBe(status)
    if (status === 403) {
      expect(state.reached).not.toHaveBeenCalled()
      expect(response.setCookie).toBeUndefined()
      expect(response.body.message).toBe(deniedMessage ?? '校园版请使用独立账号入口')
    } else {
      expect(state.reached).toHaveBeenCalledOnce()
      expect(response.body.controllerReached).toBe(true)
    }
  })
})
