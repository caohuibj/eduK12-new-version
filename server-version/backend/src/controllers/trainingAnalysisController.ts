import {trainingGroupLongitudinalCatalog,generateTrainingGroupLongitudinal,readTrainingGroupLongitudinal} from '../modules/training-analysis/group-longitudinal.service'
import {groupLongitudinalRequestSchema} from '../modules/reporting/group-longitudinal'
import type { Request, Response } from 'express'
import { generateTrainingGroupReport, listTrainingGroupReports, readTrainingGroupReport, trainingGroupTools } from '../modules/training-analysis/group-report.service'
import { z } from 'zod'
import { analyzeTrainingCourse, discoverTrainingCourseSources, setTrainingAnalysisQuality, trainingQualityPage } from '../modules/training-analysis/service'
import { trainingManifestSummary, type TrainingAnalysisActor } from '../modules/training-analysis/manifest'
import { enqueueExportJob } from '../services/exportJobService'
import { assertExportLimits } from '../services/exportStorage'
import { success } from '../utils/response'

const actor = (req:Request):TrainingAnalysisActor => ({id:req.user!.userId,role:req.user!.role as 'ADMIN'|'TEACHER'})
const selectorFor = (req:Request) => req.body?.selector && typeof req.body.selector==='object'
  ? {...req.body.selector,courseId:req.body.selector.courseId??req.params.id} : req.body?.selector
const respondError = (res:Response,err:unknown) => {
  const error=err as {statusCode?:number;code?:string;message?:string}
  const status=err instanceof z.ZodError ? 400 : error.statusCode??500
  return res.status(status).json({code:error.code??'TRAINING_ANALYSIS_FAILED',
    message:status===500?'分析暂时不可用':err instanceof z.ZodError?'请求格式无效':error.message,data:null})
}
const frozenSummaryV1Schema=z.object({schemaVersion:z.literal(1),manifestHash:z.string().regex(/^[a-f0-9]{64}$/),
  sourceCutoff:z.string().datetime(),definitionHash:z.string(),sourceHash:z.string(),qualityHash:z.string(),authorityHash:z.string(),
  sourceCount:z.number().int().nonnegative(),observationCount:z.number().int().nonnegative()}).strict()
const frozenSummarySchema=z.union([frozenSummaryV1Schema,frozenSummaryV1Schema.extend({schemaVersion:z.literal(2),researchGovernanceHash:z.string().regex(/^[a-f0-9]{64}$/)})])
async function reproduce(req:Request) {
  const summary=frozenSummarySchema.parse(req.body?.manifest)
  if(new Date(summary.sourceCutoff).getTime()>Date.now()) throw Object.assign(new Error('分析时间无效'),{statusCode:400})
  const result=await analyzeTrainingCourse({actor:actor(req),courseId:req.params.id,selector:selectorFor(req),sourceCutoff:summary.sourceCutoff})
  if(result.manifest.manifestHash!==summary.manifestHash) throw Object.assign(new Error('来源、质量或访问权限已变化，请重新分析'),{statusCode:409,code:'TRAINING_ANALYSIS_STALE'})
  return result
}
export const trainingAnalysisController={
  groupIndex: async(req:Request,res:Response)=>{try{return success(res,await listTrainingGroupReports({actor:{userId:req.user!.userId,role:req.user!.role},courseId:req.params.id}))}catch(err){return respondError(res,err)}},
  groupTools: async(req:Request,res:Response)=>{try{return success(res,await trainingGroupTools({actor:{userId:req.user!.userId,role:req.user!.role},courseId:req.params.id,taskId:req.params.taskId}))}catch(err){return respondError(res,err)}},
  groupLongCatalog:async(req:Request,res:Response)=>{try{return success(res,await trainingGroupLongitudinalCatalog({actor:{userId:req.user!.userId,role:req.user!.role},courseId:req.params.id,taskId:req.params.taskId}))}catch(err){return respondError(res,err)}},
  groupLongGenerate:async(req:Request,res:Response)=>{try{return success(res,await generateTrainingGroupLongitudinal({actor:{userId:req.user!.userId,role:req.user!.role},courseId:req.params.id,taskId:req.params.taskId,...groupLongitudinalRequestSchema.parse(req.body)}))}catch(err){return respondError(res,err)}},
  groupLongRead:async(req:Request,res:Response)=>{try{return success(res,await readTrainingGroupLongitudinal({actor:{userId:req.user!.userId,role:req.user!.role},courseId:req.params.id,taskId:req.params.taskId,artifactId:req.params.artifactId}))}catch(err){return respondError(res,err)}},
  groupGenerate: async(req:Request,res:Response)=>{try{return success(res,await generateTrainingGroupReport({actor:{userId:req.user!.userId,role:req.user!.role},courseId:req.params.id,selection:req.body}))}catch(err){return respondError(res,err)}},
  groupRead: async(req:Request,res:Response)=>{try{return success(res,await readTrainingGroupReport({actor:{userId:req.user!.userId,role:req.user!.role},courseId:req.params.id,taskId:req.params.taskId,artifactId:req.params.artifactId}))}catch(err){return respondError(res,err)}},
  sources:async(req:Request,res:Response)=>{try{return success(res,await discoverTrainingCourseSources(actor(req),req.params.id))}catch(err){return respondError(res,err)}},
  analyze:async(req:Request,res:Response)=>{try{
    const result=await analyzeTrainingCourse({actor:actor(req),courseId:req.params.id,selector:selectorFor(req)})
    return success(res,{manifest:trainingManifestSummary(result.manifest),analysis:result.analysis,quality:trainingQualityPage(result.quality)})
  }catch(err){return respondError(res,err)}},
  qualityList:async(req:Request,res:Response)=>{try{
    const result=await reproduce(req)
    return success(res,trainingQualityPage(result.quality,req.body?.page??1))
  }catch(err){return respondError(res,err)}},
  quality:async(req:Request,res:Response)=>{try{
    const parsed=z.object({attemptId:z.string().guid(),attemptEpoch:z.number().int().positive(),sourceHash:z.string().regex(/^[a-f0-9]{64}$/),
      expectedRevision:z.number().int().nonnegative(),verdict:z.enum(['INCLUDE','EXCLUDE']),reason:z.string().min(2).max(1000)}).parse(req.body)
    return success(res,await setTrainingAnalysisQuality({actor:actor(req),courseId:req.params.id,selector:selectorFor(req),...parsed}))
  }catch(err){return respondError(res,err)}},
  exports:async(req:Request,res:Response)=>{try{
    const {layout,format,requestKey}=z.object({layout:z.enum(['long','wide','dictionary']),format:z.enum(['csv','zip']),requestKey:z.string().min(16).max(160)}).parse(req.body)
    const result=await reproduce(req)
    const tables=result.tables
    for(const table of format==='zip'?Object.values(tables):[tables[layout]]) assertExportLimits({records:table.rows.length,fields:table.columns.length})
    return success(res,await enqueueExportJob({ authorityTokenVersion: req.user!.tokenVersion,resourceType:'TRAINING_ANALYSIS',resourceId:req.params.id,createdBy:req.user!.userId,
      anonymized:true,format,recordCount:tables[layout].rows.length,requestKey,
      options:{anonymize:true,creatorRole:actor(req).role,detail:'research',trainingAnalysis:{version:1,selector:result.manifest.selector,manifest:result.manifest,table:layout}}}))
  }catch(err){return respondError(res,err)}},
}
