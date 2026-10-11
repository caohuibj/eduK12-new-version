import {loadSurveySource} from './analytics.source'
import {pairedDescriptive,type FrozenScoreObservation} from './analytics.cohorts'
import {SurveyAnalyticsError} from './analytics.read'

const PAGE_SIZE=200
const MAX_PAGES=30
/**
 * Exact linked paired descriptive statistics for up to 6000 verified FINALs
 * across two Waves. Each transaction reads <=200 sources and <=8 MiB cipher,
 * decrypts one chunk, retains only selected numeric score observations.
 * The initial snapshot timestamp and project revision fence every page.
 * Never return a partial paired mean as though it were the whole cohort.
 */
export async function describeSurveyPairedScoresPaged(input:{
  actorUserId:string;projectId:string;baselineWaveId:string;followupWaveId:string;
  instrumentKey:string;scoreKey:string
}){
  if(input.baselineWaveId===input.followupWaveId)
    throw new SurveyAnalyticsError(400,'请选择两个不同研究波次')
  const waveIds=[input.baselineWaveId,input.followupWaveId]
  let afterFinal:{id:string;completedAt:Date}|undefined
  let snapshotCutOff:Date|undefined
  let expectedSourceRevision:number|undefined
  const scores:FrozenScoreObservation[]=[]
  let columns:Awaited<ReturnType<typeof loadSurveySource>>['scoreColumns']=[]
  for(let page=0;page<MAX_PAGES;page++){
    const chunk=await loadSurveySource({
      actorUserId:input.actorUserId,projectId:input.projectId,waveIds,
      maxFinals:PAGE_SIZE,pageMode:true,includeWideSchema:true,
      includeAttendance:false,afterFinal,snapshotCutOff,expectedSourceRevision,
    })
    if(chunk.collectionMode!=='LINKED_WAVES')
      throw new SurveyAnalyticsError(409,'独立匿名研究不支持按研究编号计算纵向配对')
    if(!snapshotCutOff){
      snapshotCutOff=new Date(chunk.cutOff)
      expectedSourceRevision=chunk.sourceRevision
      columns=chunk.scoreColumns
    }
    scores.push(...chunk.scores.filter(x=>
      x.measurement.instrumentKey===input.instrumentKey
      &&x.measurement.scoreKey===input.scoreKey))
    if(!chunk.nextFinalCursor){
      return {...pairedDescriptive({
        projectId:input.projectId,baselineWaveId:input.baselineWaveId,
        followupWaveId:input.followupWaveId,
        instrumentKey:input.instrumentKey,scoreKey:input.scoreKey,
        observations:scores,expectedColumns:columns,
      }),sourceCutOff:snapshotCutOff.toISOString(),sampleRevision:expectedSourceRevision}
    }
    afterFinal={
      id:chunk.nextFinalCursor.id,
      completedAt:new Date(chunk.nextFinalCursor.completedAt),
    }
  }
  throw new SurveyAnalyticsError(413,'跨轮有效 FINAL 超过 6000 份的分析上限；请缩小研究范围')
}
