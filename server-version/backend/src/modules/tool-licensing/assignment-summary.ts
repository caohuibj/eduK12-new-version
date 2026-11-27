import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { currentEntryEvidenceJoin } from '../admin-permissions/current-entry-evidence'
import { educationStandardAuthorityJoins } from '../assessment-authorization/education-standard-use-current'
import { EDUCATION_STANDARD_USE_ACTION } from '../assessment-authorization/education-standard-use'
import { contentScopeContains } from '../measurement-content/content-authority'
import { currentContentGrantFromRows, type GrantRow } from '../measurement-content/content-authority.repository'
import { standardAvailability } from '../measurement-content/eligible-standard'
import { LIBRARY_SCOPE } from '../scale-library-governance/contracts'
import type { ToolLicenseProduct } from './contracts'

export type AssignmentSummary = {
  state: 'RECORDED' | 'PENDING' | 'AUTHORITY_LOST' | 'VERSION_UNAVAILABLE'
  canAssignVersion: boolean
  reselectIfPinned: boolean
}

type ChainRow = Omit<GrantRow, 'valid_from' | 'expires_at' | 'revoked_at' | 'subject_expires_at'> & {
  valid_from:string;expires_at:string;revoked_at:string|null;subject_expires_at:string|null
}
type AssignmentRow = {
  key:string;available:boolean;useId:string|null;useCurrent:boolean;authorityCurrent:boolean
  delegated?: {id:string;issuerId:string;measurementId:string;chain:ChainRow[]} | null
  now:Date
}

const dbNow = Prisma.sql`statement_timestamp()`
const dbUtc = Prisma.sql`statement_timestamp() AT TIME ZONE 'UTC'`
const maxRows = 4096

function trainingAssignments(subjectId:string){
  return Prisma.sql`
    SELECT s.key,s.available,g.id AS "useId",(g.id IS NOT NULL AND g.revoked_at IS NULL) AS "useCurrent",
      (g.authority_grant_id IS NULL AND EXISTS(SELECT 1 FROM (SELECT 1) evidence
        ${currentEntryEvidenceJoin({issuerId:Prisma.sql`g.granted_by`,entryId:Prisma.sql`g.authority_entry_grant_id`,entryRevision:Prisma.sql`g.authority_entry_grant_version`,entry:'TRAINING'})}
        WHERE u.expires_at IS NULL OR u.expires_at>${dbNow})) AS "authorityCurrent",
      CASE WHEN issuer.id IS NOT NULL AND g.authority_entry_grant_id IS NULL AND g.authority_entry_grant_version IS NULL THEN (
        SELECT jsonb_build_object('id',leaf.id,'issuerId',g.granted_by,'measurementId',s.measurement_id,
          'chain',(SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object(
            'valid_from',a.valid_from AT TIME ZONE 'UTC','expires_at',a.expires_at AT TIME ZONE 'UTC',
            'revoked_at',a.revoked_at AT TIME ZONE 'UTC','subject_active',owner.is_active,
            'subject_frozen',owner.is_frozen,'subject_expires_at',owner.expires_at))
            FROM content_capability_grants a JOIN users owner ON owner.id=a.subject_id
            WHERE a.id=ANY(leaf.ancestry)))
        FROM content_capability_grants leaf WHERE leaf.id=g.authority_grant_id AND cardinality(leaf.ancestry) BETWEEN 1 AND 2
      ) END AS delegated,${dbNow} AS now
    FROM sources s LEFT JOIN material_grants g ON g.teacher_id=${subjectId} AND g.resource_type='STANDARD_COMBINATION'
      AND g.resource_id=s.source_id AND g.standard_combination_hash=s.fingerprint
    LEFT JOIN users issuer ON issuer.id=g.granted_by AND g.authority_grant_id IS NOT NULL
      AND g.revoked_at IS NULL AND s.available AND issuer.account_domain IN ('TRAINING','LEGACY') AND issuer.platform_role='STANDARD'
      AND issuer.is_active AND NOT issuer.is_frozen AND NOT issuer.must_change_password
      AND (issuer.expires_at IS NULL OR issuer.expires_at>${dbNow})`
}

function educationAssignments(product:'SCHOOL'|'TEACHER',subjectId:string,userId:string) {
  return Prisma.sql`
    SELECT s.key,s.available,g.id AS "useId",
      (g.id IS NOT NULL AND g.revoked_at IS NULL AND g.valid_from<=${dbUtc} AND g.expires_at>${dbUtc}) AS "useCurrent",
      (a.id IS NULL OR EXISTS(SELECT 1 FROM (SELECT g.issuer_id,s.measurement_id,
        a.metadata#>>'{selectedBinding,binding,authorization,authority,0,id}' AS entry_id,
        a.metadata#>>'{selectedBinding,binding,authorization,authority,0,revision}' AS entry_revision,
        a.metadata#>>'{selectedBinding,binding,authorization,authority,1,id}' AS root_id,
        a.metadata#>>'{selectedBinding,binding,authorization,authority,1,revision}' AS root_revision,
        s.exact_key AS exact_distribution_key,s.policy_key,s.fingerprint AS policy_hash) w
        ${educationStandardAuthorityJoins({product,organizationId:subjectId})}
        WHERE a.actor_id=g.issuer_id AND cardinality(g.resource_keys)=1
          AND a.metadata#>>'{selectedBinding,binding,authorization,id}'=g.id
          AND a.metadata#>>'{selectedBinding,binding,authorization,revision}'=g.version::text
          AND root.valid_from<=${dbUtc} AND root.expires_at>${dbUtc}
          AND (u.expires_at IS NULL OR u.expires_at>${dbNow}))) AS "authorityCurrent",${dbNow} AS now
    FROM sources s LEFT JOIN content_capability_grants g ON g.product=${product} AND g.scope_kind='ORGANIZATION'
      AND g.scope_id=${subjectId} AND g.subject_id=${userId} AND g.resource_kind='material'
      AND g.capabilities=ARRAY['material.use']::text[] AND g.parent_grant_id IS NULL AND g.ancestry=ARRAY[g.id]::text[]
      AND g.remaining_delegation_depth=0 AND g.delegable_capabilities=ARRAY[]::text[] AND g.resource_keys@>ARRAY[s.exact_key]::text[]
    LEFT JOIN assessment_management_events a ON a.id=g.id AND a.action=${EDUCATION_STANDARD_USE_ACTION}`
}

function surveyAssignments(userId:string) {
  return Prisma.sql`
    SELECT s.key,s.available,g.id AS "useId",(g.id IS NOT NULL AND g.status='ACTIVE') AS "useCurrent",
      (NULLIF(g.snapshot#>'{provenance,selectedBinding}','null'::jsonb) IS NULL OR EXISTS(
        SELECT 1 FROM (SELECT 1) evidence
        ${currentEntryEvidenceJoin({issuerId:Prisma.sql`g.created_by`,entryId:Prisma.sql`g.snapshot#>>'{provenance,selectedBinding,binding,authorization,authority,0,id}'`,
          entryRevision:Prisma.sql`(g.snapshot#>>'{provenance,selectedBinding,binding,authorization,authority,0,revision}')`,entry:'SURVEY'})}
        WHERE (u.expires_at IS NULL OR u.expires_at>${dbNow}))) AS "authorityCurrent",${dbNow} AS now
    FROM sources s LEFT JOIN survey_tool_grants g ON g.user_id=${userId}
      AND g.snapshot#>>'{ref,sourceId}'=s.exact_key AND g.snapshot#>>'{ref,sourceVersion}'=s.fingerprint`
}

function authorityCurrent(row:AssignmentRow) {
  if (row.authorityCurrent) return true
  if (!row.delegated?.chain) return false
  const {id,issuerId,measurementId,chain} = row.delegated
  try {
    const grant = currentContentGrantFromRows(chain.map(value=>({
      ...value,valid_from:new Date(value.valid_from),expires_at:new Date(value.expires_at),
      revoked_at:value.revoked_at?new Date(value.revoked_at):null,
      subject_expires_at:value.subject_expires_at?new Date(value.subject_expires_at):null,
    })),id,row.now)
    return grant.subjectId===issuerId && grant.capabilities.includes('material.distribute') && contentScopeContains(grant.scope,{
      product:'TRAINING',scopeKind:'PLATFORM',scopeId:LIBRARY_SCOPE,resourceKind:'material',resourceKeys:[measurementId],
    })
  } catch {
    return false
  }
}

/** Advisory, bounded metadata for the current publisher and licensed tools.
 * Stale binding hints do not identify drafts or confer authority. */
export async function ownAssignmentSummary(product:ToolLicenseProduct,subjectId:string,
  userId:string,keys:readonly string[]):Promise<Map<string,AssignmentSummary>> {
  const scales=keys.filter(key=>key.startsWith('SCALE:')).map(key=>key.slice('SCALE:'.length))
  const forms=product==='TRAINING'?[]:keys.filter(key=>key.startsWith('FORM:'))
  if (!scales.length&&!forms.length) return new Map()
  const education=product==='SCHOOL'||product==='TEACHER'
  const sources:Prisma.Sql[]=[]
  if (scales.length) {
    const {joins,available}=standardAvailability(product)
    const exactKey=education
      ? Prisma.sql`'education-source:STANDARD_SCALE:'||s.id||':'||s.combination_hash`
      : Prisma.sql`'survey-standard:'||s.id`
    sources.push(Prisma.sql`SELECT 'SCALE:'||s.tool_key AS key,${exactKey} AS exact_key,s.combination_hash AS fingerprint,
      'standard-release:'||s.id AS policy_key,s.id AS source_id,m.id AS measurement_id,COALESCE(${available},false) AS available
      FROM survey_standard_releases s ${joins} WHERE s.tool_key=ANY(${scales}::text[])`)
  }
  if (forms.length) {
    const stableKey=Prisma.sql`CASE WHEN t.tool_key LIKE 'FORM:%' THEN t.tool_key ELSE 'FORM:'||t.tool_key END`
    const exactKey=education
      ? Prisma.sql`'education-source:FORM:'||t.id||':'||t.snapshot_hash`
      : Prisma.sql`'survey-tool:'||t.id`
    sources.push(Prisma.sql`SELECT ${stableKey} AS key,${exactKey} AS exact_key,t.snapshot_hash AS fingerprint,
      'governed-release:'||t.id AS policy_key,t.id AS source_id,NULL::text AS measurement_id,
      COALESCE(t.state='ONLINE' AND p.decision='APPROVED' AND NOT p.paused,false) AS available
      FROM survey_governed_tools t LEFT JOIN survey_tool_policies p ON p.product=${product}
        AND p.resource_key='governed-release:'||t.id AND p.fingerprint=t.snapshot_hash
      WHERE t.family='FORM' AND ${stableKey}=ANY(${forms}::text[])`)
  }
  const assignment=education ? educationAssignments(product,subjectId,userId)
    : product==='TRAINING' ? trainingAssignments(subjectId) : surveyAssignments(userId)
  const rows=await prisma.$queryRaw<AssignmentRow[]>(Prisma.sql`
    WITH sources AS (${Prisma.join(sources,' UNION ALL ')})
    ${assignment} LIMIT ${maxRows+1}`)
  if (rows.length>maxRows) return new Map()

  const states=new Map<string,{available:boolean;current:boolean;authorityLost:boolean;stale:boolean}>()
  for (const row of rows) {
    const state=states.get(row.key)??{available:false,current:false,authorityLost:false,stale:false}
    state.available ||= row.available
    if (row.useId) {
      const usable=row.available&&row.useCurrent&&authorityCurrent(row)
      state.current ||= usable
      state.stale ||= !usable
      state.authorityLost ||= row.available&&row.useCurrent&&!usable
    }
    states.set(row.key,state)
  }
  return new Map([...states].map(([key,state])=>[key,{
    state:state.current?'RECORDED':state.authorityLost?'AUTHORITY_LOST':state.available?'PENDING':'VERSION_UNAVAILABLE',
    canAssignVersion:state.available&&key.startsWith('SCALE:'),
    reselectIfPinned:state.stale,
  }]))
}
