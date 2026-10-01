import type { Request, RequestHandler, Response } from 'express'

/** Express 4 does not forward rejected async handlers to error middleware. */
export const asyncHandler = (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { void Promise.resolve().then(() => handler(req, res)).catch(next) }
