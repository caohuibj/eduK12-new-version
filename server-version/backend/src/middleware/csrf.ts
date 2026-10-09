import { Request, Response, NextFunction } from 'express'
import { csrfTokensMatch, getCsrfCookie, getSchoolCsrfCookie, getCsrfHeader } from '../utils/authCookies'
import { forbidden } from '../utils/response'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Cookie-authenticated API writes require a double-submit CSRF token. Public
 * capability endpoints authenticate with an opaque bearer capability instead
 * of the session cookie and therefore use their own authorization boundary.
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) return next()
  if (
    req.path === '/auth/csrf' ||
    req.path.startsWith('/public/') ||
    req.path.startsWith('/checkins/public/')
  ) {
    return next()
  }

  if (!csrfTokensMatch(req.path.startsWith('/campus/') ? getSchoolCsrfCookie(req) : getCsrfCookie(req), getCsrfHeader(req))) {
    return forbidden(res, 'CSRF 校验失败')
  }

  return next()
}
