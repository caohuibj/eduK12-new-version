import { randomUUID } from 'node:crypto'
import { Request, Response, NextFunction } from 'express'

declare global {
  namespace Express {
    interface Request {
      requestId?: string
    }
  }
}

/** Attach a non-sensitive correlation id to every request and response. */
export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const id = randomUUID()
  req.requestId = id
  res.setHeader('X-Request-ID', id)
  next()
}
