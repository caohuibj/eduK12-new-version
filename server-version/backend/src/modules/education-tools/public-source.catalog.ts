import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {authorizePrivateTool} from './private-tool.access'
import {privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {parseEducationPublicSourceKey} from './public-source.identity'
import {educationStandardHeaderColumns,educationFormHeaderColumns,educationCognitiveHeaderColumns,educationSjtHeaderColumns,educationSjtHeaderSources,educationPublicRequiredContextKeys,type EducationPublicSourceHeader} from './public-source.headers'
import {assertContentGrantChain,type ContentGrant} from '../measurement-content/content-authority'
import {educationApplicabilitySchema} from '../scale-library-governance/education-applicability'
import {educationCompositionResponseModeSchema,educationCompositionAdministrationForEntry} from './private-tool.composition-contracts'
import {expertTargetKindSchema,supportsExpertSource,isNativeExpertObserver} from './expert-observation.contract'
import {supportsStudentStandardSource} from './student-observation.contract'
import {parseEducationPackageKey} from './package-reference.contracts'

const key=z.string().max(240).refine(value=>parseEducationPublicSourceKey(value)!==null)
const useKey=z.string().max(240).refine(value=>parseEducationPublicSourceKey(value)!==null||parseEducationPackageKey(value)!==null)
export const educationPublicCatalogQuery=z.object({cursor:key.optional(),kind:z.enum(['SCALE','FORM','COGNITIVE','SJT']).optional(),q:z.string().trim().max(160).optional(),responseMode:educationCompositionResponseModeSchema.optional(),targetKind:expertTargetKindSchema.optional()}).strict()
type GrantRow={id:string;subject_id:string;issuer_id:string;product:'SCHOOL'|'TEACHER';scope_id:string;resource_keys:string[];
 valid_from:Date;expires_at:Date;read_at:Date;version:number;revoked_at:Date|null;parent_grant_id:string|null;ancestry:string[];
 capabilities:ContentGrant['capabilities'];delegable_capabilities:ContentGrant['capabilities'];remaining_delegation_depth:number}
const grantFromRow=(row:GrantRow):ContentGrant=>({id:row.id,subjectId:row.subject_id,issuerId:row.issuer_id,parentGrantId:row.parent_grant_id,
 scope:{product:row.product,scopeKind:'ORGANIZATION',scopeId:row.scope_id,resourceKind:'material',resourceKeys:row.resource_keys},
 capabilities:row.capabilities,delegableCapabilities:row.delegable_capabilities,remainingDelegationDepth:row.remaining_delegation_depth,
 validFrom:row.valid_from,expiresAt:row.expires_at,version:row.version,revokedAt:row.revoked_at,ancestry:row.ancestry})

/** The caller has resolved current author/organization authority once in this
 * transaction. Only this narrow, non-delegable root-use branch is accepted.
 * One grant batch + one post-lock clock covers all referenced public leaves;
 * no per-card ancestry reads or persistent authorization cache. */
export async function readEducationPublicUse(tx:Prisma.TransactionClient,c:PrivateToolContext,keys:readonly string[],lock=false){
 const exact=[...new Set(keys)];if(exact.length>128||exact.some(value=>!useKey.safeParse(value).success))privateToolFail('PUBLIC_SOURCE_INPUT_INVALID',400)
 if(!exact.length)return new Map<string,{grantId:string;grantVersion:number;expiresAt:Date}>()
 const rows=await tx.$queryRaw<GrantRow[]>(Prisma.sql`SELECT g.id,g.subject_id,g.issuer_id,g.product,g.scope_id,g.resource_keys,
  g.valid_from,g.expires_at,clock_timestamp() AS read_at,g.version,g.revoked_at,g.parent_grant_id,g.ancestry,g.capabilities,g.delegable_capabilities,g.remaining_delegation_depth
  FROM content_capability_grants g WHERE g.subject_id=${c.principal.userId} AND g.product=${c.entry} AND g.scope_kind='ORGANIZATION'
   AND g.scope_id=${c.organizationId} AND g.resource_kind='material' AND g.resource_keys&&${exact}::text[]
   AND g.capabilities=ARRAY['material.use']::text[] AND g.parent_grant_id IS NULL AND g.ancestry=ARRAY[g.id]::text[]
   AND g.remaining_delegation_depth=0 AND g.delegable_capabilities=ARRAY[]::text[] AND g.revoked_at IS NULL
  ORDER BY g.id ${lock?Prisma.sql`FOR SHARE OF g`:Prisma.empty}`)
 const allowed=new Map<string,{grantId:string;grantVersion:number;expiresAt:Date}>()
 if(!rows.length)return allowed
 // Only a protected write's SHARE locks can wait behind a revoke. Read-only
 // preview/media calls reuse this statement's clock rather than another SQL.
 const clock=lock?(await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`))[0]:{now:new Date(Math.max(...rows.map(row=>row.read_at.getTime())))}
 for(const row of rows){
  if(row.valid_from>clock.now||row.expires_at<=clock.now)continue
  const grant=assertContentGrantChain([grantFromRow(row)],row.id,clock.now)
  for(const resourceKey of grant.scope.resourceKeys)if(exact.includes(resourceKey)&&!allowed.has(resourceKey))allowed.set(resourceKey,{grantId:row.id,grantVersion:row.version,expiresAt:row.expires_at})
 }
 return allowed
}

/** Authorized origins only. The directory is a hint; freeze/publication/START
 * recheck exact use and current source state in their own write transaction. */
export async function listEducationPublicSources(c:PrivateToolContext,raw:unknown){
 const input=educationPublicCatalogQuery.parse(raw)
 const administration=educationCompositionAdministrationForEntry(c.entry,input.responseMode,input.targetKind)
 const respondent=administration.responseMode==='SELF'?'SELF':administration.responseMode==='PARENT_REPORT'?'PARENT':administration.responseMode==='TEACHER_REPORT'?'TEACHER':'OBSERVER'
 return prisma.$transaction(async tx=>{
  await authorizePrivateTool(tx,c)
  // Deduplicate grant keys before the PK joins and paginate/search real source
  // headers in this single statement. No page-size sparse post-filter, no full
  // bodies, deep ancestry reads or per-card runtime materialization.
  const candidates=await tx.$queryRaw<EducationPublicSourceHeader[]>(Prisma.sql`WITH authorized_keys AS (
   SELECT DISTINCT k.key
   FROM content_capability_grants g CROSS JOIN LATERAL unnest(g.resource_keys) k(key)
   WHERE g.subject_id=${c.principal.userId} AND g.product=${c.entry} AND g.scope_kind='ORGANIZATION' AND g.scope_id=${c.organizationId}
    AND g.resource_kind='material' AND g.capabilities=ARRAY['material.use']::text[] AND g.parent_grant_id IS NULL
    AND g.ancestry=ARRAY[g.id]::text[] AND g.remaining_delegation_depth=0 AND g.delegable_capabilities=ARRAY[]::text[]
    AND g.revoked_at IS NULL AND g.valid_from<=clock_timestamp() AT TIME ZONE 'UTC' AND g.expires_at>clock_timestamp() AT TIME ZONE 'UTC'
  ), sources AS (
   SELECT ${educationStandardHeaderColumns} FROM authorized_keys k
    JOIN survey_standard_releases s ON s.id=split_part(k.key,':',3) AND k.key='education-source:STANDARD_SCALE:'||s.id||':'||s.combination_hash
    JOIN measurement_content_releases m ON m.id=s.measurement_release->>'releaseId'
    LEFT JOIN scales native ON native.code=s.snapshot->>'toolKey' AND native.instrument_version=s.snapshot->>'instrumentVersion' AND native.status='PUBLISHED' AND native.instrument_class='STANDARD' AND native.library_entry_id IS NULL
    WHERE s.state='ONLINE' AND m.layer='MEASUREMENT' AND m.family='SCALE' AND m.status='PUBLISHED' AND m.content_hash=s.measurement_release->>'contentHash'
   UNION ALL
   SELECT ${educationFormHeaderColumns} FROM authorized_keys k
    JOIN survey_governed_tools t ON t.id=split_part(k.key,':',3) AND k.key='education-source:FORM:'||t.id||':'||t.snapshot_hash
    WHERE t.family='FORM' AND t.state='ONLINE'
   UNION ALL
   SELECT ${educationCognitiveHeaderColumns} FROM authorized_keys k
    JOIN cognitive_test_configs c ON c.id=split_part(k.key,':',3)
    JOIN measurement_content_releases m ON m.id=c.measurement_release_id AND k.key='education-source:COGNITIVE_CONFIG:'||c.id||':'||m.content_hash
    WHERE c.status='PUBLISHED' AND m.layer='MEASUREMENT' AND m.family='COGNITIVE' AND m.status='PUBLISHED' AND m.scope->>'kind'='PLATFORM'
     AND (c.access_policy='OPEN' OR EXISTS(SELECT 1 FROM material_grants original WHERE original.teacher_id=${c.principal.userId} AND original.resource_type='COGNITIVE_CONFIG' AND original.resource_id=c.id))
   UNION ALL
   SELECT ${educationSjtHeaderColumns} FROM authorized_keys k
    JOIN LATERAL ${educationSjtHeaderSources(Prisma.sql`ARRAY[split_part(k.key,':',3)]`)} ON sjt_source.id=split_part(k.key,':',3)
    JOIN measurement_content_releases m ON m.id=sjt_source.measurement_release_id AND k.key='education-source:SJT_RELEASE:'||sjt_source.id||':'||m.content_hash
    WHERE m.layer='MEASUREMENT' AND m.family='SJT' AND m.status='PUBLISHED' AND m.scope->>'kind'='PLATFORM'
  ) SELECT * FROM sources
   WHERE (${input.cursor??null}::text IS NULL OR key COLLATE "C">${input.cursor??null} COLLATE "C")
    AND (${input.kind??null}::text IS NULL OR kind=${input.kind==='SCALE'?'STANDARD_SCALE':input.kind==='COGNITIVE'?'COGNITIVE_CONFIG':input.kind==='SJT'?'SJT_RELEASE':'FORM'})
    AND (${input.q??''}='' OR strpos(lower(title),lower(${input.q??''}))>0)
   ORDER BY key COLLATE "C" LIMIT 41`)
  const selected=candidates.slice(0,40)
  return {list:selected.map(header=>{
   const declaration=header.kind==='FORM'?educationApplicabilitySchema.safeParse(header.applicability):null
   const native=['COGNITIVE_CONFIG','SJT_RELEASE'].includes(header.kind)
   const applicable=native?administration.responseMode==='SELF'&&['participant_self_report',c.entry==='SCHOOL'?'student_self_report':'teacher_self_report'].includes(header.nativeRespondentType??''):administration.responseMode==='EXPERT_REPORT'?supportsExpertSource(header.expertApplicability,administration)
    &&(header.kind==='FORM'||administration.targetKind==='PERSON'&&header.nativeAvailable&&isNativeExpertObserver(header.nativeRespondentType)&&(header.applicability as {respondentTypes?:string[]}|null)?.respondentTypes?.includes('OBSERVER')):
    header.kind==='STANDARD_SCALE'?header.nativeAvailable&&(administration.responseMode==='STUDENT_REPORT'
     ?supportsStudentStandardSource({nativeRespondentType:header.nativeRespondentType,educationApplicability:header.educationApplicability,applicability:header.applicability})
     :(header.applicability as {respondentTypes?:string[]}|null)?.respondentTypes?.includes(respondent)):declaration?.success&&declaration.data.administrations.some(a=>a.population===administration.population&&a.responseMode===administration.responseMode)
   const requiredContextKeys=educationPublicRequiredContextKeys(header)
   const contextUnavailable=['STUDENT_REPORT','EXPERT_REPORT'].includes(administration.responseMode)&&requiredContextKeys.length>0
   return {
   catalogKey:header.key,kind:header.kind==='STANDARD_SCALE'?'SCALE':header.kind==='COGNITIVE_CONFIG'?'COGNITIVE':header.kind==='SJT_RELEASE'?'SJT':'FORM',sourceProvider:header.kind,sourceId:header.id,contentHash:header.hash,
   title:header.title,language:header.language,versions:header.versions,requiredContextKeys,referenceContextKeys:header.referenceContextKeys,sourceLabel:'获授权公共固定版本',
   allowedActions:applicable&&!contextUnavailable?['REFERENCE_FIXED_VERSION']:[],runtimeStatus:native?'CHECK_EXACT_NATIVE_AT_FREEZE':header.kind==='FORM'?'CHECK_EXACT_FORM_AT_FREEZE':header.nativeAvailable?'CHECK_EXACT_STANDARD_AT_FREEZE':'NATIVE_UNAVAILABLE',canEditOriginal:false,canDistribute:false,
   ...(native&&!applicable?{unavailableReason:'认知与 SJT 仅支持原生本人作答，不能用于他评。'}:{}),
   ...(header.kind==='STANDARD_SCALE'&&!applicable?{unavailableReason:header.nativeAvailable?'该版本未声明支持当前作答方式。':'原生量表尚未安装或已停止使用；授权不会创建执行程序。'}:{}),
   ...(header.kind==='FORM'&&!applicable?{unavailableReason:'该固定版本未声明适用于当前问卷的施测方式。'}:{}),
   ...(contextUnavailable?{unavailableReason:administration.responseMode==='EXPERT_REPORT'?'该版本需要受评教师的个人背景；当前专家观察不能用专家背景代替，原版内容与参数保持不变。':'该版本需要受评教师的个人背景才能计分，当前学生评教暂不支持。原版内容与参数保持不变。'}:{}),
  }}),nextCursor:candidates.length>40?selected.at(-1)!.key:null}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
}
