import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {canonicalHash,canonicalJsonString} from '../assessment-runtime/canonical'
import {assertContentAuthority} from '../measurement-content/content-authority.repository'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {prepareRelease,ContentReleaseError} from '../measurement-content/release'
import {getContentRelease,publishContentRelease} from '../measurement-content/repository'
import {reportTemplateSchema} from '../measurement-content/report-template'
import {DECLARATIVE_REPORT_GENERATOR,renderDeclaredReport,type ReportReferenceFact} from '../measurement-content/report-renderer'
import {prepareTrainingContentSnapshot} from '../composite/training-content-binding'
import {resolveCompositeSituationalItems,compositeSjtGrantScope} from '../composite/composite.service'

const text=z.string().trim().min(1).max(240),id=z.string().uuid()
export const trainingReportPayload=z.object({measurementReleaseId:id,metricKeys:z.array(text).min(1).max(100),
  audience:z.enum(['teacher','researcher']),language:text,template:reportTemplateSchema,assets:z.array(z.never()).max(0).default([])}).strict()
export const createTrainingReportInput=z.object({requestId:id,reportKey:text.max(168),version:text,payload:trainingReportPayload}).strict()
export const editTrainingReportInput=z.object({revision:z.number().int().nonnegative(),payload:trainingReportPayload}).strict()
export const publishTrainingReportInput=z.object({revision:z.number().int().nonnegative(),publicationNote:z.string().trim().min(3).max(4000)}).strict()
const contextSchema=z.object({actorId:text,courseId:text,compositeId:text,grantId:id}).strict()
export type TrainingReportContext=z.infer<typeof contextSchema>
type Payload=z.infer<typeof trainingReportPayload>
type Row={id:string;course_id:string;composite_id:string;owner_id:string;report_key:string;version:string;revision:number;
  create_input_hash:string;payload:Payload;state:'DRAFT'|'PUBLISHED';published_release_id:string|null}
export class TrainingReportError extends Error{constructor(readonly statusCode:number,message:string){super(message);this.name='TrainingReportError'}}
function fail(status:number,message:string):never{throw new TrainingReportError(status,message)}
function denied():never{throw new ContentAuthorityError('CONTENT_AUTHORITY_DENIED')}
const options={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:10000}
async function authorize(tx:Prisma.TransactionClient,raw:TrainingReportContext,capability:'report.edit'|'report.publish'){
  const context=contextSchema.parse(raw)
  // Same lock order for every operation, including reads: course -> principal ->
  // composition/delivery -> delegated capability; sample facts are never loaded.
  const courses=await tx.$queryRaw<Array<{id:string;creator_id:string;course_type:string;is_library:boolean}>>(Prisma.sql`
    SELECT id,creator_id,course_type,is_library FROM courses WHERE id=${context.courseId} FOR SHARE`)
  const course=courses[0]
  if(!course||course.creator_id!==context.actorId||course.course_type!=='TRAINING_COURSE'||course.is_library)denied()
  const users=await tx.$queryRaw<Array<{role:string;teacher_approved:boolean;account_domain:string;is_active:boolean;is_frozen:boolean;must_change_password:boolean;expires_at:Date|null}>>(Prisma.sql`
    SELECT role::text,teacher_approved,account_domain,is_active,is_frozen,must_change_password,expires_at FROM users WHERE id=${context.actorId} FOR SHARE`)
  const user=users[0]
  if(!user||user.role!=='TEACHER'||!user.teacher_approved||!['LEGACY','TRAINING'].includes(user.account_domain)||!user.is_active||user.is_frozen||user.must_change_password)denied()
  const composites=await tx.$queryRaw<Array<{id:string;created_by:string;course_id:string|null;product_kind:string;questionnaire_type:string|null}>>(Prisma.sql`
    SELECT id,created_by,course_id,product_kind,questionnaire_type FROM composite_assessments WHERE id=${context.compositeId} FOR SHARE`)
  const composite=composites[0]
  if(!composite||composite.created_by!==context.actorId)denied()
  const deliveries=await tx.$queryRaw<Array<{course_id:string}>>(Prisma.sql`
    SELECT course_id FROM questionnaire_course_deliveries WHERE composite_id=${context.compositeId} AND course_id=${context.courseId} FOR SHARE`)
  if(composite.product_kind==='QUESTIONNAIRE'?(composite.questionnaire_type!=='COURSE'||!deliveries.length):composite.course_id!==context.courseId)denied()
  await authority(tx,context,capability)
  const [clock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
  if(!clock||(user.expires_at&&new Date(user.expires_at)<=new Date(clock.now)))denied()
  return context
}
async function authority(tx:Prisma.TransactionClient,context:TrainingReportContext,capability:'report.edit'|'report.publish'){
  return assertContentAuthority(tx,{actorId:context.actorId,grantId:context.grantId,capability,
    scope:{product:'TRAINING',scopeKind:'COURSE',scopeId:context.courseId,resourceKind:'report',resourceKeys:[context.compositeId]}})
}
async function readDraft(tx:Prisma.TransactionClient,context:TrainingReportContext,draftId:string,write=false){
  id.parse(draftId)
  const rows=await tx.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM training_report_drafts WHERE id=${draftId}
    AND course_id=${context.courseId} AND composite_id=${context.compositeId} AND owner_id=${context.actorId}
    ${write?Prisma.sql`FOR UPDATE`:Prisma.sql`FOR SHARE`}`)
  if(!rows[0])fail(404,'报告草稿不存在')
  return rows[0]
}
async function measurements(tx:Prisma.TransactionClient,context:TrainingReportContext){
  const composite=await tx.compositeAssessment.findUnique({where:{id:context.compositeId},include:{
    questionnaireCourses:{select:{courseId:true}},items:{orderBy:{position:'asc'},include:{scale:true,cognitiveAssignment:{include:{config:true}}}}}})
  if(!composite||composite.createdBy!==context.actorId)denied()
  const resolved=await resolveCompositeSituationalItems(composite.items,tx,true,compositeSjtGrantScope(composite))
  const {snapshot,releases}=await prepareTrainingContentSnapshot(tx,composite,resolved,'HISTORICAL_INTERPRETATION')
  return {units:snapshot.units,releases}
}
async function releaseInput(tx:Prisma.TransactionClient,context:TrainingReportContext,key:string,version:string,payload:Payload){
  const {units,releases}=await measurements(tx,context),pointer=units.find(unit=>unit.measurement.releaseId===payload.measurementReleaseId)?.measurement
  if(!pointer)fail(404,'测量版本不属于此课程测评的实际挂载来源')
  const measurement=releases.get(pointer.releaseId)
  if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.status==='REVOKED'||measurement.contentHash!==pointer.contentHash
    ||measurement.content.measurementHash!==pointer.measurementHash)throw new ContentReleaseError('CONTENT_TRAINING_SOURCE_MISMATCH')
  const metrics=new Set(measurement.content.metrics.map(metric=>metric.metricKey))
  if(payload.metricKeys.some(key=>!metrics.has(key))||new Set(payload.metricKeys).size!==payload.metricKeys.length)fail(400,'报告指标必须属于所选测量且不能重复')
  const scope={kind:'PRIVATE' as const,product:'TRAINING' as const,ownerId:context.actorId,resourceId:context.compositeId}
  const release=prepareRelease({layer:'REPORT',family:measurement.family,key:`report:${canonicalHash(scope)}:${key}`,version,scope,
    sourceReleaseId:null,assetRefs:[],provenance:{courseId:context.courseId,compositeId:context.compositeId},
    content:{projectionVersion:1,measurements:[{releaseId:measurement.releaseId,contentHash:measurement.contentHash}],metricKeys:payload.metricKeys,
      audience:payload.audience,language:payload.language,generatorVersion:DECLARATIVE_REPORT_GENERATOR,template:payload.template}})
  return {release,measurement}
}
export async function listTrainingReportMeasurements(context:TrainingReportContext){
  return prisma.$transaction(async tx=>{await authorize(tx,context,'report.edit')
    const {units,releases}=await measurements(tx,context),ids=[...new Set(units.map(unit=>unit.measurement.releaseId))]
    const result=[]
    for(const releaseId of ids){const release=releases.get(releaseId)
      if(!release||release.layer!=='MEASUREMENT'||release.status==='REVOKED')throw new ContentReleaseError('CONTENT_TRAINING_RELEASE_REQUIRED')
      result.push({id:release.releaseId,family:release.family,key:release.key,version:release.version,status:release.status,contentHash:release.contentHash,metrics:release.content.metrics})}
    await authority(tx,context,'report.edit')
    return result
  },options)
}
export async function listTrainingReportDrafts(context:TrainingReportContext,page=1){
  z.number().int().min(1).max(1000).parse(page)
  return prisma.$transaction(async tx=>{await authorize(tx,context,'report.edit')
    const rows=await tx.$queryRaw(Prisma.sql`SELECT id,report_key AS "reportKey",version,revision,state,published_release_id AS "publishedReleaseId"
      FROM training_report_drafts WHERE course_id=${context.courseId} AND composite_id=${context.compositeId} AND owner_id=${context.actorId}
      ORDER BY updated_at DESC,id LIMIT 25 OFFSET ${(page-1)*25}`)
    await authority(tx,context,'report.edit');return rows
  },options)
}
export async function getTrainingReportDraft(context:TrainingReportContext,draftId:string){
  return prisma.$transaction(async tx=>{await authorize(tx,context,'report.edit');const row=await readDraft(tx,context,draftId);await authority(tx,context,'report.edit');return row},options)
}
export async function createTrainingReportDraft(context:TrainingReportContext,raw:unknown){
  const input=createTrainingReportInput.parse(raw)
  const createHash=canonicalHash({actorId:context.actorId,courseId:context.courseId,compositeId:context.compositeId,input})
  return prisma.$transaction(async tx=>{await authorize(tx,context,'report.edit')
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`training-report:${input.requestId}`}))`)
    const prior=await tx.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM training_report_drafts WHERE id=${input.requestId} FOR SHARE`)
    if(prior[0]){if(prior[0].create_input_hash!==createHash||prior[0].owner_id!==context.actorId||prior[0].course_id!==context.courseId||prior[0].composite_id!==context.compositeId)fail(409,'创建请求已用于不同内容');await authority(tx,context,'report.edit');return prior[0]}
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${canonicalHash(['training-report-version',context.compositeId,input.reportKey,input.version])}))`)
    await releaseInput(tx,context,input.reportKey,input.version,input.payload)
    await authority(tx,context,'report.edit')
    const rows=await tx.$queryRaw<Row[]>(Prisma.sql`INSERT INTO training_report_drafts(id,course_id,composite_id,owner_id,report_key,version,create_input_hash,payload)
      VALUES(${input.requestId},${context.courseId},${context.compositeId},${context.actorId},${input.reportKey},${input.version},${createHash},${canonicalJsonString(input.payload)}::jsonb)
      ON CONFLICT DO NOTHING RETURNING *`)
    if(!rows[0])fail(409,'该报告版本已存在，请使用新版本')
    return rows[0]
  },options)
}
export async function editTrainingReportDraft(context:TrainingReportContext,draftId:string,raw:unknown){
  const input=editTrainingReportInput.parse(raw)
  return prisma.$transaction(async tx=>{await authorize(tx,context,'report.edit');const row=await readDraft(tx,context,draftId,true)
    if(row.state!=='DRAFT'||row.revision!==input.revision)fail(409,'草稿已发布或版本变化')
    await releaseInput(tx,context,row.report_key,row.version,input.payload)
    await authority(tx,context,'report.edit')
    const rows=await tx.$queryRaw<Row[]>(Prisma.sql`UPDATE training_report_drafts SET payload=${canonicalJsonString(input.payload)}::jsonb,revision=revision+1,updated_at=clock_timestamp()
      WHERE id=${draftId} AND revision=${input.revision} AND state='DRAFT' RETURNING *`)
    if(!rows[0])fail(409,'报告草稿已变化');return rows[0]
  },options)
}
export async function previewTrainingReportDraft(context:TrainingReportContext,draftId:string,rawScenario:unknown){
  const scenario=z.enum(['INTERPRETABLE','NO_REFERENCE','INVALID']).parse(rawScenario)
  return prisma.$transaction(async tx=>{await authorize(tx,context,'report.edit');const row=await readDraft(tx,context,draftId)
    const payload=trainingReportPayload.parse(row.payload),{measurement}=await releaseInput(tx,context,row.report_key,row.version,payload)
    const facts=payload.metricKeys.map(metricKey=>({metricKey,value:scenario==='INVALID'?null:1,unit:measurement.content.metrics.find(metric=>metric.metricKey===metricKey)!.unit,status:scenario==='INVALID'?'INVALID' as const:'INTERPRETABLE' as const}))
    const candidates:ReportReferenceFact[]=scenario==='INTERPRETABLE'?payload.template.blocks.flatMap(block=>block.type==='REFERENCE_BAND'?[{metricKey:block.metricKey,referenceKind:block.referenceKind,bandKey:block.bandKey,status:'AVAILABLE' as const}]:[]):[]
    const references=[...new Map(candidates.map(reference=>[`${reference.metricKey}:${reference.referenceKind}`,reference])).values()]
    await authority(tx,context,'report.edit')
    return {synthetic:true,scenario,revision:row.revision,report:renderDeclaredReport(payload.template,facts,references)}
  },options)
}
export async function publishTrainingReportDraft(context:TrainingReportContext,draftId:string,raw:unknown){
  const input=publishTrainingReportInput.parse(raw)
  return prisma.$transaction(async tx=>{await authorize(tx,context,'report.publish');const row=await readDraft(tx,context,draftId,true)
    if(row.revision!==input.revision)fail(409,'草稿版本已变化')
    if(row.state==='PUBLISHED'){
      const prior=row.published_release_id?await getContentRelease(tx,row.published_release_id,true):null
      if(!prior||prior.layer!=='REPORT'||prior.scope.kind!=='PRIVATE'||prior.scope.product!=='TRAINING'||prior.scope.ownerId!==context.actorId
        ||prior.scope.resourceId!==context.compositeId||prior.version!==row.version||prior.provenance.courseId!==context.courseId||prior.provenance.draftId!==draftId||prior.provenance.publicationNote!==input.publicationNote)fail(409,'已发布请求内容不匹配')
      await authority(tx,context,'report.publish')
      return {draftId,releaseId:prior.releaseId,contentHash:prior.contentHash,version:prior.version,status:prior.status,idempotent:true}
    }
    const {release}=await releaseInput(tx,context,row.report_key,row.version,trainingReportPayload.parse(row.payload))
    release.provenance={...release.provenance,draftId,draftRevision:row.revision,publicationNote:input.publicationNote}
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${canonicalHash([release.family,release.layer,release.key,release.version])}))`)
    await authority(tx,context,'report.publish')
    const published=await publishContentRelease(tx,release,context.actorId,'HISTORICAL_INTERPRETATION')
    const changed=await tx.$executeRaw(Prisma.sql`UPDATE training_report_drafts SET state='PUBLISHED',published_release_id=${published.releaseId},updated_at=clock_timestamp()
      WHERE id=${draftId} AND revision=${input.revision} AND state='DRAFT'`)
    if(changed!==1)fail(409,'报告草稿已变化')
    return {draftId,releaseId:published.releaseId,contentHash:published.contentHash,version:published.version,status:published.status,idempotent:false}
  },options)
}
