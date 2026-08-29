import crypto from 'node:crypto'
import { Request, Response, NextFunction, RequestHandler } from 'express'
import { cacheService } from '../services/cacheService'

const digest = (value: string): string => crypto.createHash('sha256').update(value).digest('hex')

/** Redis-backed fixed-window limiter for public endpoints. */
export const createRedisRateLimiter = (options: {
  name: string
  limit: number
  windowSeconds: number
  key?: (req: Request) => string
}): RequestHandler => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    next()
    return
  }

  const rawKey = options.key ? options.key(req) : (req.ip || req.socket.remoteAddress || 'unknown')
  const result = await cacheService.consumeRateLimit(
    `ratelimit:${options.name}:${digest(rawKey)}`,
    options.limit,
    options.windowSeconds,
  )
  if (!result) {
    res.status(503).json({ code: -1, message: '服务暂时不可用，请稍后再试' })
    return
  }
  res.setHeader('RateLimit-Limit', String(options.limit))
  res.setHeader('RateLimit-Remaining', String(result.remaining))
  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfterSeconds))
    res.status(429).json({ code: -1, message: '请求过于频繁，请稍后再试' })
    return
  }
  next()
}
