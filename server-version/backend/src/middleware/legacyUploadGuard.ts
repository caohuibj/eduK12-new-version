import { Request, Response, NextFunction, RequestHandler } from 'express'

const ASSET_PATH = /^\/assets(?:\/|$)/

/**
 * Legacy uploads may remain readable during migration, but the new private
 * asset namespace is never served by the static compatibility route.
 */
export const legacyUploadGuard = (legacyUploadsEnabled: boolean): RequestHandler => (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (ASSET_PATH.test(req.path)) {
    return res.status(410).json({ code: -1, message: '资产必须通过签名接口访问' })
  }
  if (!legacyUploadsEnabled) {
    return res.status(410).json({ code: -1, message: '旧文件访问入口已停用，请使用资产接口' })
  }
  return next()
}
