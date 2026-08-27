import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Request, Response } from 'express'
import { config } from '../config'

export const AUTH_COOKIE_NAME = 'ptool_session'
export const CSRF_COOKIE_NAME = 'ptool_csrf'
export const CSRF_HEADER_NAME = 'x-csrf-token'

const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

export const parseCookieHeader = (header: string | undefined): Record<string, string> => {
  if (!header) return {}

  return Object.fromEntries(
    header.split(';').flatMap((part) => {
      const separator = part.indexOf('=')
      if (separator < 1) return []

      const name = part.slice(0, separator).trim()
      const value = part.slice(separator + 1).trim()
      try {
        return [[name, decodeURIComponent(value)]]
      } catch {
        return []
      }
    }),
  )
}

export const getCookie = (req: Request, name: string): string | null => {
  const value = parseCookieHeader(req.headers.cookie)[name]
  return value || null
}

export const getCookieValue = (header: string | undefined, name: string): string | null => {
  const value = parseCookieHeader(header)[name]
  return value || null
}

const appendSetCookie = (res: Response, value: string): void => {
  const current = res.getHeader('Set-Cookie')
  if (!current) {
    res.setHeader('Set-Cookie', value)
    return
  }

  const values = Array.isArray(current) ? current.map(String) : [String(current)]
  res.setHeader('Set-Cookie', [...values, value])
}

const serializeCookie = (
  name: string,
  value: string,
  options: { httpOnly?: boolean; maxAge?: number; secure?: boolean } = {},
): string => {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax',
  ]

  if (options.httpOnly) attributes.push('HttpOnly')
  if (options.maxAge !== undefined) attributes.push(`Max-Age=${options.maxAge}`)
  if (options.secure) attributes.push('Secure')
  return attributes.join('; ')
}

const isSecureRequest = (req: Request): boolean =>
  config.cookieSecure || req.secure === true

export const getSessionToken = (req: Request): string | null => getCookie(req, AUTH_COOKIE_NAME)

export const setSessionCookie = (req: Request, res: Response, token: string): void => {
  appendSetCookie(res, serializeCookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    secure: isSecureRequest(req),
  }))
}

export const clearSessionCookie = (req: Request, res: Response): void => {
  appendSetCookie(res, serializeCookie(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    maxAge: 0,
    secure: isSecureRequest(req),
  }))
}

export const issueCsrfToken = (req: Request, res: Response): string => {
  const token = randomBytes(32).toString('base64url')
  appendSetCookie(res, serializeCookie(CSRF_COOKIE_NAME, token, {
    maxAge: COOKIE_MAX_AGE_SECONDS,
    secure: isSecureRequest(req),
  }))
  return token
}

export const getCsrfCookie = (req: Request): string | null => getCookie(req, CSRF_COOKIE_NAME)

export const getCsrfHeader = (req: Request): string | null => {
  const value = req.get(CSRF_HEADER_NAME)
  return value?.trim() || null
}

export const csrfTokensMatch = (cookieToken: string | null, headerToken: string | null): boolean => {
  if (!cookieToken || !headerToken) return false
  const cookieDigest = createHash('sha256').update(cookieToken).digest()
  const headerDigest = createHash('sha256').update(headerToken).digest()
  return timingSafeEqual(cookieDigest, headerDigest)
}
