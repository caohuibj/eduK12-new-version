import { NextFunction, Request, Response } from 'express'
import { error } from '../utils/response'

export const parsePositiveAccountExtensionMonths = (value: unknown): number | null => {
  const months = value === undefined ? 12 : value
  return typeof months === 'number' && Number.isInteger(months) && months > 0
    ? months
    : null
}

/** The legacy extend-account endpoint is extension-only, never expiry shortening. */
export const requirePositiveAccountExtension = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const months = parsePositiveAccountExtensionMonths(req.body?.months)
  if (months === null) {
    return error(res, 'months 必须为正整数', -1, 400)
  }
  req.body = { ...req.body, months }
  next()
}
