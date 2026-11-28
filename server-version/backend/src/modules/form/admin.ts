import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { canonicalHash } from '../assessment-runtime/canonical'
import { governedFail, governedRow, insertFormTemplateSubmission } from '../survey/governed-tool.service'
import { artifactBlockers } from '../survey/governed-tool.model'
import { governedFormRelease } from './disclosure'
import { assertFormReleaseAxesUnchanged, buildGovernedFormRelease, lockFormReleaseAxes } from './publication'
import {
  formReleaseVersion, formTemplateContentSchema, formTemplateReportSchema, prepareFormRelease, type FormTemplateContent,
} from './release'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const formTemplateRequestSchema = z.object({
  requestId: z.string().uuid(),
  releaseKey: formReleaseVersion,
  base: z.object({ releaseId: z.string().uuid(), hash }).strict().optional(),
  content: formTemplateContentSchema,
  report: formTemplateReportSchema.omit({ contentHash: true }),
}).strict()
type FormTemplateRequest = z.infer<typeof formTemplateRequestSchema>

const contentIdentity = (content: FormTemplateContent) => canonicalHash({
  title: content.title, definition: content.definition,
  rawAnswerPolicy: content.dataCeiling.audiences,
})

function baselineContentIdentity(row: Awaited<ReturnType<typeof governedRow>>) {
  const unit = row.snapshot.unit!
  const release = governedFormRelease(unit.provenance)
  return canonicalHash({ title: unit.title, definition: unit.displayDefinition,
    rawAnswerPolicy: release?.dataCeiling.audiences ?? {} })
}

async function prepareAdminFormTemplate(db: Prisma.TransactionClient, actorId: string, input: FormTemplateRequest) {
  let contentHash = canonicalHash(input.content)
  if (input.base) {
    const row = await governedRow(db, input.base.releaseId)
    const unit = row.snapshot.unit
    if (row.snapshot_hash !== input.base.hash || row.family !== 'FORM' || !unit || row.tool_key !== 'FORM:original:' + input.content.toolKey)
      governedFail(409, '来源表单版本已变化，请重新读取')
    const frozenUnit = unit!
    const same = baselineContentIdentity(row) === contentIdentity(input.content)
    if (same !== (input.content.version === frozenUnit.ref.sourceVersion))
      governedFail(409, same ? '表单题本未改变，继续沿用原题本版本' : '题本或数据安全上限已改变，请创建新题本版本')
    const previous = governedFormRelease(frozenUnit.provenance)
    if (same && previous) contentHash = previous.contentHash
  }
  const report = formTemplateReportSchema.parse({ ...input.report, contentHash })
  const prepared = prepareFormRelease(input.content, report, contentHash, canonicalHash(report))
  const artifact = buildGovernedFormRelease(actorId, {
    requestId: input.requestId, releaseKey: input.releaseKey, content: input.content, report,
    prepared,
  })
  const blockers = artifactBlockers(artifact)
  return {
    artifact, blockers, previewHash: canonicalHash(artifact), definition: artifact.unit!.displayDefinition,
    effectiveDisclosure: governedFormRelease(artifact.unit!.provenance)!.effectiveDisclosure,
  }
}

export async function previewFormTemplate(db: Prisma.TransactionClient, actorId: string, raw: unknown) {
  const { artifact: _artifact, ...preview } = await prepareAdminFormTemplate(db, actorId, formTemplateRequestSchema.parse(raw))
  return preview
}

export async function submitReviewedFormTemplate(db: Prisma.TransactionClient, actorId: string, raw: unknown) {
  const { expectedPreviewHash, ...input } = formTemplateRequestSchema.extend({ expectedPreviewHash: hash }).parse(raw)
  // Serialize authoring of a series to close the immutable axis-label check.
  await lockFormReleaseAxes(db, input.content.toolKey)
  const { artifact, blockers, previewHash } = await prepareAdminFormTemplate(db, actorId, input)
  if (expectedPreviewHash !== previewHash) governedFail(409, '预览内容已改变，请重新预览')
  if (blockers.length) governedFail(409, blockers.join('；'))
  await assertFormReleaseAxesUnchanged(db, artifact)
  return insertFormTemplateSubmission(db, actorId, input.requestId, artifact)
}

export async function readFormRevisionTemplate(db: Prisma.TransactionClient, releaseId: string) {
  const row = await governedRow(db, releaseId)
  if (row.family !== 'FORM' || !row.snapshot.unit || !row.tool_key.startsWith('FORM:original:'))
    governedFail(404, '此版本没有可复制的原生表单')
  const unit = row.snapshot.unit!
  const release = governedFormRelease(unit.provenance)
  const reference = row.reference.metadata
  return {
    base: { releaseId: row.id, hash: row.snapshot_hash },
    content: {
      schemaVersion: 1 as const, toolKey: row.tool_key.slice('FORM:original:'.length), version: unit.ref.sourceVersion,
      title: unit.title, definition: unit.displayDefinition,
      dataCeiling: release?.dataCeiling ?? { schemaVersion: 1, unknownAudience: 'DENY', policyVersion: unit.ref.sourceVersion, audiences: {} },
      statement: typeof reference.submissionStatement === 'string' ? reference.submissionStatement : '',
      classificationTags: Array.isArray(reference.classificationTags)
        ? reference.classificationTags.flatMap(tag => typeof tag?.id === 'string' ? [tag.id] : []) : [],
      reference: reference.annotations ?? {},
    },
    report: row.snapshot.report ? { ...row.snapshot.report, ...(release ? { reportVisibility: release.reportVisibility } : {}) } : null,
  }
}
