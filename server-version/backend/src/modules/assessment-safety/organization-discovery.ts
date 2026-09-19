import { prisma } from '../../config/database'
import { resolveOrganizationAccessContext } from '../organization/access'
import type { ReportingPrincipal } from '../reporting/authorization'
import { ReportingError, reportingFail } from '../reporting/types'
import { readOrganizationSafetyCase } from './organization-view'

export type OrganizationSafetyProjectionKind = 'FULL' | 'ACTION' | 'SUMMARY'

export interface OrganizationSafetyCaseSummary {
  caseId: string
  projection: OrganizationSafetyProjectionKind
  status: string
  createdAt: string
  acknowledgedAt: string | null
  disposedAt: string | null
  ackDueAt?: string
  disposeDueAt?: string
}

type CandidateRow = {
  caseId: string
  status: string
  createdAt: Date
  acknowledgedAt: Date | null
  disposedAt: Date | null
  ackDueAt: Date
  disposeDueAt: Date
}

const LIMIT = 100
const hidden = (): never => reportingFail('REPORT_NOT_FOUND', 'safety resource not found', 404)

/**
 * Product discovery for Organization Safety is deliberately narrower than the
 * exact-case projection. It exposes no subject identity, trigger material, owner
 * identity or event detail. Every candidate is re-authorized through the exact
 * read path before being returned.
 */
export const listOrganizationSafetyCases = async (input: {
  principal: ReportingPrincipal
  organizationId: string
}): Promise<{ list: OrganizationSafetyCaseSummary[]; truncated: boolean }> => {
  const context = await resolveOrganizationAccessContext(input)
  if (
    !context?.membershipId
    || context.explicitDenies.some((deny) => ['*', 'SAFETY_READ', 'REPORT_READ'].includes(deny))
  ) return hidden()

  const canSeeOrganizationSummary = context.organizationStatus === 'ACTIVE' && context.orgRole === 'ORG_ADMIN'
  const candidateRows = await prisma.$queryRaw<CandidateRow[]>`
    SELECT
      c."id" AS "caseId",
      c."status"::text AS "status",
      c."created_at" AS "createdAt",
      c."acknowledged_at" AS "acknowledgedAt",
      c."disposed_at" AS "disposedAt",
      c."ack_due_at" AS "ackDueAt",
      c."dispose_due_at" AS "disposeDueAt"
    FROM "safety_cases" c
    JOIN "assessment_unit_snapshots" snapshot
      ON snapshot."id" = c."trigger_source_record_id"
      AND snapshot."payload_kind" = 'UNIT_RESULT'
      AND snapshot."terminal_state" = 'COMPLETED'
      AND snapshot."canonical_result_encrypted" IS NOT NULL
      AND snapshot."composite_attempt_id" IS NOT NULL
    JOIN "composite_assessment_attempts" attempt
      ON attempt."id" = snapshot."composite_attempt_id"
      AND attempt."status" = 'COMPLETED'
      AND attempt."attempt_epoch" = snapshot."attempt_epoch"
      AND attempt."subject_user_id" = c."subject_user_id"
    JOIN "assessment_run_executions" execution
      ON execution."organization_id" = ${input.organizationId}
      AND execution."runtime_binding_kind" = 'COMPOSITE'
      AND execution."runtime_binding_ref" = snapshot."composite_attempt_id"
      AND execution."status" = 'COMPLETED'
    JOIN "assessment_run_actor_snapshots" subject
      ON subject."organization_id" = execution."organization_id"
      AND subject."run_id" = execution."run_id"
      AND subject."id" = execution."subject_actor_snapshot_id"
      AND subject."user_id" = c."subject_user_id"
    WHERE c."trigger_source_kind" = 'CANONICAL_UNIT_RESULT'
      AND c."subject_user_id" <> ${input.principal.userId}
      AND (
        ${canSeeOrganizationSummary}
        OR c."primary_owner_user_id" = ${input.principal.userId}
        OR ${input.principal.userId} = ANY(c."backup_owner_user_ids")
      )
    GROUP BY c."id", c."status", c."created_at", c."acknowledged_at", c."disposed_at", c."ack_due_at", c."dispose_due_at"
    HAVING COUNT(DISTINCT execution."id") = 1
    ORDER BY c."created_at" DESC, c."id" DESC
    LIMIT ${LIMIT + 1}
  `

  const list: OrganizationSafetyCaseSummary[] = []
  for (const row of candidateRows.slice(0, LIMIT)) {
    try {
      const exact = await readOrganizationSafetyCase({
        principal: input.principal,
        organizationId: input.organizationId,
        caseId: row.caseId,
      })
      const base = {
        caseId: row.caseId,
        projection: exact.projection,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
        disposedAt: row.disposedAt?.toISOString() ?? null,
      }
      list.push(exact.projection === 'SUMMARY'
        ? base
        : {
            ...base,
            ackDueAt: row.ackDueAt.toISOString(),
            disposeDueAt: row.disposeDueAt.toISOString(),
          })
    } catch (error) {
      if (error instanceof ReportingError && error.code === 'REPORT_NOT_FOUND') continue
      throw error
    }
  }

  return { list, truncated: candidateRows.length > LIMIT }
}
