import { randomUUID } from 'node:crypto'
import { Router, type Request, type Response, type NextFunction } from 'express'
import { Prisma, type CognitiveTestConfig } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../../config/database'
import { success, error } from '../../../utils/response'
import { requireRecentAdminKey } from '../../admin-permissions/guards'
import { assertStandardSystem } from '../../survey/standard-triplet.service'
import { canonicalHash } from '../../assessment-runtime/canonical'
import { getContentRelease, publishContentRelease } from '../../measurement-content/repository'
import { publishedCognitiveConfigMeasurement } from '../../measurement-content/cognitive'
import { prepareRelease } from '../../measurement-content/release'
import { DECLARATIVE_REPORT_GENERATOR } from '../../measurement-content/report-renderer'
import { compileEffectiveDisclosure } from '../../scale/policy/disclosure'
import { scaleReportVisibilitySchema } from '../../scale/policy/schema'
import type { ScaleDataCeilingV1 } from '../../scale/policy/types'
import { resolveParticipantPresentation } from '../participant-presentation'
import { getCognitiveRegistryEntry } from '../cognitive.registry'
import { cognitiveDeclaredReport } from '../profile-freeze'
import { publishCognitiveConfigRelease } from '../release.service'
import { reportMetaSchema } from '../schemas/report-meta'
import { BAD_REQUEST, CONFLICT, CognitiveServiceError } from '../cognitive.errors'
import { getCognitiveV2TaskDefinition } from '../v2/registry'

const version = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/)
const text = z.string().trim().min(1).max(4000)
export const cognitiveReportRevisionSchema = z.object({
  version, title: text.max(200), introduction: z.string().trim().max(4000),
  instruction: z.string().trim().max(4000), disclaimer: text,
  practicalTips: z.array(text.max(2000)).max(30), reportVisibility: scaleReportVisibilitySchema,
}).strict()
const commitSchema = z.object({
  release:cognitiveReportRevisionSchema, expectedPreviewHash:z.string().regex(/^[0-9a-f]{64}$/),
}).strict()
type Revision = z.infer<typeof cognitiveReportRevisionSchema>

export async function prepareCognitiveReportRevision(tx:Prisma.TransactionClient,id:string,release:Revision) {
  await tx.$queryRaw`SELECT id FROM cognitive_test_configs WHERE id=${id} FOR SHARE`
  const source=await tx.cognitiveTestConfig.findUnique({where:{id}})
  if (!source||source.status!=='PUBLISHED'||!source.measurementReleaseId||source.testType==='fake')
    throw CONFLICT('原配置没有可供复制的已发布题本')
  const definition=getCognitiveV2TaskDefinition(source.testType,source.engineVersion,source.scoringVersion)
  if (!definition) throw CONFLICT('原配置对应的引擎和计分器未部署')
  const measurement=await getContentRelease(tx,source.measurementReleaseId,true)
  const expected=prepareRelease(publishedCognitiveConfigMeasurement(source))
  if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.family!=='COGNITIVE'||measurement.status!=='PUBLISHED'
    ||measurement.scope.kind!=='PLATFORM'||measurement.contentHash!==expected.contentHash||measurement.version!==expected.version)
    throw CONFLICT('原配置已发布题本摘要不一致')
  const prior=cognitiveDeclaredReport(source.config)
  const meta=reportMetaSchema.safeParse((source.config as {report?:unknown}|null)?.report)
  if(!meta.success)throw CONFLICT('原配置报告元数据不可用')
  const ceiling:ScaleDataCeilingV1={
    schemaVersion:1,policyVersion:prior?.effectiveDisclosure.policyVersion.split('/')[0]??'cognitive-core-non-disclosing-v1',
    audiences:{},unknownAudience:'DENY',
  }
  for(const audience of ['respondent','subject','teacher','researcher'] as const){
    const c=prior?.effectiveDisclosure.audiences[audience]
    if(c)ceiling.audiences[audience]={rawAnswers:c.rawAnswers,itemScores:c.itemScores,methods:c.methods,resultQualityDetails:c.resultQualityDetails}
  }
  const effectiveDisclosure=compileEffectiveDisclosure(ceiling,release.reportVisibility,undefined)
  const config=definition.configSchema.parse({
    ...source.config as Prisma.JsonObject,
    report:{...meta.data,reportVersion:release.version,declaredRelease:{
      measurementOrigin:{version:measurement.version,instrumentVersion:measurement.content.instrumentVersion},
      parameterVersion:prior?.parameterVersion??'legacy-'+canonicalHash(source.configVersion).slice(0,24), title:release.title, introduction:release.introduction,
      practicalTips:release.practicalTips,disclaimer:release.disclaimer,effectiveDisclosure,
    }},
  }) as Prisma.InputJsonObject
  const previewHash=canonicalHash({sourceId:id,sourceVersion:source.configVersion,measurementReleaseId:measurement.releaseId,
    contentHash:measurement.contentHash,release,config})
  return {source,measurement,config,effectiveDisclosure,previewHash,profileKeys:Object.keys(definition.profiles)}
}

function reportRevisionReceipt(row:Pick<CognitiveTestConfig,'id'|'name'|'configVersion'|'measurementReleaseId'>,profileKeys:string[],replayed:boolean) {
  return {id:row.id,name:row.name,version:row.configVersion,measurementReleaseId:row.measurementReleaseId,replayed,
    entryApproval:{status:replayed?'CHECK_CURRENT' as const:'PENDING' as const,configId:row.id,profileKeys},
  }
}

export async function publishCognitiveReportRevision(tx:Prisma.TransactionClient,actorId:string,id:string,raw:unknown) {
  const {release,expectedPreviewHash}=commitSchema.parse(raw)
  const ready=await prepareCognitiveReportRevision(tx,id,release)
  if(ready.previewHash!==expectedPreviewHash)throw CONFLICT('报告预览已变化，请重新确认')
  const {source,measurement,effectiveDisclosure,config,previewHash,profileKeys}=ready
  const identity={testType:source.testType,configVersion:release.version}
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'cognitive-report-editor:'+source.testType+':'+release.version}))`
  const existing=await tx.cognitiveTestConfig.findUnique({where:{testType_configVersion:identity}})
  if(existing){
    const operation=await tx.assessmentManagementEvent.findFirst({where:{
      actorId,resourceId:existing.id,action:'COGNITIVE_ADMIN_REPORT_PUBLISHED',
    }})
    if((operation?.metadata as {previewHash?:string}|null)?.previewHash===previewHash&&existing.status==='PUBLISHED')
      return reportRevisionReceipt(existing,profileKeys,true)
    throw CONFLICT('配置或报告版本已经存在，请使用新的版本号')
  }
  const draft=await tx.cognitiveTestConfig.create({data:{
    ...identity,engineVersion:source.engineVersion,scoringVersion:source.scoringVersion,
    name:release.title,instruction:release.instruction||null,status:'DRAFT',accessPolicy:'GRANT',config,
  }})
  const published=await publishCognitiveConfigRelease(tx,draft,{actorId,source:'ADMIN'})
  if(published.measurementReleaseId!==source.measurementReleaseId)throw CONFLICT('报告修订无法复用原始题本')
  const report=await publishContentRelease(tx,{
    family:'COGNITIVE',layer:'REPORT',key:measurement.key,version:release.version,scope:measurement.scope,
    assetRefs:[],sourceReleaseId:null,provenance:{source:'ADMIN_REPORT_REVISION',sourceConfigId:id},
    content:{projectionVersion:1,measurements:[{releaseId:measurement.releaseId,contentHash:measurement.contentHash}],
      metricKeys:measurement.content.metrics.map(item=>item.metricKey),audience:'participant',language:'zh-CN',
      generatorVersion:DECLARATIVE_REPORT_GENERATOR,effectiveDisclosure,template:{
        title:release.title,limitations:[],disclaimer:release.disclaimer,
        blocks:release.introduction?[{type:'TEXT',text:release.introduction}]:[],
      }},
  },actorId)
  if(report.status!=='PUBLISHED')throw CONFLICT('报告版本不可发布')
  await tx.assessmentManagementEvent.create({data:{
    id:randomUUID(),actorId,resourceId:published.id,action:'COGNITIVE_ADMIN_REPORT_PUBLISHED',
    metadata:{sourceConfigId:id,previewHash,reportReleaseId:report.releaseId,measurementReleaseId:published.measurementReleaseId,entryApprovals:0},
  }})
  return reportRevisionReceipt(published,profileKeys,false)
}

export const cognitiveReportReleaseRouter=Router()
const wrap=(work:(req:Request,tx:Prisma.TransactionClient)=>Promise<unknown>,write=false)=>
  async (req:Request,res:Response,next:NextFunction)=>{
    try {
      if(!req.user)return error(res,'需要当前系统管理员身份',-1,401)
      return success(res,await prisma.$transaction(async tx=>{
        await assertStandardSystem(tx,req.user!.userId,write?req.user!:undefined)
        return work(req,tx)
      }))
    } catch(caught) {
      if(caught instanceof z.ZodError)return error(res,'报告版本、显示文字或披露范围不合法',-1,400)
      if(caught instanceof CognitiveServiceError)return error(res,caught.message,-1,caught.statusCode)
      return next(caught)
    }
  }
cognitiveReportReleaseRouter.get('/',wrap(async(req,tx)=>{
  const filter=z.object({key:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/).optional(),
    page:z.coerce.number().int().min(1).max(5000).default(1)}).parse(req.query)
  const rows=await tx.cognitiveTestConfig.findMany({
    where:{status:'PUBLISHED',measurementReleaseId:{not:null},testType:filter.key??{not:'fake'}},
    orderBy:[{publishedAt:'desc'},{id:'desc'}],skip:(filter.page-1)*25,take:26,
    select:{id:true,name:true,testType:true,configVersion:true,engineVersion:true,scoringVersion:true},
  })
  return {rows:rows.slice(0,25).flatMap(row=>{
    const definition=getCognitiveV2TaskDefinition(row.testType,row.engineVersion,row.scoringVersion)
    const entry=getCognitiveRegistryEntry(row.testType,row.engineVersion,row.scoringVersion)
    return definition&&entry?[{...row,profiles:Object.values(entry.profiles).map(profile=>({
      key:profile.profile,estimatedMinutes:profile.estimatedMinutes,
    }))}]:[]
  }),hasMore:rows.length>25}
}))
cognitiveReportReleaseRouter.get('/:id',wrap(async(req,tx)=>{
  const id=z.string().guid().parse(req.params.id)
  const source=await tx.cognitiveTestConfig.findUnique({where:{id}})
  if(!source||source.status!=='PUBLISHED'||!source.measurementReleaseId||source.testType==='fake'
    ||!getCognitiveV2TaskDefinition(source.testType,source.engineVersion,source.scoringVersion))throw CONFLICT('原配置不可用于报告修订')
  const declared=cognitiveDeclaredReport(source.config)
  const installed=resolveParticipantPresentation(source)
  return {id:source.id,title:declared?.title??source.name,instruction:source.instruction??'',
    introduction:declared?.introduction??installed?.reportReading?.introduction??'',
    disclaimer:declared?.disclaimer??installed?.disclaimer??'',practicalTips:declared?.practicalTips??installed?.practicalTips??[],
    reportVisibility:declared?.effectiveDisclosure.audiences??{}}
}))
cognitiveReportReleaseRouter.post('/:id/preview',wrap(async(req,tx)=>{
  const release=cognitiveReportRevisionSchema.parse(req.body)
  const {source,measurement,previewHash,effectiveDisclosure}=await prepareCognitiveReportRevision(tx,z.string().guid().parse(req.params.id),release)
  return {previewHash,source:{id:source.id,name:source.name,version:source.configVersion,
    engineVersion:source.engineVersion,scoringVersion:source.scoringVersion,measurementReleaseId:measurement.releaseId},effectiveDisclosure}
}))
cognitiveReportReleaseRouter.post('/:id/publish',requireRecentAdminKey,wrap((req,tx)=>{
  if(!req.user)throw BAD_REQUEST('需要当前系统管理员身份')
  return publishCognitiveReportRevision(tx,req.user.userId,z.string().guid().parse(req.params.id),req.body)
},true))
