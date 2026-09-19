import { randomUUID } from 'node:crypto'
import { prisma } from '../../config/database'
import { resolveOrganizationAccessContext } from '../organization/access'
import { readOrganizationSafetyCase } from '../assessment-safety/organization-view'
import type { ReportingPrincipal } from './authorization'
import { readOrganizationMemberProjection } from './memberProjection'
import { readOrganizationReportingArtifact } from './pr4Service'
import { reportingFail } from './types'

export type ReportingExportTarget =
  | { kind: 'AGGREGATE' | 'MEMBER'; artifactId: string }
  | { kind: 'SAFETY'; caseId: string }

type ExportInput = { principal: ReportingPrincipal; organizationId: string; target: ReportingExportTarget }

// Quote every cell, double embedded quotes and neutralize spreadsheet formulas
// even after leading whitespace/control characters. Numeric negatives stay numeric.
export const csvCell = (value: unknown): string => {
  let text = value === null || value === undefined ? '' : String(value)
  if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/u.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export const projectionToCsv = (projection: unknown): string => {
  const rows: Array<[string, unknown]> = []
  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, `${path}[${index}]`))
    else if (value !== null && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) visit(entry, path ? `${path}.${key}` : key)
    } else rows.push([path, value])
  }
  visit(projection, '')
  return [['field', 'value'], ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

const assertExportGrant = async (input: ExportInput) => {
  const context = await resolveOrganizationAccessContext(input)
  const grant = input.target.kind === 'MEMBER' ? 'REPORT_MEMBER_EXPORT' : 'REPORT_EXPORT'
  if (!context?.membershipId || context.organizationStatus !== 'ACTIVE'
    || !context.capabilities.includes(grant)
    || context.explicitDenies.some((deny) => ['*', 'REPORT_READ', 'REPORT_EXPORT', grant].includes(deny))) {
    reportingFail('EXPORT_NOT_ALLOWED', 'current scoped export capability required', 403)
  }
}

const authorizedProjection = async (input: ExportInput): Promise<unknown> => {
  // Read first: subject exclusion and resource scope always outrank export rights.
  const projection = input.target.kind === 'SAFETY'
    ? await readOrganizationSafetyCase({ ...input, caseId: input.target.caseId })
    : input.target.kind === 'MEMBER'
      ? await readOrganizationMemberProjection({ ...input, artifactId: input.target.artifactId })
      : await readOrganizationReportingArtifact({ ...input, artifactId: input.target.artifactId })
  await assertExportGrant(input)
  return projection
}

export const createReportingExport = async (input: ExportInput) => {
  await authorizedProjection(input)
  const id = randomUUID()
  const artifactId = input.target.kind === 'SAFETY' ? null : input.target.artifactId
  const caseId = input.target.kind === 'SAFETY' ? input.target.caseId : null
  const rows = await prisma.$transaction(async (tx) => {
    const tickets = await tx.$queryRaw<Array<{ id: string; expiresAt: Date }>>`
      INSERT INTO reporting_export_tickets (id,organization_id,viewer_user_id,artifact_id,safety_case_id,export_kind,expires_at)
      VALUES (${id},${input.organizationId},${input.principal.userId},${artifactId},${caseId},${input.target.kind},CURRENT_TIMESTAMP+INTERVAL '15 minutes')
      RETURNING id, expires_at AS "expiresAt"
    `
    await tx.$executeRaw`
      INSERT INTO organization_governance_audits
        (id,organization_id,actor_user_id,action,target_type,target_id,domain_event_id,payload)
      VALUES (${randomUUID()},${input.organizationId},${input.principal.userId},'REPORT_EXPORT_CREATED','ReportingExport',${id},${id},
        ${JSON.stringify({ kind: input.target.kind, artifactId, caseId })}::jsonb)
    `
    return tickets
  })
  await authorizedProjection(input)
  return { exportId: id, expiresAt: rows[0].expiresAt.toISOString() }
}

export const downloadReportingExport = async (input: {
  principal: ReportingPrincipal; organizationId: string; exportId: string
}) => {
  const rows = await prisma.$queryRaw<Array<{ kind: 'AGGREGATE' | 'MEMBER' | 'SAFETY'; artifactId: string | null; caseId: string | null }>>`
    SELECT export_kind AS kind, artifact_id AS "artifactId", safety_case_id AS "caseId" FROM reporting_export_tickets
    WHERE id=${input.exportId} AND organization_id=${input.organizationId} AND viewer_user_id=${input.principal.userId}
      AND expires_at > statement_timestamp()
  `
  const ticket = rows[0] ?? reportingFail('REPORT_EXPORT_NOT_FOUND', 'export not found or expired', 404)
  const target: ReportingExportTarget = ticket.kind === 'SAFETY'
    ? { kind: 'SAFETY', caseId: ticket.caseId! } : { kind: ticket.kind, artifactId: ticket.artifactId! }
  const projection = await authorizedProjection({ ...input, target })
  return { filename: `report-${input.exportId}.csv`, csv: projectionToCsv(projection) }
}
