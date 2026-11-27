import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {educationNativeBundleSchema} from '../bundle-product/education-identity'
import {educationCognitiveProfileHeaderJoins} from '../education-tools/public-source.headers'
import {authorizeToolPublication,isExpandedToolLicensingEnabled,isToolLicensingEnabled,ToolLicenseAccessError} from '../tool-licensing/runtime'
import type {RunResourcePolicy} from './resourceAuthority'

type Product='SCHOOL'|'TEACHER'
type Track={id:string;resourceKey:string;resourceVersion?:string;resourcePolicy:RunResourcePolicy}
type SourceInput={product:Product;organizationId:string;tracks:readonly Track[]}
type FrozenLeaf={id:string;resourceKey:string;manifestHash:string;origin:unknown;leafCount:number;position:number;
 profileArtifactHash:string|null;sourceProvider:string|null;kind:string|null;versionId:string|null;contentHash:string|null;toolKey:string|null}
type FrozenDelivery={id:string;product:string;organizationId:string;originProduct:string;originOrganizationId:string;originId:string;
 runtimeId:string;originRuntimeId:string;runtimeHash:string;originRuntimeHash:string;family:string;provider:string|null;
 nativeBundle:unknown;versionId:string|null;contentHash:string|null;toolKey:string|null;
 standaloneMatches:boolean|null;sourceKind:string|null}
export type EducationPublicationTool={trackId:string;key:string}
const prefix=(family:string,key:string)=>key.startsWith(family+':')?key:family+':'+key
const sourceFamilies:Record<string,string>={STANDARD_SCALE:'SCALE',PUBLIC_FORM:'FORM',COGNITIVE_CONFIG:'COGNITIVE',SJT_RELEASE:'SJT',LIBRARY_SCALE:'SCALE'}

/** Metadata only, after the real publisher has checked and locked the source.
 * Resolve immutable versions, never latest releases or private UUIDs. Private
 * leaves stay private; whole packages are not billed again by internal leaf.
 * No respondent path calls this resolver.
 */
export async function resolveEducationPublicationTools(tx:Prisma.TransactionClient,input:SourceInput):Promise<EducationPublicationTool[]>{
 const expanded=isExpandedToolLicensingEnabled(input.product)
 if(input.tracks.length>128){
  if(!expanded)return []
  throw new ToolLicenseAccessError('本次发布的工具数量超过可核对范围')
 }
 const compositions=input.tracks.filter(track=>track.resourceKey.startsWith('education-composition:')
  &&(expanded||track.resourcePolicy.educationComposition?.origin.variantKey!=='TEACHER:STUDENT_REPORT'))
 const deliveries=expanded?input.tracks.filter(track=>track.resourceKey.startsWith('education-assessment:')):[]
 const library=expanded?input.tracks.filter(track=>track.resourceKey.startsWith('library-scale:')):[]
 if(!expanded&&compositions.length!==input.tracks.length)return []
 const result:EducationPublicationTool[]=[]
 if(compositions.length){
  if(compositions.some(track=>!track.resourcePolicy.educationComposition||track.resourcePolicy.runtimeLaunchTarget?.kind!=='COMPOSITE'))
   throw new ToolLicenseAccessError('冻结教育问卷缺少可核对的运行身份')
  const ids=[...new Set(compositions.map(track=>track.resourcePolicy.runtimeLaunchTarget!.ref))].sort()
  const rows=await tx.$queryRaw<FrozenLeaf[]>(Prisma.sql`
   SELECT c.id,c.creation_key AS "resourceKey",c.training_content_snapshot_hash AS "manifestHash",
    c.training_content_snapshot#>'{educationBinding,origin}' AS origin,
    CASE WHEN jsonb_typeof(c.training_content_snapshot#>'{educationBinding,manifest}')='array'
     THEN jsonb_array_length(c.training_content_snapshot#>'{educationBinding,manifest}') ELSE -1 END AS "leafCount",
    leaf.value->>'profileArtifactHash' AS "profileArtifactHash",leaf.position::int AS position,leaf.value->>'sourceProvider' AS "sourceProvider",leaf.value->>'kind' AS kind,
    leaf.value->>'versionId' AS "versionId",leaf.value->>'contentHash' AS "contentHash",
    CASE leaf.value->>'sourceProvider'
     WHEN 'STANDARD_SCALE' THEN s.tool_key WHEN 'PUBLIC_FORM' THEN f.tool_key
     WHEN 'COGNITIVE_CONFIG' THEN profile.test_type
     WHEN 'SJT_RELEASE' THEN CASE WHEN sm.id IS NOT NULL AND (sjt.id IS NULL OR mapping.id IS NULL)
      THEN COALESCE(sjt.instrument_key,mapping.instrument_key) END
     WHEN 'LIBRARY_SCALE' THEN lm.content_key END AS "toolKey"
   FROM composite_assessments c
   LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.training_content_snapshot#>'{educationBinding,manifest}')='array'
    THEN c.training_content_snapshot#>'{educationBinding,manifest}' ELSE '[]'::jsonb END) WITH ORDINALITY leaf(value,position) ON true
   LEFT JOIN survey_standard_releases s ON leaf.value->>'sourceProvider'='STANDARD_SCALE'
    AND s.id=leaf.value->>'versionId' AND s.combination_hash=leaf.value->>'contentHash'
   LEFT JOIN survey_governed_tools f ON leaf.value->>'sourceProvider'='PUBLIC_FORM' AND f.family='FORM'
    AND f.id=leaf.value->>'versionId' AND f.snapshot_hash=leaf.value->>'contentHash'
   LEFT JOIN LATERAL (
    SELECT c.test_type FROM (SELECT 1) anchor ${educationCognitiveProfileHeaderJoins(input.product)}
    WHERE leaf.value->>'sourceProvider'='COGNITIVE_CONFIG' AND c.id=leaf.value->>'versionId'
     AND p.fingerprint=leaf.value->>'profileArtifactHash' AND m.content_hash=leaf.value->>'contentHash'
    LIMIT 1
   ) profile ON true
   LEFT JOIN sjt_author_releases sjt ON leaf.value->>'sourceProvider'='SJT_RELEASE' AND sjt.id=leaf.value->>'versionId'
   LEFT JOIN static_sjt_measurement_mappings mapping ON leaf.value->>'sourceProvider'='SJT_RELEASE' AND mapping.id=leaf.value->>'versionId'
   LEFT JOIN measurement_content_releases sm ON sm.id=COALESCE(sjt.measurement_release_id,mapping.measurement_release_id)
    AND sm.family='SJT' AND sm.content_hash=leaf.value->>'contentHash'
   LEFT JOIN scale_library_entries library ON leaf.value->>'sourceProvider'='LIBRARY_SCALE' AND library.id=leaf.value->>'versionId'
   LEFT JOIN scale_library_submissions submission ON submission.id=library.submission_id AND submission.snapshot_hash=leaf.value->>'contentHash'
   LEFT JOIN measurement_content_releases lm ON submission.id IS NOT NULL AND lm.id=library.release_id AND lm.family='SCALE'
   WHERE c.id=ANY(${ids}::text[]) ORDER BY c.id,leaf.position
  `)
  const byId=new Map<string,FrozenLeaf[]>()
  for(const row of rows){const leaves=byId.get(row.id)??[];leaves.push(row);byId.set(row.id,leaves)}
  if(byId.size!==ids.length)throw new ToolLicenseAccessError('冻结教育工具来源缺失，无法核对发布授权')
  for(const track of compositions){
   const leaves=byId.get(track.resourcePolicy.runtimeLaunchTarget!.ref)!,binding=track.resourcePolicy.educationComposition!
   const first=leaves[0]
   if(first.resourceKey!==track.resourceKey||first.manifestHash!==binding.manifestHash
    ||binding.origin.entry!==input.product||binding.origin.organizationId!==input.organizationId
    ||canonicalHash(first.origin)!==canonicalHash(binding.origin))
    throw new ToolLicenseAccessError('冻结教育工具来源与本次学校或入口不一致')
   // Keep the old flag's exact single-standard pilot boundary. Only the new
   // expanded flag opts existing mixed/private workflows into public billing.
   if(!expanded&&(first.leafCount!==1||first.sourceProvider!=='STANDARD_SCALE'||first.kind!=='SCALE'))return []
   if(!Number.isInteger(first.leafCount)||first.leafCount<1||first.leafCount>50||leaves.length!==first.leafCount
    ||new Set(leaves.map(leaf=>leaf.position)).size!==first.leafCount)
    throw new ToolLicenseAccessError('冻结教育问卷的单元清单不完整')
   for(const leaf of leaves){
    if(leaf.sourceProvider==='PRIVATE_VERSION'||(leaf.sourceProvider==='COGNITIVE_CONFIG'&&leaf.profileArtifactHash===null))continue
    const family=sourceFamilies[leaf.sourceProvider??'']
    if(!family||family!==leaf.kind)throw new ToolLicenseAccessError('冻结教育问卷的公共工具类型无法核对')
    if(!expanded&&leaf.sourceProvider!=='STANDARD_SCALE')continue
    if(!leaf.versionId||!leaf.contentHash||!leaf.toolKey?.trim())throw new ToolLicenseAccessError('冻结公共工具版本缺少精确的稳定身份')
    result.push({trackId:track.id,key:leaf.sourceProvider==='STANDARD_SCALE'?'SCALE:'+leaf.toolKey:prefix(family,leaf.toolKey)})
   }
  }
 }
 if(library.length){
  const rows=await tx.$queryRaw<Array<{trackId:string;contentKey:string}>>(Prisma.sql`
   SELECT wanted.id AS "trackId",m.content_key AS "contentKey"
   FROM (VALUES ${Prisma.join(library.map(track=>Prisma.sql`
    (${track.id}::text,${track.resourceKey}::text,${track.resourceVersion??null}::text)
   `))}) AS wanted(id,resource_key,resource_version)
   JOIN registered_assessment_resources r ON r.resource_key=wanted.resource_key
    AND r.resource_version=wanted.resource_version AND r.status='PUBLISHED'
   JOIN measurement_content_releases m ON m.id=r.entry#>>'{libraryOrigin,releaseId}'
    AND m.content_hash=r.entry#>>'{libraryOrigin,contentHash}' AND m.layer='MEASUREMENT' AND m.family='SCALE'
   WHERE r.entry#>>'{libraryOrigin,product}'=${input.product}
  `)
  if(rows.length!==library.length||rows.some(row=>!row.contentKey))
   throw new ToolLicenseAccessError('冻结共用量表缺少精确的商业工具来源')
  for(const row of rows)result.push({trackId:row.trackId,key:prefix('SCALE',row.contentKey)})
 }
 if(deliveries.length){
  if(deliveries.some(track=>track.resourcePolicy.runtimeLaunchTarget?.kind!=='COMPOSITE'))
   throw new ToolLicenseAccessError('冻结教育测评缺少可核对的运行身份')
  const ids=deliveries.map(track=>track.resourceKey.split(':')[3])
  const rows=await tx.$queryRaw<FrozenDelivery[]>(Prisma.sql`
   SELECT d.id,d.product,d.organization_id AS "organizationId",d.family,d.runtime_composite_id AS "runtimeId",
    d.entry#>>'{educationOrigin,product}' AS "originProduct",d.entry#>>'{educationOrigin,organizationId}' AS "originOrganizationId",
    d.entry#>>'{educationOrigin,resourceId}' AS "originId",d.entry#>>'{educationOrigin,runtimeCompositeId}' AS "originRuntimeId",
    d.entry#>>'{educationOrigin,runtimeSnapshotHash}' AS "originRuntimeHash",runtime.training_content_snapshot_hash AS "runtimeHash",
    d.entry#>'{educationOrigin,nativeBundle}' AS "nativeBundle",d.entry#>>'{educationOrigin,publicPackage,sourceRef,provider}' AS provider,
    d.entry#>>'{educationOrigin,publicPackage,sourceRef,versionId}' AS "versionId",
    d.entry#>>'{educationOrigin,publicPackage,sourceRef,contentHash}' AS "contentHash",
    actual.id IS NOT NULL AND frozen.unit->>'itemId'=frozen.origin_unit->>'itemId'
      AND frozen.unit->>'family'=frozen.origin_unit->>'family'
      AND frozen.unit->'measurement'=frozen.origin_unit->'measurement' AS "standaloneMatches",
    frozen.unit#>>'{source,kind}' AS "sourceKind",
    CASE d.family WHEN 'BUNDLE' THEN p."bundleKey" WHEN 'COGNITIVE' THEN profile.test_type
      WHEN 'SITUATIONAL' THEN COALESCE(author.instrument_key,mapping.instrument_key) END AS "toolKey"
   FROM education_assessment_deliveries d
   JOIN composite_assessments runtime ON runtime.id=d.runtime_composite_id
   LEFT JOIN bundle_package_releases p ON d.entry#>>'{educationOrigin,publicPackage,sourceRef,provider}'='NATIVE_RELEASE'
    AND p.id=d.entry#>>'{educationOrigin,publicPackage,sourceRef,versionId}'
    AND p."contentHash"=d.entry#>>'{educationOrigin,publicPackage,sourceRef,contentHash}' AND p.status='PUBLISHED'
   LEFT JOIN LATERAL (
    SELECT runtime.training_content_snapshot#>'{units,0}' AS unit,d.entry#>'{educationOrigin,units,0}' AS origin_unit
    WHERE d.family IN ('COGNITIVE','SITUATIONAL')
     AND runtime.training_content_snapshot#>'{units,1}' IS NULL
     AND d.entry#>'{educationOrigin,units,1}' IS NULL
   ) frozen ON true
   LEFT JOIN measurement_content_releases actual ON actual.id=frozen.unit#>>'{measurement,releaseId}'
    AND actual.content_hash=frozen.unit#>>'{measurement,contentHash}'
    AND actual.content->>'measurementHash'=frozen.unit#>>'{measurement,measurementHash}'
    AND actual.family=frozen.unit->>'family'
    AND actual.family=CASE d.family WHEN 'SITUATIONAL' THEN 'SJT' ELSE d.family END
    AND actual.layer='MEASUREMENT' AND actual.status='PUBLISHED'
   LEFT JOIN LATERAL (
    SELECT c.test_type FROM (SELECT 1) anchor ${educationCognitiveProfileHeaderJoins(input.product)}
    WHERE d.family='COGNITIVE' AND frozen.unit#>>'{source,kind}'='COGNITIVE_CONFIG'
     AND c.id=frozen.unit#>>'{source,id}' AND p.fingerprint=frozen.unit#>>'{source,cognitiveProfile,artifactHash}'
     AND m.id=actual.source_release_id AND actual.scope->>'kind'='PRIVATE'
     AND actual.scope->>'ownerId'=frozen.unit#>>'{source,ownerId}'
     AND actual.scope->>'resourceId'=frozen.unit#>>'{source,assignmentId}'
     AND actual.provenance->>'configId'=c.id
     AND actual.provenance->>'assignmentId'=frozen.unit#>>'{source,assignmentId}'
     AND actual.provenance->>'profileArtifactHash'=p.fingerprint
     AND actual.provenance->>'profile'=e.metadata#>>'{configuration,profile}'
     AND actual.provenance->>'resolvedConfigHash'=e.metadata#>>'{configuration,resolvedConfigHash}'
     AND NOT EXISTS(SELECT 1 FROM scale_library_emergency_stops stop
      WHERE stop.target_kind='RELEASE' AND stop.target_id IN (m.id,actual.id))
    LIMIT 1
   ) profile ON true
   LEFT JOIN sjt_author_releases author ON d.family='SITUATIONAL'
    AND frozen.unit#>>'{source,kind}'='SJT_AUTHOR_RELEASE' AND author.id=frozen.unit#>>'{source,id}'
    AND author.author_id=frozen.unit#>>'{source,ownerId}' AND author.status='PUBLISHED'
    AND (author.authorization_policy IS NULL OR author.authorization_policy='COURSE_GRANT_V1')
    AND author.measurement_release_id=actual.id AND actual.scope->>'kind'='PLATFORM'
    AND author.instrument_key=frozen.unit#>>'{source,instrumentKey}'
    AND author.instrument_version=frozen.unit#>>'{source,instrumentVersion}'
    AND COALESCE(author.package#>>'{definition,respondentType}',actual.content#>>'{executable,respondentType}')
     IN ('participant_self_report',${input.product==='SCHOOL'?'student_self_report':'teacher_self_report'})
    AND NOT EXISTS(SELECT 1 FROM scale_library_emergency_stops stop WHERE stop.target_kind='RELEASE' AND stop.target_id=actual.id)
   LEFT JOIN static_sjt_measurement_mappings mapping ON d.family='SITUATIONAL'
    AND frozen.unit#>>'{source,kind}'='STATIC_SJT_REGISTRY' AND mapping.id=frozen.unit#>>'{source,id}'
    AND mapping.deployment_hash IS NOT NULL AND mapping.measurement_release_id=actual.id AND actual.scope->>'kind'='PLATFORM'
    AND mapping.instrument_key=frozen.unit#>>'{source,instrumentKey}'
    AND mapping.instrument_version=frozen.unit#>>'{source,instrumentVersion}'
    AND actual.content#>>'{executable,respondentType}'
     IN ('participant_self_report',${input.product==='SCHOOL'?'student_self_report':'teacher_self_report'})
    AND NOT EXISTS(SELECT 1 FROM scale_library_emergency_stops stop WHERE stop.target_kind='RELEASE' AND stop.target_id=actual.id)
   WHERE d.id=ANY(${[...new Set(ids)].sort()}::text[]) AND d.status='PUBLISHED' ORDER BY d.id
  `)
  const byId=new Map(rows.map(row=>[row.id,row]))
  for(const track of deliveries){
   const row=byId.get(track.resourceKey.split(':')[3])
   if(!row||track.resourceKey!=='education-assessment:'+input.product+':'+input.organizationId+':'+row.id
    ||row.product!==input.product||row.originProduct!==input.product||row.organizationId!==input.organizationId
    ||row.originOrganizationId!==input.organizationId||row.originId!==row.id||row.runtimeId!==row.originRuntimeId
    ||row.runtimeId!==track.resourcePolicy.runtimeLaunchTarget!.ref||row.runtimeHash!==row.originRuntimeHash)
    throw new ToolLicenseAccessError('冻结教育测评来源与本次学校或入口不一致')
   if(row.family==='BUNDLE'){
    if(row.provider!=='NATIVE_RELEASE')continue
    if(!educationNativeBundleSchema.safeParse(row.nativeBundle).success||!row.versionId||!row.contentHash||!row.toolKey?.trim())
     throw new ToolLicenseAccessError('冻结原生整包版本缺少精确的稳定身份')
    result.push({trackId:track.id,key:prefix('BUNDLE',row.toolKey)})
   }else if(row.family==='SITUATIONAL'){
    if(!row.standaloneMatches||!['SJT_AUTHOR_RELEASE','STATIC_SJT_REGISTRY'].includes(row.sourceKind??'')||!row.toolKey?.trim())
     throw new ToolLicenseAccessError('独立情境测评缺少可授权的精确版本')
    result.push({trackId:track.id,key:'SJT:'+row.toolKey})
   }else if(row.family==='COGNITIVE'){
    if(!row.standaloneMatches||row.sourceKind!=='COGNITIVE_CONFIG')
     throw new ToolLicenseAccessError('独立认知测评的冻结配置与发布来源不一致')
    // The approved artifact must match the frozen pin. Legacy assignments may
    // use the same test type or config without that exact product approval.
    if(row.toolKey?.trim())result.push({trackId:track.id,key:'COGNITIVE:'+row.toolKey})
   }
  }
 }
 if(!expanded&&new Set(result.map(item=>item.key)).size!==1)return []
 return [...new Map(result.map(item=>[item.trackId+'\u0000'+item.key,item])).values()]
}

/** Existing name keeps one publishing integration point. */
export async function authorizeEducationStandardPublication(tx:Prisma.TransactionClient,input:{
 product:Product|null;organizationId:string;runId:string;tracks:readonly Track[];
 closesAt:Date|null;maxResponses?:number;frozenResponses:number;trackResponseCounts?:ReadonlyMap<string,number>
}){
 const product=input.product
 if(!product||!isToolLicensingEnabled(product)||!input.tracks.length)return false
 const tools=await resolveEducationPublicationTools(tx,{...input,product})
 if(!tools.length)return false
 const keys=[...new Set(tools.map(tool=>tool.key))].sort()
 const allocations=input.trackResponseCounts?keys.map(key=>{
  const trackIds=tools.filter(tool=>tool.key===key).map(tool=>tool.trackId).sort()
  let quantity=0
  for(const id of trackIds){
   const count=input.trackResponseCounts!.get(id)
   if(count===undefined||!Number.isSafeInteger(count)||count<0)throw new ToolLicenseAccessError('冻结工具的作答名额缺失')
   quantity+=count
  }
  return {key,quantity,trackIds}
 }):undefined
 if(!allocations&&(keys.length!==1||new Set(tools.map(tool=>tool.trackId)).size!==input.tracks.length))
  throw new ToolLicenseAccessError('多工具发布缺少逐工具冻结名额，请重新预览')
 await authorizeToolPublication(tx,{
  product,subjectId:input.organizationId,publicationId:input.runId,toolKeys:keys,
  education:{closesAt:input.closesAt,maxResponses:input.maxResponses,frozenResponses:input.frozenResponses,...(allocations?{allocations}:{})},
 })
 return true
}
