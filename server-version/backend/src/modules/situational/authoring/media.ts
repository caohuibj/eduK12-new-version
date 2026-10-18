import type { Prisma } from '@prisma/client'
import { assessmentImageSchema } from '../../assessment-core/definition-primitives'
import { ASSESSMENT_STATIC_IMAGE_MIME_TYPES } from '../../assessment-media/assessment-image'
import { retainAssessmentAssetReferences } from '../../assessment-media/assessment-asset'
import { lockStoredAssetRows } from '../../../services/assetStorage'
import type { z } from 'zod'
import { sjtAdaptationSourceSchema } from './grant-contract'

export const SJT_AUTHOR_MEDIA_SCOPE = 'sjt-authoring'
export const SJT_AUTHOR_MAX_IMAGE_BYTES = 2 * 1024 * 1024
export const SJT_AUTHOR_RELEASE_MEDIA_REFERENCE_TYPE = 'SjtAuthorRelease'
export type SjtAuthorImage = z.infer<typeof assessmentImageSchema>
export class SjtAuthorMediaError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); this.name = 'SjtAuthorMediaError' }
}
function fail(message: string): never { throw new SjtAuthorMediaError(403, message) }

/** The service builds this only after validating the exact source release and
 * active ADAPT grant in the same transaction. Never accept it from request JSON.
 */
export interface SjtAuthorAdaptMediaSource {
  template: unknown
  sourceOwnerId: string
  grantId: string
  provenance: unknown
}
export interface SjtAuthorMediaOptions { adaptSource?: SjtAuthorAdaptMediaSource }

export function sjtAuthorImages(template: unknown): SjtAuthorImage[] {
  if (!template || typeof template !== 'object' || Array.isArray(template)) return []
  const document = template as { templateVersion?: string; display?: { scenes?: Array<{ image?: unknown }> } }
  if (document.templateVersion !== 'sjt-online-v1') return []
  if (!Array.isArray(document.display?.scenes)) fail('在线图片题面无效')
  return document.display!.scenes!.flatMap(scene => {
    if (scene.image === undefined) return []
    const parsed = assessmentImageSchema.safeParse(scene.image)
    if (!parsed.success) fail('情境图片身份、替代文字或许可字段无效')
    return [parsed.data!]
  })
}
const sameIdentity = (a: SjtAuthorImage['asset'], b: SjtAuthorImage['asset']) =>
  a.assetId === b.assetId && a.contentHash === b.contentHash && a.mimeType === b.mimeType

function sourceImages(source: SjtAuthorAdaptMediaSource | undefined): SjtAuthorImage[] {
  if (!source) return []
  const parsed = sjtAdaptationSourceSchema.safeParse(source.provenance)
  if (!source.sourceOwnerId || !source.grantId || !parsed.success
    || parsed.data.sourceAuthorId !== source.sourceOwnerId
    || parsed.data.receipt.grantId !== source.grantId) fail('改编图片缺少明确的来源与 ADAPT 授权凭据')
  return sjtAuthorImages(source.template)
}

/** Applies to create, revise, restore, review admission and publication. A bare
 * asset ID/hash, another product's PRIVATE upload, or reviewer status grants no use.
 */
export async function assertSjtAuthorMedia(
  tx: Prisma.TransactionClient, ownerId: string, template: unknown, options: SjtAuthorMediaOptions = {},
): Promise<SjtAuthorImage['asset'][]> {
  const images = sjtAuthorImages(template)
  if (!images.length) return []
  const ids = [...new Set(images.map(image => image.asset.assetId))].sort()
  if (ids.length > 20) fail('单个在线工具最多引用 20 张静态情境图片')
  await lockStoredAssetRows(tx, ids)
  const assets = await tx.storedAsset.findMany({ where: { id: { in: ids } }, select: {
    id: true, ownerId: true, accessScope: true, scopeId: true, deletedAt: true,
    mimeType: true, sha256: true, sizeBytes: true, provider: true, objectKey: true,
  } })
  const byId = new Map(assets.map(asset => [asset.id, asset]))
  const source = sourceImages(options.adaptSource)
  for (const image of images) {
    if (!image.altText.trim() || !['self_authored', 'authorized'].includes(image.rightsStatus) || !image.rightsNote.trim())
      fail('情境图片必须填写替代文字与明确的原创或授权依据')
    const asset = byId.get(image.asset.assetId)
    if (!asset || asset.deletedAt || asset.accessScope !== 'PRIVATE' || asset.scopeId !== SJT_AUTHOR_MEDIA_SCOPE
      || asset.sizeBytes <= 0 || asset.sizeBytes > SJT_AUTHOR_MAX_IMAGE_BYTES || !asset.objectKey
      || !['local', 'cos'].includes(asset.provider)
      || !ASSESSMENT_STATIC_IMAGE_MIME_TYPES.includes(asset.mimeType as typeof ASSESSMENT_STATIC_IMAGE_MIME_TYPES[number])
      || asset.sha256 !== image.asset.contentHash || asset.mimeType !== image.asset.mimeType)
      fail('情境图片不存在、已删除、超限或身份与作者上传范围不一致')
    if (asset.ownerId !== ownerId) {
      const original = source.find(candidate => sameIdentity(candidate.asset, image.asset))
      if (!options.adaptSource || asset.ownerId !== options.adaptSource.sourceOwnerId || !original
        || image.rightsStatus !== 'authorized' || original.rightsStatus === 'unknown' || !original.rightsNote.trim())
        fail('他人图片只能凭有效来源 ADAPT 授权改编，不能仅凭资产编号或摘要引用')
    }
  }
  return images.map(image => image.asset)
}

export async function retainSjtAuthorReleaseMedia(
  tx: Prisma.TransactionClient, ownerId: string, releaseId: string, template: unknown,
  options: SjtAuthorMediaOptions = {},
): Promise<void> {
  const references = await assertSjtAuthorMedia(tx, ownerId, template, options)
  await retainAssessmentAssetReferences({ db: tx, references,
    owner: { entityType: SJT_AUTHOR_RELEASE_MEDIA_REFERENCE_TYPE, entityId: releaseId, field: 'media' },
  })
}
