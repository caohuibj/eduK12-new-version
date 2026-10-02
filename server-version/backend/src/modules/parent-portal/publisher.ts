import { readExactReportingSeriesWavesBatch } from '../reporting/series'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import { canonicalHash } from '../assessment-runtime/canonical'
import { readReportingArtifactRecord } from '../reporting/artifact'
import { getPublishedReportingSpec } from '../reporting/spec'
import { assertProtectedFeedbackManagerAccess,protectedFeedbackSubjectScope } from '../reporting/protectedFeedback'
import { assertIndividualLongitudinalAccess,individualSubjectScope } from '../reporting/individualAuthorization'
import { governedArtifactMetrics } from '../reporting/governedDisclosure'
import type { ReportingArtifactRecord } from '../reporting/types'
import { assertDisclosureOfficer } from './authorization'
import { assertParentToolCeiling } from './tool-policy'
import { fail,parentToolRefSchema } from './contracts'
import { buildParentProjection,parentTemplateRegistry } from './templates'
type Actor=Pick<AuthenticatedPrincipal,'userId'|'role'|'platformRole'>
type Tx=Prisma.TransactionClient
async function toolRef(tx:Tx,record:ReportingArtifactRecord){
 if(record.analysisKind==='PROTECTED_FEEDBACK')return parentToolRefSchema.parse(record.artifactPayload.resource)
 if(record.analysisKind!=='INDIVIDUAL_LONGITUDINAL')return fail('PARENT_SOURCE_UNSUPPORTED')
 const waves=await readExactReportingSeriesWavesBatch({organizationId:record.organizationId,seriesId:record.seriesId,bindings:record.artifactPayload.waveBindings},tx)
 if(waves.length<2)fail('PARENT_TOOL_PROVENANCE_UNAVAILABLE')
 const refs=waves.map(w=>{const v=w.inputManifest.resource;return parentToolRefSchema.parse({family:v.family,key:v.key,version:v.version})})
 if(refs.some(r=>canonicalHash(r)!==canonicalHash(refs[0])))fail('PARENT_TOOL_PROVENANCE_UNAVAILABLE')
 return refs[0]
}
export function createParentPublisher(db=prisma,registry=parentTemplateRegistry){
 const run=<T>(operation:(tx:Tx)=>Promise<T>)=>db.$transaction(operation,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})
 async function prepare(tx:Tx,actor:Actor,artifactId:string,key:string,version:string){
  const record=await readReportingArtifactRecord(artifactId,tx)
  if(!['PROTECTED_FEEDBACK','INDIVIDUAL_LONGITUDINAL'].includes(record.analysisKind))fail('PARENT_SOURCE_UNSUPPORTED')
  const subjectUserId=record.analysisKind==='PROTECTED_FEEDBACK'?record.artifactPayload.source.subjectUserId:record.analysisKind==='INDIVIDUAL_LONGITUDINAL'?record.subjectUserId:fail()
  await assertDisclosureOfficer(tx,actor,record.organizationId)
  if(record.analysisKind==='PROTECTED_FEEDBACK')await assertProtectedFeedbackManagerAccess({principal:actor,organizationId:record.organizationId,subjectUserId,tx})
  else await assertIndividualLongitudinalAccess({principal:actor,organizationId:record.organizationId,subjectUserId,tx})
  const subjects=await tx.$queryRaw<Array<{id:string}>>`SELECT u.id FROM users u JOIN organization_memberships m ON m.user_id=u.id JOIN organizations o ON o.id=m.organization_id WHERE u.id=${subjectUserId} AND u.role='STUDENT' AND u.is_active=true AND u.is_frozen=false AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp()) AND m.organization_id=${record.organizationId} AND o.status='ACTIVE' AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp()) AND NOT EXISTS(SELECT 1 FROM organization_access_denies d WHERE d.organization_id=m.organization_id AND d.user_id=u.id AND d.lifted_at IS NULL AND (d.permission IN ('*','REPORT_READ','PARENT_REPORT_READ') OR d.permission=${record.policyDomain})) LIMIT 1 FOR SHARE OF u,m,o`
  if(!subjects.length)fail()
  const spec=await getPublishedReportingSpec(record.specId,tx)
  if(spec.specHash!==record.artifactPayload.specHash||spec.definition.analysisKind!==record.analysisKind)fail('PARENT_SOURCE_INTEGRITY',409)
  const ref=await toolRef(tx,record),template=registry.resolve(key,version,ref)
  if(template.mode==='EDUCATIONAL_SUMMARY'){
   const allowed=await governedArtifactMetrics({artifact:record,principal:actor,individual:record.analysisKind==='INDIVIDUAL_LONGITUDINAL',tx})
   for(const m of template.metrics){if(allowed&&!allowed.includes(m.metricId))fail('PARENT_SOURCE_DISCLOSURE_UNAVAILABLE');if(!spec.definition.metricRules.some(r=>r.metricId===m.metricId&&'sourceFamily'in r&&'sourceResourceKey'in r&&r.sourceFamily===ref.family&&r.sourceResourceKey===ref.key&&r.sourceMetricKey===m.sourceMetricKey&&(record.analysisKind!=='PROTECTED_FEEDBACK'||(m.aggregation&&'aggregations'in r&&r.aggregations.includes(m.aggregation)))&&(!m.longitudinal||('longitudinalMetricKey'in r&&r.longitudinalMetricKey===m.sourceMetricKey))))fail('PARENT_TEMPLATE_METRIC_MISMATCH')}
  }
  const projection=buildParentProjection(record,subjectUserId,template)
  await assertParentToolCeiling(tx,projection)
  const proposal={artifactId,sourceHash:record.snapshotHash,organizationId:record.organizationId,subjectUserId,template,projection}
  return {record,proposal,previewHash:canonicalHash(proposal)}
 }
 return {
  async preview(actor:Actor,artifactId:string,key='parent-report-availability',version='1.0.0'){
   return run(async tx=>{const prepared=await prepare(tx,actor,artifactId,key,version);const heads=await tx.$queryRaw<Array<{version:number}>>`SELECT version FROM parent_report_publication_heads WHERE source_artifact_id=${artifactId}`;return {artifactId,projection:prepared.proposal.projection,template:{key,version},previewHash:prepared.previewHash,expectedVersion:heads[0]?.version??0,commandKey:randomUUID(),allowedActions:['PUBLISH']}})
  },
  async publish(actor:Actor,artifactId:string,input:{templateKey:string;templateVersion:string;previewHash:string;expectedVersion:number;commandKey:string}){
   return run(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${artifactId},0))`
    const prepared=await prepare(tx,actor,artifactId,input.templateKey,input.templateVersion),requestHash=canonicalHash({artifactId,templateKey:input.templateKey,templateVersion:input.templateVersion,previewHash:input.previewHash,expectedVersion:input.expectedVersion})
    if(input.previewHash!==prepared.previewHash)fail('PARENT_PREVIEW_CHANGED',409,'预览内容已经变化，请重新预览')
    const receipts=await tx.$queryRaw<Array<{id:string;hash:string;requestHash:string}>>`SELECT id,publication_hash AS hash,request_hash AS "requestHash" FROM parent_report_publications WHERE published_by_user_id=${actor.userId} AND command_key=${input.commandKey}`
    if(receipts.length){if(receipts[0].requestHash!==requestHash)fail('PARENT_COMMAND_CONFLICT',409);return {publicationId:receipts[0].id,publicationHash:receipts[0].hash}}
    const heads=await tx.$queryRaw<Array<{version:number}>>`SELECT version FROM parent_report_publication_heads WHERE source_artifact_id=${artifactId} FOR UPDATE`
    if((heads[0]?.version??0)!==input.expectedVersion)fail('PARENT_PUBLICATION_CHANGED',409,'发布版本已变化，请重新预览')
    const id=randomUUID(),at=new Date(),{proposal}=prepared,payload={schemaVersion:1,audience:'PARENT',publicationId:id,...proposal,publishedByUserId:actor.userId,publishedAt:at.toISOString()},publicationHash=canonicalHash(payload)
    await tx.$executeRaw`INSERT INTO parent_report_publications(id,source_artifact_id,organization_id,subject_user_id,source_hash,template_key,template_version,template_hash,projection_payload,projection_hash,publication_payload,publication_hash,published_by_user_id,published_at,command_key,request_hash) VALUES(${id},${artifactId},${proposal.organizationId},${proposal.subjectUserId},${proposal.sourceHash},${proposal.template.key},${proposal.template.version},${canonicalHash(proposal.template)},${JSON.stringify(proposal.projection)}::jsonb,${canonicalHash(proposal.projection)},${JSON.stringify(payload)}::jsonb,${publicationHash},${actor.userId},${at},${input.commandKey},${requestHash})`
    await tx.$executeRaw`INSERT INTO parent_report_publication_heads(source_artifact_id,publication_id,version) VALUES(${artifactId},${id},${input.expectedVersion+1}) ON CONFLICT(source_artifact_id) DO UPDATE SET publication_id=EXCLUDED.publication_id,version=EXCLUDED.version,revoked_at=NULL`
    await tx.$executeRaw`INSERT INTO parent_portal_audit(id,actor_user_id,action,artifact_id) VALUES(${randomUUID()},${actor.userId},'REPORT_PARENT_PUBLISHED',${artifactId})`
    return {publicationId:id,publicationHash}
   })
  },
  async list(actor:Actor,organizationId:string){
   return run(async tx=>{
    await assertDisclosureOfficer(tx,actor,organizationId)
    const input={principal:actor,organizationId,tx}
    async function scope(factory:(i:typeof input)=>Promise<Prisma.Sql>){try{return await factory(input)}catch(e){if((e as any).statusCode===404)return Prisma.sql`false`;throw e}}
    const protectedScope=await scope(protectedFeedbackSubjectScope),individualScope=await scope(individualSubjectScope)
    const rows=await tx.$queryRaw<Array<{id:string;name:string;at:Date}>>(Prisma.sql`SELECT DISTINCT ON(a.id,a.generated_at) a.id,COALESCE(u.nickname,u.username) AS name,a.generated_at AS at FROM reporting_analysis_artifacts a JOIN users u ON u.id=COALESCE(a.subject_user_id,a.artifact_payload->'source'->>'subjectUserId') JOIN organization_memberships m ON m.user_id=u.id AND m.organization_id=a.organization_id JOIN reporting_analysis_specs spec ON spec.id=a.spec_id AND spec.status='PUBLISHED' WHERE a.organization_id=${organizationId} AND u.role='STUDENT' AND u.is_active=true AND u.is_frozen=false AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp()) AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp()) AND NOT EXISTS(SELECT 1 FROM organization_access_denies d WHERE d.organization_id=a.organization_id AND d.user_id=u.id AND d.lifted_at IS NULL AND (d.permission IN ('*','REPORT_READ','REPORT_MEMBER_READ','PARENT_REPORT_READ') OR d.permission=a.policy_domain)) AND ((a.analysis_kind='PROTECTED_FEEDBACK' AND (${protectedScope})) OR (a.analysis_kind='INDIVIDUAL_LONGITUDINAL' AND (${individualScope}))) ORDER BY a.generated_at DESC,a.id LIMIT 21`)
    return {list:rows.slice(0,20).map(row=>({id:row.id,title:row.name+' · 测评报告',generatedAt:row.at.toISOString()})),truncated:rows.length>20}
   })
  },
 }
}
export const parentPublisher=createParentPublisher()
