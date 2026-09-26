import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { reportingFail, type ReportingCohortSelectorInputV2 } from './types'

export const MAX_COHORT_SELECTOR_REFERENCES = 5000
const ids = z.array(z.string().uuid()).min(1).max(MAX_COHORT_SELECTOR_REFERENCES)

export const cohortSelectorSchema = z.object({
  schemaVersion: z.literal(2),
  clauses: z.array(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('CLASS_UNITS'), classUnitIds: ids }).strict(),
    z.object({ kind: z.literal('LABELS'), labelIds: ids, match: z.enum(['ANY', 'ALL']) }).strict(),
    z.object({ kind: z.literal('MEMBERSHIP_IDS'), membershipIds: ids }).strict(),
  ])).max(30),
  combine: z.literal('ALL'),
}).strict().superRefine((value, ctx) => {
  const references = value.clauses.reduce((total, clause) => total + (
    clause.kind === 'LABELS' ? clause.labelIds.length
      : clause.kind === 'CLASS_UNITS' ? clause.classUnitIds.length
        : clause.membershipIds.length
  ), 0)
  if (references > MAX_COHORT_SELECTOR_REFERENCES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['clauses'],
      message: `cohort selector may reference at most ${MAX_COHORT_SELECTOR_REFERENCES} ids in total`,
    })
  }
})

export function normalizeCohortSelector(value: unknown): ReportingCohortSelectorInputV2 {
  const parsed = cohortSelectorSchema.safeParse(value)
  if (!parsed.success) return reportingFail('REPORT_SELECTOR_INVALID', 'invalid non-outcome cohort selector', 400)
  const unique = (values: string[]) => [...new Set(values)].sort()
  const clauses = parsed.data.clauses.map(c => c.kind === 'LABELS'
    ? { ...c, labelIds: unique(c.labelIds) }
    : c.kind === 'CLASS_UNITS' ? { ...c, classUnitIds: unique(c.classUnitIds) }
      : { ...c, membershipIds: unique(c.membershipIds) })
  return {
    schemaVersion: 2,
    combine: 'ALL',
    clauses: [...new Map(clauses.map(c => [canonicalHash(c), c])).entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, c]) => c),
  }
}

const selectorReferences = (selector: ReportingCohortSelectorInputV2) => ({
  labelIds: [...new Set(selector.clauses.flatMap(c => c.kind === 'LABELS' ? c.labelIds : []))],
  classIds: [...new Set(selector.clauses.flatMap(c => c.kind === 'CLASS_UNITS' ? c.classUnitIds : []))],
  memberIds: [...new Set(selector.clauses.flatMap(c => c.kind === 'MEMBERSHIP_IDS' ? c.membershipIds : []))],
})

export async function validateCohortSelectorReferences(input: {
  organizationId: string
  selector: ReportingCohortSelectorInputV2
}): Promise<void> {
  const { labelIds, classIds, memberIds } = selectorReferences(input.selector)
  const references = await prisma.$queryRaw<Array<{ kind: string; id: string }>>(Prisma.sql`
    SELECT 'LABEL' AS kind, id FROM organization_labels
      WHERE organization_id=${input.organizationId} AND id = ANY(${labelIds}::text[])
    UNION ALL
    SELECT 'CLASS', id FROM organization_units
      WHERE organization_id=${input.organizationId} AND unit_kind='CLASS' AND id = ANY(${classIds}::text[])
    UNION ALL
    SELECT 'MEMBER', id FROM organization_memberships
      WHERE organization_id=${input.organizationId} AND id = ANY(${memberIds}::text[])
  `)
  if (references.length !== labelIds.length + classIds.length + memberIds.length) {
    reportingFail('REPORT_SELECTOR_INVALID', 'cohort selection contains unavailable references', 404)
  }
}

export async function historicalCohortMembershipPredicate(input: {
  organizationId: string
  at: Date
  selector: ReportingCohortSelectorInputV2
  membershipIdSql: Prisma.Sql
}): Promise<Prisma.Sql> {
  await validateCohortSelectorReferences(input)
  const predicates = input.selector.clauses.map((clause) => {
    if (clause.kind === 'MEMBERSHIP_IDS') {
      return Prisma.sql`${input.membershipIdSql} = ANY(${clause.membershipIds}::text[])`
    }
    if (clause.kind === 'CLASS_UNITS') {
      return Prisma.sql`EXISTS (
        SELECT 1
        FROM organization_student_class_assignments class_assignment
        WHERE class_assignment.organization_id=${input.organizationId}
          AND class_assignment.membership_id=${input.membershipIdSql}
          AND class_assignment.class_unit_id = ANY(${clause.classUnitIds}::text[])
          AND class_assignment.valid_from <= ${input.at}
          AND (class_assignment.valid_until IS NULL OR class_assignment.valid_until > ${input.at})
      )`
    }
    if (clause.match === 'ANY') {
      return Prisma.sql`EXISTS (
        SELECT 1
        FROM organization_label_assignments label_assignment
        WHERE label_assignment.organization_id=${input.organizationId}
          AND label_assignment.membership_id=${input.membershipIdSql}
          AND label_assignment.label_id = ANY(${clause.labelIds}::text[])
          AND label_assignment.valid_from <= ${input.at}
          AND (label_assignment.valid_until IS NULL OR label_assignment.valid_until > ${input.at})
      )`
    }
    return Prisma.sql`(
      SELECT COUNT(DISTINCT label_assignment.label_id)::int
      FROM organization_label_assignments label_assignment
      WHERE label_assignment.organization_id=${input.organizationId}
        AND label_assignment.membership_id=${input.membershipIdSql}
        AND label_assignment.label_id = ANY(${clause.labelIds}::text[])
        AND label_assignment.valid_from <= ${input.at}
        AND (label_assignment.valid_until IS NULL OR label_assignment.valid_until > ${input.at})
    ) = ${clause.labelIds.length}`
  })
  return predicates.length ? Prisma.sql`(${Prisma.join(predicates, ' AND ')})` : Prisma.sql`TRUE`
}
