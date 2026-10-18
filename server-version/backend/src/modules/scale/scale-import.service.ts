import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { config } from '../../config'
import { canonicalHash } from '../assessment-runtime/canonical'
import { parseScaleImport, SCALE_IMPORT_MAX_BYTES } from '../assessment-core/scale/import-parser'
import { hashScaleDefinition } from './scale-definition'
import { assertScaleCopyPublishSource, lockScaleCopySource, syncCopiedScaleDraftMedia } from './scale-copy.service'

export const scaleImportInputSchema = z.object({
  content: z.string().min(1).max(SCALE_IMPORT_MAX_BYTES),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict()
export const scaleImportConfirmSchema = scaleImportInputSchema.extend({ digest: z.string().regex(/^[a-f0-9]{64}$/),
  previewToken: z.string().regex(/^[a-f0-9]{64}$/), previewExpiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict()
export class ScaleImportError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
const PREVIEW_TTL_MS = 10 * 60 * 1000
const signPreview = (digest: string, expiresAt: number) => createHmac('sha256', config.assetSigningSecret)
  .update('scale-import-confirm-v1\0').update(digest).update('\0').update(String(expiresAt)).digest('hex')
const fail = (status: number, message: string): never => { throw new ScaleImportError(status, message) }

export async function importScaleCsv(id: string, actor: { userId: string; role: string }, raw: unknown, confirm: boolean) {
  const input = (confirm ? scaleImportConfirmSchema : scaleImportInputSchema).parse(raw)
  const proof = confirm ? scaleImportConfirmSchema.parse(input) : null
  if (proof) {
    if (proof.previewExpiresAt <= Date.now() || proof.previewExpiresAt > Date.now() + PREVIEW_TTL_MS
      || !timingSafeEqual(Buffer.from(proof.previewToken, 'hex'), Buffer.from(signPreview(proof.digest, proof.previewExpiresAt), 'hex')))
      fail(409, '预检凭据无效或已过期，请重新预检')
  }
  return prisma.$transaction(async tx => {
    const scale = await lockScaleCopySource(tx, id)
    if (!scale) return fail(404, '量表不存在')
    if (scale.creatorId !== actor.userId && actor.role !== 'ADMIN') fail(403, '无权限修改此量表；使用授权不包含改编权')
    if (scale.instrumentClass !== 'CUSTOM_DESCRIPTIVE') fail(409, '标准量表由代码 package 管理，不能导入覆盖')
    if (scale.status !== 'DRAFT') fail(409, '仅草稿支持导入；已发布定义不可变更')
    if (scale.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) fail(409, '量表版本已变化，请重新预检')
    // Copied material retains its exact source/license gate, under the same lock.
    await assertScaleCopyPublishSource(tx, scale)
    const parsed = parseScaleImport(input.content, scale.definition)
    const contentHash = createHash('sha256').update(input.content, 'utf8').digest('hex')
    const digest = canonicalHash({ protocol: 'scale-import-v1', id, actorId: actor.userId,
      revision: scale.updatedAt.toISOString(), contentHash, baseHash: canonicalHash(scale.definition), nextHash: canonicalHash(parsed.definition) })
    const previewExpiresAt = Date.now() + PREVIEW_TTL_MS
    const previewToken = signPreview(digest, previewExpiresAt)
    const summary = { digest, previewToken, previewExpiresAt, expectedUpdatedAt: scale.updatedAt.toISOString(), count: parsed.count,
      totalItems: parsed.definition.items.length, responseSetKey: parsed.definition.responseSets[0].key, responseSet: parsed.definition.responseSets[0],
      scores: parsed.definition.scoring.scores.map(score => ({ key: score.key, label: score.label, aggregation: score.source.aggregation })), items: parsed.items }
    if (!confirm) return summary
    if (!('digest' in input) || typeof input.digest !== 'string' || !timingSafeEqual(Buffer.from(input.digest, 'hex'), Buffer.from(digest, 'hex'))) fail(409, '预检内容或摘要已变化，请重新预检')
    if (proof && proof.previewExpiresAt <= Date.now()) fail(409, '预检凭据已过期，请重新预检')
    const definitionHash = hashScaleDefinition(parsed.definition)
    const saved = await tx.scale.update({ where: { id, status: 'DRAFT', instrumentClass: 'CUSTOM_DESCRIPTIVE', updatedAt: scale.updatedAt },
      data: { definition: parsed.definition as any, definitionHash, itemCount: parsed.definition.items.length,
        dimensionCount: parsed.definition.scoring.scores.filter(score => score.type === 'dimension').length,
        updatedAt: new Date(Math.max(Date.now(), scale.updatedAt.getTime() + 1)) } })
    if (scale.copySource != null) await syncCopiedScaleDraftMedia(tx, id, parsed.definition)
    await tx.assessmentManagementEvent.create({ data: { actorId: actor.userId, resourceId: id, action: 'SCALE_IMPORT',
      metadata: { protocol: 'scale-import-v1', digest, contentHash, sourceBytes: Buffer.byteLength(input.content), count: parsed.count,
        previousRevision: scale.updatedAt.toISOString(), revision: saved.updatedAt.toISOString(), definitionHash } } })
    return { ...saved, importedCount: parsed.count }
  }, { maxWait: 5000, timeout: 5000 })
}
