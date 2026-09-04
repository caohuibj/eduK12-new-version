import crypto from 'node:crypto'
import type { Request, RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import { config } from '../config'
import { isValidRecoveryToken } from '../services/anonymousAccess'

export type PublicAssessmentBudget = 'get' | 'final'

const START_TOKEN_PATH = /\/(?:questionnaires|composite-assessments|cognitive\/assignments)\/([^/?#]+)/i
const FINAL_PATH = /(?:^|\/)(?:start|submit|restart)(?:\/|$)/i

const digest = (value: string): string => crypto.createHash('sha256').update(value).digest('hex')

/** Classify public assessment traffic into GET vs FINAL budgets. */
export const classifyPublicAssessmentBudget = (req: Request): PublicAssessmentBudget => {
  const method = String(req.method || 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return 'get'
  const path = `${req.baseUrl || ''}${req.path || ''}`
  if (FINAL_PATH.test(path)) return 'final'
  // Non-finalizing writes (legacy disabled patches, etc.) share the GET budget so
  // a misclassified probe cannot burn the scarcer FINAL counters.
  return 'get'
}

/** Public link / capability token from route params or known start-entry paths. */
export const extractPublicAssessmentStartToken = (req: Request): string | null => {
  const fromParams = req.params?.token
  if (typeof fromParams === 'string' && fromParams.length >= 16 && fromParams.length <= 200) {
    return fromParams
  }
  const path = `${req.baseUrl || ''}${req.path || ''}`
  const match = START_TOKEN_PATH.exec(path)
  if (!match) return null
  const token = match[1]
  if (!token || token.length < 16 || token.length > 200) return null
  // Session/attempt UUIDs appear on other path families and must not key start-token budgets.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return null
  }
  return token
}

/**
 * Per-attempt recovery credential.
 * Prefer X-Recovery-Token header; fall back to JSON body.recoveryToken when the
 * body is already parsed (limiters mount after express.json). Body-only clients
 * (some composite scale/form mutations) would otherwise skip the recovery budget.
 */
export const extractPublicAssessmentRecoveryToken = (req: Request): string | null => {
  const header = req.headers['x-recovery-token']
  const fromHeader = Array.isArray(header) ? header[0] : header
  if (isValidRecoveryToken(fromHeader)) return fromHeader
  const body = req.body as { recoveryToken?: unknown } | undefined
  const fromBody = body && typeof body === 'object' ? body.recoveryToken : undefined
  return isValidRecoveryToken(fromBody) ? fromBody : null
}

const createBudgetLimiter = (options: {
  name: string
  budget: PublicAssessmentBudget
  limit: number
  key: (req: Request) => string | null
}): RequestHandler => rateLimit({
  windowMs: config.publicAssessmentWindowMs,
  limit: options.limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Custom keys intentionally hash IP/token/recovery material; disable the
  // default IPv6 subnet fallback check that assumes raw req.ip keys.
  validate: { keyGeneratorIpFallback: false },
  skip: (req) => {
    if (classifyPublicAssessmentBudget(req) !== options.budget) return true
    return options.key(req) === null
  },
  keyGenerator: (req) => {
    const raw = options.key(req)
    // skip() already filtered nulls; keep a stable fallback for the type checker.
    return raw ? `${options.name}:${digest(raw)}` : `${options.name}:missing`
  },
})

const ipKey = (req: Request): string => req.ip || req.socket.remoteAddress || 'unknown'

/**
 * Check-in-style multi-dimension public assessment limiter:
 * coarse NAT IP (high ceiling) + capability/start-token + per-attempt recovery-token,
 * each with separate GET and FINAL budgets.
 */
export const publicAssessmentRateLimiters: RequestHandler[] = [
  createBudgetLimiter({
    name: 'public-assessment-ip-get',
    budget: 'get',
    limit: config.publicAssessmentIpGetLimit,
    key: ipKey,
  }),
  createBudgetLimiter({
    name: 'public-assessment-ip-final',
    budget: 'final',
    limit: config.publicAssessmentIpFinalLimit,
    key: ipKey,
  }),
  createBudgetLimiter({
    name: 'public-assessment-token-get',
    budget: 'get',
    limit: config.publicAssessmentTokenGetLimit,
    key: extractPublicAssessmentStartToken,
  }),
  createBudgetLimiter({
    name: 'public-assessment-token-final',
    budget: 'final',
    limit: config.publicAssessmentTokenFinalLimit,
    key: extractPublicAssessmentStartToken,
  }),
  createBudgetLimiter({
    name: 'public-assessment-recovery-get',
    budget: 'get',
    limit: config.publicAssessmentRecoveryGetLimit,
    key: extractPublicAssessmentRecoveryToken,
  }),
  createBudgetLimiter({
    name: 'public-assessment-recovery-final',
    budget: 'final',
    limit: config.publicAssessmentRecoveryFinalLimit,
    key: extractPublicAssessmentRecoveryToken,
  }),
]
