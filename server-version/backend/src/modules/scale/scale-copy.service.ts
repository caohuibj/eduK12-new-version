import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { syncAssetReferences } from '../../services/assetStorage'
import { hashScaleDefinition, type ScaleDefinitionV2 } from './scale-definition'
import { validateScaleProductDefinition } from './product-definition-readiness'
import { assertAssessmentAssetReferencesReady } from '../assessment-media/assessment-asset'
import { scaleAssessmentMediaReferences } from './scale-image-retention'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const scaleCopySourceSchema = z.object({
  schemaVersion: z.literal(1), parentId: z.string().min(1), parentCode: z.string().min(1),
  parentVersion: z.string().min(1), parentDefinitionHash: digest, parentScoringHash: digest,
  parentCreatorId: z.string().min(1), parentSourceHash: digest, parentLicenseHash: digest,
}).strict()
export type ScaleCopySource = z.infer<typeof scaleCopySourceSchema>
export class ScaleCopyError extends Error {
  constructor(message: string, readonly status = 409) { super(message) }
}
const stable = (value: any): any => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const digestValue = (value: unknown) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
type Source = { libraryEntryId?: string | null; id: string; code: string; creatorId: string; status: string; instrumentClass: string; instrumentVersion: string; definition: unknown; definitionHash: string | null }
export const scaleCopyEligibility = (scale: Source, userId: string) => {
  if (scale.libraryEntryId) return { allowed: false, reason: '共用库授权引用只读，不能复制或修订为私人可编辑工具。' }
  if (scale.creatorId !== userId) return { allowed: false, reason: '仅作者可以复制自编量表；查看或使用授权不包含改编权。' }
  if (scale.instrumentClass !== 'CUSTOM_DESCRIPTIVE' || scale.status !== 'PUBLISHED') return { allowed: false, reason: '仅已发布的自编描述性量表可以复制。' }
  const definition = scale.definition as Partial<ScaleDefinitionV2> | null
  if (definition?.license?.status !== 'self_authored' || definition.license.redistribution !== 'allowed') return { allowed: false, reason: '仅明确可再分发的自有内容支持复制；其他来源需单独确认改编权。' }
  return { allowed: true }
}
const sourceSnapshot = (scale: Source, definition: ScaleDefinitionV2): ScaleCopySource => ({
  schemaVersion: 1, parentId: scale.id, parentCode: scale.code, parentVersion: scale.instrumentVersion,
  parentDefinitionHash: hashScaleDefinition(definition), parentScoringHash: digestValue(definition.scoring),
  parentCreatorId: scale.creatorId, parentSourceHash: digestValue(definition.source), parentLicenseHash: digestValue(definition.license),
})
export const lockScaleCopySource = async (tx: Prisma.TransactionClient, sourceId: string) => {
  // Same row lock conflicts with DELETE and all status/definition updates. Never
  // trust a pre-transaction read for copy/publication authorization.
  await tx.$queryRaw`SELECT "id" FROM "scales" WHERE "id" = ${sourceId} FOR UPDATE`
  return tx.scale.findUnique({ where: { id: sourceId } })
}
export const syncCopiedScaleDraftMedia = async (tx: Prisma.TransactionClient, id: string, definition: ScaleDefinitionV2) => {
  await assertAssessmentAssetReferencesReady(scaleAssessmentMediaReferences(definition), tx as never)
  await syncAssetReferences({ entityType: 'ScaleCopyDraft', entityId: id, values: { definition }, db: tx as never })
}
export const assertScaleCopyPublishSource = async (tx: Prisma.TransactionClient, copy: { id: string; creatorId: string; copySource?: unknown }) => {
  if (copy.copySource == null) return // Existing/native drafts retain their publication contract.
  const parsed = scaleCopySourceSchema.safeParse(copy.copySource)
  if (!parsed.success || parsed.data.parentId === copy.id) throw new ScaleCopyError('复制来源记录无效，不能发布，请重新从来源创建草稿。')
  const source = await lockScaleCopySource(tx, parsed.data.parentId)
  if (!source) throw new ScaleCopyError('复制来源已不存在，不能发布此草稿；已发布版本和历史结果不受影响。')
  const eligibility = scaleCopyEligibility(source, copy.creatorId)
  if (!eligibility.allowed) throw new ScaleCopyError(eligibility.reason!)
  const validation = validateScaleProductDefinition(source.definition, 'CUSTOM_DESCRIPTIVE')
  if (!validation.valid || !validation.definition || source.definitionHash !== hashScaleDefinition(validation.definition)
    || JSON.stringify(stable(sourceSnapshot(source, validation.definition))) !== JSON.stringify(stable(parsed.data))) {
    throw new ScaleCopyError('复制来源或许可已变化，不能发布此草稿，请重新核对来源。')
  }
  return source // Reuse this locked, rights-checked identity for release provenance.
}
export const copyScaleToDraft = async (sourceId: string, userId: string, mode: 'COPY' | 'REVISION' = 'COPY') => prisma.$transaction(async tx => {
  const source = await lockScaleCopySource(tx, sourceId)
  if (!source) throw new ScaleCopyError('量表不存在', 404)
  const eligibility = scaleCopyEligibility(source, userId)
  if (!eligibility.allowed) throw new ScaleCopyError(eligibility.reason!, 403)
  const validation = validateScaleProductDefinition(source.definition, 'CUSTOM_DESCRIPTIVE')
  if (!validation.valid || !validation.definition) throw new ScaleCopyError('来源定义与当前编制器不兼容，不能复制。')
  const definition = validation.definition
  if (source.definitionHash !== hashScaleDefinition(definition)) throw new ScaleCopyError('来源定义摘要不一致，不能复制。')
  const familyId = mode === 'REVISION' ? source.authoringFamilyId ?? source.id : randomUUID()
  // Serialize sibling revision allocation on the original family root. Return
  // an integer, not the lock function's PostgreSQL void (unsupported by Prisma).
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${"scale-authoring-family:" + familyId}))`
  const latest = mode === 'REVISION' ? await tx.scale.aggregate({ where: { authoringFamilyId: familyId }, _max: { authoringVersion: true } }) : null
  const authoringVersion = mode === 'REVISION' ? Math.max(source.authoringVersion ?? 1, latest?._max.authoringVersion ?? 1) + 1 : 1
  if (mode === 'REVISION' && !source.authoringFamilyId) await tx.scale.update({ where: { id: source.id }, data: { authoringFamilyId: familyId, authoringVersion: 1 } })
  const copied = await tx.scale.create({ data: {
    code: `COPY_${randomUUID()}`, name: `${source.name}（${mode === 'REVISION' ? '修订' : '新工具'}草稿）`, description: source.description,
    // Independent copies retain provenance in immutable copySource, not a
    // lifecycle FK. Revisions alone protect their same-family parent row.
    authoringFamilyId: familyId, authoringVersion, sourceScaleId: mode === 'REVISION' ? source.id : null,
    status: 'DRAFT', visibility: 'HIDDEN', instrumentClass: 'CUSTOM_DESCRIPTIVE', instrumentVersion: source.instrumentVersion,
    definition: source.definition as Prisma.InputJsonValue, definitionHash: source.definitionHash,
    copySource: sourceSnapshot(source, definition), itemCount: source.itemCount, dimensionCount: source.dimensionCount,
    estimatedTime: source.estimatedTime, instruction: source.instruction, creatorId: userId, tags: source.tags,
  } })
  await syncCopiedScaleDraftMedia(tx, copied.id, definition)
  return copied
})
