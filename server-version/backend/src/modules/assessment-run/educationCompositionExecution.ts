import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {authorizePrivateTool} from '../education-tools/private-tool.access'
import {privateToolFail} from '../education-tools/private-tool.contracts'
import {educationCompositionKey,educationCompositionPolicyBindingSchema,educationCompositionRuntimeAnchorSchema,
 type EducationCompositionRuntimeAnchor} from '../education-tools/private-tool.composition-contracts'
import {assertScaleLibraryCollectionAllowed} from '../scale-library-governance/collection-guard'
import {issueVerifiedEducationStart} from './education-start-context'
import type {RunResourcePolicy} from './resourceAuthority'

type Tx=Prisma.TransactionClient
const manifestSchema=z.array(z.object({blockId:z.string().guid(),kind:z.enum(['SCALE','FORM']),versionId:z.string().guid(),
 contentHash:z.string(),itemIds:z.array(z.string().guid()),sectionIds:z.array(z.string().guid()),title:z.string()}).strict()).min(1).max(50)
const unitsSchema=z.array(z.object({itemId:z.string(),scaleId:z.string(),versionId:z.string().guid(),contentHash:z.string(),
 releaseId:z.string().guid(),definitionHash:z.string(),measurementHash:z.string()}).strict()).max(50)

/** Frozen policy comes from an actual server-loaded Run track. The DB seal and
 * immutable version/children prove content correspondence; this reader checks
 * only the independent header anchors and bounded references, never full source
 * definitions, stimuli, report bodies or full snapshot hashes. No author rights. */
export async function readFrozenCompositionIdentity(tx:Tx,input:{policy:RunResourcePolicy;policyHash:string;organizationId:string;key:string;version:string}){
 const policy=input.policy,binding=educationCompositionPolicyBindingSchema.parse(policy.educationComposition),origin=binding.origin
 if(input.version!=='1.0.0'||policy.version!==input.version||policy.family!=='BUNDLE'||policy.key!==input.key
  ||educationCompositionKey(origin)!==input.key||origin.organizationId!==input.organizationId||canonicalHash(policy)!==input.policyHash
  ||policy.runtimeLaunchTarget?.kind!=='COMPOSITE'||policy.scientificMaturity!=='PILOT'
  ||policy.analysisMode!=='INDIVIDUAL_ONLY'||policy.minimumRespondents!==null
  ||canonicalHash([policy.subjectRoles,policy.respondentRoles,policy.relationshipKinds,policy.perspectives])
   !==canonicalHash([[origin.entry==='TEACHER'?'TEACHER':'STUDENT'],[origin.entry==='TEACHER'?'TEACHER':'STUDENT'],['SELF'],['SELF_REPORT']]))
  privateToolFail('PRIVATE_COMPOSITION_EXECUTION_INVALID')
 const [row]=await tx.$queryRaw<Array<{title:string;manifest:unknown;units:unknown}>>(Prisma.sql`SELECT c.name AS title,
  (SELECT jsonb_agg(jsonb_build_object('blockId',b->>'blockId','kind',b->>'kind','versionId',v.id,'contentHash',v.content_hash,
   'itemIds',b->'itemIds','sectionIds',b->'sectionIds','title',v.title) ORDER BY ordinal)
   FROM jsonb_array_elements(c.training_content_snapshot#>'{educationBinding,manifest}') WITH ORDINALITY blocks(b,ordinal)
   JOIN education_private_tool_versions v ON v.id=b->>'versionId') AS manifest,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('itemId',u->>'itemId','scaleId',s.id,'versionId',u#>>'{source,privateVersionId}',
   'contentHash',u#>>'{measurement,contentHash}','releaseId',u#>>'{measurement,releaseId}','definitionHash',s.definition_hash,
   'measurementHash',u#>>'{measurement,measurementHash}')),'[]'::jsonb)
   FROM jsonb_array_elements(c.training_content_snapshot->'units') u JOIN scales s ON s.id=u#>>'{source,id}') AS units
  FROM composite_assessments c WHERE c.id=${policy.runtimeLaunchTarget.ref} AND c.creation_key=${input.key}
   AND c.creation_hash=${canonicalHash(origin)} AND c.training_content_snapshot_hash=${binding.manifestHash}
   AND c.created_by=${origin.ownerUserId} AND c.status='PUBLISHED' AND c.published_at IS NOT NULL
   AND c.product_kind='ORGANIZATION_RESOURCE' AND NOT c.public_enabled AND NOT c.copyable`)
 if(!row)privateToolFail('PRIVATE_COMPOSITION_EXECUTION_INVALID')
 return {kind:'COMPOSITION' as const,origin,compositeId:policy.runtimeLaunchTarget.ref,title:row.title,policy,binding,
  manifest:manifestSchema.parse(row.manifest),units:unitsSchema.parse(row.units),identityOnly:true as const}
}
export type FrozenCompositionIdentity=Awaited<ReturnType<typeof readFrozenCompositionIdentity>>

/** Collection boundaries only. NEW_START rechecks the publisher's author right;
 * a participant never needs that role. Continuation uses its frozen admission,
 * while emergency stops still fence collection. Ordinary role withdrawal does
 * not destroy an entered attempt or historical report. */
export async function assertCompositionCollection(tx:Tx,identity:FrozenCompositionIdentity,purpose:'NEW_START'|'BOUND_COLLECTION',lock=false){
 if(purpose==='NEW_START')await authorizePrivateTool(tx,{entry:identity.origin.entry,organizationId:identity.origin.organizationId,
  principal:{userId:identity.origin.ownerUserId,accountDomain:'SCHOOL'}})
 const releases=[...new Set(identity.units.map(unit=>unit.releaseId))],scales=[...new Set(identity.units.map(unit=>unit.scaleId))]
 if(lock)await assertScaleLibraryCollectionAllowed(tx,releases,scales)
 const [row]=await tx.$queryRaw<Array<{stopped:boolean;unavailable:boolean}>>(Prisma.sql`SELECT
  EXISTS(SELECT 1 FROM scale_library_emergency_stops s WHERE s.target_kind='RELEASE' AND s.target_id=ANY(${releases}::text[])
   OR s.target_kind='TRAINING_SCALE' AND s.target_id=ANY(${scales}::text[])) AS stopped,
  (EXISTS(SELECT 1 FROM measurement_content_releases WHERE id=ANY(${releases}::text[]) AND status<>'PUBLISHED')
   OR EXISTS(SELECT 1 FROM scales WHERE id=ANY(${scales}::text[]) AND status<>'PUBLISHED')) AS unavailable`)
 if(row.stopped||purpose==='NEW_START'&&row.unavailable)privateToolFail('PRIVATE_COMPOSITION_COLLECTION_UNAVAILABLE',403)
}

/** Exact persisted execution/assignment identity. The consuming START, FINAL
 * or report layer owns current actor/relationship/consent checks; source reading
 * does not repeat that query or confer those rights. */
export async function readCompositionExecutionSource(tx:Tx,input:{executionId?:string;assignmentRef?:string;actorUserId?:string;compositeId?:string;parentAttemptId?:string}){
 const [row]=await tx.$queryRaw<Array<{executionId:string;organizationId:string;key:string;version:string;policy:RunResourcePolicy;policyHash:string;
  assignmentRef:string;subjectUserId:string;respondentUserId:string;bindingKind:string|null;bindingRef:string|null;status:string;runStatus:string;assignmentStatus:string}>>(Prisma.sql`
  SELECT e.id AS "executionId",e.organization_id AS "organizationId",t.resource_key AS key,t.resource_version AS version,
   t.frozen_resource_policy AS policy,t.resource_policy_hash AS "policyHash",a.id AS "assignmentRef",a.subject_user_id AS "subjectUserId",
   a.respondent_user_id AS "respondentUserId",e.runtime_binding_kind AS "bindingKind",e.runtime_binding_ref AS "bindingRef",e.status,
   r.status AS "runStatus",a.status AS "assignmentStatus"
  FROM assessment_run_executions e JOIN assessment_runs r ON r.id=e.run_id AND r.organization_id=e.organization_id
  JOIN assessment_run_tracks t ON t.id=e.track_id AND t.run_id=e.run_id AND t.organization_id=e.organization_id
  JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id AND a.policy_domain='ORGANIZATION_RUN'
   AND a.resource_kind=t.resource_family AND a.resource_key=t.resource_key AND a.resource_version=t.resource_version
   AND a.subject_user_id=a.respondent_user_id AND a.subject_role='TEACHER' AND a.respondent_role='TEACHER'
   AND a.relationship_kind='SELF' AND a.perspective='SELF_REPORT' AND a.analysis_mode='INDIVIDUAL_ONLY'
  JOIN huiteacher_evaluation_run_links link ON link.organization_id=e.organization_id AND link.run_id=e.run_id
  WHERE ${input.executionId?Prisma.sql`e.id=${input.executionId}`:Prisma.sql`a.id=${input.assignmentRef??''}`}
   AND t.resource_family='BUNDLE' AND t.resource_key LIKE 'education-composition:TEACHER:%'
   AND NOT EXISTS(SELECT 1 FROM campus_activity_runs school WHERE school.organization_id=e.organization_id AND school.run_id=e.run_id)`)
 if(!row||!['PUBLISHED','CLOSED'].includes(row.runStatus)||!['ASSIGNED','STARTED','COMPLETED'].includes(row.status)
  ||!['OPEN','STARTED','COMPLETED'].includes(row.assignmentStatus)||(input.actorUserId!==undefined&&input.actorUserId!==row.respondentUserId))
  privateToolFail('PRIVATE_COMPOSITION_EXECUTION_INVALID')
 const identity=await readFrozenCompositionIdentity(tx,row)
 if(identity.origin.entry!=='TEACHER'||input.compositeId!==undefined&&identity.compositeId!==input.compositeId)
  privateToolFail('PRIVATE_COMPOSITION_EXECUTION_INVALID')
 if(input.parentAttemptId!==undefined){
  const parent=await tx.compositeAssessmentAttempt.findUnique({where:{id:input.parentAttemptId},select:{userId:true,subjectUserId:true,respondentUserId:true,assignmentRef:true,compositeAssessmentId:true}})
  if(row.bindingKind!=='COMPOSITE'||row.bindingRef!==input.parentAttemptId||!parent||parent.assignmentRef!==row.assignmentRef
   ||parent.userId!==row.respondentUserId||parent.subjectUserId!==row.subjectUserId||parent.respondentUserId!==row.respondentUserId
   ||parent.compositeAssessmentId!==identity.compositeId)privateToolFail('PRIVATE_COMPOSITION_EXECUTION_INVALID')
 }
 return {identity,...row}
}
export async function admitCompositionStart(tx:Tx,input:{executionId:string;compositeId:string;actorUserId:string}){
 const source=await readCompositionExecutionSource(tx,input)
 await assertCompositionCollection(tx,source.identity,'NEW_START',true)
 return issueVerifiedEducationStart({tx,product:'TEACHER',compositeId:source.identity.compositeId,assignmentRef:source.assignmentRef,
  respondentUserId:source.respondentUserId,composition:source.identity.binding})
}

/** FINAL uses a previously DB-bound immutable attempt binding, not a caller
 * receipt. One header assertion can be reused for all its measurement units. */
export async function assertSealedCompositionAnchor(tx:Tx,raw:EducationCompositionRuntimeAnchor,compositeId:string,ownerId:string){
 const anchor=educationCompositionRuntimeAnchorSchema.parse(raw),origin=anchor.origin
 if(origin.ownerUserId!==ownerId)privateToolFail('PRIVATE_COMPOSITION_IDENTITY_INVALID')
 const [row]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM composite_assessments
  WHERE id=${compositeId} AND created_by=${ownerId} AND creation_key=${educationCompositionKey(origin)}
   AND creation_hash=${canonicalHash(origin)} AND training_content_snapshot_hash=${anchor.manifestHash}
   AND status='PUBLISHED' AND product_kind='ORGANIZATION_RESOURCE' AND NOT public_enabled AND NOT copyable`)
 if(!row)privateToolFail('PRIVATE_COMPOSITION_IDENTITY_INVALID')
 return anchor
}
