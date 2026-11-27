import { Prisma } from '@prisma/client'
import { eligibleStandards } from '../measurement-content/eligible-standard'
import { prisma } from '../../config/database'
import type { ToolLicenseProduct } from './contracts'

export type AssignmentSummary = 'RECORDED' | 'PENDING' | 'CHECK_IN_CATALOG'

/** Scoped display hints for existing exact version assignments. The real
 * authoring and formal publisher still check source and publisher authority. */
export async function ownAssignmentSummary(product: ToolLicenseProduct, subjectId: string,
  userId: string, keys: readonly string[]): Promise<Map<string, AssignmentSummary>> {
  const scales = keys.filter(key=>key.startsWith('SCALE:'))
  const forms = product==='TRAINING' ? [] : keys.filter(key=>key.startsWith('FORM:'))
  if (!scales.length&&!forms.length) return new Map()
  if (product === 'TRAINING') {
    const rows = await prisma.$queryRaw<Array<{key:string;recorded:boolean}>>(Prisma.sql`
      SELECT 'SCALE:'||s.tool_key AS key,bool_or(EXISTS (SELECT 1 FROM material_grants g WHERE
        g.teacher_id=${subjectId} AND g.resource_type='STANDARD_COMBINATION' AND g.resource_id=s.id
        AND g.standard_combination_hash=s.combination_hash AND g.revoked_at IS NULL)) AS recorded
      ${eligibleStandards(product)} AND 'SCALE:'||s.tool_key=ANY(${scales}::text[]) GROUP BY s.tool_key`)
    return new Map(rows.map(row=>[row.key,row.recorded?'RECORDED':'PENDING']))
  }
  const education = product === 'SCHOOL' || product === 'TEACHER'
  const candidateFormKeys = Prisma.sql`CASE WHEN t.tool_key LIKE 'FORM:%' THEN t.tool_key ELSE 'FORM:'||t.tool_key END`
  const sources: Prisma.Sql[] = []
  if (scales.length) {
    const scaleKey = education
      ? Prisma.sql`'education-source:STANDARD_SCALE:'||s.id||':'||s.combination_hash`
      : Prisma.sql`'survey-standard:'||s.id`
    sources.push(Prisma.sql`SELECT 'SCALE:'||s.tool_key AS key,${scaleKey} AS exact_key,s.combination_hash AS fingerprint
      ${eligibleStandards(product)} AND 'SCALE:'||s.tool_key=ANY(${scales}::text[])`)
  }
  if (forms.length) {
    const formKey = education
      ? Prisma.sql`'education-source:FORM:'||t.id||':'||t.snapshot_hash`
      : Prisma.sql`'survey-tool:'||t.id`
    sources.push(Prisma.sql`SELECT ${candidateFormKeys} AS key,${formKey} AS exact_key,t.snapshot_hash AS fingerprint
      FROM survey_governed_tools t JOIN survey_tool_policies p ON p.product=${product} AND p.resource_key='governed-release:'||t.id
        AND p.fingerprint=t.snapshot_hash AND p.decision='APPROVED' AND NOT p.paused
      WHERE t.state='ONLINE' AND t.family='FORM' AND ${candidateFormKeys}=ANY(${forms}::text[])`)
  }
  const recorded = education ? Prisma.sql`EXISTS (
      SELECT 1 FROM content_capability_grants g WHERE g.product=${product} AND g.scope_kind='ORGANIZATION'
        AND g.scope_id=${subjectId} AND g.subject_id=${userId} AND g.resource_kind='material'
        AND g.capabilities=ARRAY['material.use']::text[] AND g.revoked_at IS NULL
        AND g.valid_from<=statement_timestamp() AT TIME ZONE 'UTC'
        AND g.expires_at>statement_timestamp() AT TIME ZONE 'UTC' AND c.exact_key=ANY(g.resource_keys)
    )` : Prisma.sql`EXISTS (
      SELECT 1 FROM survey_tool_grants g WHERE g.user_id=${userId} AND g.status='ACTIVE'
        AND g.snapshot#>>'{ref,sourceId}'=c.exact_key AND g.snapshot#>>'{ref,sourceVersion}'=c.fingerprint
    )`
  const matched = await prisma.$queryRaw<Array<{key:string;recorded:boolean}>>(Prisma.sql`
    WITH candidates AS (${Prisma.join(sources,' UNION ALL ')})
    SELECT c.key,bool_or(${recorded}) AS recorded FROM candidates c
    GROUP BY c.key
  `)
  return new Map(matched.map(row=>[row.key,row.recorded?'RECORDED':'PENDING']))
}
