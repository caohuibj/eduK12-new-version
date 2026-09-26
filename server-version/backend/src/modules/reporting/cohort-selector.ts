import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { reportingFail, type ReportingCohortSelectorInputV2, type ReportingCohortMemberV1 } from './types'

const ids = z.array(z.string().uuid()).min(1).max(5000)
export const cohortSelectorSchema = z.object({
  schemaVersion: z.literal(2),
  clauses: z.array(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('CLASS_UNITS'), classUnitIds: ids }).strict(),
    z.object({ kind: z.literal('LABELS'), labelIds: ids, match: z.enum(['ANY', 'ALL']) }).strict(),
    z.object({ kind: z.literal('MEMBERSHIP_IDS'), membershipIds: ids }).strict(),
  ])).max(30),
  combine: z.literal('ALL'),
}).strict()

export function normalizeCohortSelector(value: unknown): ReportingCohortSelectorInputV2 {
  const parsed = cohortSelectorSchema.safeParse(value)
  if (!parsed.success) return reportingFail('REPORT_SELECTOR_INVALID', 'invalid non-outcome cohort selector', 400)
  const unique = (values: string[]) => [...new Set(values)].sort()
  const clauses = parsed.data.clauses.map(c => c.kind === 'LABELS'
    ? { ...c, labelIds: unique(c.labelIds) }
    : c.kind === 'CLASS_UNITS' ? { ...c, classUnitIds: unique(c.classUnitIds) }
      : { ...c, membershipIds: unique(c.membershipIds) })
  return { schemaVersion: 2, combine: 'ALL', clauses: [...new Map(clauses.map(c => [canonicalHash(c), c])).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([,c]) => c) }
}

/** A bounded number of set queries, independent of population size. */
export async function selectHistoricalMembers(input: {
  organizationId: string; at: Date; selector: ReportingCohortSelectorInputV2; members: ReportingCohortMemberV1[]
}): Promise<ReportingCohortMemberV1[]> {
  const labelIds = [...new Set(input.selector.clauses.flatMap(c => c.kind === 'LABELS' ? c.labelIds : []))]
  const classIds = [...new Set(input.selector.clauses.flatMap(c => c.kind === 'CLASS_UNITS' ? c.classUnitIds : []))]
  const memberIds = [...new Set(input.selector.clauses.flatMap(c => c.kind === 'MEMBERSHIP_IDS' ? c.membershipIds : []))]
  const references = await prisma.$queryRaw<Array<{ kind: string; id: string }>>(Prisma.sql`
    SELECT 'LABEL' AS kind, id FROM organization_labels WHERE organization_id=${input.organizationId} AND id = ANY(${labelIds}::text[])
    UNION ALL SELECT 'CLASS', id FROM organization_units WHERE organization_id=${input.organizationId} AND unit_kind='CLASS' AND id = ANY(${classIds}::text[])
    UNION ALL SELECT 'MEMBER', id FROM organization_memberships WHERE organization_id=${input.organizationId} AND id = ANY(${memberIds}::text[])
  `)
  if (references.length !== labelIds.length + classIds.length + memberIds.length) reportingFail('REPORT_SELECTOR_INVALID', 'cohort selection contains unavailable references', 404)
  const assignments = await prisma.$queryRaw<Array<{ kind: string; membershipId: string; id: string }>>(Prisma.sql`
    SELECT 'LABEL' AS kind, membership_id AS "membershipId", label_id AS id FROM organization_label_assignments
    WHERE organization_id=${input.organizationId} AND label_id = ANY(${labelIds}::text[])
      AND valid_from <= ${input.at} AND (valid_until IS NULL OR valid_until > ${input.at})
    UNION ALL
    SELECT 'CLASS', membership_id, class_unit_id FROM organization_student_class_assignments
    WHERE organization_id=${input.organizationId} AND class_unit_id = ANY(${classIds}::text[])
      AND valid_from <= ${input.at} AND (valid_until IS NULL OR valid_until > ${input.at})
  `)
  const keys = new Set(assignments.map(a => `${a.kind}:${a.membershipId}:${a.id}`))
  return input.members.filter(m => input.selector.clauses.every(c => {
    if (c.kind === 'MEMBERSHIP_IDS') return c.membershipIds.includes(m.membershipId)
    if (c.kind === 'CLASS_UNITS') return c.classUnitIds.some(id => keys.has(`CLASS:${m.membershipId}:${id}`))
    const matches = c.labelIds.map(id => keys.has(`LABEL:${m.membershipId}:${id}`))
    return c.match === 'ALL' ? matches.every(Boolean) : matches.some(Boolean)
  }))
}
