import crypto from 'node:crypto'
import fs from 'node:fs'
import { promises as fsPromises } from 'node:fs'
import { configuredInteger } from '../services/boundedAdmissionGate'
import { config } from '../config'
import path from 'node:path'
import multer from 'multer'
import type { Request, Response, NextFunction, RequestHandler } from 'express'

export const UPLOAD_STAGING_ROOT = path.join(path.resolve(config.uploadDir), '.upload-staging')
const TEMP_ROOT = UPLOAD_STAGING_ROOT

const isInsideTempRoot = (candidate: string): boolean => {
  const resolved = path.resolve(candidate)
  const root = path.resolve(TEMP_ROOT)
  return resolved.startsWith(`${root}${path.sep}`)
}

export const cleanupUploadedFile = async (file: Express.Multer.File | undefined): Promise<void> => {
  if (!file?.path || !isInsideTempRoot(file.path)) return
  await fsPromises.rm(path.dirname(file.path), { recursive: true, force: true }).catch(() => undefined)
}

export const createTemporaryUploadStorage = (): multer.StorageEngine => multer.diskStorage({
  destination: (req, _file, callback) => {
    const requestDir = path.join(TEMP_ROOT, crypto.randomUUID())
    ;(req as Request & { uploadTempDir?: string }).uploadTempDir = requestDir
    fs.mkdir(requestDir, { recursive: true, mode: 0o700 }, (error) => callback(error, requestDir))
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 10)
    callback(null, `${crypto.randomUUID()}${extension}`)
  },
})

const collectFiles = (req: Request): Express.Multer.File[] => {
  const files = req.files
  if (Array.isArray(files)) return files
  if (files && typeof files === 'object') return Object.values(files).flat()
  return req.file ? [req.file] : []
}

export const cleanupRequestUploads = async (req: Request): Promise<void> => {
  await Promise.all(collectFiles(req).map(cleanupUploadedFile))
  const requestDir = (req as Request & { uploadTempDir?: string }).uploadTempDir
  if (requestDir && isInsideTempRoot(requestDir)) {
    await fsPromises.rm(requestDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * Wrap Multer so parse errors and client disconnects also remove staging data.
 * The cleanup is deliberately request-scoped and never recursively scans a
 * shared upload directory.
 */
export const withUploadCleanup = (uploadMiddleware: RequestHandler): RequestHandler => (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    void cleanupRequestUploads(req)
  }
  res.once('finish', cleanup)
  res.once('close', cleanup)
  uploadMiddleware(req, res, (error?: unknown) => {
    if (error) {
      void cleanupRequestUploads(req).finally(() => next(error))
      return
    }
    next()
  })
}

/** Reclaim staging left by a terminated process. This bounded asynchronous
 * sweep only removes old UUID request directories created by this module. */
export async function cleanupStaleUploadDirectories(now = Date.now()): Promise<number> {
  let directory: Awaited<ReturnType<typeof fsPromises.opendir>>
  try { directory = await fsPromises.opendir(TEMP_ROOT) } catch { return 0 }
  let scanned = 0, removed = 0
  try {
    for await (const entry of directory) {
      if (++scanned > 500) break
      if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue
      const candidate = path.join(TEMP_ROOT, entry.name)
      try {
        const stat = await fsPromises.stat(candidate)
        if (stat.mtimeMs > now - 24 * 60 * 60 * 1000) continue
        await fsPromises.rm(candidate, { recursive: true, force: true })
        removed++
      } catch { /* A concurrent request/cleanup may already have removed it. */ }
    }
  } catch { /* Cleanup must not affect request admission. */ }
  return removed
}

/** Private disk staging shares the persistent upload volume. Reserve room for
 * two full local uploads beyond the 5 GiB operational floor before parsing. */
export async function assertUploadStagingCapacity(maximumBytes: number): Promise<void> {
  await fsPromises.mkdir(TEMP_ROOT, { recursive: true, mode: 0o700 })
  const disk = await fsPromises.statfs(TEMP_ROOT, { bigint: true })
  if (disk.bavail * disk.bsize < BigInt(5 * 1024 ** 3 + Math.max(maximumBytes * configuredInteger('UPLOAD_MAX_CONCURRENT', 2), 1024 ** 3)))
    throw Object.assign(new Error('Upload staging capacity unavailable'), { statusCode: 503, retryAfterSeconds: 2 })
}
