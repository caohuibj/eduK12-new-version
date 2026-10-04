import { createHash } from 'node:crypto'
import { cacheService } from '../services/cacheService'
import type { RequestHandler, Request, Response } from 'express'
import multer from 'multer'
import { promises as fs } from 'node:fs'
import sharp from 'sharp'
import { BoundedAdmissionGate, configuredInteger, isBoundedAdmissionBusyError } from '../services/boundedAdmissionGate'
import { createRedisRateLimiter } from './redisRateLimit'
import { createTemporaryUploadStorage, cleanupRequestUploads } from '../utils/uploadTemp'
import { detectMimeType } from '../utils/fileValidator'

export const uploadAdmission = new BoundedAdmissionGate({
  name: 'multipart_upload', maxConcurrent: configuredInteger('UPLOAD_MAX_CONCURRENT', 2),
  maxQueue: 0, maxWaitMs: 1000, retryAfterSeconds: 2,
})
export const uploadPrincipalRateLimit = createRedisRateLimiter({
  name: 'upload_principal', limit: configuredInteger('UPLOAD_REQUEST_LIMIT', 30), windowSeconds: 900,
  key: req => req.user?.userId || req.header('X-Checkin-Session-Capability') || req.ip || 'unknown',
})
const byteBudget = configuredInteger('UPLOAD_BYTE_BUDGET', 600 * 1024 * 1024)
export async function reserveUploadBudget(req: Request, maximumBytes: number): Promise<void> {
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') return
  const declared = Number(req.header('Content-Length'))
  const cost = Number.isSafeInteger(declared) && declared > 0 ? Math.min(declared, maximumBytes) : maximumBytes
  const principal = req.user?.userId || req.header('X-Checkin-Session-Capability') || req.ip || 'unknown'
  const key = createHash('sha256').update(principal).digest('hex')
  const result = await cacheService.consumeWeightedRateLimit(`upload:bytes:${key}`, byteBudget, 900, cost)
  if (!result) throw Object.assign(new Error('Upload budget unavailable'), { statusCode: 503, retryAfterSeconds: 2 })
  if (!result.allowed) throw Object.assign(new Error('Upload byte budget exceeded'), { statusCode: 429, retryAfterSeconds: result.retryAfterSeconds })
}

export const acceptedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const maxPixels = configuredInteger('UPLOAD_IMAGE_MAX_PIXELS', 16_000_000)

export async function validateImageBuffer(buffer: Buffer, mime: string): Promise<void> {
  const metadata = await sharp(buffer, { limitInputPixels: maxPixels, animated: true, failOn: 'warning' }).metadata()
  const formats: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }
  const pixels = (metadata.width || 0) * (metadata.pageHeight || metadata.height || 0) * (metadata.pages || 1)
  if (formats[metadata.format || ''] !== mime || pixels <= 0 || pixels > maxPixels) throw new Error('Invalid image dimensions or encoding')
  // Force a complete decode, with bounded pixels, to reject truncated payloads.
  await sharp(buffer, { limitInputPixels: maxPixels, animated: true, failOn: 'warning' }).stats()
}

export async function readTemporaryUpload(req: Request, allowedTypes: string[], materialize = true): Promise<void> {
  if (!req.file) throw new Error('Missing upload')
  if (materialize) req.file.buffer = await fs.readFile(req.file.path)
  else {
    const file = await fs.open(req.file.path, 'r')
    try {
      req.file.buffer = Buffer.alloc(16)
      await file.read(req.file.buffer, 0, 16, 0)
    } finally { await file.close() }
  }
  const mime = detectMimeType(req.file.buffer.subarray(0, 16))
  if (!mime || !allowedTypes.includes(mime)) throw new Error('Invalid upload content')
  if (mime.startsWith('image/')) await validateImageBuffer(req.file.buffer, mime)
  ;(req.file as Express.Multer.File & { detectedMimeType: string }).detectedMimeType = mime
}

export const withUploadAdmission = (handler: RequestHandler, maximumBytes = 10 * 1024 * 1024): RequestHandler => async (req, res, next) => {
  try {
    await reserveUploadBudget(req, maximumBytes)
    await uploadAdmission.run(async () => {
      const timeout = setTimeout(() => { req.destroy(); res.destroy() }, 60_000)
      try { await handler(req, res, next) }
      finally {
        clearTimeout(timeout)
        await cleanupRequestUploads(req)
        if (req.file) req.file.buffer = Buffer.alloc(0)
      }
    })
  } catch (error) {
    if (res.destroyed || res.headersSent) return
    if (isBoundedAdmissionBusyError(error)) {
      res.setHeader('Retry-After', String(error.retryAfterSeconds))
      res.status(503).json({ code: -1, message: '上传服务繁忙，请稍后重试' })
    } else if (error && typeof error === 'object' && 'statusCode' in error) {
      const budgetError = error as { statusCode: number; retryAfterSeconds: number }
      res.setHeader('Retry-After', String(budgetError.retryAfterSeconds))
      res.status(budgetError.statusCode).json({ code: -1, message: '上传额度不足或服务暂时不可用，请稍后重试' })
    } else res.status(400).json({ code: -1, message: '上传文件无效或超过限制' })
  }
}

export const boundedUpload = (field: string, maxBytes: number, allowedTypes: string[], handler: RequestHandler, materialize = true): RequestHandler => {
  // Browsers send plain multipart filename parameters as UTF-8. Let the
  // parser decode them once; extended filename parameters retain their charset.
  const options: multer.Options & { defParamCharset: string } = {
    storage: createTemporaryUploadStorage(),
    defParamCharset: 'utf8',
    limits: { fileSize: maxBytes, files: 1, fields: 10, fieldSize: 16 * 1024, parts: 11 },
  }
  const parse = multer(options).single(field)
  return withUploadAdmission(async (req: Request, res: Response, next) => {
    await new Promise<void>((resolve, reject) => parse(req, res, error => error ? reject(error) : resolve()))
    await readTemporaryUpload(req, allowedTypes, materialize)
    if (!res.destroyed) await handler(req, res, next)
  }, maxBytes)
}
