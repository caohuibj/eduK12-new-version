import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { canonicalHash,canonicalJsonString } from '../assessment-runtime/canonical'
import { authorizedProject,SurveyBuilderError } from './builder.service'
import { assetReference,prepareRelease,assertMeasurementDependency } from '../measurement-content/release'
import { getContentRelease,publishContentRelease } from '../measurement-content/repository'
import { reportTemplateSchema } from '../measurement-content/report-template'
import { DECLARATIVE_REPORT_GENERATOR,renderDeclaredReport,type ReportReferenceFact } from '../measurement-content/report-renderer'
import { retainAssessmentAssetReferences } from '../assessment-media/assessment-asset'
import { surveyMimeTypes,surveyMaxImageBytes } from './media.references'
const text=z.string().trim().min(1).max(240)
export const surveyReportPayload=z.object({
  measurementReleaseId:z.string().guid(),metricKeys:z.array(text).min(1).max(100),
  audience:z.enum(['student','parent','teacher','researcher']),language:text,
  template:reportTemplateSchema,
  assets:z.array(assetReference.extend({rightsStatus:z.enum(['self_authored','authorized']),rightsNote:z.string().trim().min(1).max(2000)}).strict()).max(30).default([]),
}).strict()
export const createSurveyReportInput=z.object({requestId:z.string().guid(),reportKey:z.string().trim().min(1).max(168),version:text,payload:surveyReportPayload}).strict()
export const editSurveyReportInput=z.object({revision:z.number().int().nonnegative(),payload:surveyReportPayload}).strict()
export const publishSurveyReportInput=z.object({revision:z.number().int().nonnegative(),publicationNote:z.string().trim().min(3).max(4000)}).strict()
type Payload=z.infer<typeof surveyReportPayload>
type Row={id:string;project_id:string;owner_id:string;report_key:string;version:string;revision:number;payload:Payload;state:'DRAFT'|'PUBLISHED';published_release_id:string|null}
const fail=(status:number,message:string):never=>{throw new SurveyBuilderError(status,message)}
async function readDraft(tx:Prisma.TransactionClient,actorId:string,projectId:string,id:string,write=false){
  // Reports are independent interpretations: closed/archived collection remains closed.
  await authorizedProject(tx,actorId,projectId,false)
  const rows=await tx.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM survey_report_drafts WHERE id=${id} AND project_id=${projectId} AND owner_id=${actorId} ${write?Prisma.sql`FOR UPDATE`:Prisma.sql`FOR SHARE`}`)
  if(!rows[0])fail(404,'报告草稿不存在')
  return rows[0]
}
async function releaseInput(tx:Prisma.TransactionClient,actorId:string,projectId:string,reportKey:string,version:string,payload:Payload){
  const measurement=await getContentRelease(tx,payload.measurementReleaseId,true)
  if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.scope.kind!=='PRIVATE'
    ||measurement.scope.product!=='SURVEY'||measurement.scope.resourceId!==projectId||measurement.scope.ownerId!==actorId)
    throw new SurveyBuilderError(404,'只能编制本项目私有测量的报告')
  // This authoring endpoint also supports corrected historical interpretation.
  // New administration binding separately rejects retired/superseded measurement.
  assertMeasurementDependency(measurement.status,'HISTORICAL_INTERPRETATION')
  // Catalog use grants do not confer adaptation of the authoritative report.
  if(measurement.provenance.source)fail(403,'目录来源报告编制需另有明确改编许可')
  const metrics=new Set(measurement.content.metrics.map(m=>m.metricKey))
  if(payload.metricKeys.some(k=>!metrics.has(k)))fail(400,'报告引用了测量未定义的指标')
  if(payload.assets.length){
    const assets=await tx.storedAsset.findMany({where:{id:{in:payload.assets.map(a=>a.assetId)},ownerId:actorId,scopeId:projectId,accessScope:'PRIVATE',deletedAt:null},select:{id:true,sha256:true,mimeType:true,sizeBytes:true}})
    const found=new Map(assets.map(a=>[a.id,a]))
    if(payload.assets.some(a=>{const row=found.get(a.assetId);return !row||row.sha256!==a.sha256||row.mimeType!==a.mediaType||row.sizeBytes<=0||row.sizeBytes>surveyMaxImageBytes||!surveyMimeTypes.includes(row.mimeType as typeof surveyMimeTypes[number])}))fail(403,'报告图片须为本项目获准的冻结静态资产')
  }
  const release=prepareRelease({layer:'REPORT',family:measurement.family,key:`report:${canonicalHash(measurement.scope)}:${reportKey}`,version,
    scope:measurement.scope,sourceReleaseId:null,assetRefs:payload.assets.map(({rightsStatus:_status,rightsNote:_note,...asset})=>asset),
    provenance:{assetRights:payload.assets.map(a=>({assetId:a.assetId,rightsStatus:a.rightsStatus,rightsNote:a.rightsNote}))},
    content:{projectionVersion:1,measurements:[{releaseId:measurement.releaseId,contentHash:measurement.contentHash}],metricKeys:payload.metricKeys,
      audience:payload.audience,language:payload.language,generatorVersion:DECLARATIVE_REPORT_GENERATOR,template:payload.template}})
  return {release,measurement}
}
export async function listSurveyReportMeasurements(actorId:string,projectId:string){
  return prisma.$transaction(async tx=>{
    await authorizedProject(tx,actorId,projectId,false)
    return tx.$queryRaw(Prisma.sql`SELECT id,family,content_key AS key,version,status,content_hash AS "contentHash",content->'metrics' AS metrics
      FROM measurement_content_releases WHERE layer='MEASUREMENT' AND status IN ('PUBLISHED','SUPERSEDED','RETIRED')
      AND scope->>'kind'='PRIVATE' AND scope->>'product'='SURVEY' AND scope->>'resourceId'=${projectId} AND scope->>'ownerId'=${actorId}
      AND NOT (provenance ? 'source') ORDER BY published_at DESC,id LIMIT 100`)
  })
}
export async function listSurveyReportDrafts(actorId:string,projectId:string,page:number){
  return prisma.$transaction(async tx=>{await authorizedProject(tx,actorId,projectId,false)
    return tx.$queryRaw(Prisma.sql`SELECT id,report_key AS "reportKey",version,revision,state,published_release_id AS "publishedReleaseId" FROM survey_report_drafts
      WHERE project_id=${projectId} AND owner_id=${actorId} ORDER BY updated_at DESC,id LIMIT 25 OFFSET ${(page-1)*25}`)})
}
export async function createSurveyReportDraft(actorId:string,projectId:string,raw:unknown){
  const input=createSurveyReportInput.parse(raw)
  return prisma.$transaction(async tx=>{
    await authorizedProject(tx,actorId,projectId,false)
    await releaseInput(tx,actorId,projectId,input.reportKey,input.version,input.payload)
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`survey-report-draft:${input.requestId}`}))`)
    const prior=await tx.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM survey_report_drafts WHERE id=${input.requestId} FOR SHARE`)
    if(prior[0]){
      const row=prior[0]
      if(row.project_id!==projectId||row.owner_id!==actorId||row.report_key!==input.reportKey||row.version!==input.version||canonicalHash(row.payload)!==canonicalHash(input.payload))fail(409,'报告草稿创建请求已用于不同内容')
      return row
    }
    const rows=await tx.$queryRaw<Row[]>(Prisma.sql`INSERT INTO survey_report_drafts(id,project_id,owner_id,report_key,version,payload)
      VALUES(${input.requestId},${projectId},${actorId},${input.reportKey},${input.version},${canonicalJsonString(input.payload)}::jsonb) ON CONFLICT DO NOTHING RETURNING *`)
    if(!rows[0])fail(409,'该报告版本已存在，请使用新版本')
    return rows[0]
  })
}
export async function getSurveyReportDraft(actorId:string,projectId:string,id:string){return prisma.$transaction(tx=>readDraft(tx,actorId,projectId,id))}
export async function editSurveyReportDraft(actorId:string,projectId:string,id:string,raw:unknown){
  const input=editSurveyReportInput.parse(raw)
  return prisma.$transaction(async tx=>{
    const row=await readDraft(tx,actorId,projectId,id,true)
    if(row.state!=='DRAFT'||row.revision!==input.revision)fail(409,'草稿已发布或版本变化，请另建版本或刷新')
    await releaseInput(tx,actorId,projectId,row.report_key,row.version,input.payload)
    const rows=await tx.$queryRaw<Row[]>(Prisma.sql`UPDATE survey_report_drafts SET payload=${canonicalJsonString(input.payload)}::jsonb,revision=revision+1,updated_at=now()
      WHERE id=${id} AND revision=${input.revision} AND state='DRAFT' RETURNING *`)
    if(!rows[0])fail(409,'报告草稿已变化')
    return rows[0]
  })
}
export async function previewSurveyReportDraft(actorId:string,projectId:string,id:string,scenario:'INTERPRETABLE'|'NO_REFERENCE'|'INVALID'){
  return prisma.$transaction(async tx=>{
    const row=await readDraft(tx,actorId,projectId,id),payload=surveyReportPayload.parse(row.payload)
    const {measurement}=await releaseInput(tx,actorId,projectId,row.report_key,row.version,payload)
    const facts=payload.metricKeys.map(metricKey=>({metricKey,value:scenario==='INVALID'?null:1,unit:measurement.content.metrics.find(m=>m.metricKey===metricKey)!.unit,status:scenario==='INVALID'?'INVALID' as const:'INTERPRETABLE' as const}))
    const referenceCandidates:ReportReferenceFact[]=scenario==='INTERPRETABLE'?payload.template.blocks.flatMap(b=>b.type==='REFERENCE_BAND'?[{metricKey:b.metricKey,referenceKind:b.referenceKind,bandKey:b.bandKey,status:'AVAILABLE' as const}]:[]):[]
    // A synthetic case chooses one band per slot, like a frozen reference result.
    const references=[...new Map(referenceCandidates.map(r=>[`${r.metricKey}:${r.referenceKind}`,r])).values()]
    return {synthetic:true,scenario,revision:row.revision,report:renderDeclaredReport(payload.template,facts,references)}
  })
}
export async function publishSurveyReportDraft(actorId:string,projectId:string,id:string,raw:unknown){
  const input=publishSurveyReportInput.parse(raw)
  return prisma.$transaction(async tx=>{
    const row=await readDraft(tx,actorId,projectId,id,true)
    if(row.revision!==input.revision)fail(409,'草稿版本已变化')
    if(row.state==='PUBLISHED')return {draftId:id,releaseId:row.published_release_id,idempotent:true}
    const payload=surveyReportPayload.parse(row.payload),{release}=await releaseInput(tx,actorId,projectId,row.report_key,row.version,payload)
    release.provenance={...release.provenance,draftId:id,draftRevision:row.revision,publicationNote:input.publicationNote}
    // The repository accepts strict source input, not derived identity metadata.
    const {hashScheme:_hashScheme,contentHash:_contentHash,...sourceInput}=release
    const published=await publishContentRelease(tx,sourceInput,actorId,'HISTORICAL_INTERPRETATION')
    await retainAssessmentAssetReferences({owner:{entityType:'MeasurementReportRelease',entityId:published.releaseId,field:'media'},references:payload.assets.map(a=>({assetId:a.assetId,contentHash:a.sha256,mimeType:a.mediaType})),db:tx})
    await tx.$executeRaw(Prisma.sql`UPDATE survey_report_drafts SET state='PUBLISHED',published_release_id=${published.releaseId},updated_at=now() WHERE id=${id} AND revision=${input.revision} AND state='DRAFT'`)
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:actorId,projectId,action:'PRIVATE_REPORT_PUBLISHED',metadata:{draftId:id,releaseId:published.releaseId,revision:row.revision}}})
    return {draftId:id,releaseId:published.releaseId,contentHash:published.contentHash,idempotent:false}
  })
}
