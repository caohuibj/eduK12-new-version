import crypto from 'node:crypto'
import fs from 'node:fs'
import { promises as fsPromises } from 'node:fs'
import path from 'node:path'
import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { config } from '../config'
import { UserRole } from '../types'
import { forbidden, notFound, unauthorized } from '../utils/response'
import { getCOSSignedUrl, isCOSEnabled, uploadBufferToCOS } from '../utils/cos'

export const ASSET_URL_TTL_SECONDS = 10 * 60
// objectKey is always relative to the upload root (for example
// `assets/<uuid>.pdf`). Keeping one root here also makes worker paths and the
// migration script agree on where an asset physically lives.
const ASSET_ROOT = path.resolve(config.uploadDir)
const ASSET_SIGNING_SECRET = process.env.ASSET_SIGNING_SECRET || config.jwtSecret

export type AssetProvider = 'local' | 'cos'

export interface StoreAssetInput {
  buffer: Buffer
  originalName?: string
  mimeType: string
  ownerId?: string
  accessScope?: string
  scopeId?: string
  provider?: AssetProvider
}

const extensionFor = (fileName: string | undefined, mimeType: string): string => {
  const extension = fileName ? path.extname(fileName).toLowerCase() : ''
  if (/^\.[a-z0-9]{1,10}$/.test(extension)) return extension
  const known: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
  }
  return known[mimeType] || '.bin'
}

const providerFromEnvironment = (): AssetProvider => {
  const provider = (process.env.ASSET_STORAGE_PROVIDER || 'local').toLowerCase()
  if (provider !== 'local' && provider !== 'cos') {
    throw new Error('ASSET_STORAGE_PROVIDER must be local or cos')
  }
  if (provider === 'cos' && !isCOSEnabled()) {
    throw new Error('COS storage is selected but COS credentials are not configured')
  }
  return provider
}

const localPathFor = (objectKey: string): string => {
  const candidate = path.resolve(ASSET_ROOT, objectKey)
  if (candidate !== ASSET_ROOT && !candidate.startsWith(`${ASSET_ROOT}${path.sep}`)) {
    throw new Error('invalid asset object key')
  }
  return candidate
}

export const sha256Buffer = (buffer: Buffer): string => crypto.createHash('sha256').update(buffer).digest('hex')

export const storeAsset = async (input: StoreAssetInput) => {
  if (!input.buffer.length) throw new Error('asset cannot be empty')
  const id = crypto.randomUUID()
  const objectKey = `assets/${id}${extensionFor(input.originalName, input.mimeType)}`
  const provider = input.provider || providerFromEnvironment()
  const localPath = localPathFor(objectKey)

  try {
    if (provider === 'cos') {
      await uploadBufferToCOS(input.buffer, objectKey)
    } else {
      await fsPromises.mkdir(path.dirname(localPath), { recursive: true, mode: 0o700 })
      await fsPromises.writeFile(localPath, input.buffer, { mode: 0o600, flag: 'wx' })
    }

    return await prisma.storedAsset.create({
      data: {
        id,
        objectKey,
        provider,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.length,
        sha256: sha256Buffer(input.buffer),
        originalName: input.originalName,
        ownerId: input.ownerId,
        accessScope: input.accessScope || 'PRIVATE',
        scopeId: input.scopeId,
      },
    })
  } catch (error) {
    if (provider === 'local') await fsPromises.rm(localPath, { force: true }).catch(() => undefined)
    throw error
  }
}

const sha256File = async (filePath: string): Promise<string> => {
  const hash = crypto.createHash('sha256')
  const stream = fs.createReadStream(filePath)
  for await (const chunk of stream) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

export interface StoreAssetFileInput {
  filePath: string
  originalName?: string
  mimeType: string
  ownerId?: string
  accessScope?: string
  scopeId?: string
  provider?: AssetProvider
}

/** Store a worker-produced file without buffering local files in memory. */
export const storeAssetFromFile = async (input: StoreAssetFileInput) => {
  const stat = await fsPromises.stat(input.filePath)
  if (!stat.isFile() || stat.size <= 0) throw new Error('asset file cannot be empty')

  const id = crypto.randomUUID()
  const objectKey = `assets/${id}${extensionFor(input.originalName, input.mimeType)}`
  const provider = input.provider || providerFromEnvironment()
  const localPath = localPathFor(objectKey)
  const digest = await sha256File(input.filePath)

  try {
    if (provider === 'cos') {
      // The COS SDK adapter currently accepts buffers. This branch is only
      // used when COS is explicitly configured; local development remains
      // streaming and does not require a COS service.
      await uploadBufferToCOS(await fsPromises.readFile(input.filePath), objectKey)
    } else {
      await fsPromises.mkdir(path.dirname(localPath), { recursive: true, mode: 0o700 })
      await fsPromises.copyFile(input.filePath, localPath)
      await fsPromises.chmod(localPath, 0o600)
    }

    return await prisma.storedAsset.create({
      data: {
        id,
        objectKey,
        provider,
        mimeType: input.mimeType,
        sizeBytes: stat.size,
        sha256: digest,
        originalName: input.originalName,
        ownerId: input.ownerId,
        accessScope: input.accessScope || 'PRIVATE',
        scopeId: input.scopeId,
      },
    })
  } catch (error) {
    if (provider === 'local') await fsPromises.rm(localPath, { force: true }).catch(() => undefined)
    throw error
  }
}

export const attachAssetReference = async (params: {
  assetId: string
  entityType: string
  entityId: string
  field: string
}) => prisma.assetReference.upsert({
  where: {
    assetId_entityType_entityId_field: {
      assetId: params.assetId,
      entityType: params.entityType,
      entityId: params.entityId,
      field: params.field,
    },
  },
  create: params,
  update: {},
})

export const createAssetSignature = (assetId: string, expiresAt: number): string => {
  return crypto.createHmac('sha256', ASSET_SIGNING_SECRET).update(`${assetId}.${expiresAt}`).digest('base64url')
}

export const verifyAssetSignature = (assetId: string, expiresAt: number, signature: string): boolean => {
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(signature)) return false
  const expected = createAssetSignature(assetId, expiresAt)
  const expectedBuffer = Buffer.from(expected)
  const suppliedBuffer = Buffer.from(signature)
  return expectedBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
}

const signedPath = (assetId: string, expiresAt: number, publicRoute = false): string => {
  const query = new URLSearchParams({
    expires: String(expiresAt),
    signature: createAssetSignature(assetId, expiresAt),
  })
  return `/api/${publicRoute ? 'public/' : ''}assets/${encodeURIComponent(assetId)}/content?${query.toString()}`
}

export const getSignedAssetUrl = async (assetId: string, publicRoute = false): Promise<string | null> => {
  const asset = await prisma.storedAsset.findUnique({ where: { id: assetId } })
  if (!asset || asset.deletedAt) return null
  if (publicRoute && asset.accessScope !== 'PUBLIC_CHECKIN') return null
  const expiresAt = Math.floor(Date.now() / 1000) + ASSET_URL_TTL_SECONDS
  // The client always receives an application URL. COS credentials and COS
  // URLs remain server-side and are generated only while serving the asset.
  return signedPath(asset.id, expiresAt, publicRoute)
}

/**
 * Replace asset references in JSON attachment fields with short-lived
 * application URLs while preserving the original metadata and assetId.
 * Legacy strings are deliberately left unchanged during the migration window.
 */
export const hydrateAssetReferences = async (value: unknown, publicRoute = false): Promise<unknown> => {
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => hydrateAssetReferences(item, publicRoute)))
  }
  if (!value || typeof value !== 'object') return value
  if (value instanceof Date || Buffer.isBuffer(value)) return value

  const record = value as Record<string, unknown>
  if (typeof record.assetId === 'string' && record.assetId) {
    const url = await getSignedAssetUrl(record.assetId, publicRoute)
    return { ...record, url }
  }

  const entries = await Promise.all(
    Object.entries(record).map(async ([key, item]) => [key, await hydrateAssetReferences(item, publicRoute)] as const),
  )
  return Object.fromEntries(entries)
}

const canReadPrivateAsset = async (asset: {
  ownerId: string | null
  accessScope: string
  scopeId: string | null
}, req: Request): Promise<boolean> => {
  if (req.user?.role === UserRole.ADMIN) return true
  if (asset.ownerId && asset.ownerId === req.user?.userId) return true
  if (asset.accessScope === 'PUBLIC') return true
  if (asset.accessScope !== 'COURSE' || !asset.scopeId || !req.user?.userId) return false

  const course = await prisma.course.findUnique({
    where: { id: asset.scopeId },
    select: {
      creatorId: true,
      students: { where: { studentId: req.user.userId }, select: { id: true } },
    },
  })
  return !!course && (course.creatorId === req.user.userId || course.students.length > 0)
}

export const issuePrivateAssetUrl = async (req: Request, res: Response) => {
  const asset = await prisma.storedAsset.findUnique({ where: { id: req.params.id } })
  if (!asset || asset.deletedAt) return notFound(res, '文件不存在')
  if (!(await canReadPrivateAsset(asset, req))) return forbidden(res, '无权限访问此文件')
  const url = await getSignedAssetUrl(asset.id)
  if (!url) return notFound(res, '文件不存在')
  return res.json({ code: 0, message: '操作成功', data: { assetId: asset.id, url, expiresIn: ASSET_URL_TTL_SECONDS } })
}

const validatePublicCheckinAsset = async (assetId: string, token: string | undefined) => {
  if (!token) return null
  const { checkinTokenService } = await import('./checkinTokenService')
  const validation = await checkinTokenService.validateToken(token)
  if (!validation.valid || !validation.checkin) return null
  const asset = await prisma.storedAsset.findUnique({ where: { id: assetId } })
  if (!asset || asset.deletedAt || asset.accessScope !== 'PUBLIC_CHECKIN' || asset.scopeId !== validation.checkin.id) return null
  return asset
}

export const issuePublicAssetUrl = async (req: Request, res: Response) => {
  const asset = await validatePublicCheckinAsset(req.params.id, req.header('X-Checkin-Token'))
  if (!asset) return unauthorized(res, '无效的签到访问令牌')
  const url = await getSignedAssetUrl(asset.id, true)
  if (!url) return notFound(res, '文件不存在')
  return res.json({ code: 0, message: '操作成功', data: { assetId: asset.id, url, expiresIn: ASSET_URL_TTL_SECONDS } })
}

export const serveAsset = async (req: Request, res: Response) => {
  const expiresAt = Number(req.query.expires)
  const signature = typeof req.query.signature === 'string' ? req.query.signature : ''
  if (!verifyAssetSignature(req.params.id, expiresAt, signature)) return unauthorized(res, '文件访问签名无效或已过期')

  const asset = await prisma.storedAsset.findUnique({ where: { id: req.params.id } })
  if (!asset || asset.deletedAt) return notFound(res, '文件不存在')
  const publicRoute = req.baseUrl.includes('/public/assets')
  if (publicRoute && asset.accessScope !== 'PUBLIC_CHECKIN') {
    return unauthorized(res, '该文件不允许公开访问')
  }
  if (publicRoute && asset.accessScope === 'PUBLIC_CHECKIN') {
    const valid = await validatePublicCheckinAsset(asset.id, req.header('X-Checkin-Token'))
    if (!valid) return unauthorized(res, '无效的签到访问令牌')
  }

  if (asset.provider === 'cos') {
    const url = await getCOSSignedUrl(asset.objectKey, Math.max(1, expiresAt - Math.floor(Date.now() / 1000)))
    return res.redirect(302, url)
  }

  const localPath = localPathFor(asset.objectKey)
  if (!fs.existsSync(localPath)) return notFound(res, '文件不存在')
  res.setHeader('Content-Type', asset.mimeType)
  res.setHeader('Content-Length', String(asset.sizeBytes))
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(asset.originalName || asset.id)}"`)
  return fs.createReadStream(localPath).pipe(res)
}

export const assetStorageInternals = { localPathFor, providerFromEnvironment, signedPath }

// Queue workers use this only for local-provider processing input. The path
// remains confined below the private asset root.
export const getLocalAssetPath = (objectKey: string): string => localPathFor(objectKey)
