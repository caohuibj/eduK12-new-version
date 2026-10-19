import { Router, type Request, type Response, type RequestHandler } from 'express'
import { z } from 'zod'
import { prisma } from '../config/database'
import { UserRole } from '../types'
import { boundedUpload, uploadPrincipalRateLimit } from '../middleware/uploadAdmission'
import { storeAsset, discardUnreferencedAsset, softDeleteStoredAsset } from '../services/assetStorage'
import { ASSESSMENT_STATIC_IMAGE_MIME_TYPES } from '../modules/assessment-media/assessment-image'
import { AssessmentImageDeliveryError, serveAssessmentImageContent } from '../modules/assessment-media/assessment-image-delivery'
import { getSjtDraft } from '../modules/situational/authoring/service'
import { SJT_AUTHOR_MEDIA_SCOPE, SJT_AUTHOR_MAX_IMAGE_BYTES, sjtAuthorImages } from '../modules/situational/authoring/media'

/** Mounted behind sjtAuthoring's existing authenticate + requireTeacher boundary. */
const router = Router()
const actor = (req: Request) => ({ userId: req.user!.userId, admin: req.user!.role === UserRole.ADMIN })
const send = (res: Response, data: unknown) => res.json({ code: 0, message: '成功', data })
const problem = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode })
const handle = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => async (req, res) => {
  try { await fn(req, res) } catch (error) {
    if (res.headersSent) { res.destroy(); return }
    if (error instanceof z.ZodError) { res.status(400).json({ code: 'SJT_MEDIA_ERROR', message: '图片分页参数无效' }); return }
    const status = error instanceof AssessmentImageDeliveryError ? 404 : Number((error as { statusCode?: number }).statusCode ?? 500)
    res.status(status).json({ code: 'SJT_MEDIA_ERROR', message: status < 500 ? (error as Error).message : '图片服务暂时不可用' })
  }
}
const portable = (asset: { id: string; sha256: string; mimeType: string; originalName: string | null; sizeBytes: number }) => ({
  asset: { assetId: asset.id, contentHash: asset.sha256, mimeType: asset.mimeType },
  name: asset.originalName || asset.id, sizeBytes: asset.sizeBytes,
})
router.post('/media/images', uploadPrincipalRateLimit,
  boundedUpload('image', SJT_AUTHOR_MAX_IMAGE_BYTES, [...ASSESSMENT_STATIC_IMAGE_MIME_TYPES], handle(async (req, res) => {
    if (!req.file) throw problem(400, '请选择 PNG、JPEG 或 WebP 图片')
    const mimeType = (req.file as Express.Multer.File & { detectedMimeType: string }).detectedMimeType
    let asset: Awaited<ReturnType<typeof storeAsset>> | undefined
    try {
      asset = await storeAsset({ buffer: req.file.buffer, originalName: req.file.originalname, mimeType,
        ownerId: req.user!.userId, accessScope: 'PRIVATE', scopeId: SJT_AUTHOR_MEDIA_SCOPE })
      send(res, portable(asset))
    } catch (error) {
      if (asset) await discardUnreferencedAsset(asset).catch(() => undefined)
      throw error
    }
  })))
const pageQuery = z.object({
  pageSize: z.string().regex(/^[1-9]\d{0,2}$/u).transform(Number).pipe(z.number().int().max(100)).optional(),
  cursor: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/u).optional(),
}).strict()
const cursorSchema = z.object({ createdAt: z.string().datetime(), id: z.string().min(1).max(200) }).strict()
router.get('/media/images', handle(async (req, res) => {
  const query = pageQuery.parse(req.query), pageSize = query.pageSize ?? 30
  let cursor: z.infer<typeof cursorSchema> | undefined
  if (query.cursor) {
    try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'))) }
    catch { throw problem(400, '图片分页游标无效') }
  }
  const rows = await prisma.storedAsset.findMany({ where: {
    ownerId: req.user!.userId, accessScope: 'PRIVATE', scopeId: SJT_AUTHOR_MEDIA_SCOPE, deletedAt: null,
    mimeType: { in: [...ASSESSMENT_STATIC_IMAGE_MIME_TYPES] }, sizeBytes: { gt: 0, lte: SJT_AUTHOR_MAX_IMAGE_BYTES },
    ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.createdAt) } },
      { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } }] } : {}),
  }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: pageSize + 1,
  select: { id: true, sha256: true, mimeType: true, originalName: true, sizeBytes: true, createdAt: true } })
  const items = rows.slice(0, pageSize), last = items[items.length - 1]
  const nextCursor = rows.length > pageSize && last
    ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString('base64url') : null
  send(res, { items: items.map(portable), nextCursor })
}))
router.get('/media/images/:assetId/content', handle(async (req, res) => {
  const asset = await prisma.storedAsset.findFirst({ where: {
    id: req.params.assetId, ownerId: req.user!.userId, accessScope: 'PRIVATE', scopeId: SJT_AUTHOR_MEDIA_SCOPE, deletedAt: null,
    mimeType: { in: [...ASSESSMENT_STATIC_IMAGE_MIME_TYPES] }, sizeBytes: { gt: 0, lte: SJT_AUTHOR_MAX_IMAGE_BYTES },
  } })
  if (!asset) throw problem(404, '图片不存在或无权读取')
  res.setHeader('Cache-Control', 'private, no-store')
  await serveAssessmentImageContent({ reference: portable(asset).asset as ReturnType<typeof sjtAuthorImages>[number]['asset'], res })
}))
router.delete('/media/images/:assetId', handle(async (req, res) => {
  const result = await softDeleteStoredAsset({ assetId: req.params.assetId, authorize: async asset =>
    asset.ownerId === req.user!.userId && asset.accessScope === 'PRIVATE' && asset.scopeId === SJT_AUTHOR_MEDIA_SCOPE })
  if (result === 'referenced') throw problem(409, '图片已被发布版本或作答保留，不能删除')
  if (result !== 'deleted') throw problem(404, '图片不存在或无权删除')
  send(res, { deleted: true })
}))
router.get('/drafts/:id/media/:assetId/content', handle(async (req, res) => {
  // getSjtDraft checks exact draft entitlement, including current adaptation grants.
  const draft = await getSjtDraft(actor(req), req.params.id)
  const reference = sjtAuthorImages(draft.template).find(image => image.asset.assetId === req.params.assetId)?.asset
  if (!reference) throw problem(404, '图片不属于当前授权题面')
  res.setHeader('Cache-Control', 'private, no-store')
  await serveAssessmentImageContent({ reference, res })
}))
export default router
