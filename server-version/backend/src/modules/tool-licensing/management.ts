import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { AdminPermissionError, lockAdminMutation } from '../admin-permissions/service'
import { validAdminProof, ADMIN_STEP_UP_SECONDS, type AdminSessionProof } from '../admin-permissions/proof'
import { canonicalHash } from '../assessment-runtime/canonical'
import {
  createToolLicenseSchema, editToolLicenseSchema, terminateToolLicenseSchema, toolLicenseListQuery,
  toolLicenseSubjectType, type ToolLicenseFamily, type ToolLicenseProduct, type ToolLicenseSubjectType,
} from './contracts'
import { requireLicenseSubject, requireLicenseTools, type LicenseSubject } from './directory'
import { commercialEnrollmentAtSql, commercialRolloutMode, isToolLicensingEnabled } from './runtime'
import { ownAssignmentSummary, type AssignmentSummary } from './assignment-summary'

type Tx = Prisma.TransactionClient
export type ToolLicenseActor = { actorUserId: string; actorSession: AdminSessionProof }
type LicenseItemInput = { key: string; limit: number | null }
type LicenseStatus = 'SCHEDULED' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED'
type LicenseItem = LicenseItemInput & { name: string; family: ToolLicenseFamily; used: number; reserved?: number }
type LicenseRow = {
  id: string
  product: ToolLicenseProduct
  subjectId: string
  subjectType: ToolLicenseSubjectType
  subjectLabel: string
  startsAt: Date
  expiresAt: Date
  terminatedAt: Date | null
  revision: number
  requestDigest: string
  status: LicenseStatus
  reason: string
  tools: LicenseItem[]
  nextLicenseId?: string | null
  missingTools?: string[]
  effectiveAt?: Date | null
  evaluatedAt?: Date
}
const options = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 10000 }
const fail = (status: number, message: string): never => { throw new AdminPermissionError(status, message) }
const periodStatus = Prisma.sql`CASE WHEN l.terminated_at IS NOT NULL THEN 'TERMINATED'
  WHEN l.expires_at<=statement_timestamp() THEN 'EXPIRED'
  WHEN l.starts_at>statement_timestamp() THEN 'SCHEDULED'
  ELSE 'ACTIVE' END`
const projection = (quota = false, renewal = false, includeEnrollment = false) => Prisma.sql`
  SELECT l.id,l.product,l.subject_id AS "subjectId",l.subject_type AS "subjectType",
    l.subject_label AS "subjectLabel",l.starts_at AS "startsAt",l.expires_at AS "expiresAt",
    l.terminated_at AS "terminatedAt",l.revision,l.request_digest AS "requestDigest",
    ${periodStatus} AS status,e.reason,
    ${includeEnrollment ? Prisma.sql`${commercialEnrollmentAtSql(Prisma.sql`l.product`,Prisma.sql`l.subject_id`)} AS "effectiveAt",
      statement_timestamp() AS "evaluatedAt",` : Prisma.empty}
    ${renewal ? Prisma.sql`next.id AS "nextLicenseId",ARRAY(
      SELECT i.name FROM tool_license_items i WHERE i.license_id=l.id AND i.removed_at IS NULL
      AND next.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tool_license_items n WHERE n.license_id=next.id
        AND n.tool_key=i.tool_key AND n.removed_at IS NULL) ORDER BY i.name,i.tool_key) AS "missingTools",` : Prisma.empty}
    COALESCE((SELECT jsonb_agg(jsonb_build_object('key',i.tool_key,'name',i.name,'family',i.family,
      'limit',i.usage_limit,'used',i.used
      ${quota ? Prisma.sql`,'reserved',COALESCE(ledger.reserved,0)` : Prisma.empty}) ORDER BY i.name,i.tool_key)
      FROM tool_license_items i
      ${quota ? Prisma.sql`LEFT JOIN (
        SELECT c.tool_key,sum(c.quantity) AS reserved FROM tool_license_charges c WHERE c.license_id=l.id
          AND c.settle_after IS NOT NULL AND c.settled_at IS NULL GROUP BY c.tool_key
      ) ledger ON ledger.tool_key=i.tool_key` : Prisma.empty}
      WHERE i.license_id=l.id AND i.removed_at IS NULL),'[]'::jsonb) AS tools
  FROM tool_licenses l JOIN tool_license_events e ON e.license_id=l.id AND e.revision=l.revision
  ${renewal ? Prisma.sql`LEFT JOIN LATERAL (SELECT n.id FROM tool_licenses n WHERE n.product=l.product
    AND n.subject_id=l.subject_id AND n.starts_at=l.expires_at AND n.terminated_at IS NULL ORDER BY n.id LIMIT 1) next ON true` : Prisma.empty}
`

function enrollmentView(product:ToolLicenseProduct, effectiveAt:Date|null, evaluatedAt:Date) {
  const enabled=isToolLicensingEnabled(product)
  return {mode:commercialRolloutMode(enabled,effectiveAt,evaluatedAt),effectiveAt}
}

function publicView(row: LicenseRow) {
  const {requestDigest:_requestDigest,effectiveAt,evaluatedAt,...view}=row
  return evaluatedAt ? {...view,enrollment:enrollmentView(row.product,effectiveAt??null,evaluatedAt)} : view
}

async function readRow(db: Tx, id: string) {
  const [row] = await db.$queryRaw<LicenseRow[]>(Prisma.sql`${projection()} WHERE l.id=${id}`)
  if (!row) return fail(404, '工具授权不存在')
  return row
}

export async function readToolLicense(id: string) {
  return publicView(await readRow(prisma, id))
}

export async function readToolLicenseTerminationImpact(id: string) {
  const row = await readRow(prisma, id)
  const [usage] = await prisma.$queryRaw<Array<{ meteredPublications: number; outstandingReservations: number }>>`
    SELECT count(DISTINCT publication_id)::int AS "meteredPublications",
      count(DISTINCT publication_id) FILTER (WHERE settle_after IS NOT NULL AND settled_at IS NULL)::int AS "outstandingReservations"
    FROM tool_license_charges WHERE license_id=${id}
  `
  return { id: row.id, revision: row.revision, product: row.product, status: row.status,
    subjectLabel: row.subjectLabel, tools: row.tools.map(tool => ({ key: tool.key, name: tool.name })), ...usage }
}

export async function listToolLicenses(raw: unknown) {
  const { product, subjectId, toolKey, family, status, page } = toolLicenseListQuery.parse(raw)
  const size = 25
  const statusFilter = status === 'EXPIRING'
    ? Prisma.sql`AND ${periodStatus}='ACTIVE' AND l.expires_at<=statement_timestamp()+INTERVAL '30 days'`
    : status ? Prisma.sql`AND ${periodStatus}=${status}` : Prisma.empty
  const rows = await prisma.$queryRaw<LicenseRow[]>(Prisma.sql`
    ${projection(false, status === 'EXPIRING', true)} WHERE l.product=${product}
    ${subjectId ? Prisma.sql`AND l.subject_id=${subjectId}` : Prisma.empty}
    ${toolKey || family ? Prisma.sql`AND EXISTS (SELECT 1 FROM tool_license_items item
      WHERE item.license_id=l.id AND item.removed_at IS NULL
      ${toolKey ? Prisma.sql`AND item.tool_key=${toolKey}` : Prisma.empty}
      ${family ? Prisma.sql`AND item.family=${family}` : Prisma.empty})` : Prisma.empty}
    ${statusFilter}
    ORDER BY ${status === 'EXPIRING' ? Prisma.sql`(next.id IS NULL) DESC,l.expires_at,` : Prisma.empty} l.created_at DESC,l.id LIMIT ${size + 1} OFFSET ${(page - 1) * size}
  `)
  return { list: rows.slice(0, size).map(publicView), hasMore: rows.length > size }
}

/** Business workspaces call this only after resolving the current product and
 * their own account or school. Internal reasons, actors and audit IDs stay in
 * system administration. These records describe commercial permission only. */
export async function readOwnToolLicense(product: ToolLicenseProduct, subjectId: string, userId: string) {
  const [row] = await prisma.$queryRaw<LicenseRow[]>(Prisma.sql`
    ${projection(product === 'SCHOOL' || product === 'TEACHER', false, true)} WHERE l.product=${product} AND l.subject_id=${subjectId}
    ORDER BY CASE WHEN l.terminated_at IS NOT NULL OR l.expires_at<=statement_timestamp() THEN 2
      WHEN l.starts_at>statement_timestamp() THEN 1 ELSE 0 END,
      CASE WHEN l.starts_at>statement_timestamp() THEN l.starts_at END ASC,
      l.starts_at DESC,l.id LIMIT 1
  `)
  const assignments = row?.status === 'ACTIVE'
    ? await ownAssignmentSummary(product, subjectId, userId, row.tools.map(tool => tool.key))
    : new Map<string,AssignmentSummary>()
  return {
    enrollment: enrollmentView(product,row?.effectiveAt??null,row?.evaluatedAt??new Date()),
    enforcing: isToolLicensingEnabled(product),
    license: row ? { product, subjectId, startsAt: row.startsAt, expiresAt: row.expiresAt, status: row.status,
      tools: row.tools.map(tool => {
        const version = assignments.get(tool.key)
        return {...tool,assignment:version?.state??'CHECK_IN_CATALOG',canAssignVersion:version?.canAssignVersion??false,
          reselectIfPinned:version?.reselectIfPinned??false}
      }),
    } : null,
  }
}

export async function validateToolLicenseItems(tx: Tx, product: ToolLicenseProduct, tools: LicenseItemInput[]) {
  const entries: Omit<LicenseItem, 'used'>[] = []
  for (let offset = 0; offset < tools.length; offset += 128) {
    const batch = tools.slice(offset, offset + 128)
    const sources = await requireLicenseTools(tx, product, batch.map(tool => tool.key))
    const byKey = new Map(sources.map(source => [source.key, source]))
    for (const tool of batch) {
      const source = byKey.get(tool.key)
      if (!source) return fail(409, '部分工具已不在当前入口的可授权范围')
      entries.push({ ...source, limit: tool.limit })
    }
  }
  return entries
}

async function writeItems(tx: Tx, id: string, entries: Omit<LicenseItem, 'used'>[]) {
  const rows = entries.map(entry => Prisma.sql`(${id},${entry.key},${entry.name},${entry.family},${entry.limit}::integer)`)
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO tool_license_items(license_id,tool_key,name,family,usage_limit)
    VALUES ${Prisma.join(rows)}
    ON CONFLICT (license_id,tool_key) DO UPDATE SET
      name=EXCLUDED.name, family=EXCLUDED.family, usage_limit=EXCLUDED.usage_limit, removed_at=NULL
  `)
}

async function audit(tx: Tx, value: {
  id: string; revision: number; actor: ToolLicenseActor; action: 'CREATED' | 'UPDATED' | 'TERMINATED'; reason: string; snapshot: unknown
}) {
  await tx.$executeRaw`
    INSERT INTO tool_license_events (license_id,revision,actor_id,action,reason,snapshot)
    VALUES (${value.id},${value.revision},${value.actor.actorUserId},${value.action},${value.reason},
      ${JSON.stringify(value.snapshot)}::jsonb)
  `
}

export async function lockToolLicenseSubjects(tx: Tx, product: ToolLicenseProduct, subjectIds: string[]) {
  // Sort by the actual lock key so overlapping batches always take locks in
  // the same order, even when distinct subject IDs have equal hashes.
  await tx.$queryRaw`
    SELECT 1 FROM (
      SELECT pg_advisory_xact_lock(hashtext(${product}), scope.lock_id)
      FROM (SELECT DISTINCT hashtext(id) AS lock_id FROM unnest(${subjectIds}::text[]) AS subjects(id) ORDER BY lock_id) scope
    ) locked
  `
}

export async function findOverlappingToolLicenseSubjects(tx: Tx, input: {
  product: ToolLicenseProduct; subjectIds: string[]; startsAt: Date; expiresAt: Date
}) {
  const { product, subjectIds, startsAt, expiresAt } = input
  const rows = await tx.$queryRaw<Array<{ subjectId: string }>>`
    SELECT DISTINCT subject_id AS "subjectId" FROM tool_licenses
    WHERE product=${product} AND subject_id=ANY(${subjectIds}::text[])
      AND starts_at<${expiresAt} AND LEAST(expires_at,COALESCE(terminated_at,expires_at))>${startsAt}
      AND (terminated_at IS NULL OR terminated_at>starts_at)
  `
  return new Set(rows.map(row => row.subjectId))
}

export async function readToolLicenseIssueTime(tx: Tx, expiresAt: Date) {
  const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
  if (expiresAt <= clock.now) fail(400, '到期时间须晚于当前时间')
  return clock.now
}

export async function lockLicenseActor(tx: Tx, actor: ToolLicenseActor) {
  const account = await lockAdminMutation(tx, actor)
  return () => {
    if (!account || (account.expiresAt && account.expiresAt <= new Date())
      || !validAdminProof(actor.actorSession, ADMIN_STEP_UP_SECONDS))
      fail(403, '操作者会话已失效，请重新验证')
  }
}

export async function writeNewToolLicenses(tx: Tx, value: {
  recipients: {id:string; subject:LicenseSubject}[]; product: ToolLicenseProduct; actor: ToolLicenseActor; digest: string
  startsAt: Date; expiresAt: Date; reason: string; entries: Omit<LicenseItem, 'used'>[]; batchIssuedAt?: Date
}) {
  const { recipients, product, actor, digest, startsAt, expiresAt, reason, entries, batchIssuedAt } = value
  const ids = recipients.map(row => row.id)
  const inserted = await tx.$executeRaw`
    INSERT INTO tool_licenses (id,product,subject_type,subject_id,subject_label,starts_at,expires_at,request_digest)
    SELECT id,${product},${toolLicenseSubjectType(product)},subject,label,${startsAt},${expiresAt},${digest}
    FROM unnest(${ids}::text[],${recipients.map(r=>r.subject.id)}::text[],${recipients.map(r=>r.subject.label)}::text[]) AS recipient(id,subject,label)
    ORDER BY id
    ON CONFLICT (id) DO NOTHING
  `
  if (inserted !== ids.length) fail(409, '该请求编号已用于另一份授权')
  await tx.$executeRaw`
    INSERT INTO tool_license_items(license_id,tool_key,name,family,usage_limit)
    SELECT id,tool.key,tool.name,tool.family,tool."limit" FROM unnest(${ids}::text[]) AS recipient(id)
    CROSS JOIN jsonb_to_recordset(${JSON.stringify(entries)}::jsonb) AS tool(key text,name text,family text,"limit" integer)
  `
  const snapshot = { startsAt, expiresAt, tools: entries, ...(batchIssuedAt ? { batchIssuedAt } : {}) }
  await tx.$executeRaw`
    INSERT INTO tool_license_events(license_id,revision,actor_id,action,reason,snapshot)
    SELECT id,1,${actor.actorUserId},'CREATED',${reason},${JSON.stringify(snapshot)}::jsonb FROM unnest(${ids}::text[]) AS recipient(id)
  `
}

export async function createToolLicense(actor: ToolLicenseActor, raw: unknown) {
  const input = createToolLicenseSchema.parse(raw)
  const ordered = [...input.tools].sort((left, right) => left.key.localeCompare(right.key))
  const digest = canonicalHash({ ...input, startsAt: input.startsAt.toISOString(), expiresAt: input.expiresAt.toISOString(),
    tools: ordered, actorId: actor.actorUserId })
  const { requestId: id, product, subjectId, startsAt, expiresAt, reason } = input
  return prisma.$transaction(async tx => {
    const recheck = await lockLicenseActor(tx, actor)
    await lockToolLicenseSubjects(tx, product, [subjectId])
    const [prior] = await tx.$queryRaw<Array<{ request_digest: string }>>`SELECT request_digest FROM tool_licenses WHERE id=${id}`
    if (prior) {
      recheck()
      if (prior.request_digest !== digest) fail(409, '该请求编号已用于另一份授权')
      return publicView(await readRow(tx, id))
    }
    const overlaps = await findOverlappingToolLicenseSubjects(tx, { product, subjectIds: [subjectId], startsAt, expiresAt })
    if (overlaps.size) fail(409, '该对象在此入口已有与所选期限重叠的授权')
    const subject = await requireLicenseSubject(tx, product, subjectId)
    const entries = await validateToolLicenseItems(tx, product, ordered)
    await readToolLicenseIssueTime(tx, expiresAt)
    recheck()
    await writeNewToolLicenses(tx, { recipients: [{ id, subject }], product, actor, digest, startsAt, expiresAt, reason, entries })
    return publicView(await readRow(tx, id))
  }, options)
}

async function lockForChange(tx: Tx, actor: ToolLicenseActor, id: string, expectedRevision: number) {
  const recheck = await lockLicenseActor(tx, actor)
  const [locked] = await tx.$queryRaw<Array<{ revision: number }>>`SELECT revision FROM tool_licenses WHERE id=${id} FOR UPDATE`
  if (!locked) return fail(404, '工具授权不存在')
  if (locked.revision !== expectedRevision) fail(409, '授权已变化，请刷新核对')
  return { current: await readRow(tx, id), recheck }
}

export async function editToolLicense(actor: ToolLicenseActor, id: string, raw: unknown) {
  const input = editToolLicenseSchema.parse(raw)
  return prisma.$transaction(async tx => {
    const { current, recheck } = await lockForChange(tx, actor, id, input.expectedRevision)
    if (current.status === 'TERMINATED' || current.status === 'EXPIRED') fail(409, '已结束的授权不能修改，可另行签发新期次')
    const keys = input.tools.map(tool => tool.key)
    const entries = await validateToolLicenseItems(tx, current.product, input.tools)
    const previous = await tx.$queryRaw<Array<{ key: string; used: number }>>(Prisma.sql`
      SELECT tool_key AS key,used FROM tool_license_items WHERE license_id=${id} AND tool_key IN (${Prisma.join(keys)})
    `)
    const used = new Map(previous.map(item => [item.key, item.used]))
    if (entries.some(item => item.limit !== null && item.limit < (used.get(item.key) ?? 0)))
      fail(409, '新额度不能小于工具已用次数')
    recheck()
    // Keep removed items and their counters so re-adding a tool in this period never restores spent quota.
    await tx.$executeRaw(Prisma.sql`
      UPDATE tool_license_items SET removed_at=clock_timestamp() WHERE license_id=${id}
        AND removed_at IS NULL AND tool_key NOT IN (${Prisma.join(keys)})
    `)
    await writeItems(tx, id, entries)
    const revision = current.revision + 1
    await tx.$executeRaw`UPDATE tool_licenses SET revision=${revision} WHERE id=${id}`
    await audit(tx, { id, revision, actor, action: 'UPDATED', reason: input.reason, snapshot: { tools: entries } })
    return publicView(await readRow(tx, id))
  }, options)
}

export async function terminateToolLicense(actor: ToolLicenseActor, id: string, raw: unknown) {
  const input = terminateToolLicenseSchema.parse(raw)
  return prisma.$transaction(async tx => {
    const { current, recheck } = await lockForChange(tx, actor, id, input.expectedRevision)
    if (current.status === 'TERMINATED' || current.status === 'EXPIRED') fail(409, '此授权已结束')
    recheck()
    const revision = current.revision + 1
    await tx.$executeRaw`UPDATE tool_licenses SET terminated_at=clock_timestamp(),revision=${revision} WHERE id=${id}`
    await audit(tx, { id, revision, actor, action: 'TERMINATED', reason: input.reason, snapshot: { tools: current.tools } })
    return publicView(await readRow(tx, id))
  }, options)
}
