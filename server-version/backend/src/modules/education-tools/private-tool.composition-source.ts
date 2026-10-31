import {Prisma} from '@prisma/client'
import {assertSelfGroupV2Entry,buildSelfGroupCohortAnalysisPolicy,SELF_GROUP_POLICY_KEY} from '../assessment-policy/self-group-contract'
import {parseSchoolPrivateGroupSelection} from './school-private-group-selection'
import {schoolPrivateGroupDisclosure,schoolPrivateGroupParentAudiences,schoolPrivateScaleGroupChoice} from './school-private-group-source'
import {isStudentComposition,studentCompositionRunPolicy,studentCompositionSubjectCeiling} from '../huiteacher/studentComposition.policy'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {createRelationalProductRegistry,type RelationalProductEntryV1} from '../assessment-relational/product-registry'
import {projectRelationalRunPolicy,type RunResourcePolicy} from '../assessment-run/resourceAuthority'
import {authorizePrivateTool} from './private-tool.access'
import {assertScaleLibraryCollectionAllowed} from '../scale-library-governance/collection-guard'
import {privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {readEducationPublicUse} from './public-source.catalog'
import {parseEducationPublicSourceKey} from './public-source.identity'
import {readEducationPublicSourceHeaders} from './public-source.headers'
import {assertEducationLibraryHeaders} from './library-source.catalog'
import {assertEducationCognitiveOriginalUse} from './native-source.cognitive'
import {assertEducationLibraryUses,type LockedEducationLibraryUses} from './library-source.use'
import {readSelectedSourceBindings} from './selected-source-binding'
import {educationCompositionKey,educationCompositionOriginSchema,educationCompositionResourceKeySchema,educationCompositionVariant,
 educationCompositionPolicyBindingSchema,type EducationCompositionOrigin,type EducationCompositionPolicyBinding} from './private-tool.composition-contracts'

type Tx=Prisma.TransactionClient
type Ref={family:string;key:string;version:string}
const leafSummarySchema=z.array(z.object({blockId:z.string().guid(),versionId:z.string().guid(),contentHash:z.string(),
 kind:z.enum(['SCALE','FORM','COGNITIVE','SJT']),audience:z.string().nullable(),metricKeys:z.array(z.string()).max(100),sourceProvider:z.string().optional(),
 longitudinal:z.boolean().optional(),sourceLongitudinalMetricKeys:z.array(z.string()).nullable().optional(),reportRespondent:z.string().nullable().optional(),subjectNumeric:z.boolean().nullable().optional(),reportScoreKeys:z.array(z.string()).nullable().optional(),
 groupAuthorLicense:z.object({status:z.string(),redistribution:z.string()}).passthrough().nullish()}).strict()).min(1).max(50)
type Row={id:string;key:string;creationHash:string;createdBy:string;status:string;publishedAt:Date|null;productKind:string;
 publicEnabled:boolean;copyable:boolean;manifestHash:string;versionId:string;toolId:string;entry:string;organizationId:string;
 ownerUserId:string;contentHash:string;variantKey:string;title:string;leaves:unknown;groupReporting?:unknown;available:boolean;releaseIds:string[];scaleIds:string[];publicKeys:string[];publicBindings?:unknown;librarySources:Array<{versionId:string;contentHash:string}>}
export type PrivateCompositionRunSource={origin:EducationCompositionOrigin;compositeId:string;manifestHash:string;
 resourceEntry:RelationalProductEntryV1|null;policy:RunResourcePolicy;identityOnly:true;canPublish:false}

/** Metadata for NEW_USE only. Caller owns the real workflow/publication lock.
 * Author authority is read once per batch; the DB's immutable seal proves the
 * source/child correspondence. No source definition, stimulus, report body,
 * compilation, materialization or full snapshot hash is read/rebuilt here. */
export async function readPrivateCompositionRunSources(tx:Tx,c:PrivateToolContext,refs:Ref[],options:{lockForUse?:boolean;libraryUses?:LockedEducationLibraryUses;historyGroup?:boolean}={}):Promise<Map<string,PrivateCompositionRunSource>>{
 if(!refs.length)return new Map()
 for(const ref of refs){
  educationCompositionResourceKeySchema.parse(ref.key)
  const [,entry,versionId,population]=ref.key.split(':')
  z.string().guid().parse(versionId)
  if(ref.family!=='BUNDLE'||ref.version!=='1.0.0'||ref.key.endsWith(':EXPERT_REPORT:2.0.0')||entry!==c.entry||population!==(entry==='SCHOOL'?'STUDENT':'TEACHER'))
   privateToolFail('PRIVATE_COMPOSITION_RESOURCE_INVALID',403)
 }
 if(options.historyGroup){if(c.entry!=='SCHOOL'||options.lockForUse)privateToolFail('PRIVATE_COMPOSITION_RESOURCE_INVALID',403)}
 else await authorizePrivateTool(tx,c)
 const keys=[...new Set(refs.map(ref=>ref.key))]
 const rows=await tx.$queryRaw<Row[]>(Prisma.sql`SELECT c.id,c.creation_key AS key,c.creation_hash AS "creationHash",c.created_by AS "createdBy",
  c.status,c.published_at AS "publishedAt",c.product_kind AS "productKind",c.public_enabled AS "publicEnabled",c.copyable,
  c.training_content_snapshot_hash AS "manifestHash",v.id AS "versionId",v.tool_id AS "toolId",v.entry,
  v.organization_id AS "organizationId",v.owner_user_id AS "ownerUserId",v.content_hash AS "contentHash",v.title,v.definition->'groupReporting' AS "groupReporting",
  (v.definition#>>'{administration,population}')||':'||(v.definition#>>'{administration,responseMode}') AS "variantKey",
  (SELECT COALESCE(jsonb_agg((b->'source')-ARRAY['kind','profile']),'[]'::jsonb) FROM jsonb_array_elements(v.definition->'blocks') b
   WHERE b#>>'{source,provider}' IN ('STANDARD_SCALE','COGNITIVE_CONFIG') AND b->'source'?'selectedBinding') AS "publicBindings",
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('versionId',b->>'versionId','contentHash',b->>'contentHash')),'[]'::jsonb)
   FROM jsonb_array_elements(c.training_content_snapshot#>'{educationBinding,manifest}') b WHERE b->>'sourceProvider'='LIBRARY_SCALE') AS "librarySources",
  (SELECT jsonb_agg(jsonb_build_object('blockId',b->>'blockId','versionId',b->>'versionId','contentHash',b->>'contentHash','kind',b->>'kind',
    'sourceProvider',b->>'sourceProvider','groupAuthorLicense',CASE WHEN b->>'sourceProvider'='PRIVATE_VERSION' THEN s.definition->'license' ELSE NULL END,
    'longitudinal',COALESCE((SELECT block->'longitudinal' FROM jsonb_array_elements(v.definition->'blocks') block WHERE block->>'blockId'=b->>'blockId'),'false'::jsonb),
    'sourceLongitudinalMetricKeys',COALESCE(s.definition#>'{report,audienceContract,longitudinalMetricKeys}',std.snapshot#>'{definition,report,audienceContract,longitudinalMetricKeys}',library.snapshot#>'{compiledDefinition,report,audienceContract,longitudinalMetricKeys}'),
    'audience',CASE WHEN b->>'sourceProvider' IN ('COGNITIVE_CONFIG','SJT_RELEASE') THEN CASE v.entry WHEN 'SCHOOL' THEN 'student' ELSE 'teacher' END ELSE COALESCE(s.definition#>>'{report,audienceContract,audience}',std.snapshot#>>'{definition,report,audienceContract,audience}',library.snapshot#>>'{compiledDefinition,report,audienceContract,audience}') END,
    'reportRespondent',COALESCE(s.definition#>>'{report,audienceContract,respondent}',std.snapshot#>>'{definition,report,audienceContract,respondent}',library.snapshot#>>'{compiledDefinition,report,audienceContract,respondent}'),
    'reportScoreKeys',COALESCE(s.definition#>'{report,scoreOrder}',std.snapshot#>'{definition,report,scoreOrder}',library.snapshot#>'{compiledDefinition,report,scoreOrder}'),
    'subjectNumeric',std.snapshot#>'{parts,CONTENT,reference,metadata,disclosure,audiences,subject,numericScores}',
    'metricKeys',CASE WHEN b->>'sourceProvider' IN ('COGNITIVE_CONFIG','SJT_RELEASE') THEN (SELECT COALESCE(jsonb_agg(metric->>'metricKey'),'[]') FROM jsonb_array_elements(native_m.content->'metrics') metric) WHEN b->>'sourceProvider'='LIBRARY_SCALE' THEN (SELECT COALESCE(jsonb_agg(score->>'key'),'[]') FROM jsonb_array_elements(library.snapshot#>'{compiledDefinition,scoring,scores}') score) WHEN b->>'sourceProvider'='STANDARD_SCALE' THEN (SELECT COALESCE(jsonb_agg(score->>'key'),'[]') FROM jsonb_array_elements(std.snapshot#>'{definition,scoring,scores}') score) WHEN s.kind='SCALE' THEN (SELECT COALESCE(jsonb_agg(score->>'key'),'[]')
      FROM jsonb_array_elements(s.definition#>'{scoring,scores}') score) ELSE '[]'::jsonb END) ORDER BY ordinal)
   FROM jsonb_array_elements(c.training_content_snapshot#>'{educationBinding,manifest}') WITH ORDINALITY blocks(b,ordinal)
   LEFT JOIN education_private_tool_versions s ON s.id=b->>'versionId' AND b->>'sourceProvider'='PRIVATE_VERSION'
   LEFT JOIN survey_standard_releases std ON std.id=b->>'versionId' AND b->>'sourceProvider'='STANDARD_SCALE' AND std.combination_hash=b->>'contentHash'
   LEFT JOIN scale_library_entries library_entry ON library_entry.id=b->>'versionId' AND b->>'sourceProvider'='LIBRARY_SCALE'
   LEFT JOIN scale_library_submissions library ON library.id=library_entry.submission_id AND library.snapshot_hash=b->>'contentHash'
   LEFT JOIN LATERAL (SELECT value AS unit FROM jsonb_array_elements(c.training_content_snapshot->'units') WHERE value->>'itemId'=b->'itemIds'->>0) native_u ON b->>'sourceProvider' IN ('COGNITIVE_CONFIG','SJT_RELEASE')
   LEFT JOIN measurement_content_releases native_m ON native_m.id=native_u.unit#>>'{measurement,releaseId}') AS leaves,
  NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.training_content_snapshot->'units') u
   LEFT JOIN scales s ON u->>'family'='SCALE' AND s.id=u#>>'{source,id}' LEFT JOIN measurement_content_releases r ON r.id=u#>>'{measurement,releaseId}'
   WHERE (u->>'family'='SCALE' AND s.status IS DISTINCT FROM 'PUBLISHED') OR r.status IS DISTINCT FROM 'PUBLISHED'
    OR EXISTS(SELECT 1 FROM scale_library_emergency_stops stop
     WHERE stop.target_kind='RELEASE' AND stop.target_id=r.id OR stop.target_kind='TRAINING_SCALE' AND stop.target_id=s.id)) AS available,
  ARRAY(SELECT u#>>'{measurement,releaseId}' FROM jsonb_array_elements(c.training_content_snapshot->'units') u UNION SELECT u#>>'{source,educationNative,sourceMeasurementReleaseId}' FROM jsonb_array_elements(c.training_content_snapshot->'units') u WHERE u#>>'{source,educationNative,provider}'='COGNITIVE_CONFIG') AS "releaseIds",
  ARRAY(SELECT u#>>'{source,id}' FROM jsonb_array_elements(c.training_content_snapshot->'units') u WHERE u->>'family'='SCALE') AS "scaleIds",
  ARRAY(SELECT 'education-source:'||CASE b->>'sourceProvider' WHEN 'PUBLIC_FORM' THEN 'FORM' WHEN 'COGNITIVE_CONFIG' THEN CASE WHEN b?'profileArtifactHash' THEN 'COGNITIVE_PROFILE' ELSE 'COGNITIVE_CONFIG' END ELSE b->>'sourceProvider' END||':'||(b->>'versionId')||':'||COALESCE(b->>'profileArtifactHash',b->>'contentHash')
   FROM jsonb_array_elements(c.training_content_snapshot#>'{educationBinding,manifest}') b WHERE b->>'sourceProvider' IN ('PUBLIC_FORM','STANDARD_SCALE','COGNITIVE_CONFIG','SJT_RELEASE')) AS "publicKeys"
  FROM composite_assessments c JOIN education_private_tool_versions v ON c.creation_key=
   'education-composition:'||v.entry||':'||v.id||':'||(v.definition#>>'{administration,population}')||':'||(v.definition#>>'{administration,responseMode}')||':1.0.0'
  WHERE c.creation_key IN (${Prisma.join(keys)}) AND v.kind='COMPOSITION' AND v.entry=${c.entry}
   AND v.organization_id=${c.organizationId} AND v.owner_user_id=${c.principal.userId}`)
 const librarySources=rows.flatMap(row=>row.librarySources)
 if(!options.historyGroup){
  await assertEducationLibraryUses(tx,c,librarySources.map(source=>source.versionId),{locked:options.libraryUses,requireLocked:options.lockForUse})
  await assertEducationLibraryHeaders(tx,librarySources,options.lockForUse)
 }
 const publicKeys=[...new Set(rows.flatMap(row=>row.publicKeys))]
 // Match native retire's config -> measurement order; this is the existing
 // current-use check, moved ahead of the collection identity locks.
 if(publicKeys.length&&!options.historyGroup)await assertEducationCognitiveOriginalUse(tx,c,publicKeys.map(key=>parseEducationPublicSourceKey(key)!).filter(source=>source.kind==='COGNITIVE_CONFIG').map(source=>source.id),options.lockForUse)
 if(options.lockForUse){
  const releases=[...new Set(rows.flatMap(row=>row.releaseIds))],scales=[...new Set(rows.flatMap(row=>row.scaleIds))]
  // Reuse the real emergency writer's identity locks, then read mutable status
  // after any wait. This is one batch at the consuming write, not per unit.
  await assertScaleLibraryCollectionAllowed(tx,releases,scales)
  const unavailable=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM scales
   WHERE id=ANY(${scales}::text[]) AND status<>'PUBLISHED' UNION ALL SELECT id FROM measurement_content_releases
   WHERE id=ANY(${releases}::text[]) AND status<>'PUBLISHED'`)
  if(unavailable.length)privateToolFail('PRIVATE_COMPOSITION_SOURCE_UNAVAILABLE')
 }
 if(publicKeys.length&&!options.historyGroup){
  const pins=readSelectedSourceBindings(rows.flatMap(row=>(row.publicBindings??[]) as unknown[]),true)
  const headers=await readEducationPublicSourceHeaders(tx,publicKeys.map(key=>parseEducationPublicSourceKey(key)!),options.lockForUse,c.entry),allowed=await readEducationPublicUse(tx,c,publicKeys,options.lockForUse,pins,true)
  if(allowed.size!==publicKeys.length||headers.size!==publicKeys.length)privateToolFail('PUBLIC_SOURCE_USE_REQUIRED',403)
 }
 const sources=new Map<string,PrivateCompositionRunSource>()
 for(const row of rows){
  const origin=educationCompositionOriginSchema.parse({schemaVersion:1,adapterVersion:'1.0.0',mode:'COMPOSITION',entry:row.entry,
   organizationId:row.organizationId,ownerUserId:row.ownerUserId,toolId:row.toolId,versionId:row.versionId,contentHash:row.contentHash,
   variantKey:row.variantKey})
  if(educationCompositionKey(origin)!==row.key||row.creationHash!==canonicalHash(origin)||row.createdBy!==origin.ownerUserId
   ||row.productKind!=='ORGANIZATION_RESOURCE'||row.publicEnabled||row.copyable||!['DRAFT','PUBLISHED'].includes(row.status)
   ||(row.status==='DRAFT'?row.publishedAt!==null:row.publishedAt===null))privateToolFail('PRIVATE_COMPOSITION_IDENTITY_INVALID')
  if(!row.available)privateToolFail('PRIVATE_COMPOSITION_SOURCE_UNAVAILABLE')
  const variant=educationCompositionVariant(origin),none={mode:'NONE' as const,metricKeys:[],longitudinalMetricKeys:[]}
 const leaves=leafSummarySchema.parse(row.leaves)
 const groupReporting=row.groupReporting==null?null:parseSchoolPrivateGroupSelection(row.groupReporting,{entry:c.entry,
  administration:{population:origin.entry==='SCHOOL'?'STUDENT':'TEACHER',responseMode:variant.responseMode},
  sources:leaves.flatMap(leaf=>{
   const choice=leaf.sourceProvider==='PRIVATE_VERSION'&&leaf.kind==='SCALE'&&leaf.groupAuthorLicense?
    schoolPrivateScaleGroupChoice({id:leaf.versionId,entry:origin.entry,title:row.title,contentHash:leaf.contentHash},
     {license:leaf.groupAuthorLicense,scoring:{scores:leaf.metricKeys.map(key=>({key}))}}):null
   return choice?[{...choice,blockId:leaf.blockId}]:[]
  })})
 const student=isStudentComposition(origin)
 const binding=educationCompositionPolicyBindingSchema.parse({origin,manifestHash:row.manifestHash,
   unitReports:leaves.filter(leaf=>leaf.kind!=='FORM').map(leaf=>({blockId:leaf.blockId,versionId:leaf.versionId,
    contentHash:leaf.contentHash,respondent:variant.responseMode==='SELF'&&leaf.audience===(origin.entry==='SCHOOL'?'student':'teacher')
     ?{mode:'INDIVIDUAL_SUMMARY',metricKeys:leaf.metricKeys,longitudinalMetricKeys:leaf.longitudinal&&leaf.subjectNumeric!==false?leaf.metricKeys.filter(key=>leaf.sourceLongitudinalMetricKeys==null||leaf.sourceLongitudinalMetricKeys.includes(key)):[]}:none,
    ...(student?{subject:studentCompositionSubjectCeiling(leaf)}:{})}))})
  if(groupReporting)binding.unitReports=binding.unitReports.map(unit=>{
   const selected=groupReporting.leaves.find(leaf=>leaf.blockId===unit.blockId)
   return selected?{...unit,groupDisclosure:schoolPrivateGroupDisclosure({minimumRespondents:groupReporting.minimumRespondents,audiences:selected.audiences,
    approved:{schemaVersion:1,policyKey:'EDUCATION_PRIVATE_COMPOSITION_V1',minimumRespondents:null,audiences:{RESPONDENT:unit.respondent,
     SUBJECT:none,TEACHER:none,PARENT:none,PROFESSIONAL:none,ORGANIZATION:none,RESEARCH:none}}})}:unit
  })
  if(student){
   if(process.env.HUITEACHER_STUDENT_FEEDBACK_ENABLED!=='true')privateToolFail('HUITEACHER_STUDENT_FEEDBACK_DISABLED',403)
   sources.set(row.key,{origin,compositeId:row.id,manifestHash:row.manifestHash,resourceEntry:null,
    policy:studentCompositionRunPolicy({origin,binding,compositeId:row.id}),identityOnly:true,canPublish:false})
   continue
  }
  const policyKey='EDUCATION_PRIVATE_COMPOSITION_V1'
  const resourceEntry:RelationalProductEntryV1&{educationComposition?:EducationCompositionPolicyBinding}={title:row.title,description:'普通问卷固定版本；单元独立计分，不是跨工具评分整包。',
   releaseStatus:row.status as 'DRAFT'|'PUBLISHED',scienceMaturity:'PILOT',
   initiationModes:variant.responseMode==='SELF'?['ORG_ASSIGN','CLASS_ASSIGN']:['ORG_ASSIGN','RELATED_OBSERVER_ASSIGN'],subjectReportMode:'NONE',
   applicability:{schemaVersion:1,resourceKind:'BUNDLE',resourceKey:row.key,resourceVersion:'1.0.0',subjectRoles:[variant.subjectRole],respondentRoles:[variant.respondentRole],
    relationshipKinds:variant.relationshipKinds.filter(kind=>kind!=='COURSE_TEACHER_STUDENT'),perspectives:[variant.perspective],analysisMode:'INDIVIDUAL_ONLY',
    visibilityPolicyKey:variant.responseMode==='SELF'?policyKey:'observer_private_respondent_v1',minimumRespondents:null},
   ...(variant.responseMode==='TEACHER_REPORT'?{allowedTargetModes:['HOMEROOM_TEACHER','ALL_CLASS_TEACHERS','SELECTED_CLASS_TEACHERS'] as const}:{}),
   cohortAnalysisPolicy:null,launchTarget:{runtime:'COMPOSITE',compositeAssessmentId:row.id},
   resultDisclosure:{schemaVersion:1,policyKey,minimumRespondents:null,audiences:{
    // This parent has no cross-tool metric namespace. Its native unit ceilings
    // are independently frozen below; feedback must honor each block's rule.
    RESPONDENT:{mode:binding.unitReports.some(unit=>unit.respondent.mode==='INDIVIDUAL_SUMMARY')?'INDIVIDUAL_SUMMARY':'COMPLETION_ONLY',metricKeys:[],longitudinalMetricKeys:[]},
    SUBJECT:none,TEACHER:none,PARENT:none,PROFESSIONAL:none,ORGANIZATION:none,RESEARCH:none}}}
  if(groupReporting){
   resourceEntry.educationComposition=binding
   resourceEntry.resultDisclosure=schoolPrivateGroupDisclosure({approved:resourceEntry.resultDisclosure!,minimumRespondents:groupReporting.minimumRespondents,
    audiences:schoolPrivateGroupParentAudiences(groupReporting)})
   resourceEntry.applicability={...resourceEntry.applicability,analysisMode:'COHORT_AGGREGATE',minimumRespondents:groupReporting.minimumRespondents,visibilityPolicyKey:SELF_GROUP_POLICY_KEY}
   resourceEntry.cohortAnalysisPolicy=buildSelfGroupCohortAnalysisPolicy(resourceEntry.resultDisclosure)
   assertSelfGroupV2Entry(resourceEntry)
  }
  if(options.historyGroup&&(!groupReporting||resourceEntry.releaseStatus!=='PUBLISHED'))privateToolFail('PRIVATE_COMPOSITION_RESOURCE_INVALID',403)
  createRelationalProductRegistry([resourceEntry])
  sources.set(row.key,{origin,compositeId:row.id,manifestHash:row.manifestHash,resourceEntry,
   policy:{...projectRelationalRunPolicy(resourceEntry),educationComposition:binding},identityOnly:true,canPublish:false})
 }
 if(sources.size!==keys.length)privateToolFail('PRIVATE_COMPOSITION_SOURCE_NOT_FOUND',404)
 return sources
}

/** Called only after the real Run publisher/CAS/population checks, in that
 * same transaction. A source's lifecycle never confers task or report access. */
export async function publishPrivateCompositionRuntime(tx:Tx,source:RunResourcePolicy){
 const anchor=educationCompositionPolicyBindingSchema.parse(source.educationComposition),origin=anchor.origin,target=source.runtimeLaunchTarget
 if(source.family!=='BUNDLE'||source.key!==educationCompositionKey(origin)||source.version!=='1.0.0'||target?.kind!=='COMPOSITE')
  privateToolFail('PRIVATE_COMPOSITION_IDENTITY_INVALID')
 const [row]=await tx.$queryRaw<Array<{status:string;publishedAt:Date|null}>>(Prisma.sql`SELECT status,published_at AS "publishedAt"
  FROM composite_assessments WHERE id=${target.ref} AND creation_key=${source.key} AND creation_hash=${canonicalHash(origin)}
   AND training_content_snapshot_hash=${anchor.manifestHash} FOR UPDATE`)
 if(!row||!['DRAFT','PUBLISHED'].includes(row.status)||(row.status==='DRAFT'?row.publishedAt!==null:row.publishedAt===null))
  privateToolFail('PRIVATE_COMPOSITION_IDENTITY_INVALID')
 if(row.status==='DRAFT')await tx.compositeAssessment.update({where:{id:target.ref},data:{status:'PUBLISHED',publishedAt:new Date()}})
}
