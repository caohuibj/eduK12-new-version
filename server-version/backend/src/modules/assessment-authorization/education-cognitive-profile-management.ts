import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {AdminPermissionError} from '../admin-permissions/service'
import {assertEducationConfigurationManager,educationConfigurationDistributionRoots} from './education-standard-management'
import {readApprovedCognitiveProfileArtifact} from './cognitive-profile-approved-source'
import type {EducationConfigurationScope} from './education-standard-use'
import {educationCognitiveProfileHeaderJoins} from '../education-tools/public-source.headers'
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
 const input=query.parse(raw),size=25
 return prisma.$transaction(async tx=>{
  await assertEducationConfigurationManager(tx,actorId,scope)
  const rows=await tx.$queryRaw<Array<{configId:string;title:string;profile:string;artifactHash:string;configuration:unknown;authorities:unknown[]}>>(Prisma.sql`SELECT c.id AS "configId",c.name AS title,e.metadata#>>'{configuration,profile}' AS profile,p.fingerprint AS "artifactHash",e.metadata->'configuration' AS configuration,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'version',r.version,'validFrom',r.valid_from AT TIME ZONE 'UTC','expiresAt',r.expires_at AT TIME ZONE 'UTC')) FROM (${educationConfigurationDistributionRoots(actorId,scope,Prisma.sql`m.id`)} ORDER BY g.id LIMIT 129) r),'[]'::jsonb) AS authorities
   FROM (SELECT 1) anchor ${educationCognitiveProfileHeaderJoins(scope.product)}
   WHERE EXISTS(${educationConfigurationDistributionRoots(actorId,scope,Prisma.sql`m.id`)}) AND (${input.q}='' OR strpos(lower(c.name),lower(${input.q}))>0 OR strpos(lower(c.test_type),lower(${input.q}))>0)
   ORDER BY c.id,p.fingerprint LIMIT ${size+1} OFFSET ${(input.page-1)*size}`)
  return {page:input.page,hasMore:rows.length>size,list:rows.slice(0,size).map(row=>({...row,assignable:row.authorities.length>0&&row.authorities.length<=128,authorities:row.authorities.length<=128?row.authorities:[]}))}
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
