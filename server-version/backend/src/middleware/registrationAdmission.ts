import crypto from 'node:crypto'
import type { RequestHandler } from 'express'
import { cacheService } from '../services/cacheService'
import { BoundedAdmissionGate, configuredInteger, isBoundedAdmissionBusyError } from '../services/boundedAdmissionGate'
import { withLoginPasswordVerification } from './loginRateLimit'
export const registrationBudgets = Object.freeze({
  global: configuredInteger('REGISTRATION_GLOBAL_LIMIT', 6000),
  ip: configuredInteger('REGISTRATION_IP_LIMIT', 3000),
  resource: configuredInteger('REGISTRATION_RESOURCE_LIMIT', 3000),
  account: configuredInteger('REGISTRATION_ACCOUNT_LIMIT', 10),
  teacherCode: configuredInteger('REGISTRATION_TEACHER_CODE_LIMIT', 120),
})
const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex')
const normalized = (value: unknown) => typeof value === 'string' ? value.trim().toUpperCase().slice(0, 200) : 'INVALID'
/** All aliases share Redis budgets. IP is a coarse NAT fuse; it is never an account budget. */
export const registrationRateLimit: RequestHandler = async (req, res, next) => {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') return next()
  const budgets: Array<[string, string, number]> = [['global', 'all', registrationBudgets.global], ['ip', req.ip || req.socket.remoteAddress || 'unknown', registrationBudgets.ip]]
  if (typeof req.body?.username === 'string') budgets.push(['account', normalized(req.body.username), registrationBudgets.account])
  if (req.body?.courseCode !== undefined) budgets.push(['course', normalized(req.body.courseCode), registrationBudgets.resource])
  if (req.body?.teacherCode !== undefined) budgets.push(['teacher', normalized(req.body.teacherCode), registrationBudgets.teacherCode])
  if (req.body?.activationCode !== undefined) budgets.push(['campus-code', normalized(req.body.activationCode), registrationBudgets.resource])
  if (req.body?.inviteCode !== undefined) budgets.push(['campus-staff-invite', normalized(req.body.inviteCode), registrationBudgets.resource])
  for (const [kind, value, limit] of budgets) {
    const result = await cacheService.consumeRateLimit(`ratelimit:registration:${kind}:${digest(value)}`, limit, 900)
    if (!result) { res.setHeader('Retry-After', '2'); res.status(503).json({ code: -1, message: '注册服务暂时不可用，请稍后重试' }); return }
    if (!result.allowed) { res.setHeader('Retry-After', String(result.retryAfterSeconds)); res.status(429).json({ code: -1, message: '注册请求过于频繁，请稍后重试' }); return }
  }
  next()
}
const registrationGate = new BoundedAdmissionGate({ name: 'registration', maxConcurrent: configuredInteger('REGISTRATION_MAX_CONCURRENT', 2), maxQueue: configuredInteger('REGISTRATION_MAX_QUEUE', 16, true), maxWaitMs: configuredInteger('REGISTRATION_MAX_WAIT_MS', 3000), retryAfterSeconds: 2 })
export const withRegistrationAdmission = (handler: RequestHandler, passwordWork = true): RequestHandler => async (req, res, next) => {
  try {
    const work = async () => { if (!res.destroyed) await handler(req, res, next) }
    await registrationGate.run(() => passwordWork ? withLoginPasswordVerification(work) : work())
  } catch (error) {
    if (!isBoundedAdmissionBusyError(error)) return next(error)
    res.setHeader('Retry-After', String(error.retryAfterSeconds)); res.status(503).json({ code: -1, message: '注册服务繁忙，请稍后重试' })
  }
}
