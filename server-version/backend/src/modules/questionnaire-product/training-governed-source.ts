import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { assertToolEntryPolicy, prefetchToolPolicyAdmission } from '../assessment-governance/tool-entry-policy'
import { AdminPermissionError } from '../admin-permissions/service'
import { CompositeServiceError, compositeConflict, compositeForbidden } from '../composite/composite.errors'
import { assertGovernedDependencies, assertGovernedOnline } from '../survey/governed-tool.service'
import { governedPolicyIdentity } from '../survey/governed-tool.model'
import { toolLicenseKey } from '../tool-licensing/contracts'
import { authorizeToolPublication, isExpandedToolLicensingEnabled, ToolLicenseAccessError } from '../tool-licensing/runtime'
import { hasTrainingGovernedSource, matchesTrainingGovernedContent, trainingGovernedDirectoryFilter, trainingGovernedSections } from './training-governed-definition'

type Tx = Prisma.TransactionClient
const sourceAction = 'TRAINING_GOVERNED_SOURCE'
export const trainingGovernedSourceSchema = z.object({
  id: z.string().guid(), hash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
type Pointer = z.infer<typeof trainingGovernedSourceSchema>

export async function listTrainingGovernedSources(actorId: string, raw: unknown) {
  if (!isExpandedToolLicensingEnabled('TRAINING')) return { list: [], hasMore: false }
  const input = z.object({ q: z.string().trim().max(120).default(''), page: z.coerce.number().int().min(1).max(500).default(1) }).strict().parse(raw)
  await requireTrainingTeacher(prisma, actorId)
  const list = await prisma.$queryRaw<Array<{ id: string; name: string; family: 'FORM' | 'COMBINATION'; version: string; hash: string }>>(Prisma.sql`
    SELECT t.id,t.title AS name,t.family,t.tool_version AS version,t.snapshot_hash AS hash
    FROM survey_governed_tools t WHERE ${trainingGovernedDirectoryFilter()}
      AND (${input.q}='' OR strpos(lower(t.title),lower(${input.q}))>0)
    ORDER BY t.title,t.tool_version,t.id LIMIT 26 OFFSET ${(input.page - 1) * 25}
  `)
  return { list: list.slice(0, 25), hasMore: list.length > 25 }
}

async function requireTrainingTeacher(tx: Tx, actorId: string) {
  const row = await tx.user.findUnique({ where: { id: actorId }, select: {
    role: true, accountDomain: true, isActive: true, isFrozen: true, teacherApproved: true,
  } })
  if (!row?.isActive || row.isFrozen || row.role !== 'TEACHER' || !row.teacherApproved
    || !['LEGACY', 'TRAINING'].includes(row.accountDomain))
    throw compositeForbidden('仅通过审核的 Training 教师可投放公共工具')
}

async function readSource(tx: Tx, pointer: Pointer) {
  try {
    const row = await assertGovernedOnline(tx, pointer.id, pointer.hash)
    let sections: ReturnType<typeof trainingGovernedSections>
    try {
      sections = trainingGovernedSections(row.snapshot)
    } catch (cause) {
      throw compositeConflict(cause instanceof Error ? cause.message : '此平台工具无法在 Training 投放')
    }
    await assertGovernedDependencies(tx, row.snapshot)
    const policies = [governedPolicyIdentity(row), ...row.snapshot.components.map(component => ({
      resourceKey: 'governed-release:' + component.source.id, fingerprint: component.source.hash,
    }))]
    await prefetchToolPolicyAdmission(tx, policies, 'TRAINING')
    for (const policy of policies) await assertToolEntryPolicy(tx, policy, 'TRAINING')
    return { row, sections }
  } catch (cause) {
    if (cause instanceof AdminPermissionError) throw new CompositeServiceError(cause.message, cause.statusCode)
    throw cause
  }
}

export async function materializeTrainingGovernedSource(tx: Tx, compositeId: string, actorId: string, pointer: Pointer) {
  if (!isExpandedToolLicensingEnabled('TRAINING')) throw compositeForbidden('Training 公共工具投放尚未启用')
  await requireTrainingTeacher(tx, actorId)
  const { sections } = await readSource(tx, pointer)
  for (const { items, ...section } of sections) {
    const { id } = await tx.compositeFormSection.create({
      data: { ...section, compositeAssessmentId: compositeId }, select: { id: true },
    })
    await tx.compositeAssessmentItem.createMany({ data: items.map(item => ({
      ...item, formOptions: item.formOptions ?? Prisma.DbNull, formSectionId: id, compositeAssessmentId: compositeId,
    })) })
  }
  await tx.assessmentManagementEvent.create({
    data: { id: compositeId, actorId, resourceId: compositeId, action: sourceAction, metadata: pointer },
  })
}

export async function authorizeTrainingGovernedPublication(tx: Tx, publication: {
  id: string; creationKey?: string | null; createdBy: string | null; productKind: string; status: string
  formSections: Parameters<typeof matchesTrainingGovernedContent>[1]
  items: Parameters<typeof matchesTrainingGovernedContent>[2]
  trainingFlowDraft?: unknown; trainingVariantDraft?: unknown; reportPackageKey?: unknown; analysisProtocolKey?: unknown
}) {
  if (!hasTrainingGovernedSource(publication)) return
  if (!isExpandedToolLicensingEnabled('TRAINING')) throw compositeForbidden('Training 公共工具投放尚未启用')
  if (!publication.createdBy || publication.productKind !== 'QUESTIONNAIRE' || publication.status !== 'DRAFT'
    || publication.trainingFlowDraft || publication.trainingVariantDraft || publication.reportPackageKey || publication.analysisProtocolKey)
    throw compositeConflict('平台工具必须按冻结的普通问卷独立投放')
  const source = await tx.assessmentManagementEvent.findUnique({ where: { id: publication.id } })
  const pointer = trainingGovernedSourceSchema.safeParse(source?.metadata)
  if (!pointer.success || source?.action !== sourceAction || source.resourceId !== publication.id || source.actorId !== publication.createdBy)
    throw compositeConflict('缺少本次投放的精确平台来源')
  await requireTrainingTeacher(tx, publication.createdBy)
  const { row, sections } = await readSource(tx, pointer.data)
  if (!matchesTrainingGovernedContent(sections, publication.formSections, publication.items))
    throw compositeConflict('表单与冻结来源不一致，请从精确版本重新创建投放')
  try {
    await authorizeToolPublication(tx, {
      product: 'TRAINING', subjectId: publication.createdBy, publicationId: publication.id,
      toolKeys: [toolLicenseKey(row.family, row.tool_key)], requireIssuedLicense: true,
    })
  } catch (cause) {
    if (cause instanceof ToolLicenseAccessError) throw new CompositeServiceError(cause.message, cause.statusCode)
    throw cause
  }
}
