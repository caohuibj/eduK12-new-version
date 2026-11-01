import {catalogDiscoveryRecords,discoveryPageSql,discoveryJoin} from '../survey/catalog-discovery'
import {catalogDiscoveryQueryFields,catalogTagFacets,type CatalogClassificationTag} from '../scale/library/catalog-discovery'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {AdminPermissionError} from '../admin-permissions/service'
import {assertEducationConfigurationManager,educationConfigurationDistributionRoots} from './education-standard-management'
import {readApprovedCognitiveProfileArtifact} from './cognitive-profile-approved-source'
import type {EducationConfigurationScope} from './education-standard-use'
import {EDUCATION_STANDARD_USE_ACTION} from './education-standard-use'
import {listEducationAuthoringMemberCandidates} from '../organization/educationProductAccess'
const query=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),q:z.string().trim().max(120).default('')}).strict()
const options={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:15000}
async function selected(tx:Prisma.TransactionClient,actorId:string,scope:EducationConfigurationScope,configId:string,profile:unknown,artifactHash:string){
 await assertEducationConfigurationManager(tx,actorId,scope)
 const source=await readApprovedCognitiveProfileArtifact(tx,configId,profile,artifactHash,scope.product)
 const roots=await tx.$queryRaw<Array<{id:string;version:number;validFrom:Date;expiresAt:Date}>>(Prisma.sql`SELECT r.id,r.version,r.valid_from AS "validFrom",r.expires_at AS "expiresAt" FROM (${educationConfigurationDistributionRoots(actorId,scope,Prisma.sql`${source.artifact.identity.measurement.releaseId}`)}) r ORDER BY r.id LIMIT 129`)
 if(!roots.length||roots.length>128)throw new AdminPermissionError(403,'当前缺少本校、本来源的明确精确分发委托')
 return {...source,roots}
}
export async function educationCognitiveProfileManagementCatalog(actorId:string,scope:EducationConfigurationScope,raw:unknown){
 const input=query.extend(catalogDiscoveryQueryFields).parse(raw),size=25,records=catalogDiscoveryRecords()
 return prisma.$transaction(async tx=>{
  await assertEducationConfigurationManager(tx,actorId,scope)
  const [catalog]=await tx.$queryRaw<Array<{facetTags:CatalogClassificationTag[];list:Array<{configId:string;title:string;profile:string;artifactHash:string;configuration:unknown;available:boolean;authorities:unknown[];classificationTags:CatalogClassificationTag[]}>}>>(discoveryPageSql({source:Prisma.sql`WITH approvals AS (
   SELECT DISTINCT ON (resource_id,metadata->>'artifactHash') resource_id,metadata FROM assessment_management_events
   WHERE action='COGNITIVE_PROFILE_APPROVED' AND metadata->>'artifactFormatVersion'='2' ORDER BY resource_id,metadata->>'artifactHash',id
  ), headers AS (SELECT c.test_type AS search_key,discovery.ids,discovery.terms,COALESCE(discovery.tags,'[]'::jsonb) AS "classificationTags",e.resource_id AS "configId",COALESCE(c.name,'原认知测验') AS title,e.metadata#>>'{configuration,profile}' AS profile,e.metadata->>'artifactHash' AS "artifactHash",e.metadata->'configuration' AS configuration,
   COALESCE(c.status='PUBLISHED' AND c.measurement_release_id=m.id AND m.layer='MEASUREMENT' AND m.family='COGNITIVE' AND m.status='PUBLISHED'
    AND m.scope->>'kind'='PLATFORM' AND m.content_hash=e.metadata#>>'{configuration,measurement,contentHash}' AND t.template_hash IS NOT NULL AND p.decision='APPROVED' AND NOT p.paused,false) AS available,
   EXISTS(SELECT 1 FROM content_capability_grants own JOIN assessment_management_events issuance ON issuance.id=own.id AND issuance.action=${EDUCATION_STANDARD_USE_ACTION}
    WHERE own.issuer_id=${actorId} AND own.product=${scope.product} AND own.scope_kind='ORGANIZATION' AND own.scope_id=${scope.organizationId}
     AND issuance.actor_id=${actorId} AND issuance.resource_id=e.resource_id AND issuance.metadata->>'artifactHash'=e.metadata->>'artifactHash'
     AND issuance.metadata#>>'{selectedBinding,binding,configuration,kind}'='COGNITIVE_PROFILE') AS "ownIssued",
   COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'version',r.version,'validFrom',r.valid_from AT TIME ZONE 'UTC','expiresAt',r.expires_at AT TIME ZONE 'UTC')) FROM (${educationConfigurationDistributionRoots(actorId,scope,Prisma.sql`m.id`)} ORDER BY g.id LIMIT 129) r),'[]'::jsonb) AS authorities
   FROM approvals e LEFT JOIN cognitive_test_configs c ON c.id=e.resource_id
   LEFT JOIN measurement_content_releases m ON m.id=e.metadata#>>'{configuration,measurement,releaseId}'
   LEFT JOIN assessment_public_templates t ON t.template_hash=e.metadata->>'artifactHash' AND t.template_kind='COGNITIVE_PROFILE_CONFIGURATION'
   LEFT JOIN survey_tool_policies p ON p.product=${scope.product} AND p.resource_key='cognitive-profile:'||e.resource_id||':'||(e.metadata#>>'{configuration,profile}') AND p.fingerprint=e.metadata->>'artifactHash'
   ${discoveryJoin(records,{kind:Prisma.sql`'COGNITIVE'`,key:Prisma.sql`c.test_type`,version:Prisma.sql`NULL`,engine:Prisma.sql`c.engine_version`,scoring:Prisma.sql`c.scoring_version`})}
   )
   SELECT ids,terms,search_key,"configId",title,profile,"artifactHash",configuration,available,authorities,"classificationTags" FROM headers
   WHERE (available AND jsonb_array_length(authorities)>0) OR "ownIssued"
   `,filters:{...input,keyword:[input.q,input.keyword].filter(Boolean).join(' ')},text:[Prisma.sql`v.title`,Prisma.sql`v.search_key`],order:Prisma.sql`v."configId",v."artifactHash"`,limit:size+1,offset:(input.page-1)*size}))
  const rows=catalog.list
  return {page:input.page,hasMore:rows.length>size,tagFacets:catalogTagFacets([catalog.facetTags]),list:rows.slice(0,size).map(({available,search_key:_searchKey,...row}:typeof rows[number]&{search_key?:string})=>({...row,assignable:available&&row.authorities.length>0&&row.authorities.length<=128,authorities:available&&row.authorities.length<=128?row.authorities:[],
   unavailableReason:!available?'原配置已停止新增分发或当前入口未批准':!row.authorities.length?'当前缺少本校、本来源的精确分发委托':row.authorities.length>128?'精确分发委托过多，请整理后选择':null}))}
 },options)
}
export async function educationCognitiveProfileManagementRecipients(actorId:string,scope:EducationConfigurationScope,configId:string,profile:unknown,artifactHash:string,raw:unknown){
 const input=query.parse(raw)
 return prisma.$transaction(async tx=>{
  await selected(tx,actorId,scope,configId,profile,artifactHash)
  return listEducationAuthoringMemberCandidates({product:scope.product==='SCHOOL'?'HUISCHOOL':'HUITEACHER',organizationId:scope.organizationId,...input},tx)
 },options)
}
export async function educationCognitiveProfileManagementPreview(actorId:string,scope:EducationConfigurationScope,configId:string,profile:unknown,artifactHash:string){
 return prisma.$transaction(async tx=>{
  const {artifact}=await selected(tx,actorId,scope,configId,profile,artifactHash),report=artifact.resolvedReport
  return {configId,profile:artifact.identity.profile,artifactHash,configuration:artifact.identity,reportStyle:{title:report.reportDefinition.title,caveats:report.reportCaveats,disclaimer:report.reportDefinition.disclaimer,
   headline:report.reportDefinition.primaryMetrics.map(key=>({key,label:report.metricDefinitions[key]?.label??key})),detail:report.reportDefinition.secondaryMetrics.map(key=>({key,label:report.metricDefinitions[key]?.label??key}))}}
 },options)
}
