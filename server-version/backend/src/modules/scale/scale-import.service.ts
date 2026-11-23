import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { parseScaleImport, SCALE_IMPORT_MAX_BYTES } from '../assessment-core/scale/import-parser'
import { parseFullScaleWorkbook } from './scale-full-workbook'
import { hashScaleDefinition } from './scale-definition'
import { assertScaleCopyPublishSource, lockScaleCopySource, syncCopiedScaleDraftMedia } from './scale-copy.service'

export const scaleImportInputSchema = z.object({
  content: z.string().min(1).max(SCALE_IMPORT_MAX_BYTES),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict()
export const scaleImportConfirmSchema = scaleImportInputSchema.extend({
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  previewToken: z.string().optional(),
  previewExpiresAt: z.string().optional(),
}).strict()
export class ScaleImportError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
const fail = (status: number, message: string): never => { throw new ScaleImportError(status, message) }

export async function importScaleCsv(id: string, actor: { userId: string; role: string }, raw: unknown, confirm: boolean) {
  const input = (confirm ? scaleImportConfirmSchema : scaleImportInputSchema).parse(raw)
  return prisma.$transaction(async tx => {
    const scale = await lockScaleCopySource(tx, id)
    if (!scale) return fail(404, '量表不存在')
    if (scale.creatorId !== actor.userId && actor.role !== 'ADMIN') fail(403, '无权限修改此量表；使用授权不包含改编权')
    if (scale.libraryEntryId) fail(409, '共用库授权引用只读，不能导入覆盖')
    if (scale.instrumentClass !== 'CUSTOM_DESCRIPTIVE') fail(409, '标准量表由代码 package 管理，不能导入覆盖')
    if (scale.status !== 'DRAFT') fail(409, '仅草稿支持导入；已发布定义不可变更')
    if (scale.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) fail(409, '量表版本已变化，请重新预检')
    await assertScaleCopyPublishSource(tx, scale)
    const parsed = parseScaleImport(input.content, scale.definition)
    const contentHash = createHash('sha256').update(input.content, 'utf8').digest('hex')
    const digest = canonicalHash({ protocol: 'scale-import-v1', id, actorId: actor.userId,
      revision: scale.updatedAt.toISOString(), contentHash, baseHash: canonicalHash(scale.definition), nextHash: canonicalHash(parsed.definition) })
    const summary = { digest, expectedUpdatedAt: scale.updatedAt.toISOString(), count: parsed.count,
      totalItems: parsed.definition.items.length, responseSetKey: parsed.definition.responseSets[0].key, responseSet: parsed.definition.responseSets[0],
      scores: parsed.definition.scoring.scores.map(score => ({ key: score.key, label: score.label, aggregation: score.source.aggregation })), items: parsed.items }
    if (!confirm) return summary
    if (!('digest' in input) || typeof input.digest !== 'string' || !timingSafeEqual(Buffer.from(input.digest, 'hex'), Buffer.from(digest, 'hex'))) fail(409, '预检内容或摘要已变化，请重新预检')
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

const fullWorkbookPreviewSchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict()
const fullWorkbookConfirmSchema = fullWorkbookPreviewSchema.extend({
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  previewToken: z.string().optional(),
  previewExpiresAt: z.string().optional(),
}).strict()

/** One-step Excel (.xlsx) import for custom scales: populates responseSet,
 * items, dimensions/scoring, and optional threshold rawScoreFeedback together.
 *
 * Parses the uploaded .xlsx workbook OUTSIDE any database transaction so CPU/ZIP
 * work never holds row locks or DB connections, and preview never acquires
 * FOR UPDATE locks. Confirm re-locks and rechecks revision + base definition hash
 * inside a short write transaction before committing. */
export async function importScaleFullWorkbook(
  id: string,
  actor: { userId: string; role: string },
  buffer: Buffer,
  raw: unknown,
  confirm: boolean,
) {
  const input = (confirm ? fullWorkbookConfirmSchema : fullWorkbookPreviewSchema).parse(raw)
  const proof = confirm ? fullWorkbookConfirmSchema.parse(input) : null

  const assertDraftEditable = <T extends {
    creatorId: string; libraryEntryId: string | null; instrumentClass: string; status: string; updatedAt: Date
  }>(scale: T | null): T => {
    if (!scale) return fail(404, '量表不存在')
    if (scale.creatorId !== actor.userId && actor.role !== 'ADMIN') fail(403, '无权限修改此量表；使用授权不包含改编权')
    if (scale.libraryEntryId) fail(409, '共用库授权引用只读，不能导入覆盖')
    if (scale.instrumentClass !== 'CUSTOM_DESCRIPTIVE') fail(409, '标准量表由代码 package 管理，不能导入覆盖')
    if (scale.status !== 'DRAFT') fail(409, '仅草稿支持导入；已发布定义不可变更')
    if (scale.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) fail(409, '量表版本已变化，请重新预检')
    return scale
  }

  const snapshot = assertDraftEditable(await prisma.scale.findUnique({ where: { id } }))
  const contentHash = createHash('sha256').update(buffer).digest('hex')
  const baseHash = canonicalHash(snapshot.definition)
  const parsed = await parseFullScaleWorkbook(buffer, snapshot.definition)
  const digest = canonicalHash({
    protocol: 'scale-full-workbook-v1',
    id,
    actorId: actor.userId,
    revision: snapshot.updatedAt.toISOString(),
    contentHash,
    baseHash,
    nextHash: canonicalHash(parsed.definition),
  })
  const summary = {
    digest,
    expectedUpdatedAt: snapshot.updatedAt.toISOString(),
    count: parsed.count,
    totalItems: parsed.definition.items.length,
    reportConfigured: parsed.reportConfigured,
    rawScoreFeedback: parsed.definition.report.rawScoreFeedback ?? null,
    responseSetKey: parsed.definition.responseSets[0].key,
    responseSet: parsed.definition.responseSets[0],
    scores: parsed.definition.scoring.scores.map((score) => ({
      key: score.key,
      label: score.label,
      aggregation: score.source.type === 'items' ? score.source.aggregation : 'custom',
    })),
    items: parsed.items,
  }
  if (!confirm) return summary
  if (!proof || !timingSafeEqual(Buffer.from(proof.digest, 'hex'), Buffer.from(digest, 'hex'))) {
    return fail(409, '预检内容或摘要已变化，请重新预检')
  }
  if (proof.digest !== digest) return fail(409, 'Excel 文件内容已变化，请重新预检')
  const definitionHash = hashScaleDefinition(parsed.definition)

  return prisma.$transaction(async (tx) => {
    const scale = assertDraftEditable(await lockScaleCopySource(tx, id))
    if (canonicalHash(scale.definition) !== baseHash) {
      return fail(409, '量表版本已变化，请重新预检')
    }
    await assertScaleCopyPublishSource(tx, scale)
    const saved = await tx.scale.update({
      where: { id, status: 'DRAFT', instrumentClass: 'CUSTOM_DESCRIPTIVE', updatedAt: scale.updatedAt },
      data: {
        definition: parsed.definition as any,
        definitionHash,
        itemCount: parsed.definition.items.length,
        dimensionCount: parsed.definition.scoring.scores.filter((score) => score.type === 'dimension').length,
        updatedAt: new Date(Math.max(Date.now(), scale.updatedAt.getTime() + 1)),
      },
    })
    if (scale.copySource != null) await syncCopiedScaleDraftMedia(tx, id, parsed.definition)
    await tx.assessmentManagementEvent.create({
      data: {
        actorId: actor.userId,
        resourceId: id,
        action: 'SCALE_IMPORT',
        metadata: {
          protocol: 'scale-full-workbook-v1',
          digest,
          contentHash,
          sourceBytes: buffer.length,
          count: parsed.count,
          reportConfigured: parsed.reportConfigured,
          previousRevision: scale.updatedAt.toISOString(),
          revision: saved.updatedAt.toISOString(),
          definitionHash,
        },
      },
    })
    return { ...saved, importedCount: parsed.count, reportConfigured: parsed.reportConfigured }
  }, { maxWait: 5000, timeout: 10000 })
}
