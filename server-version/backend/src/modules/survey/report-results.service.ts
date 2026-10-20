import {surveyAttemptCode} from './analytics.export-format'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {getContentRelease,type StoredRelease} from '../measurement-content/repository'
import {renderDeclaredReport,DECLARATIVE_REPORT_GENERATOR,type ReportMetricFact,type ReportReferenceFact} from '../measurement-content/report-renderer'
import {authorizedProject,SurveyBuilderError} from './builder.service'
import {loadSurveySource} from './analytics.source'
import {SurveyAnalyticsError} from './analytics.errors'
const fail=(status:number,message:string):never=>{throw new SurveyAnalyticsError(status,message)}
/** Researcher-only materialization of a selected template against saved FINAL
 * facts/interpretation. No scorer, population selector, or new interpretation.
 */
export async function readSurveyStoredReport(actorId:string,input:{projectId:string;waveId:string;finalId:string;instrumentKey:string}){
  const source=await loadSurveySource({actorUserId:actorId,projectId:input.projectId,waveIds:[input.waveId],
    finalId:input.finalId,maxFinals:1,selectRaw:false,includeInterpretation:true,includeAttendance:false})
  const saved=source.interpretations?.[0]
  if(source.completeAttempts!==1||!saved?.interpretation||!saved.binding)fail(404,'此 FINAL 没有已保存的版本解释')
  const bound=saved!.binding!.units.find(unit=>unit.instrumentKey===input.instrumentKey)
  const interpreted=saved!.interpretation!.units.find(unit=>unit.instrumentKey===input.instrumentKey)
  if(!bound?.report||!interpreted||interpreted.report.status!=='READY')fail(409,'此 FINAL 没有可读取的已选报告模板')
  return prisma.$transaction(async tx=>{
    try{await authorizedProject(tx,actorId,input.projectId,false)}catch(error){
      if(error instanceof SurveyBuilderError)fail(error.statusCode,error.message);throw error
    }
    // Existing withdrawal/quality governance locks this project and increments
    // its revision. Hold that same lock through the final read decision.
    const project=await tx.surveyProject.findUnique({where:{id:input.projectId},select:{revision:true}})
    const current=await tx.surveyWaveFinal.findFirst({where:{id:input.finalId,projectId:input.projectId,waveId:input.waveId,
      attempt:{id:saved!.attemptId,status:'COMPLETED',excludedAt:null,OR:[{sampleReview:{is:null}},{sampleReview:{is:{verdict:'INCLUDED'}}}]}},select:{resultsHash:true}})
    if(!project||project.revision!==source.sourceRevision||!current||current.resultsHash!==saved!.sourceFinalHash)fail(409,'研究来源或当前访问范围已变化')
    const cache=new Map<string,StoredRelease>()
    const read=async(pointer:{releaseId:string;contentHash:string})=>{
      let release=cache.get(pointer.releaseId)
      if(!release){release=(await getContentRelease(tx,pointer.releaseId,true))??undefined;if(release)cache.set(pointer.releaseId,release)}
      if(!release||release.contentHash!==pointer.contentHash||release.scope.kind!=='PRIVATE'||release.scope.product!=='SURVEY'
        ||release.scope.resourceId!==input.projectId||release.scope.ownerId!==actorId)fail(409,'报告内容版本来源不匹配')
      return release!
    }
    const measurement=await read(bound!.measurement),report=await read(bound!.report!)
    if(measurement.layer!=='MEASUREMENT'||report.layer!=='REPORT')return fail(409,'报告版本类型错误')
    if(measurement.content.measurementHash!==bound!.measurement.measurementHash||report.family!==measurement.family
      ||report.content.measurements.length!==1||canonicalHash(report.content.measurements[0])!==canonicalHash({releaseId:measurement.releaseId,contentHash:measurement.contentHash})
      ||report.content.generatorVersion!==DECLARATIVE_REPORT_GENERATOR||interpreted!.report.generatorVersion!==report.content.generatorVersion)fail(409,'报告版本绑定不兼容')
    // READY records eligibility at FINAL, not an already rendered artifact.
    // A revoked template cannot generate a new rendering now.
    if(report.status==='REVOKED'||measurement.status==='REVOKED')fail(409,'该测量或报告模板已撤回，不能生成新的报告视图')
    const lifecycleNotices:Array<{layer:string;releaseId:string;status:string}>=[]
    if(measurement.status!=='PUBLISHED')lifecycleNotices.push({layer:'MEASUREMENT',releaseId:measurement.releaseId,status:measurement.status})
    if(report.status!=='PUBLISHED')lifecycleNotices.push({layer:'REPORT',releaseId:report.releaseId,status:report.status})
    for(const slot of bound!.references){
      if(slot.status!=='SELECTED')continue
      const reference=await read(slot)
      if(reference.layer!=='REFERENCE'||reference.family!==measurement.family||reference.content.measurement.releaseId!==measurement.releaseId
        ||reference.content.measurement.contentHash!==measurement.contentHash)fail(409,'参考版本绑定不兼容')
      if(reference.status!=='PUBLISHED')lifecycleNotices.push({layer:'REFERENCE',releaseId:reference.releaseId,status:reference.status})
    }
    const allowed=new Set(report.content.metricKeys)
    const metrics:ReportMetricFact[]=source.scores.filter(score=>score.attemptId===saved!.attemptId&&score.measurement.instrumentKey===input.instrumentKey
      &&allowed.has(score.measurement.scoreKey)).map(score=>({metricKey:score.measurement.scoreKey,value:score.value,
        unit:measurement.content.metrics.find(m=>m.metricKey===score.measurement.scoreKey)?.unit??score.measurement.unit??'unknown',
        status:score.quality?.status==='interpretable'&&score.status===(measurement.family==='COGNITIVE'?'OK':'calculated')?'INTERPRETABLE':score.quality?.status==='invalid'?'INVALID':'UNAVAILABLE'}))
    const references:ReportReferenceFact[]=interpreted!.references.filter(ref=>allowed.has(ref.metricKey)).map(ref=>({metricKey:ref.metricKey,
      referenceKind:ref.referenceKind,status:ref.status==='AVAILABLE'?'AVAILABLE':'UNAVAILABLE',bandKey:ref.values?.bandKey??null}))
    return {accessAudience:'researcher' as const,intendedAudience:report.content.audience,sourceFinalHash:saved!.sourceFinalHash,
      contentBindingHash:saved!.interpretation!.contentBindingHash,reportRelease:bound!.report,
      interpretationSemantics:'SAVED_AT_FINAL_NO_RECALCULATION' as const,lifecycleNotices,
      report:renderDeclaredReport(report.content.template,metrics,references)}
  },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:5000})
}

/** Bounded pointer-only browser index. The existing reader supplies current
 * scope and both source fences; no per-row release/template fetches. */
export async function listSurveyStoredReports(actorId:string,input:{projectId:string;waveId:string;afterId?:string}){
  const source=await loadSurveySource({actorUserId:actorId,projectId:input.projectId,waveIds:[input.waveId],
    maxFinals:25,pageMode:true,stableIdCursor:true,selectRaw:false,selectScore:false,includeInterpretation:true,includeAttendance:false,
    ...(input.afterId?{afterFinal:{id:input.afterId,completedAt:new Date(0)}}:{})})
  const list=(source.interpretations??[]).map(saved=>{
    if(!saved.finalId||!saved.sourceVerified||saved.projectId!==input.projectId||saved.waveId!==input.waveId)fail(409,'报告列表来源不完整')
    return {finalId:saved.finalId,attemptCode:saved.researchCode??surveyAttemptCode(saved.attemptId),completedAt:saved.completedAt,
      reports:(saved.binding?.units??[]).map(unit=>({instrumentKey:unit.instrumentKey,measurementRelease:unit.measurement,
        reportRelease:unit.report??null,status:saved.interpretation?.units.find(item=>item.instrumentKey===unit.instrumentKey)?.report.status??'NOT_RECORDED'}))}
  })
  if(list.length!==source.completeAttempts)fail(409,'报告列表来源不完整')
  return {list,nextAfterId:source.nextFinalCursor?.id??null,sourceRevision:source.sourceRevision,
    semantics:'SAVED_FINAL_REPORT_POINTERS' as const}
}
