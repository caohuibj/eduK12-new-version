import { Prisma } from '@prisma/client'
import { canonicalHash } from '../assessment-runtime/canonical'
import { adminRequiresTotp } from './proof'
import type { AdminEntry } from './service'

export const SURVEY_WAVE_HANDOFF_ACTION='SURVEY_ENTRY_WAVE_HANDOFF'
export type EntryOffboarding={mode:'PLANNED';digest:string;successorId?:string}|{mode:'EMERGENCY';digest?:string}

type EntryBasis={id:string;userId:string;entry:AdminEntry;version:number}
type Successor={id:string;username:string;entryId:string;version:number}
type Item={id:string;category:'COLLECTING'|'DRAFT'|'CONFIGURATION';title:string;ready:boolean}
type Handoff={waveId:string;publicationId:string;useId:string;issuerId:string;replacementId:string}
type Impact={
 counts:{collecting:number;drafts:number;configurations:number;pending:number}
 items:Item[]
 handoffs:Handoff[]
 fingerprint:string
}

function successorsSql(basis:EntryBasis) {
  return Prisma.sql`
    SELECT u.id,u.username,g.id AS "entryId",g.version
    FROM users u JOIN admin_entry_grants g ON g.user_id=u.id AND g.entry=${basis.entry} AND g.revoked_at IS NULL
    WHERE u.id<>${basis.userId} AND u.platform_role='STANDARD' AND u.account_domain IN ('TRAINING','LEGACY')
      AND u.is_active AND NOT u.is_frozen AND NOT u.must_change_password
      AND (u.role<>'TEACHER' OR u.teacher_approved)
      AND (u.expires_at IS NULL OR u.expires_at>clock_timestamp())
      AND (EXISTS (SELECT 1 FROM admin_totp_credentials t WHERE t.user_id=u.id)
        OR (${!adminRequiresTotp()} AND EXISTS (SELECT 1 FROM admin_security_keys k WHERE k.user_id=u.id)))`
}

function surveyImpact(basis:EntryBasis,successor:Successor|undefined,lock:boolean) {
  return Prisma.sql`
    handoff_audits AS MATERIALIZED (
      SELECT id,CASE WHEN action=${SURVEY_WAVE_HANDOFF_ACTION} THEN reason::jsonb END AS link FROM admin_authorization_audits
      WHERE action=${SURVEY_WAVE_HANDOFF_ACTION} AND entry='SURVEY'
    ), current_handoffs AS MATERIALIZED (
      SELECT split_part(id,':',2) AS wave_id,link FROM handoff_audits
      WHERE link->>'successorEntryId'=${basis.id} AND link->>'successorVersion'=${String(basis.version)}
    ), original AS MATERIALIZED (
      SELECT g.id,g.user_id,g.snapshot,g.created_by,
        g.snapshot#>>'{provenance,selectedBinding,binding,authorization,authority,0,id}' AS entry_id,
        g.snapshot#>>'{provenance,selectedBinding,binding,authorization,authority,0,revision}' AS entry_version
      FROM survey_tool_grants g
      WHERE g.status='ACTIVE' AND (
        (g.created_by=${basis.userId}
         AND g.snapshot#>>'{provenance,selectedBinding,binding,authorization,authority,0,id}'=${basis.id}
         AND g.snapshot#>>'{provenance,selectedBinding,binding,authorization,authority,0,revision}'=${String(basis.version)})
        OR g.id IN (SELECT link->>'useId' FROM current_handoffs)
      )
    ), replacement AS MATERIALIZED (
      SELECT previous.id,m.id AS replacement_id
      FROM original previous
      JOIN LATERAL (
        SELECT candidate.id FROM survey_tool_grants candidate
        WHERE candidate.user_id=previous.user_id AND candidate.status='ACTIVE' AND candidate.created_by=${successor?.id??null}
          AND candidate.snapshot->'ref'=previous.snapshot->'ref'
          AND candidate.snapshot#>'{provenance,selectedBinding,binding,configuration}'=previous.snapshot#>'{provenance,selectedBinding,binding,configuration}'
          AND candidate.snapshot#>>'{provenance,selectedBinding,binding,authorization,authority,0,id}'=${successor?.entryId??null}
          AND candidate.snapshot#>>'{provenance,selectedBinding,binding,authorization,authority,0,revision}'=${String(successor?.version??0)}
        ORDER BY candidate.id LIMIT 1 ${lock?Prisma.sql`FOR SHARE NOWAIT`:Prisma.empty}
      ) m ON true
    ), affected_waves AS MATERIALIZED (
      SELECT DISTINCT w.id AS wave_id,w.publication_id,w.title,w.revision,w.status AS wave_status,
        old.id AS use_id,old.created_by AS issuer_id,r.replacement_id
      FROM survey_waves w JOIN survey_projects p ON p.id=w.project_id AND (p.status IN ('ACTIVE','PAUSED') OR (p.status='DRAFT' AND w.status='DRAFT'))
      JOIN survey_publications pub ON pub.id=w.publication_id AND pub.project_id=p.id
      CROSS JOIN LATERAL jsonb_array_elements(pub.compiled_snapshot->'units') AS unit(value)
      JOIN original old ON old.id=unit.value#>>'{sourceProvenance,sourceGrantId}' AND old.user_id=p.owner_user_id
       AND old.snapshot#>'{provenance,selectedBinding}'=unit.value#>'{sourceProvenance,selectedBinding}'
      LEFT JOIN replacement r ON r.id=old.id
      WHERE w.status IN ('OPEN','PAUSED','DRAFT') AND w.hard_stop_at IS NULL
        AND (w.closes_at IS NULL OR w.closes_at>statement_timestamp())
        AND ((old.entry_id=${basis.id} AND old.entry_version=${String(basis.version)})
         OR EXISTS (SELECT 1 FROM current_handoffs h WHERE h.wave_id=w.id AND h.link->>'useId'=old.id
                    AND h.link->>'publicationId'=w.publication_id))
    ), handoff_records AS (
      SELECT wave_id AS "waveId",publication_id AS "publicationId",use_id AS "useId",issuer_id AS "issuerId",replacement_id AS "replacementId"
      FROM affected_waves WHERE wave_status IN ('OPEN','PAUSED') AND replacement_id IS NOT NULL
    ), records AS (
      SELECT wave_id AS id, CASE WHEN wave_status='DRAFT' THEN 'DRAFT' ELSE 'COLLECTING' END AS category,
        title,bool_and(wave_status<>'DRAFT' AND replacement_id IS NOT NULL) AS ready,
        revision::text||':'||publication_id||':'||string_agg(use_id||':'||COALESCE(replacement_id,''),',' ORDER BY use_id) AS stamp
      FROM affected_waves GROUP BY wave_id,wave_status,title,revision,publication_id
      UNION ALL
      SELECT d.id,'DRAFT',d.title,false,d.revision::text
      FROM survey_instrument_drafts d JOIN survey_projects p ON p.id=d.project_id AND p.status IN ('DRAFT','ACTIVE','PAUSED')
      JOIN original old ON old.id=d.catalog_grant_id AND old.user_id=p.owner_user_id
      WHERE d.status IN ('DRAFT','PUBLISHED') AND old.entry_id=${basis.id} AND old.entry_version=${String(basis.version)}
        AND (d.status='DRAFT' OR EXISTS (
          SELECT 1 FROM survey_waves draft WHERE draft.project_id=d.project_id AND draft.status='DRAFT'
            AND draft.publication_id IS NULL AND draft.instrument_ids ? d.id))
      UNION ALL
      SELECT old.id,'CONFIGURATION',COALESCE(old.snapshot#>>'{provenance,configurationName}',old.snapshot->>'title',old.id),
        r.replacement_id IS NOT NULL,COALESCE(r.replacement_id,'')
      FROM original old LEFT JOIN replacement r ON r.id=old.id
      WHERE old.entry_id=${basis.id} AND old.entry_version=${String(basis.version)}
    )`
}

function educationImpact(basis:EntryBasis,successor:Successor|undefined,lock:boolean) {
  const product=basis.entry==='HUISCHOOL'?'SCHOOL':'TEACHER'
  return Prisma.sql`
    issued AS MATERIALIZED (
      SELECT g.id,g.revoked_at,g.expires_at,g.scope_id,g.subject_id,g.version
      FROM content_capability_grants g JOIN assessment_management_events evidence ON evidence.id=g.id AND evidence.actor_id=g.issuer_id
       AND evidence.action='EDUCATION_STANDARD_CONFIGURATION_USE_GRANTED'
      WHERE g.product=${product} AND g.issuer_id=${basis.userId}
        AND evidence.metadata#>>'{selectedBinding,binding,authorization,authority,0,id}'=${basis.id}
        AND evidence.metadata#>>'{selectedBinding,binding,authorization,authority,0,revision}'=${String(basis.version)}
    ), affected_versions AS MATERIALIZED (
      SELECT v.id,v.organization_id
      FROM education_private_tool_versions v WHERE v.entry=${product} AND v.kind='COMPOSITION'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(v.definition->'blocks') AS block(value)
         JOIN issued g ON g.id=block.value#>>'{source,selectedBinding,authorizationId}'
          AND g.scope_id=v.organization_id AND g.subject_id=v.owner_user_id)
    ), records AS (
      SELECT g.id,'CONFIGURATION' AS category,
        COALESCE(a.metadata->>'configurationName',r.snapshot->>'title',g.resource_keys[1]) AS title,
        replacement.id IS NOT NULL AS ready,g.version::text||':'||COALESCE(replacement.id,'') AS stamp
      FROM content_capability_grants g JOIN assessment_management_events a ON a.id=g.id AND a.actor_id=g.issuer_id
       AND a.action='EDUCATION_STANDARD_CONFIGURATION_USE_GRANTED'
      LEFT JOIN survey_standard_releases r ON r.id=a.resource_id
      LEFT JOIN LATERAL (
        SELECT n.id FROM content_capability_grants n JOIN assessment_management_events evidence ON evidence.id=n.id
        JOIN content_capability_grants root ON root.id=evidence.metadata#>>'{selectedBinding,binding,authorization,authority,1,id}'
        WHERE n.issuer_id=${successor?.id??null} AND evidence.actor_id=n.issuer_id AND evidence.action=a.action
          AND n.product=g.product AND n.scope_kind=g.scope_kind AND n.scope_id=g.scope_id AND n.subject_id=g.subject_id
          AND n.resource_keys=g.resource_keys AND n.resource_kind=g.resource_kind AND n.capabilities=g.capabilities
          AND n.revoked_at IS NULL AND n.expires_at>=g.expires_at
          AND n.valid_from<=GREATEST(g.valid_from,statement_timestamp() AT TIME ZONE 'UTC')
          AND evidence.metadata#>'{selectedBinding,binding,configuration}'=a.metadata#>'{selectedBinding,binding,configuration}'
          AND evidence.metadata#>>'{selectedBinding,binding,authorization,authority,0,id}'=${successor?.entryId??null}
          AND evidence.metadata#>>'{selectedBinding,binding,authorization,authority,0,revision}'=${String(successor?.version??0)}
          AND root.subject_id=n.issuer_id AND root.product=n.product AND root.scope_id=n.scope_id
          AND root.scope_kind='ORGANIZATION' AND root.resource_kind='material' AND root.capabilities=ARRAY['material.distribute']::text[]
          AND root.version::text=evidence.metadata#>>'{selectedBinding,binding,authorization,authority,1,revision}'
          AND root.revoked_at IS NULL AND root.valid_from<=statement_timestamp() AT TIME ZONE 'UTC' AND root.expires_at>=n.expires_at
        ORDER BY n.id LIMIT 1 ${lock?Prisma.sql`FOR SHARE OF n,root NOWAIT`:Prisma.empty}
      ) replacement ON true
      WHERE g.id IN (SELECT id FROM issued WHERE revoked_at IS NULL AND expires_at>statement_timestamp() AT TIME ZONE 'UTC')
      UNION ALL
      SELECT d.id,'DRAFT',d.title,false,d.revision::text
      FROM education_private_tools d WHERE d.entry=${product} AND d.kind='COMPOSITION'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(d.definition->'blocks') AS block(value)
          JOIN issued g ON g.id=block.value#>>'{source,selectedBinding,authorizationId}'
           AND g.scope_id=d.organization_id AND g.subject_id=d.owner_user_id)
      UNION ALL
      SELECT DISTINCT run.id,CASE WHEN run.status='DRAFT' THEN 'DRAFT' ELSE 'COLLECTING' END,run.name,false,run.version::text
      FROM assessment_runs run JOIN assessment_run_tracks track ON track.run_id=run.id
      JOIN affected_versions v ON v.organization_id=run.organization_id
       AND track.resource_key LIKE 'education-composition:'||${product}||':'||v.id||':%'
      WHERE run.status IN ('DRAFT','PUBLISHED') AND (run.intake_deadline IS NULL OR run.intake_deadline>statement_timestamp())
    )`
}

function trainingImpact(basis:EntryBasis) {
  return Prisma.sql`
    grants AS MATERIALIZED (
      SELECT g.id,g.version,COALESCE(s.snapshot->>'title',g.resource_id) AS title
      FROM material_grants g LEFT JOIN survey_standard_releases s ON s.id=g.resource_id
      WHERE g.authority_entry_grant_id=${basis.id} AND g.authority_entry_grant_version=${basis.version}
        AND g.granted_by=${basis.userId} AND g.resource_type='STANDARD_COMBINATION' AND g.revoked_at IS NULL
    ), cognitive AS MATERIALIZED (
      SELECT g.id,g.version,g.revoked_at,g.expires_at,
        COALESCE(a.metadata->>'configurationName',g.resource_keys[1]) AS title
      FROM content_capability_grants g JOIN assessment_management_events a ON a.id=g.id AND a.actor_id=g.issuer_id
        AND a.action='TRAINING_COGNITIVE_PROFILE_USE_GRANTED'
      WHERE g.product='TRAINING' AND g.issuer_id=${basis.userId}
        AND a.metadata#>>'{selectedBinding,binding,authorization,authority,0,id}'=${basis.id}
        AND a.metadata#>>'{selectedBinding,binding,authorization,authority,0,revision}'=${String(basis.version)}
    ), records AS (
      SELECT g.id,'CONFIGURATION' AS category,g.title,false AS ready,g.version::text AS stamp FROM grants g
      UNION ALL
      SELECT g.id,'CONFIGURATION',g.title,false,g.version::text FROM cognitive g
      WHERE g.revoked_at IS NULL AND g.expires_at>statement_timestamp() AT TIME ZONE 'UTC'
      UNION ALL
      SELECT c.id,CASE WHEN c.status='DRAFT' THEN 'DRAFT' ELSE 'COLLECTING' END,c.name,false,c.revision::text
      FROM composite_assessments c
      WHERE c.status IN ('DRAFT','PUBLISHED') AND (c.expires_at IS NULL OR c.expires_at>statement_timestamp())
        AND (EXISTS (SELECT 1 FROM composite_assessment_items i WHERE i.composite_assessment_id=c.id
          AND i.standard_combination_source#>>'{reference,authority,authorityEntryGrantId}'=${basis.id}
          AND i.standard_combination_source#>>'{reference,authority,authorityEntryGrantVersion}'=${String(basis.version)})
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(c.training_content_snapshot->'units') AS unit(value)
          JOIN cognitive g ON g.id=unit.value#>>'{source,cognitiveProfile,selectedBinding,authorizationId}'))
      UNION ALL
      SELECT assignment.id,CASE WHEN assignment.status='DRAFT' THEN 'DRAFT' ELSE 'COLLECTING' END,assignment.title,false,assignment.updated_at::text
      FROM cognitive_assignments assignment JOIN cognitive g
        ON g.id=assignment.course_snapshot#>>'{selectedCognitiveProfile,selectedBinding,authorizationId}'
      WHERE assignment.listed_standalone AND assignment.status IN ('DRAFT','PUBLISHED')
        AND (assignment.due_at IS NULL OR assignment.due_at>statement_timestamp())
    )`
}

export async function readEntryOffboarding(tx:Prisma.TransactionClient,basis:EntryBasis,successorId?:string,lock=false) {
  const candidates=successorsSql(basis)
  const [successors,selected]=lock ? [[],successorId ? await tx.$queryRaw<Successor[]>(Prisma.sql`
    ${candidates} AND u.id=${successorId} FOR SHARE OF u,g NOWAIT`) : []] : await Promise.all([
    tx.$queryRaw<Successor[]>(Prisma.sql`${candidates} ORDER BY u.username,u.id LIMIT 50`),
    successorId ? tx.$queryRaw<Successor[]>(Prisma.sql`${candidates} AND u.id=${successorId}`) : [],
  ])
  const successor=selected[0]
  const scope=basis.entry==='SURVEY'?surveyImpact(basis,successor,lock)
    : basis.entry==='TRAINING'?trainingImpact(basis):educationImpact(basis,successor,lock)
  const [result]=await tx.$queryRaw<Impact[]>(Prisma.sql`
    WITH ${scope}
    SELECT jsonb_build_object('collecting',count(*) FILTER (WHERE category='COLLECTING')::int,
      'drafts',count(*) FILTER (WHERE category='DRAFT')::int,
      'configurations',count(*) FILTER (WHERE category='CONFIGURATION')::int,
      'pending',count(*) FILTER (WHERE NOT ready)::int) AS counts,
      encode(digest(COALESCE(string_agg(category||':'||id||':'||stamp||':'||ready::text,',' ORDER BY category,id),''),'sha256'),'hex') AS fingerprint,
      COALESCE((SELECT jsonb_agg(x) FROM (SELECT id,category,title,ready FROM records ORDER BY ready,category,id LIMIT 25) x),'[]') AS items,
      ${basis.entry==='SURVEY'&&lock?Prisma.sql`COALESCE((SELECT jsonb_agg(h) FROM handoff_records h),'[]')`:Prisma.sql`'[]'::jsonb`} AS handoffs
    FROM records`)
  const {fingerprint,items,counts,handoffs}=result
  return {
    version:basis.version,digest:canonicalHash({basis,successor:successor??null,fingerprint}),
    counts,items,truncated:counts.collecting+counts.drafts+counts.configurations>items.length,
    successors:successors.map(({id,username})=>({id,username})),successor,handoffs,
  }
}

export async function retainSurveyWaveHandoffs(tx:Prisma.TransactionClient,actorId:string,version:number,
  successor:Successor,handoffs:Handoff[]) {
  if(!handoffs.length)return
  await tx.adminAuthorizationAudit.createMany({data:handoffs.map(({waveId,issuerId,useId,publicationId,replacementId})=>({
    id:'survey-handoff:'+waveId+':'+useId+':'+successor.entryId+':'+successor.version,
    actorUserId:actorId,targetUserId:issuerId,entry:'SURVEY',action:SURVEY_WAVE_HANDOFF_ACTION,version,
    reason:JSON.stringify({useId,publicationId,replacementId,successorId:successor.id,successorEntryId:successor.entryId,
      successorVersion:successor.version}),
  }))})
}
