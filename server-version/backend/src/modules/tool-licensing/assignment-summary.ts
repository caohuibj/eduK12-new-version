import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { ToolLicenseProduct } from './contracts'

export type AssignmentSummary = 'RECORDED' | 'PENDING' | 'CHECK_IN_CATALOG'

/** Scoped display hints for existing exact version assignments. The real
 * authoring and formal publisher still check source and publisher authority. */
export async function ownAssignmentSummary(product: ToolLicenseProduct, subjectId: string,
  userId: string, keys: readonly string[]): Promise<Map<string, AssignmentSummary>> {
  if (!keys.length || product === 'TRAINING') return new Map()
  const education = product === 'SCHOOL' || product === 'TEACHER'
  const candidateFormKeys = Prisma.sql`CASE WHEN t.tool_key LIKE 'FORM:%' THEN t.tool_key ELSE 'FORM:'||t.tool_key END`
  const selection = education ? Prisma.sql`
    SELECT 'SCALE:'||s.tool_key AS key,'education-source:STANDARD_SCALE:'||s.id||':'||s.combination_hash AS exact_key,
      'standard-release:'||s.id AS policy_key,s.combination_hash AS fingerprint
    FROM survey_standard_releases s WHERE s.state='ONLINE' AND 'SCALE:'||s.tool_key=ANY(${keys}::text[])
    UNION ALL
    SELECT ${candidateFormKeys},'education-source:FORM:'||t.id||':'||t.snapshot_hash,'governed-release:'||t.id,t.snapshot_hash
    FROM survey_governed_tools t WHERE t.state='ONLINE' AND t.family='FORM' AND ${candidateFormKeys}=ANY(${keys}::text[])
  ` : Prisma.sql`
    SELECT 'SCALE:'||s.tool_key AS key,'survey-standard:'||s.id AS exact_key,
      'standard-release:'||s.id AS policy_key,s.combination_hash AS fingerprint
    FROM survey_standard_releases s WHERE s.state='ONLINE' AND 'SCALE:'||s.tool_key=ANY(${keys}::text[])
    UNION ALL
    SELECT ${candidateFormKeys},'survey-tool:'||t.id,'governed-release:'||t.id,t.snapshot_hash
    FROM survey_governed_tools t WHERE t.state='ONLINE' AND t.family='FORM' AND ${candidateFormKeys}=ANY(${keys}::text[])
  `
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
    WITH candidates AS (${selection})
    SELECT c.key,bool_or(${recorded}) AS recorded FROM candidates c JOIN survey_tool_policies p ON p.product=${product}
      AND p.resource_key=c.policy_key AND p.fingerprint=c.fingerprint AND p.decision='APPROVED' AND NOT p.paused
    GROUP BY c.key
  `)
  return new Map(matched.map(row=>[row.key,row.recorded?'RECORDED':'PENDING']))
}
