import crypto from 'node:crypto'
import fs from 'node:fs'
import { promises as fsPromises } from 'node:fs'
import path from 'node:path'
import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'
import { config } from '../config'
import { CourseStudentStatus, UserRole } from '../types'
import { forbidden, notFound, unauthorized } from '../utils/response'
import { getCOSSignedUrl, isCOSEnabled, uploadBufferToCOS, uploadToCOS, deleteFromCOS } from '../utils/cos'

export const ASSET_URL_TTL_SECONDS = 10 * 60
// objectKey is always relative to the upload root (for example
// `assets/<uuid>.pdf`). Keeping one root here also makes worker paths and the
// migration script agree on where an asset physically lives.
const ASSET_ROOT = path.resolve(config.uploadDir)
const ASSET_SIGNING_SECRET = config.assetSigningSecret

export type AssetProvider = 'local' | 'cos'
export type AssetDatabase = typeof prisma | Prisma.TransactionClient

export type AssetUrlAudience = 'private' | 'public'

export interface AssetHydrationContext {
  entityType: string
  entityId: string
  parentAccess: boolean
  courseId?: string
  checkinId?: string
}

export interface AssetReferenceInput {
  assetId: string
  field: string
}

export class AssetReferenceValidationError extends Error {
  constructor(message = '附件凭据无效或不属于当前课程') {
    super(message)
    this.name = 'AssetReferenceValidationError'
  }
}

export interface StoreAssetInput {
  buffer: Buffer
  originalName?: string
  mimeType: string
  ownerId?: string
  accessScope?: string
  scopeId?: string
  provider?: AssetProvider
}

export interface StoredAssetContent {
  id: string
  objectKey: string
  provider: string
  mimeType: string
  sizeBytes: number
  sha256: string
  deletedAt: Date | null
  originalName?: string | null
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
    if (provider === 'local') {
      await fsPromises.rm(localPath, { force: true }).catch(() => undefined)
    } else {
      await deleteFromCOS(objectKey).catch(() => undefined)
    }
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
      await uploadToCOS(input.filePath, objectKey)
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
    if (provider === 'local') {
      await fsPromises.rm(localPath, { force: true }).catch(() => undefined)
    } else {
      await deleteFromCOS(objectKey).catch(() => undefined)
    }
    throw error
  }
}

export const attachAssetReference = async (params: {
  assetId: string
  entityType: string
  entityId: string
  field: string
}, db: AssetDatabase = prisma) => db.assetReference.upsert({
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

/**
 * Compensation for an asset created immediately before a parent transaction.
 * It is intentionally conservative: if a reference appeared concurrently,
 * leave the asset intact for the normal lifecycle/GC path.
 */
export const discardUnreferencedAsset = async (asset: {
  id: string
  objectKey: string
  provider: string
}): Promise<boolean> => {
  let deleted = false
  try {
    const result = await prisma.storedAsset.deleteMany({
      where: {
        id: asset.id,
        references: { none: {} },
      },
    })
    deleted = result.count === 1
  } catch {
    return false
  }
  if (!deleted) return false

  if (asset.provider === 'local') {
    await fsPromises.rm(localPathFor(asset.objectKey), { force: true }).catch(() => undefined)
  } else {
    await deleteFromCOS(asset.objectKey).catch(() => undefined)
  }
  return true
}

const collectAssetReferencesInto = (
  value: unknown,
  field: string,
  result: AssetReferenceInput[],
): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectAssetReferencesInto(item, `${field}.${index}`, result))
    return
  }
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return

  const record = value as Record<string, unknown>
  if (typeof record.assetId === 'string' && record.assetId.trim()) {
    result.push({ assetId: record.assetId, field: field || 'asset' })
    return
  }

  Object.entries(record).forEach(([key, item]) => {
    collectAssetReferencesInto(item, field ? `${field}.${key}` : key, result)
  })
}

export const collectAssetReferences = (value: unknown, field = ''): AssetReferenceInput[] => {
  const result: AssetReferenceInput[] = []
  collectAssetReferencesInto(value, field, result)
  return result
}

export const syncAssetReferences = async (params: {
  entityType: string
  entityId: string
  values: Record<string, unknown>
  db?: AssetDatabase
}): Promise<void> => {
  const db = params.db || prisma
  const references = Object.entries(params.values)
    .flatMap(([field, value]) => collectAssetReferences(value, field))
    .filter((reference, index, all) => all.findIndex((candidate) => (
      candidate.assetId === reference.assetId && candidate.field === reference.field
    )) === index)

  await db.assetReference.deleteMany({
    where: { entityType: params.entityType, entityId: params.entityId },
  })

  for (const reference of references) {
    await attachAssetReference({
      assetId: reference.assetId,
      entityType: params.entityType,
      entityId: params.entityId,
      field: reference.field,
    }, db)
  }
}

export const validateAssetReferencesForCourse = async (params: {
  values: Record<string, unknown>
  courseId: string
  ownerId: string
  role?: UserRole
  db?: AssetDatabase
}): Promise<AssetReferenceInput[]> => {
  const references = Object.entries(params.values)
    .flatMap(([field, value]) => collectAssetReferences(value, field))
  const assetIds = [...new Set(references.map((reference) => reference.assetId))]
  if (!assetIds.length) return references

  const db = params.db || prisma
  const assets = await db.storedAsset.findMany({
    where: { id: { in: assetIds } },
    select: {
      id: true,
      ownerId: true,
      accessScope: true,
      scopeId: true,
      deletedAt: true,
    },
  })
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]))
  if (assetsById.size !== assetIds.length) throw new AssetReferenceValidationError()

  for (const assetId of assetIds) {
    const asset = assetsById.get(assetId)
    if (!asset || asset.deletedAt) throw new AssetReferenceValidationError()

    const isAdmin = params.role === UserRole.ADMIN
    if (!isAdmin && asset.ownerId !== params.ownerId) {
      throw new AssetReferenceValidationError('只能引用自己上传的附件')
    }
    if (asset.accessScope === 'PUBLIC_CHECKIN') {
      throw new AssetReferenceValidationError()
    }
    if (asset.accessScope === 'COURSE' && asset.scopeId !== params.courseId) {
      throw new AssetReferenceValidationError()
    }
  }

  return references
}

export const createAssetSignature = (
  assetId: string,
  expiresAt: number,
  audience: AssetUrlAudience = 'private',
): string => {
  return crypto.createHmac('sha256', ASSET_SIGNING_SECRET)
    .update(`${audience}.${assetId}.${expiresAt}`)
    .digest('base64url')
}

export const verifyAssetSignature = (
  assetId: string,
  expiresAt: number,
  signature: string,
  audience: AssetUrlAudience = 'private',
): boolean => {
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(signature)) return false
  const expected = createAssetSignature(assetId, expiresAt, audience)
  const expectedBuffer = Buffer.from(expected)
  const suppliedBuffer = Buffer.from(signature)
  return expectedBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
}

const signedPath = (assetId: string, expiresAt: number, publicRoute = false): string => {
  const audience: AssetUrlAudience = publicRoute ? 'public' : 'private'
  const query = new URLSearchParams({
    expires: String(expiresAt),
    signature: createAssetSignature(assetId, expiresAt, audience),
  })
  return `/api/${publicRoute ? 'public/' : ''}assets/${encodeURIComponent(assetId)}/content?${query.toString()}`
}

export const getSignedAssetUrl = async (assetId: string, publicRoute = false): Promise<string | null> => {
  const asset = await prisma.storedAsset.findUnique({ where: { id: assetId } })
  if (!asset || asset.deletedAt) return null
  if (publicRoute && asset.accessScope !== 'PUBLIC_CHECKIN') return null
  if (!publicRoute && asset.accessScope === 'PUBLIC_CHECKIN') return null
  const expiresAt = Math.floor(Date.now() / 1000) + ASSET_URL_TTL_SECONDS
  // The client always receives an application URL. COS credentials and COS
  // URLs remain server-side and are generated only while serving the asset.
  return signedPath(asset.id, expiresAt, publicRoute)
}

const isExpectedAssetScope = (
  asset: { accessScope: string; scopeId: string | null },
  context: AssetHydrationContext,
  publicRoute: boolean,
): boolean => {
  if (publicRoute) {
    // Public hydration is currently only used for a Checkin. The parent
    // reference is checked separately; these scope checks make sure a
    // course asset cannot be exposed through an unrelated public record.
    if (context.entityType !== 'Checkin' || !context.checkinId) return false
    // Participant staging/submission assets are never part of the public
    // check-in parent. Teacher reference media use COURSE/PRIVATE scope and
    // are exposed only through the exact Checkin AssetReference.
    if (asset.accessScope === 'PUBLIC_CHECKIN') return false
    if (asset.accessScope === 'COURSE') return !context.courseId || asset.scopeId === context.courseId
    return true
  }
  if (asset.accessScope === 'COURSE') {
    return !context.courseId || asset.scopeId === context.courseId
  }
  if (asset.accessScope === 'PUBLIC_CHECKIN') {
    return context.entityType === 'CheckinSubmission'
      && Boolean(context.checkinId && asset.scopeId === context.checkinId)
  }
  return true
}

const getHydratableAssets = async (
  assetIds: string[],
  publicRoute: boolean,
  context?: AssetHydrationContext,
): Promise<Map<string, { id: string }>> => {
  if (!context?.parentAccess || !assetIds.length) return new Map()

  const [assets, references] = await Promise.all([
    prisma.storedAsset.findMany({
      where: { id: { in: assetIds }, deletedAt: null },
      select: { id: true, accessScope: true, scopeId: true },
    }),
    prisma.assetReference.findMany({
      where: {
        entityType: context.entityType,
        entityId: context.entityId,
        assetId: { in: assetIds },
      },
      select: { assetId: true },
    }),
  ])
  const referencedIds = new Set(references.map((reference) => reference.assetId))
  const result = new Map<string, { id: string }>()

  for (const asset of assets) {
    if (!referencedIds.has(asset.id)) continue
    if (!isExpectedAssetScope(asset, context, publicRoute)) continue
    result.set(asset.id, { id: asset.id })
  }

  return result
}

/**
 * Replace asset references in JSON attachment fields with short-lived
 * URLs. A parent access decision and an AssetReference row are both required;
 * a bare client-supplied assetId can never obtain a URL from this function.
 * Legacy strings are deliberately left unchanged during the migration window.
 */
export const hydrateAssetReferences = async (
  value: unknown,
  publicRoute = false,
  context?: AssetHydrationContext,
): Promise<unknown> => {
  const assetIds = [...new Set(collectAssetReferences(value).map((reference) => reference.assetId))]
  const hydratableAssets = await getHydratableAssets(assetIds, publicRoute, context)
  const expiresAt = Math.floor(Date.now() / 1000) + ASSET_URL_TTL_SECONDS

  const visit = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map((item) => visit(item))
    if (!current || typeof current !== 'object') return current
    if (current instanceof Date || Buffer.isBuffer(current)) return current

    const record = current as Record<string, unknown>
    if (typeof record.assetId === 'string' && record.assetId) {
      const url = hydratableAssets.has(record.assetId)
        ? signedPath(record.assetId, expiresAt, publicRoute)
        : null
      return { ...record, url }
    }
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, visit(item)]))
  }

  return visit(value)
}

export const canReadPrivateAsset = async (asset: {
  ownerId: string | null
  accessScope: string
  scopeId: string | null
}, actor: { userId?: string; role?: UserRole } = {}): Promise<boolean> => {
  // Public check-in assets cannot obtain a private URL directly. A private
  // capability may still be issued by an authorized parent hydration (for
  // example, an authenticated CheckinSubmission response).
  if (asset.accessScope === 'PUBLIC_CHECKIN') return false
  if (actor.role === UserRole.ADMIN) return true
  if (asset.ownerId && asset.ownerId === actor.userId) return true
  if (asset.accessScope === 'PUBLIC') return true
  if (asset.accessScope !== 'COURSE' || !asset.scopeId || !actor.userId) return false

  const course = await prisma.course.findUnique({
    where: { id: asset.scopeId },
    select: {
      creatorId: true,
      shares: { select: { sharedTo: true } },
      students: {
        where: {
          studentId: actor.userId,
          status: { in: [CourseStudentStatus.ACTIVE, CourseStudentStatus.APPROVED] },
        },
        select: { id: true },
      },
    },
  })
  return !!course && (
    course.creatorId === actor.userId
    || (course.shares || []).some((share) => share.sharedTo === actor.userId)
    || course.students.length > 0
  )
}

export const issuePrivateAssetUrl = async (req: Request, res: Response) => {
  const asset = await prisma.storedAsset.findUnique({ where: { id: req.params.id } })
  if (!asset || asset.deletedAt) return notFound(res, '文件不存在')
  if (!(await canReadPrivateAsset(asset, req.user))) return forbidden(res, '无权限访问此文件')
  const url = await getSignedAssetUrl(asset.id)
  if (!url) return notFound(res, '文件不存在')
  return res.json({ code: 0, message: '操作成功', data: { assetId: asset.id, url, expiresIn: ASSET_URL_TTL_SECONDS } })
}

const validatePublicCheckinAsset = async (
  assetId: string,
  token: string | undefined,
  sessionId?: string,
  sessionCapability?: string,
) => {
  if (!token) return null
  const { checkinTokenService } = await import('./checkinTokenService')
  const validation = await checkinTokenService.validateToken(token, { ignoreUsageLimit: true })
  if (!validation.valid || !validation.checkin) return null
  const asset = await prisma.storedAsset.findUnique({ where: { id: assetId } })
  if (!asset || asset.deletedAt) return null

  // Anonymous participant assets are readable on the public route only while
  // staged and only by the exact server-issued upload session. Once promoted
  // to CheckinSubmission, they are available through authenticated parent
  // hydration instead of the shared check-in token.
  if (asset.accessScope === 'PUBLIC_CHECKIN') {
    if (!sessionId || !sessionCapability || !validation.token?.id || !validation.token.expiresAt) return null
    if (!checkinTokenService.verifySessionCapability({
      checkinId: validation.checkin.id,
      tokenId: validation.token.id,
      sessionId,
      capability: sessionCapability,
      tokenExpiresAt: validation.token.expiresAt,
    })) return null

    const stagingReference = await prisma.assetReference.findFirst({
      where: {
        assetId: asset.id,
        entityType: 'CheckinUploadSession',
        entityId: `${validation.checkin.id}:${sessionId}`,
        field: 'staging',
      },
      select: { id: true },
    })
    return stagingReference ? asset : null
  }
  if (asset.accessScope === 'COURSE' && asset.scopeId !== validation.checkin.courseId) return null

  const reference = await prisma.assetReference.findFirst({
    where: {
      assetId: asset.id,
      entityType: 'Checkin',
      entityId: validation.checkin.id,
    },
    select: { id: true },
  })
  return reference ? asset : null
}

export const issuePublicAssetUrl = async (req: Request, res: Response) => {
  const asset = await validatePublicCheckinAsset(
    req.params.id,
    req.header('X-Checkin-Token'),
    req.header('X-Checkin-Session-Id'),
    req.header('X-Checkin-Session-Capability'),
  )
  if (!asset) return unauthorized(res, '无效的签到访问令牌')
  const expiresAt = Math.floor(Date.now() / 1000) + ASSET_URL_TTL_SECONDS
  const url = signedPath(asset.id, expiresAt, true)
  return res.json({ code: 0, message: '操作成功', data: { assetId: asset.id, url, expiresIn: ASSET_URL_TTL_SECONDS } })
}

/**
 * Serve an already-authorized StoredAsset.  Assessment-specific routes call
 * this after validating the frozen attempt binding; generic asset routes call
 * it after validating a signed URL.  Keeping the byte delivery in one place
 * preserves path traversal, MIME, COS, and nosniff protections.
 */
export const serveStoredAssetContent = async (
  asset: StoredAssetContent,
  res: Response,
  expiresAt = Math.floor(Date.now() / 1000) + ASSET_URL_TTL_SECONDS,
): Promise<Response | void> => {
  if (asset.provider === 'cos') {
    const url = await getCOSSignedUrl(asset.objectKey, Math.max(1, expiresAt - Math.floor(Date.now() / 1000)))
    return res.redirect(302, url)
  }

  const localPath = localPathFor(asset.objectKey)
  if (!fs.existsSync(localPath)) return notFound(res, '文件不存在')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Type', asset.mimeType)
  res.setHeader('Content-Length', String(asset.sizeBytes))
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(asset.originalName || asset.id)}"`)
  return fs.createReadStream(localPath).pipe(res)
}

export const serveAsset = async (req: Request, res: Response) => {
  const publicRoute = req.baseUrl.includes('/public/assets')
  const expiresAt = Number(req.query.expires)
  const signature = typeof req.query.signature === 'string' ? req.query.signature : ''
  if (!verifyAssetSignature(req.params.id, expiresAt, signature, publicRoute ? 'public' : 'private')) {
    return unauthorized(res, '文件访问签名无效或已过期')
  }

  const asset = await prisma.storedAsset.findUnique({ where: { id: req.params.id } })
  if (!asset || asset.deletedAt) return notFound(res, '文件不存在')
  if (publicRoute) {
    const valid = await validatePublicCheckinAsset(
      asset.id,
      req.header('X-Checkin-Token'),
      req.header('X-Checkin-Session-Id'),
      req.header('X-Checkin-Session-Capability'),
    )
    if (!valid) return unauthorized(res, '无效的签到访问令牌')
  }
  return serveStoredAssetContent(asset, res, expiresAt)
}

export const assetStorageInternals = { localPathFor, providerFromEnvironment, signedPath }

// Queue workers use this only for local-provider processing input. The path
// remains confined below the private asset root.
export const getLocalAssetPath = (objectKey: string): string => localPathFor(objectKey)
