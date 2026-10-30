import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { reportingFail, type ReportingCohortSelectorInputV2 } from './types'

const ids = z.array(z.string().guid()).min(1).max(5000)
/** Product clients choose one dimension with OR; the generic selector stays internal. */
export const educationGroupSelectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ALL') }).strict(),
  z.object({ kind: z.literal('CLASSES'), ids }).strict(),
  z.object({ kind: z.literal('LABELS'), ids }).strict(),
])
export type EducationGroupSelection = z.infer<typeof educationGroupSelectionSchema>
export const reportingLeafSourceSchema = z.object({
  slotKey: z.string().min(1).max(240), unitType: z.enum(['SCALE', 'COGNITIVE', 'SITUATIONAL']),
  instrumentKey: z.string().min(1).max(240), instrumentVersion: z.string().min(1).max(160),
  compiledRuntimeHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

export async function educationGroupSelector(organizationId: string, product: 'SCHOOL' | 'TEACHER', selection: EducationGroupSelection): Promise<ReportingCohortSelectorInputV2 | undefined> {
  if (selection.kind === 'ALL') return undefined
  const selected = [...new Set(selection.ids)].sort()
  if (selection.kind === 'LABELS') {
    const rows = await prisma.$queryRaw<Array<{ dimensionId: string }>>`
      SELECT DISTINCT dimension_id AS "dimensionId" FROM organization_labels
      WHERE organization_id=${organizationId} AND id=ANY(${selected}::text[])
    `
    if (rows.length !== 1) reportingFail('REPORT_SELECTOR_INVALID', 'choose labels from one maintained people dimension', 400)
  }
  return { schemaVersion: 2, combine: 'ALL', clauses: selection.kind === 'LABELS'
    ? [{ kind: 'LABELS', labelIds: selected, match: 'ANY' }]
    : [{ kind: product === 'TEACHER' ? 'STAFF_CLASS_UNITS' : 'CLASS_UNITS', classUnitIds: selected }] }
}

/** Display labels are frozen with the artifact; later renaming does not alter a PDF's range. */
export async function educationGroupPresentation(input:{organizationId:string;runId:string;selection:EducationGroupSelection}){
  const selected=input.selection.kind==='ALL'?[]:input.selection.ids
  const rows=await prisma.$queryRaw<Array<{sourceLabel:string;groupNames:string|null}>>(Prisma.sql`
    SELECT run.name AS "sourceLabel",(SELECT string_agg(groups.name,'、' ORDER BY groups.name,groups.id)
      FROM (
        SELECT unit.id,unit.name FROM organization_units unit WHERE unit.organization_id=run.organization_id
          AND ${input.selection.kind==='CLASSES'} AND unit.id=ANY(${selected}::text[])
        UNION ALL
        SELECT label.id,label.name FROM organization_labels label WHERE label.organization_id=run.organization_id
          AND ${input.selection.kind==='LABELS'} AND label.id=ANY(${selected}::text[])
      ) groups) AS "groupNames"
    FROM assessment_runs run WHERE run.organization_id=${input.organizationId} AND run.id=${input.runId}
  `)
  const row=rows[0]??reportingFail('REPORT_NOT_FOUND','report source not found',404)
  return {sourceLabel:row.sourceLabel,populationLabel:input.selection.kind==='ALL'?'全部合格参与人群':`${input.selection.kind==='CLASSES'?'班级':'人员标签'}：${row.groupNames??''}（任一匹配）`}
}

/** Historical class/tag assignments at Run publication, restricted to its real
 * subjects. No participant details or counts. Unit parent links lack history,
 * so grade and gender are intentionally absent rather than inferred today. */
export async function listEducationGroupSelections(input: { organizationId: string; runId: string; trackId: string; product: 'SCHOOL' | 'TEACHER' }) {
  const assignments = input.product === 'TEACHER'
    ? Prisma.sql`organization_staff_class_assignments` : Prisma.sql`organization_student_class_assignments`
  const rows = await prisma.$queryRaw<Array<{ kind: string; id: string; name: string; dimensionId: string | null; dimensionName: string | null }>>(Prisma.sql`
    WITH subjects AS (
      SELECT DISTINCT actor.membership_id, run.published_at AS at
      FROM assessment_run_executions execution
      JOIN assessment_runs run ON run.organization_id=execution.organization_id AND run.id=execution.run_id
      JOIN assessment_run_actor_snapshots actor ON actor.organization_id=execution.organization_id
        AND actor.run_id=execution.run_id AND actor.id=execution.subject_actor_snapshot_id
      WHERE execution.organization_id=${input.organizationId} AND execution.run_id=${input.runId}
        AND execution.track_id=${input.trackId}
    )
    SELECT DISTINCT 'CLASSES' AS kind, unit.id, unit.name, NULL::text AS "dimensionId", NULL::text AS "dimensionName"
    FROM subjects JOIN ${assignments} placement ON placement.organization_id=${input.organizationId}
      AND placement.membership_id=subjects.membership_id AND placement.valid_from<=subjects.at
      AND (placement.valid_until IS NULL OR placement.valid_until>subjects.at)
    JOIN organization_units unit ON unit.organization_id=placement.organization_id AND unit.id=placement.class_unit_id
    UNION ALL
    SELECT DISTINCT 'LABELS', label.id, label.name, dimension.id, dimension.name
    FROM subjects JOIN organization_label_assignments placement ON placement.organization_id=${input.organizationId}
      AND placement.membership_id=subjects.membership_id AND placement.valid_from<=subjects.at
      AND (placement.valid_until IS NULL OR placement.valid_until>subjects.at)
    JOIN organization_labels label ON label.organization_id=placement.organization_id AND label.id=placement.label_id
    JOIN organization_classification_dimensions dimension ON dimension.organization_id=label.organization_id AND dimension.id=label.dimension_id
    ORDER BY kind, "dimensionId", name, id
    LIMIT 5001
  `)
  if (rows.length > 5000) reportingFail('REPORT_SOURCE_LIMIT', 'too many maintained grouping options', 413)
  return { options: rows, limitations: ['子群按任务发布时已有班级和人员标签选取，并随报告冻结。',
    '现有年级与班级父子关系没有历史版本，暂不据此生成历史年级子群；性别没有统一可靠来源。'] }
}
