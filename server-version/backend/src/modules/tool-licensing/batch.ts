import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { AdminPermissionError, lockAdminMutation } from '../admin-permissions/service'
import { canonicalHash } from '../assessment-runtime/canonical'
import {
  createToolLicenseSchema, editToolLicenseSchema, toolLicenseId,
  type ToolLicenseProduct, type ToolLicenseSubjectType,
} from './contracts'
import { requireLicenseSubject, type LicenseSubject, type LicenseTool } from './directory'
import {
  findOverlappingToolLicenseSubjects, lockToolLicenseSubjects, readToolLicenseIssueTime,
  validateToolLicenseItems, writeNewToolLicense, type ToolLicenseActor,
} from './management'

const maxRecipients = 50
const maxAssignments = 2000
const fields = {
  requestId: toolLicenseId,
  product: createToolLicenseSchema.shape.product,
  subjectIds: z.array(toolLicenseId).min(2).max(maxRecipients)
    .refine(ids => new Set(ids).size === ids.length, '授权对象不可重复'),
  startsAt: createToolLicenseSchema.shape.startsAt,
  expiresAt: createToolLicenseSchema.shape.expiresAt,
  reason: createToolLicenseSchema.shape.reason,
  tools: editToolLicenseSchema.shape.tools.max(maxAssignments / 2),
}
const validScope = (input: { startsAt: Date; expiresAt: Date; subjectIds: string[]; tools: unknown[] }) =>
  input.startsAt < input.expiresAt && input.subjectIds.length * input.tools.length <= maxAssignments
const scopeProblem = '到期须晚于开始时间，每批最多 2,000 个对象与工具的分配项'
const previewInput = z.strictObject(fields).refine(validScope, scopeProblem)
const issueInput = z.strictObject({ ...fields, previewDigest: z.string().regex(/^[0-9a-f]{64}$/) })
  .refine(validScope, scopeProblem)

type Scope = z.infer<typeof previewInput>
type Tx = Prisma.TransactionClient
type Conflict = { subjectId: string; label: string; reason: string }
type PreparedTool = LicenseTool & { limit: number | null }

const options = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 20000 }
const stableScope = (scope: Scope) => ({
  requestId: scope.requestId,
  product: scope.product,
  subjectIds: [...scope.subjectIds].sort(),
  startsAt: scope.startsAt.toISOString(),
  expiresAt: scope.expiresAt.toISOString(),
  reason: scope.reason,
  tools: [...scope.tools].sort((left, right) => left.key < right.key ? -1 : Number(left.key > right.key)),
})

async function readPreview(tx: Tx, actor: ToolLicenseActor, scope: Scope) {
  const stable = stableScope(scope)
  const subjects: LicenseSubject[] = []
  const conflicts: Conflict[] = []
  const tools = await validateToolLicenseItems(tx, scope.product, stable.tools)
  const overlapping = await findOverlappingToolLicenseSubjects(tx, { ...scope, subjectIds: stable.subjectIds })
  for (const subjectId of stable.subjectIds) {
    let subject: LicenseSubject
    try {
      subject = await requireLicenseSubject(tx, scope.product, subjectId)
    } catch (error) {
      if (!(error instanceof AdminPermissionError) || error.statusCode !== 403) throw error
      conflicts.push({ subjectId, label: '待核对对象', reason: error.message })
      continue
    }
    subjects.push(subject)
    if (overlapping.has(subjectId)) {
      conflicts.push({ subjectId, label: subject.label, reason: '此入口已有与所选期限重叠的许可' })
    }
  }
  const reviewed = {
    requestId: stable.requestId, product: stable.product,
    startsAt: stable.startsAt, expiresAt: stable.expiresAt, reason: stable.reason, subjects, tools, conflicts,
  }
  const previewDigest = canonicalHash({ actorId: actor.actorUserId, scope: stable, reviewed })
  return { ...reviewed, previewDigest }
}

export async function previewToolLicenseBatch(actor: ToolLicenseActor, raw: unknown) {
  const scope = previewInput.parse(raw)
  return prisma.$transaction(async tx => {
    await readToolLicenseIssueTime(tx, scope.expiresAt)
    return readPreview(tx, actor, scope)
  }, options)
}

// The first receipt reserves the batch request ID itself. The other stable
// UUIDs allow the original receipts to be retrieved from the existing ledger.
function receiptId(requestId: string, subjectId: string, index: number) {
  if (index === 0) return requestId
  const hash = canonicalHash({ scope: 'tool-license-batch-receipt', requestId, subjectId })
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

type IssuedRow = {
  id: string; product: ToolLicenseProduct; subjectId: string; subjectType: ToolLicenseSubjectType; subjectLabel: string
  startsAt: Date; expiresAt: Date; status: 'ACTIVE' | 'SCHEDULED'; reason: string
  requestDigest: string; tools: PreparedTool[] | null; issuedAt: Date | null
}

async function issuedReceipts(tx: Tx, ids: string[], digest: string) {
  const rows = await tx.$queryRaw<IssuedRow[]>`
    SELECT l.id,l.product,l.subject_id AS "subjectId",l.subject_type AS "subjectType",
      l.subject_label AS "subjectLabel",l.starts_at AS "startsAt",l.expires_at AS "expiresAt",
      l.request_digest AS "requestDigest",e.reason,e.snapshot->'tools' AS tools,
      (e.snapshot->>'batchIssuedAt')::timestamptz AS "issuedAt",
      CASE WHEN l.starts_at>(e.snapshot->>'batchIssuedAt')::timestamptz THEN 'SCHEDULED' ELSE 'ACTIVE' END AS status
    FROM tool_licenses l INNER JOIN tool_license_events e ON e.license_id=l.id AND e.revision=1 AND e.action='CREATED'
    WHERE l.id=ANY(${ids}::text[])
  `
  if (rows.length !== ids.length || rows.some(row => row.requestDigest !== digest || !row.issuedAt || !Array.isArray(row.tools))) {
    throw new AdminPermissionError(409, '该请求编号已用于另一份授权')
  }
  const byId = new Map(rows.map(row => [row.id, row]))
  return ids.map(id => {
    const { requestDigest: _digest, issuedAt: _issuedAt, tools, ...receipt } = byId.get(id)!
    return { ...receipt, revision: 1, terminatedAt: null, tools: tools!.map(tool => ({ ...tool, used: 0 })) }
  })
}

export async function createToolLicenseBatch(actor: ToolLicenseActor, raw: unknown) {
  const { previewDigest, ...scope } = issueInput.parse(raw)
  const stable = stableScope(scope)
  const { requestId, subjectIds } = stable
  const ids = subjectIds.map((subjectId, index) => receiptId(requestId, subjectId, index))
  const digest = canonicalHash({ scope: stable, actorId: actor.actorUserId, previewDigest })
  return prisma.$transaction(async tx => {
    await lockAdminMutation(tx, actor)
    // PostgreSQL keeps the one-bigint lock namespace separate from the
    // product/subject locks, which also synchronize ordinary single issuance.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended('tool-license-batch:'||${requestId}::text,0))`
    const [committed] = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM tool_licenses WHERE id=${requestId}`
    if (committed) return { requestId, licenses: await issuedReceipts(tx, ids, digest) }

    await lockToolLicenseSubjects(tx, scope.product, subjectIds)
    const review = await readPreview(tx, actor, scope).catch(error => {
      // Subject eligibility is already reported in conflicts. A catalog rejection
      // here invalidates the preview and the administrator can edit the selection.
      if (error instanceof AdminPermissionError && error.statusCode === 403)
        throw new AdminPermissionError(409, '所选工具已不在可授权范围，请调整工具后重新预览')
      throw error
    })
    if (review.conflicts.length || review.previewDigest !== previewDigest)
      throw new AdminPermissionError(409, '对象、工具或授权状态已变化，请重新预览后再签发')

    await lockAdminMutation(tx, actor)
    const issuedAt = await readToolLicenseIssueTime(tx, scope.expiresAt)
    for (const [index, subject] of review.subjects.entries()) {
      await writeNewToolLicense(tx, {
        id: ids[index], product: scope.product, subject, actor, digest,
        startsAt: scope.startsAt, expiresAt: scope.expiresAt, reason: scope.reason,
        entries: review.tools, batchIssuedAt: issuedAt,
      })
    }
    return { requestId, licenses: await issuedReceipts(tx, ids, digest) }
  }, options)
}
