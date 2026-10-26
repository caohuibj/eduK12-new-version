import {Prisma} from '@prisma/client'
import type {GovernedFamily} from './governed-tool.model'
export type VersionAxes={content:string;parameters:string|null;report:string|null}
export type GovernedSummaryRow={id:string;family:GovernedFamily;title:string;tool_key:string;tool_version:string;snapshot_hash:string;state:string;version:number;blockers:string[];submitted_by:string;submitted_at:Date;approved_by:string|null;approved_at:Date|null;approval_reason:string|null;reason:string;versions:VersionAxes;components:Array<{slotKey:string;title:string;kind:string;source:{type:string;id:string;hash:string};versions:VersionAxes|null}>}
/** List-only projection: no executable, scoring keys, templates or Reference
 * bodies leave PostgreSQL. Actions still load/hash/validate the full artifact. */
export const governedSummaryColumns=Prisma.sql`t.id,t.family,t.title,t.tool_key,t.tool_version,t.snapshot_hash,t.state,t.version,t.blockers,t.submitted_by,t.submitted_at,t.approved_by,t.approved_at,t.approval_reason,t.reason,
 jsonb_build_object('content',COALESCE(t.snapshot#>>'{unit,ref,sourceVersion}',t.tool_version),'parameters',t.snapshot#>>'{parameters,version}','report',COALESCE(t.snapshot#>>'{report,version}',t.snapshot#>>'{packageReport,version}')) AS versions,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('slotKey',c->>'slotKey','title',c->>'title','kind',c#>>'{unit,ref,kind}','source',c->'source','versions',
 CASE WHEN g.id IS NOT NULL THEN jsonb_build_object('content',g.snapshot#>>'{unit,ref,sourceVersion}','parameters',g.snapshot#>>'{parameters,version}','report',g.snapshot#>>'{report,version}')
 WHEN s.id IS NOT NULL THEN jsonb_build_object('content',s.snapshot#>>'{parts,CONTENT,version}','parameters',CASE WHEN s.snapshot#>'{parts,PARAMETERS,payload}'='null'::jsonb THEN NULL ELSE s.snapshot#>>'{parts,PARAMETERS,version}' END,'report',CASE WHEN s.snapshot#>'{parts,REPORT,payload}'='null'::jsonb THEN NULL ELSE s.snapshot#>>'{parts,REPORT,version}' END)
 ELSE NULL END) ORDER BY ordinal)
 FROM jsonb_array_elements(t.snapshot->'components') WITH ORDINALITY AS component(c,ordinal)
 LEFT JOIN survey_governed_tools g ON c#>>'{source,type}'='GOVERNED' AND g.id::text=c#>>'{source,id}' AND g.snapshot_hash=c#>>'{source,hash}'
 LEFT JOIN survey_standard_releases s ON c#>>'{source,type}'='STANDARD' AND s.id::text=c#>>'{source,id}' AND s.combination_hash=c#>>'{source,hash}'),'[]'::jsonb) AS components`
export const summaryView=(r:GovernedSummaryRow)=>({id:r.id,family:r.family,title:r.title,toolKey:r.tool_key,toolVersion:r.tool_version,hash:r.snapshot_hash,state:r.state,version:r.version,blockers:r.blockers,submittedBy:r.submitted_by,submittedAt:r.submitted_at,approvedBy:r.approved_by,approvedAt:r.approved_at,approvalReason:r.approval_reason,reason:r.reason,versions:r.versions,components:r.components,metrics:[],summaryOnly:true,validation:'FULL_EXACT_ARTIFACT_AT_ACTION',policyIdentity:{resourceKey:'governed-release:'+r.id,fingerprint:r.snapshot_hash}})
