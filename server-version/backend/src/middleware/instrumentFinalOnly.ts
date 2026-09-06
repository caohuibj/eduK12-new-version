import { RequestHandler } from 'express'
import { instrumentError } from '../utils/response'

/**
 * Legacy answer endpoints remain routable for clients that need to discover
 * the migration, but they must never mutate a FINAL_ONLY attempt.
 */
export const legacyWriteDisabled: RequestHandler = (_req, res, _next) =>
  instrumentError(
    res,
    'LEGACY_WRITE_DISABLED',
    '旧的逐题/批量写入接口已停用，请重启测评后使用最终提交',
    410,
  )
