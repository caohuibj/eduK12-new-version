import {loadSurveySource} from './analytics.source'
import {pairedDescriptive,type FrozenScoreObservation} from './analytics.cohorts'
import {SurveyAnalyticsError} from './analytics.read'
import { describeWaveGroups } from './analytics.descriptive'

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
  let expectedFinalCount:number|undefined
  const scores:FrozenScoreObservation[]=[]
  let columns:Awaited<ReturnType<typeof loadSurveySource>>['scoreColumns']=[]
  for(let page=0;page<MAX_PAGES;page++){
    const chunk=await loadSurveySource({
      actorUserId:input.actorUserId,projectId:input.projectId,waveIds,
      maxFinals:PAGE_SIZE,pageMode:true,includeWideSchema:true,
      includeAttendance:false,afterFinal,snapshotCutOff,expectedSourceRevision,
      expectedFinalCount,
    })
    if(chunk.collectionMode!=='LINKED_WAVES')
      throw new SurveyAnalyticsError(409,'独立匿名研究不支持按研究编号计算纵向配对')
    if(!snapshotCutOff){
      snapshotCutOff=new Date(chunk.cutOff)
      expectedSourceRevision=chunk.sourceRevision
      expectedFinalCount=chunk.sourceFinalCount??undefined
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

/** Read one selected item or Form-defined group across up to 6000 verified
 * FINALs, without carrying unrelated decrypted text or scores between pages.
 * Reuses loadSurveySource's immutable publication checks and revision/final
 * count fences. A partial page series NEVER produces success.
 */
export async function describeSurveyWaveItemPaged(input:{
  actorUserId:string;projectId:string;waveId:string;
  instrumentKey:string;itemKey:string
}){
  let afterFinal:{id:string;completedAt:Date}|undefined
  let snapshotCutOff:Date|undefined
  let expectedSourceRevision:number|undefined
  let expectedFinalCount:number|undefined
  let columnKey:string|undefined
  let responseType:string|undefined
  let prompt:string|undefined
  let optionCodes:string[]=[]
  let processed=0,respondentN=0,numericN=0,mean=0,m2=0
  const missingByReason:Record<string,number>={}
  const frequencies=new Map<string,number>()
  for(let page=0;page<MAX_PAGES;page++){
    const chunk=await loadSurveySource({
      actorUserId:input.actorUserId,projectId:input.projectId,
      waveIds:[input.waveId],maxFinals:PAGE_SIZE,pageMode:true,
      includeWideSchema:true,includeAttendance:false,
      afterFinal,snapshotCutOff,expectedSourceRevision,expectedFinalCount,
    })
    if(!snapshotCutOff){
      snapshotCutOff=new Date(chunk.cutOff)
      expectedSourceRevision=chunk.sourceRevision
      expectedFinalCount=chunk.sourceFinalCount??undefined
      const dict=chunk.codebook.filter(c=>c.waveId===input.waveId
        &&c.instrumentKey===input.instrumentKey&&c.itemKey===input.itemKey)
      if(dict.length!==1)
        throw new SurveyAnalyticsError(400,'逐题统计目标须来自唯一冻结研究项目/波次/工具/题目')
      const target=dict[0]
      if(['SHORT_TEXT','LONG_TEXT','OTHER_TEXT'].includes(target.responseType))
        throw new SurveyAnalyticsError(403,'敏感自由文本不进入自动逐题汇总')
      columnKey=target.columnKey;prompt=target.prompt;responseType=target.responseType
      optionCodes=target.options.map(o=>o.code)
    }
    processed+=chunk.completeAttempts
    for(const row of chunk.raw){
      if(row.waveId!==input.waveId||row.columnKey!==columnKey)continue
      if(row.missingReason){
        missingByReason[row.missingReason]=(missingByReason[row.missingReason]??0)+1
        continue
      }
      if(row.value===null)continue
      respondentN++
      if(typeof row.value==='number'&&Number.isFinite(row.value)){
        numericN++
        const delta=row.value-mean
        mean+=delta/numericN
        m2+=delta*(row.value-mean)
      }else if(typeof row.value==='string'&&optionCodes.length){
        const allowed=new Set(optionCodes)
        const multi=['MULTIPLE','MATRIX_MULTIPLE','SJT_MULTIPLE'].includes(responseType??'')
        if(multi){
          let values:unknown
          try{values=JSON.parse(row.value)}catch{
            throw new SurveyAnalyticsError(409,'冻结多选题的原始响应 JSON 不合法')
          }
          if(!Array.isArray(values)||values.some(v=>typeof v!=='string'||!allowed.has(v))
            ||new Set(values).size!==values.length)
            throw new SurveyAnalyticsError(409,'冻结多选题的响应选项与 Codebook 不一致')
          for(const item of values)frequencies.set(item,(frequencies.get(item)??0)+1)
        }else if(allowed.has(row.value)){
          frequencies.set(row.value,(frequencies.get(row.value)??0)+1)
        }else throw new SurveyAnalyticsError(409,'冻结选项编码与 Codebook 不一致')
      }
    }
    if(!chunk.nextFinalCursor){
      if(expectedFinalCount!==undefined&&processed!==expectedFinalCount)
        throw new SurveyAnalyticsError(409,'逐题统计页数与有效样本数量无法核对')
      return {
        projectId:input.projectId,waveId:input.waveId,instrumentKey:input.instrumentKey,
        itemKey:input.itemKey,columnKey,responseType,prompt,
        analysisFinalCount:processed,respondentN,missingByReason,
        frequencies:[...frequencies].sort(([a],[b])=>a.localeCompare(b))
          .map(([value,count])=>({value,count})),
        numericMean:numericN?mean:null,
        numericSampleSd:numericN>1?Math.sqrt(m2/(numericN-1)):null,
        sourceCutOff:snapshotCutOff.toISOString(),sourceRevision:expectedSourceRevision,
        complete:true,noTruncation:true,maxFinals:PAGE_SIZE*MAX_PAGES,
        note:'只有冻结的有效 FINAL；自由文本不做频数；非诊断描述统计。',
      }
    }
    afterFinal={id:chunk.nextFinalCursor.id,
      completedAt:new Date(chunk.nextFinalCursor.completedAt)}
  }
  throw new SurveyAnalyticsError(413,'逐题有效 FINAL 超过 6000 份，请使用受控分段导出')
}

export async function describeSurveyWaveGroupsPaged(input:{
  actorUserId:string;projectId:string;waveId:string;
  groupInstrumentKey:string;groupItemKey:string;scoreInstrumentKey:string;scoreKey:string
}){
  let afterFinal:{id:string;completedAt:Date}|undefined
  let snapshotCutOff:Date|undefined
  let expectedSourceRevision:number|undefined
  let expectedFinalCount:number|undefined
  let first:Awaited<ReturnType<typeof loadSurveySource>>|undefined
  let processed=0
  const compactRaw:NonNullable<typeof first>['raw']=[]
  const compactScores:NonNullable<typeof first>['scores']=[]
  for(let page=0;page<MAX_PAGES;page++){
    const chunk=await loadSurveySource({
      actorUserId:input.actorUserId,projectId:input.projectId,
      waveIds:[input.waveId],maxFinals:PAGE_SIZE,pageMode:true,
      includeWideSchema:true,includeAttendance:false,
      afterFinal,snapshotCutOff,expectedSourceRevision,expectedFinalCount,
    })
    if(!first){
      first=chunk
      snapshotCutOff=new Date(chunk.cutOff)
      expectedSourceRevision=chunk.sourceRevision
      expectedFinalCount=chunk.sourceFinalCount??undefined
    }
    processed+=chunk.completeAttempts
    compactRaw.push(...chunk.raw.filter(row=>row.waveId===input.waveId
      &&row.instrumentKey===input.groupInstrumentKey&&row.itemKey===input.groupItemKey))
    compactScores.push(...chunk.scores.filter(score=>score.waveId===input.waveId
      &&score.measurement.instrumentKey===input.scoreInstrumentKey
      &&score.measurement.scoreKey===input.scoreKey))
    if(!chunk.nextFinalCursor){
      if(expectedFinalCount!==undefined&&processed!==expectedFinalCount)
        throw new SurveyAnalyticsError(409,'分组统计未完整读取全部有效 FINAL')
      const summary=describeWaveGroups({...first,raw:compactRaw,scores:compactScores},
        input)
      return {...summary,sourceCutOff:snapshotCutOff!.toISOString(),
        sourceRevision:expectedSourceRevision,analysisFinalCount:processed,
        complete:true,noTruncation:true,maxFinals:PAGE_SIZE*MAX_PAGES}
    }
    afterFinal={id:chunk.nextFinalCursor.id,
      completedAt:new Date(chunk.nextFinalCursor.completedAt)}
  }
  throw new SurveyAnalyticsError(413,'分组有效 FINAL 超过 6000 份，请缩小波次范围')
}
