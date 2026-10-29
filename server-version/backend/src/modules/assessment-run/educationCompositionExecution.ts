import {readSealedCompositionContent} from '../education-tools/private-tool.composition-content'
import {isStudentComposition,validStudentCompositionPolicy} from '../huiteacher/studentComposition.policy'
import {studentEvaluationTrackConfigSql} from '../huiteacher/studentCompositionResource'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {authorizePrivateTool} from '../education-tools/private-tool.access'
import {privateToolFail} from '../education-tools/private-tool.contracts'
import {readEducationPublicUse} from '../education-tools/public-source.catalog'
import {educationPublicSourceKey} from '../education-tools/public-source.identity'
import {readEducationPublicSourceHeaders} from '../education-tools/public-source.headers'
import {assertEducationLibraryHeaders} from '../education-tools/library-source.catalog'
import {assertEducationLibraryUses,lockEducationLibraryUses,type LockedEducationLibraryUses} from '../education-tools/library-source.use'
import type {PrivateToolContext} from '../education-tools/private-tool.contracts'
import {educationCompositionKey,educationCompositionPolicyBindingSchema,educationCompositionRuntimeAnchorSchema,educationCompositionVariant,matchesEducationCompositionRespondent,
 type EducationCompositionRuntimeAnchor} from '../education-tools/private-tool.composition-contracts'
import {assertScaleLibraryCollectionAllowed} from '../scale-library-governance/collection-guard'
import {issueVerifiedEducationStart} from './education-start-context'
import type {RunResourcePolicy} from './resourceAuthority'

type Tx=Prisma.TransactionClient
const manifestSchema=z.array(z.object({blockId:z.string().guid(),kind:z.enum(['SCALE','FORM']),versionId:z.string().guid(),
 sourceProvider:z.enum(['PRIVATE_VERSION','PUBLIC_FORM','STANDARD_SCALE','LIBRARY_SCALE']),contentHash:z.string(),itemIds:z.array(z.string().guid()),sectionIds:z.array(z.string().guid()),title:z.string()}).strict()).min(1).max(50)
const unitsSchema=z.array(z.object({itemId:z.string(),scaleId:z.string(),versionId:z.string().guid(),contentHash:z.string(),
 releaseId:z.string().guid(),definitionHash:z.string(),measurementHash:z.string()}).strict()).max(50)

/** Frozen policy comes from an actual server-loaded Run track. The DB seal and
 * immutable version/children prove content correspondence; this reader checks
 * only the independent header anchors and bounded references, never full source
 * definitions, stimuli, report bodies or full snapshot hashes. No author rights. */
export async function readFrozenCompositionIdentity(tx:Tx,input:{policy:RunResourcePolicy;policyHash:string;organizationId:string;key:string;version:string}){
 const policy=input.policy,binding=educationCompositionPolicyBindingSchema.parse(policy.educationComposition),origin=binding.origin
 if(origin.variantKey==='TEACHER:EXPERT_REPORT')privateToolFail('PRIVATE_COMPOSITION_FIELD_INVITATION_REQUIRED',400)
 const variant=educationCompositionVariant(origin)
 if(input.version!=='1.0.0'||policy.version!==input.version||policy.family!=='BUNDLE'||policy.key!==input.key
  ||educationCompositionKey(origin)!==input.key||origin.organizationId!==input.organizationId||canonicalHash(policy)!==input.policyHash
  ||policy.runtimeLaunchTarget?.kind!=='COMPOSITE'||policy.scientificMaturity!=='PILOT'
  ||(isStudentComposition(origin)?!validStudentCompositionPolicy(policy):policy.analysisMode!=='INDIVIDUAL_ONLY'||policy.minimumRespondents!==null)
  ||canonicalHash([policy.subjectRoles,policy.respondentRoles,policy.relationshipKinds,policy.perspectives])
   !==canonicalHash([[variant.subjectRole],[variant.respondentRole],variant.relationshipKinds.filter(kind=>kind!=='COURSE_TEACHER_STUDENT'),[variant.perspective]]))
  privateToolFail('PRIVATE_COMPOSITION_EXECUTION_INVALID')
 const [row]=await tx.$queryRaw<Array<{title:string;manifest:unknown;units:unknown}>>(Prisma.sql`SELECT c.name AS title,
  (SELECT jsonb_agg(jsonb_build_object('blockId',b->>'blockId','kind',b->>'kind','versionId',b->>'versionId','contentHash',b->>'contentHash','sourceProvider',b->>'sourceProvider',
   'itemIds',b->'itemIds','sectionIds',b->'sectionIds','title',COALESCE(v.title,g.title,std.snapshot->>'title',library.snapshot->>'title')) ORDER BY ordinal)
   FROM jsonb_array_elements(c.training_content_snapshot#>'{educationBinding,manifest}') WITH ORDINALITY blocks(b,ordinal)
   LEFT JOIN education_private_tool_versions v ON v.id=b->>'versionId' AND b->>'sourceProvider'='PRIVATE_VERSION'
   LEFT JOIN survey_governed_tools g ON g.id=b->>'versionId' AND g.family='FORM' AND g.snapshot_hash=b->>'contentHash' AND b->>'sourceProvider'='PUBLIC_FORM'
   LEFT JOIN survey_standard_releases std ON std.id=b->>'versionId' AND std.combination_hash=b->>'contentHash' AND b->>'sourceProvider'='STANDARD_SCALE'
   LEFT JOIN scale_library_entries library_entry ON library_entry.id=b->>'versionId' AND b->>'sourceProvider'='LIBRARY_SCALE'
   LEFT JOIN scale_library_submissions library ON library.id=library_entry.submission_id AND library.snapshot_hash=b->>'contentHash') AS manifest,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('itemId',u->>'itemId','scaleId',s.id,'versionId',COALESCE(u#>>'{source,privateVersionId}',u#>>'{source,educationStandard,releaseId}',u#>>'{source,libraryEntryId}'),
   'contentHash',u#>>'{measurement,contentHash}','releaseId',u#>>'{measurement,releaseId}','definitionHash',COALESCE(u#>>'{source,educationStandard,nativeDefinitionHash}',u#>>'{source,educationLibrary,nativeDefinitionHash}',s.definition_hash),
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
export async function assertCompositionCollection(tx:Tx,identity:Pick<FrozenCompositionIdentity,'origin'>&{
 units:ReadonlyArray<{releaseId:string;scaleId:string}>;manifest:ReadonlyArray<{sourceProvider:string;versionId:string;contentHash:string}>
},purpose:'NEW_START'|'BOUND_COLLECTION',lock=false,libraryUses?:LockedEducationLibraryUses){
 if(isStudentComposition(identity.origin)&&process.env.HUITEACHER_STUDENT_FEEDBACK_ENABLED!=='true')privateToolFail('HUITEACHER_STUDENT_FEEDBACK_DISABLED',403)
 const c={entry:identity.origin.entry,organizationId:identity.origin.organizationId,principal:{userId:identity.origin.ownerUserId,accountDomain:'SCHOOL' as const}}
 if(purpose==='NEW_START')await authorizePrivateTool(tx,c)
 const releases=[...new Set(identity.units.map(unit=>unit.releaseId))],scales=[...new Set(identity.units.map(unit=>unit.scaleId))]
 if(lock)await assertScaleLibraryCollectionAllowed(tx,releases,scales)
 const [row]=await tx.$queryRaw<Array<{stopped:boolean;unavailable:boolean}>>(Prisma.sql`SELECT
  EXISTS(SELECT 1 FROM scale_library_emergency_stops s WHERE s.target_kind='RELEASE' AND s.target_id=ANY(${releases}::text[])
   OR s.target_kind='TRAINING_SCALE' AND s.target_id=ANY(${scales}::text[])) AS stopped,
  (EXISTS(SELECT 1 FROM measurement_content_releases WHERE id=ANY(${releases}::text[]) AND status<>'PUBLISHED')
   OR EXISTS(SELECT 1 FROM scales WHERE id=ANY(${scales}::text[]) AND status<>'PUBLISHED')) AS unavailable`)
 if(row.stopped||purpose==='NEW_START'&&row.unavailable)privateToolFail('PRIVATE_COMPOSITION_COLLECTION_UNAVAILABLE',403)
 if(purpose==='NEW_START'){
  const libraries=identity.manifest.filter(block=>block.sourceProvider==='LIBRARY_SCALE')
  await assertEducationLibraryUses(tx,c,libraries.map(source=>source.versionId),{locked:libraryUses,requireLocked:lock})
  await assertEducationLibraryHeaders(tx,libraries,lock)
  const sources=identity.manifest.filter(block=>['PUBLIC_FORM','STANDARD_SCALE'].includes(block.sourceProvider)).map(block=>({kind:block.sourceProvider==='PUBLIC_FORM'?'FORM' as const:'STANDARD_SCALE' as const,id:block.versionId,hash:block.contentHash}))
  const keys=[...new Set(sources.map(educationPublicSourceKey))]
  if(keys.length){
   const headers=await readEducationPublicSourceHeaders(tx,sources,lock),allowed=await readEducationPublicUse(tx,c,keys,lock)
   if(headers.size!==keys.length||allowed.size!==keys.length)privateToolFail('PUBLIC_SOURCE_USE_REQUIRED',403)
  }
 }
}

/** Exact persisted execution/assignment identity. The consuming START, FINAL
 * or report layer owns current actor/relationship/consent checks; source reading
 * does not repeat that query or confer those rights. */
export async function readCompositionExecutionSource(tx:Tx,input:{executionId?:string;assignmentRef?:string;actorUserId?:string;compositeId?:string;parentAttemptId?:string}){
 const [row]=await tx.$queryRaw<Array<{executionId:string;organizationId:string;key:string;version:string;policy:RunResourcePolicy;policyHash:string;
  assignmentRef:string;subjectUserId:string;respondentUserId:string;subjectRole:string;respondentRole:string;relationshipKind:string;perspective:string;
  bindingKind:string|null;bindingRef:string|null;status:string;runStatus:string;assignmentStatus:string;product:'SCHOOL'|'TEACHER'}>>(Prisma.sql`
  SELECT e.id AS "executionId",e.organization_id AS "organizationId",t.resource_key AS key,t.resource_version AS version,
   t.frozen_resource_policy AS policy,t.resource_policy_hash AS "policyHash",a.id AS "assignmentRef",a.subject_user_id AS "subjectUserId",
   a.respondent_user_id AS "respondentUserId",a.subject_role AS "subjectRole",a.respondent_role AS "respondentRole",a.relationship_kind AS "relationshipKind",a.perspective,
   e.runtime_binding_kind AS "bindingKind",e.runtime_binding_ref AS "bindingRef",e.status,
   r.status AS "runStatus",a.status AS "assignmentStatus",CASE WHEN school.run_id IS NOT NULL THEN 'SCHOOL' ELSE 'TEACHER' END AS product
  FROM assessment_run_executions e JOIN assessment_runs r ON r.id=e.run_id AND r.organization_id=e.organization_id
  JOIN assessment_run_tracks t ON t.id=e.track_id AND t.run_id=e.run_id AND t.organization_id=e.organization_id
  JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id AND a.policy_domain='ORGANIZATION_RUN'
   AND a.resource_kind=t.resource_family AND a.resource_key=t.resource_key AND a.resource_version=t.resource_version
   AND (a.analysis_mode='INDIVIDUAL_ONLY' OR (a.analysis_mode='COHORT_AGGREGATE' AND a.subject_role='TEACHER' AND a.respondent_role='STUDENT'))
  JOIN assessment_run_actor_snapshots subject ON subject.id=e.subject_actor_snapshot_id AND subject.organization_id=e.organization_id
   AND subject.run_id=e.run_id AND subject.user_id=a.subject_user_id AND subject.actor_role=a.subject_role
  JOIN assessment_run_actor_snapshots respondent ON respondent.id=e.respondent_actor_snapshot_id AND respondent.organization_id=e.organization_id
   AND respondent.run_id=e.run_id AND respondent.user_id=a.respondent_user_id AND respondent.actor_role=a.respondent_role
  LEFT JOIN huiteacher_evaluation_run_links teacher ON teacher.organization_id=e.organization_id AND teacher.run_id=e.run_id
  LEFT JOIN campus_activity_runs school ON school.organization_id=e.organization_id AND school.run_id=e.run_id
  WHERE ${input.executionId?Prisma.sql`e.id=${input.executionId}`:Prisma.sql`a.id=${input.assignmentRef??''}`}
   AND t.resource_family='BUNDLE'
   AND ((school.run_id IS NOT NULL AND teacher.run_id IS NULL AND a.subject_role='STUDENT'
     AND t.resource_key LIKE 'education-composition:SCHOOL:%')
    OR (teacher.run_id IS NOT NULL AND school.run_id IS NULL AND a.subject_role='TEACHER'
     AND t.resource_key LIKE 'education-composition:TEACHER:%' AND (a.respondent_role='TEACHER'
      OR (a.respondent_role='STUDENT' AND EXISTS(SELECT 1 FROM huiteacher_student_eval_configs cfg
       WHERE cfg.organization_id=e.organization_id AND cfg.event_id=teacher.event_id AND cfg.composition_version_id IS NOT NULL
        AND ${studentEvaluationTrackConfigSql(Prisma.sql`t`,Prisma.sql`cfg`)})))))`)
 if(!row||!['PUBLISHED','CLOSED'].includes(row.runStatus)||!['ASSIGNED','STARTED','COMPLETED'].includes(row.status)
  ||!['OPEN','STARTED','COMPLETED'].includes(row.assignmentStatus)||(input.actorUserId!==undefined&&input.actorUserId!==row.respondentUserId))
  privateToolFail('PRIVATE_COMPOSITION_EXECUTION_INVALID')
 const identity=await readFrozenCompositionIdentity(tx,row)
 if(identity.origin.entry!==row.product||input.compositeId!==undefined&&identity.compositeId!==input.compositeId)
  privateToolFail('PRIVATE_COMPOSITION_EXECUTION_INVALID')
 if(!matchesEducationCompositionRespondent(identity.origin,row))privateToolFail('PRIVATE_COMPOSITION_EXECUTION_INVALID')
 if(input.parentAttemptId!==undefined){
  const parent=await tx.compositeAssessmentAttempt.findUnique({where:{id:input.parentAttemptId},select:{userId:true,subjectUserId:true,respondentUserId:true,assignmentRef:true,compositeAssessmentId:true}})
  if(row.bindingKind!=='COMPOSITE'||row.bindingRef!==input.parentAttemptId||!parent||parent.assignmentRef!==row.assignmentRef
   ||parent.userId!==row.respondentUserId||parent.subjectUserId!==row.subjectUserId||parent.respondentUserId!==row.respondentUserId
   ||parent.compositeAssessmentId!==identity.compositeId)privateToolFail('PRIVATE_COMPOSITION_EXECUTION_INVALID')
 }
 return {identity,...row}
}
export async function admitCompositionStart(tx:Tx,input:{executionId:string;compositeId:string;actorUserId:string},libraryUses?:LockedEducationLibraryUses){
 const source=await readCompositionExecutionSource(tx,input)
 await assertCompositionCollection(tx,source.identity,'NEW_START',true,libraryUses)
 return issueVerifiedEducationStart({tx,product:source.product,compositeId:source.identity.compositeId,assignmentRef:source.assignmentRef,
  subjectUserId:source.subjectUserId,respondentUserId:source.respondentUserId,composition:source.identity.binding})
}

/** Before Organization/Run/Execution locks, for this actual frozen respondent
 * only. An unavailable U is recorded, not thrown here: concurrent reconciliation
 * may discover an already-entered attempt, which keeps its completion right. */
export async function lockCompositionStartLibraryUses(tx:Tx,input:{executionId:string;actorUserId:string}){
 const [row]=await tx.$queryRaw<Array<{entry:'SCHOOL'|'TEACHER';organizationId:string;ownerId:string;entryIds:string[]}>>(Prisma.sql`
  SELECT v.entry,v.organization_id AS "organizationId",v.owner_user_id AS "ownerId",
   ARRAY(SELECT DISTINCT b->>'versionId' FROM jsonb_array_elements(c.training_content_snapshot#>'{educationBinding,manifest}') b
    WHERE b->>'sourceProvider'='LIBRARY_SCALE') AS "entryIds"
  FROM assessment_run_executions e JOIN assessment_run_tracks t ON t.id=e.track_id AND t.run_id=e.run_id AND t.organization_id=e.organization_id
  JOIN assessment_run_actor_snapshots respondent ON respondent.id=e.respondent_actor_snapshot_id AND respondent.organization_id=e.organization_id
   AND respondent.run_id=e.run_id AND respondent.user_id=${input.actorUserId}
  JOIN composite_assessments c ON c.id=t.frozen_resource_policy#>>'{runtimeLaunchTarget,ref}' AND c.creation_key=t.resource_key
   AND c.training_content_snapshot_hash=t.frozen_resource_policy#>>'{educationComposition,manifestHash}'
  JOIN education_private_tool_versions v ON v.id=c.training_content_snapshot#>>'{educationBinding,origin,versionId}'
   AND v.organization_id=e.organization_id AND c.created_by=v.owner_user_id AND v.kind='COMPOSITION'
  WHERE e.id=${input.executionId} AND e.runtime_binding_ref IS NULL AND t.resource_family='BUNDLE'
   AND t.resource_key LIKE 'education-composition:%'`)
 if(!row?.entryIds.length)return
 const context:PrivateToolContext={entry:row.entry,organizationId:row.organizationId,principal:{userId:row.ownerId,accountDomain:'SCHOOL'}}
 return {context,entryIds:row.entryIds,uses:await lockEducationLibraryUses(tx,context,row.entryIds)}
}

/** FINAL uses a previously DB-bound immutable attempt binding, not a caller
 * receipt. One header assertion can be reused for all its measurement units. */
export async function assertSealedCompositionAnchor(tx:Tx,raw:EducationCompositionRuntimeAnchor,compositeId:string,ownerId:string){
 return (await readSealedCompositionContent(tx,{compositeId,ownerId,anchor:educationCompositionRuntimeAnchorSchema.parse(raw)})).anchor
}
