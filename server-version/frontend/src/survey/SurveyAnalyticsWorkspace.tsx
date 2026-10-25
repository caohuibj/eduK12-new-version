import {StoredPackageReports} from './StoredPackageReports'
import './survey-workspace-polish.css'
import {CheckCircle2,ClipboardCheck,Filter,UserMinus} from 'lucide-react'
import {readableAnswerCsv} from './readable-answer-export'
import { SurveySectionHeader } from './SurveySectionHeader'
import {SurveyPrivateReferenceStudio} from './SurveyPrivateReferenceStudio'
import {SurveyStoredReportReader} from './SurveyStoredReportReader'
import { useEffect,useRef,useState,type FormEvent } from 'react'

type ApiResult<T>={code:number|string;message:string;data:T|null}
type WaveSummary={id:string;ordinal:number;title:string;status:string;
  starts:number;finalCompleted:number;analysisIncluded:number;qualityExcluded:number;
  uniqueLinkedCodes:number|null;excluded:number}
type Overview={projectId:string;collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES';source:string;note:string;waves:WaveSummary[]}
type Matched={baselineN:number;followupN:number;matchedN:number;attritionN:number;lateJoinN:number;note:string}
type ScoreStat={instrumentKey:string;scoreKey:string;validN:number;mean:number|null;sampleSd:number|null;
  scoringDigest?:string;responseSignature?:string;unit?:string|null;
  provenance?:{kind:string;measurementDigest:string;scoringVersion:string;engineVersion?:string;timingPolicy?:string;devicePolicy?:string};
  qualityCounts?:Record<string,number>;completionCounts?:Record<string,number>}
type ItemStat={itemKey:string;instrumentKey:string;prompt:string;kind:string;respondentN:number;
  missingByReason:Record<string,number>;frequencies:{value:string;count:number}[];
  combinationFrequencies?:{value:string;count:number}[];responseType?:string;
  numericMean:number|null;numericSampleSd:number|null}
type WaveItems={waveId:string;items:ItemStat[];descriptiveScores:ScoreStat[];note:string;
  completedFinals?:number;fullCompletionAttempts?:number|null;earlyCompletionAttempts?:number|null}
type BoundedVariable={instrumentKey:string;itemKey:string;prompt:string;
  responseType:string;columnKey:string;kind:string}
type BoundedItem={analysisFinalCount:number;respondentN:number;prompt:string;
  itemKey:string;instrumentKey:string;responseType:string;
  frequencies:{value:string;count:number}[];missingByReason:Record<string,number>;
  numericMean:number|null;numericSampleSd:number|null;
  complete:true;sourceCutOff:string;note:string}
type PairedScore={baselineN:number;followupN:number;matchedN:number;attritionN:number;lateJoinN:number;
  meanPairedChange:number|null;comparability:'COMPARABLE'|'NOT_COMPARABLE';reason?:string}
type GroupResult={minGroupN:number;suppressedGroups:number;note:string;groups:Array<{
  optionCode:string;optionLabel:string;respondentN:number;scoreValidN:number;
  mean:number|null;sampleSd:number|null
}>}
type QualityRow={attemptId:string;attemptCode:string;researchCode:string|null;waveId:string;
  completedAt:string;verdict:'INCLUDED'|'EXCLUDED';reason:string|null;revision:number}
type QualityAudit={reviewedAt:string;reviewerId:string|null;previousVerdict:'INCLUDED'|'EXCLUDED';
  verdict:'INCLUDED'|'EXCLUDED';reason:string;revision:number}
type ExportFormat='RAW_WAVE'|'RAW_LONG'|'RAW_WIDE'|'SCORE_LONG'|'SCORE_WIDE'|'COGNITIVE_TRIAL_LONG'|'INTERPRETATION_LONG'
type Ticket={id:string;status:'READY';format:ExportFormat;expiresAt:string;
  nextCursor:string|null;pageNumber:number|null;
  manifest:{rowCount:number;columnCount:number;
    sourceCutOff?:string;sourceProjectRevision?:number;
    batch?:{phase?:'VERIFIED_FINAL'|'NON_FINAL_PARTICIPATION';representation?:string}}}
type ExportSelection={format:ExportFormat;waveId?:string;includeFreeText?:boolean;
  completedFrom?:string;completedBefore?:string}
type ExportRequest={selection:ExportSelection;cursor?:string}
type PreviousFiles={ticketId:string;page:number;parts:string[]}
class SurveyApiError extends Error {
  constructor(message:string,readonly status:number,readonly retryUntil:number|null){
    super(message+(status===429&&retryUntil===null
      ?' 服务器未提供可用的 Retry-After；请稍后手动重试，不会自动重复请求。':''))
  }
}
function retryDeadline(value:string|null):number|null{
  if(value===null||!value.trim())return null
  const time=/^\d+$/.test(value.trim())?Date.now()+Number(value)*1000:Date.parse(value)
  return Number.isFinite(time)?Math.max(Date.now(),time):null
}
const sameFrozenPage=(before:Ticket,after:Ticket)=>
  before.pageNumber===after.pageNumber&&before.format===after.format
  &&before.manifest.sourceCutOff===after.manifest.sourceCutOff
  &&before.manifest.sourceProjectRevision===after.manifest.sourceProjectRevision
  &&before.manifest.batch?.phase===after.manifest.batch?.phase
  &&before.manifest.batch?.representation===after.manifest.batch?.representation
const isCompactAttendance=(ticket:Ticket)=>['ATTENDANCE_COMPACT_V1','ATTENDANCE_COMPACT_V2']
  .includes(ticket.manifest.batch?.representation??'')
type Artifact={id:string;format:ExportFormat;csv?:string;codebook?:unknown;manifest?:unknown}
type DownloadPart='csv'|'codebook'|'manifest'|'readable'
const downloadParts:[Exclude<DownloadPart,'readable'>,string][]=[['csv','CSV'],['codebook','Codebook'],['manifest','Manifest']]
const supportsReadable=(ticket:Ticket)=>['RAW_WAVE','RAW_LONG'].includes(ticket.format)&&!isCompactAttendance(ticket)
const kindOptions:Record<ExportFormat,string>={
  RAW_WAVE:'逐题答卷（当前问卷）',
  RAW_LONG:'逐题答卷（全部轮次）',
  RAW_WIDE:'同编号逐题 Wide',
  SCORE_LONG:'全部波次探索性得分 Long',
  SCORE_WIDE:'同编号探索性得分 Wide',
  COGNITIVE_TRIAL_LONG:'单波次认知原始试次 Long',
  INTERPRETATION_LONG:'已保存解释（独立导出）',
}
async function api<T>(endpoint:string,method='GET',body?:unknown):Promise<T>{
  const headers:Record<string,string>={'Content-Type':'application/json'}
  if(method!=='GET'){
    let csrf=document.cookie.split('; ').find(x=>x.startsWith('huisurvey_research_csrf='))
      ?.split('=').slice(1).join('=')||''
    if(!csrf){
      const r=await fetch('/api/survey/auth/csrf',{credentials:'same-origin'})
      if(!r.ok)throw new Error('未能获取安全校验')
      const data=await r.json() as ApiResult<{csrfToken:string}>
      csrf=data.data?.csrfToken||''
    }
    headers['X-CSRF-Token']=decodeURIComponent(csrf)
  }
  const response=await fetch('/api/survey'+endpoint,{
    method,credentials:'same-origin',headers,
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  })
  const retryUntil=retryDeadline(response.headers?.get('Retry-After')??null)
  let result:ApiResult<T>
  try{result=await response.json() as ApiResult<T>}
  catch(e){
    if(!response.ok)throw new SurveyApiError('服务器请求未完成（HTTP '+response.status+'）',response.status,retryUntil)
    throw e
  }
  if(!response.ok||result.code!==0||result.data===null)
    throw new SurveyApiError(result.message||'操作失败',response.status,retryUntil)
  return result.data
}
const downloadBlob=(filename:string,value:string,mime:string)=>{
  const blob=new Blob([value],{type:mime})
  const url=URL.createObjectURL(blob)
  const anchor=document.createElement('a')
  anchor.href=url;anchor.download=filename
  try{document.body.append(anchor);anchor.click()}
  finally{anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),3000)}
}
export function SurveyAnalyticsWorkspace({projectId,actorId}:{projectId:string;actorId?:string}){
  const [overview,setOverview]=useState<Overview|null>(null)
  const [overviewLoading,setOverviewLoading]=useState(true),[overviewError,setOverviewError]=useState('')
  const [qualityLoading,setQualityLoading]=useState(true),[qualityError,setQualityError]=useState('')
  const [baseline,setBaseline]=useState(''),[followup,setFollowup]=useState('')
  const [paired,setPaired]=useState<Matched|null>(null)
  const [itemStats,setItemStats]=useState<WaveItems|null>(null)
  const [boundedVariables,setBoundedVariables]=useState<BoundedVariable[]>([])
  const [boundedItemKey,setBoundedItemKey]=useState('')
  const [boundedItem,setBoundedItem]=useState<BoundedItem|null>(null)
  const [metricKey,setMetricKey]=useState(''),[metricInstrument,setMetricInstrument]=useState('')
  const [pairedScore,setPairedScore]=useState<PairedScore|null>(null)
  const [groupItem,setGroupItem]=useState(''),[groupScore,setGroupScore]=useState('')
  const [groupResult,setGroupResult]=useState<GroupResult|null>(null)
  const [format,setFormat]=useState<ExportFormat>('RAW_WAVE'),[waveId,setWaveId]=useState('')
  const [exportWaveId,setExportWaveId]=useState('')
  const [downloadsStarted,setDownloadsStarted]=useState<Partial<Record<DownloadPart,boolean>>>({})
  const [downloadIssue,setDownloadIssue]=useState<string|null>(null)
  const [completedFrom,setCompletedFrom]=useState(''),[completedBefore,setCompletedBefore]=useState('')
  const [otp,setOtp]=useState(''),[busy,setBusy]=useState(false)
  const [includeFreeText,setIncludeFreeText]=useState(false),[message,setMessage]=useState('')
  const [error,setError]=useState(''),[ticket,setTicket]=useState<Ticket|null>(null)
  const [exportRequest,setExportRequest]=useState<ExportRequest|null>(null)
  const [previousFiles,setPreviousFiles]=useState<PreviousFiles|null>(null)
  const [retryUntil,setRetryUntil]=useState(0),[clock,setClock]=useState(Date.now)
  const [ticketUnavailable,setTicketUnavailable]=useState(false)
  const [continuationStopped,setContinuationStopped]=useState(false)
  const operationInFlight=useRef(false),exportEpoch=useRef(0)
  const mounted=useRef(true)
  const currentProject=useRef(projectId),currentTicket=useRef<string|null>(null)
  currentProject.current=projectId
  const previousFilesRef=useRef<PreviousFiles|null>(null)
  const [qualityRows,setQualityRows]=useState<QualityRow[]>([])
  const [qualityPage,setQualityPage]=useState(1)
  const [qualityReason,setQualityReason]=useState('')
  const [qualityHistory,setQualityHistory]=useState<{
    attemptId:string;page:number;list:QualityAudit[]
  }|null>(null)
  const base='/projects/'+projectId
  const rememberFiles=()=>{
    if(!ticket)return
    const parts=[...(downloadsStarted.readable?['中文答卷']:[]),...downloadParts.filter(([part])=>downloadsStarted[part]).map(([,label])=>label)]
    if(parts.length){
      const previous={ticketId:ticket.id,page:ticket.pageNumber??1,parts}
      previousFilesRef.current=previous;setPreviousFiles(previous)
    }
  }
  const invalidateExport=()=>{
    exportEpoch.current++;currentTicket.current=null
    rememberFiles();setTicket(null);setExportRequest(null);setDownloadsStarted({})
    setDownloadIssue(null);setTicketUnavailable(false);setContinuationStopped(false)
    // A new selection/ticket does not replenish the researcher's rate budget.
  }
  const ticketId=ticket?.id
  useEffect(()=>{
    if(!ticketId&&!retryUntil)return
    const timer=window.setInterval(()=>setClock(Date.now()),1000)
    return()=>window.clearInterval(timer)
  },[ticketId,retryUntil])
  const waiting=retryUntil>clock
  const ticketExpired=!!ticket&&Date.parse(ticket.expiresAt)<=clock
  const needsRecovery=ticketExpired||ticketUnavailable
  const changeWave=(id:string)=>{
    setWaveId(id);invalidateExport()
    setItemStats(null);setPairedScore(null);setGroupResult(null);setGroupItem('');setGroupScore('')
    setBoundedVariables([]);setBoundedItemKey('');setBoundedItem(null)
  }
  const reload=async()=>{
    setOverviewLoading(true);setOverviewError('')
    try{
      const res=await api<Overview>(base+'/analytics/overview')
      if(currentProject.current!==projectId||!mounted.current)return
      setOverview(res)
      const ordered=res.waves
      changeWave(ordered[0]?.id??'')
      if(ordered[0])setBaseline(ordered[0].id)
      if(ordered[1])setFollowup(ordered[1].id)
    }catch(e){
      if(currentProject.current===projectId&&mounted.current)setOverviewError(e instanceof Error?e.message:'完成进度尚不可用')
      throw e
    }finally{if(currentProject.current===projectId&&mounted.current)setOverviewLoading(false)}
  }
  useEffect(()=>{
    mounted.current=true
    setOverview(null);setError('');setPaired(null)
    setOverviewLoading(true);setOverviewError('');setQualityLoading(true);setQualityError('')
    exportEpoch.current++;currentTicket.current=null
    setTicket(null);setExportRequest(null);setDownloadsStarted({});setDownloadIssue(null)
    setTicketUnavailable(false);setContinuationStopped(false)
    previousFilesRef.current=null;setPreviousFiles(null)
    setQualityRows([]);setQualityPage(1)
    void Promise.all([reload(),loadQuality(1)])
      .catch(e=>{if(currentProject.current===projectId)setError(e instanceof Error?e.message:'研究分析尚不可用')})
    return()=>{mounted.current=false;currentTicket.current=null}
  },[projectId])
  const execute=async(fn:()=>Promise<void>,isCurrent=()=>true)=>{
    if(operationInFlight.current)return
    operationInFlight.current=true
    setBusy(true);setError('');setMessage('');setDownloadIssue(null)
    try{await fn()}catch(e){if(isCurrent())setError(e instanceof Error?e.message:'请求未完成')}
    finally{operationInFlight.current=false;setBusy(false)}
  }
  const loadQuality=async(page=qualityPage)=>{
    setQualityLoading(true);setQualityError('')
    try{
      const data=await api<{list:QualityRow[]}>(base+'/analytics/quality/attempts?page='+page)
      if(currentProject.current!==projectId||!mounted.current)return
      setQualityRows(data.list);setQualityPage(page);setQualityHistory(null)
    }catch(e){
      if(currentProject.current===projectId&&mounted.current)setQualityError(e instanceof Error?e.message:'质量复核列表尚不可用')
      throw e
    }finally{if(currentProject.current===projectId&&mounted.current)setQualityLoading(false)}
  }
  const openQualityHistory=(row:QualityRow,page=1)=>void execute(async()=>{
    const data=await api<{list:QualityAudit[];page:number}>(
      base+'/analytics/quality/attempts/'+row.attemptId+'/history?page='+page)
    setQualityHistory({attemptId:row.attemptId,page:data.page,list:data.list})
  })
  const markQuality=(row:QualityRow,verdict:'INCLUDED'|'EXCLUDED')=>{
    if(qualityReason.trim().length<2)return
    if(!window.confirm(verdict==='EXCLUDED'
      ?'该决定会把此份 FINAL 从后续有效样本分析排除，但不删除原始答卷。确认？'
      :'确认将该份记录重新纳入有效分析？原始 FINAL 保持不变。'))return
    void execute(async()=>{
      await api(base+'/analytics/quality/attempts/'+row.attemptId,'POST',{
        revision:row.revision,verdict,reason:qualityReason.trim(),
      })
      setQualityReason('');invalidateExport()
      await Promise.all([reload(),loadQuality(qualityPage)])
      setMessage('样本质量决定已记录审计，旧的未下载导出已失效。')
    })
  }
  const compare=()=>void execute(async()=>{
    setPaired(await api<Matched>(base+'/analytics/paired-counts','POST',{
      baselineWaveId:baseline,followupWaveId:followup,
    }))
  })
  const loadItems=()=>void execute(async()=>{
    const result=await api<WaveItems>(base+'/analytics/waves/'+waveId+'/items')
    setItemStats(result);setPairedScore(null);setGroupResult(null)
    if(result.descriptiveScores[0]){
      setMetricKey(result.descriptiveScores[0].scoreKey)
      setMetricInstrument(result.descriptiveScores[0].instrumentKey)
    }
  })
  const openBoundedDictionary=()=>void execute(async()=>{
    const result=await api<{variables:BoundedVariable[]}>(
      base+'/analytics/waves/'+waveId+'/items/dictionary')
    setBoundedVariables(result.variables)
    setBoundedItemKey(result.variables[0]?.columnKey??'')
    setBoundedItem(null)
    setMessage('已读取该波次冻结的变量字典。单题可处理最多 6000 份有效 FINAL，超过会明确报错。')
  })
  const loadBoundedItem=()=>void execute(async()=>{
    const variable=boundedVariables.find(v=>v.columnKey===boundedItemKey)
    if(!variable)throw new Error('请先选择一个冻结研究变量')
    const result=await api<BoundedItem>(
      base+'/analytics/waves/'+waveId+'/items/paged','POST',{
        instrumentKey:variable.instrumentKey,itemKey:variable.itemKey,
      })
    setBoundedItem(result)
  })
  const compareScore=()=>void execute(async()=>{
    const score=await api<PairedScore>(base+'/analytics/paired-scores','POST',{
      baselineWaveId:baseline,followupWaveId:followup,
      instrumentKey:metricInstrument,scoreKey:metricKey,
    })
    setPairedScore(score)
  })
  const compareGroups=()=>void execute(async()=>{
    const [groupInstrumentKey,groupItemKey]=groupItem.split(':')
    const [scoreInstrumentKey,scoreKey]=groupScore.split(':')
    const result=await api<GroupResult>(base+'/analytics/waves/'+waveId+'/group-scores','POST',{
      groupInstrumentKey,groupItemKey,scoreInstrumentKey,scoreKey,
    })
    setGroupResult(result)
  })
  const stepUp=(e:FormEvent)=>{e.preventDefault();void execute(async()=>{
    await api('/auth/mfa/step-up','POST',{code:otp.trim()})
    setOtp('');setMessage('已完成最新 TOTP 二次认证；敏感导出仅在接下来的五分钟内有效。')
  })}
  const exportFailure=(e:unknown,kind:'read'|'create'|'continuation')=>{
    if(!(e instanceof SurveyApiError))return
    if(e.status===429){setRetryUntil(e.retryUntil??0);setClock(Date.now())}
    if(kind==='read'&&(e.status===404||e.status===410))setTicketUnavailable(true)
    if(e.status===409||(kind==='continuation'&&e.status===400))setContinuationStopped(true)
  }
  const createExport=(mode:'new'|'next'|'recover'|'restart'='new')=>{
    if(operationInFlight.current||retryUntil>Date.now())return
    const recovering=mode==='recover',continuing=mode==='next'||recovering
    if(continuing&&(!ticket||!exportRequest||continuationStopped))return
    const cursor=recovering?exportRequest?.cursor:mode==='next'?ticket?.nextCursor:undefined
    if(continuing&&!cursor)return
    if(!continuing&&(ticket||previousFilesRef.current)&&!window.confirm(
      '将从首批开始新的完整导出，并采用新水位。旧的部分文件不能与新导出混作同一批；旧磁盘文件不会删除。确认重新开始？'))return
    const epoch=exportEpoch.current,project=projectId
    const isCurrent=()=>mounted.current&&currentProject.current===project&&exportEpoch.current===epoch
    void execute(async()=>{
      try{
        const selection:ExportSelection=continuing?{...exportRequest!.selection}:{
          format,...(['RAW_WAVE','COGNITIVE_TRIAL_LONG','INTERPRETATION_LONG'].includes(format)?{waveId}:
            (['RAW_LONG','SCORE_LONG'].includes(format)&&exportWaveId?{waveId:exportWaveId}:{})),
          ...(format.startsWith('RAW')?{includeFreeText}:{}),
          ...(['RAW_WAVE','COGNITIVE_TRIAL_LONG','INTERPRETATION_LONG'].includes(format)?{
            ...(completedFrom?{completedFrom:new Date(completedFrom).toISOString()}:{}),
            ...(completedBefore?{completedBefore:new Date(completedBefore).toISOString()}:{}),
          }:{}),
        }
        const result=await api<Ticket>(base+'/exports','POST',{
          ...selection,...(cursor?{cursor}:{}),
        })
        if(!isCurrent())return
        if(recovering&&!sameFrozenPage(ticket!,result))
          throw new SurveyApiError('重建回执与原批次页号或冻结来源不一致，已停止此分页导出。',409,null)
        rememberFiles()
        exportEpoch.current++;currentTicket.current=result.id
        setTicket(result);setExportRequest({selection,...(cursor?{cursor}:{})})
        setDownloadsStarted({});setTicketUnavailable(false);setContinuationStopped(false);setClock(Date.now())
        setMessage(recovering
          ?'已重新生成当前第 '+(result.pageNumber||1)+' 批。新票据的三个文件均需分别发起；Manifest generatedAt 会变化，不保证与旧文件逐字相同。请使用同一新票据的三件文件。'
          :isCompactAttendance(result)
            ?'已生成紧凑参与状态表；每人每波次一行。按研究编号及波次关联 FINAL CSV，切勿直接拼接两种 CSV。'
            :'第 '+(result.pageNumber||1)+' 批有效 FINAL 已生成；逐批下载并保留 Manifest。')
      }catch(e){
        if(!isCurrent())return
        exportFailure(e,continuing?'continuation':'create')
        const issue=e instanceof TypeError||e instanceof SyntaxError
          ||(e instanceof DOMException&&e.name==='SyntaxError')
          ?'生成结果未确认；没有自动重复生成。原批次位置已保留，请先核对状态，再明确选择操作。'
          :e instanceof Error?e.message:'生成结果未确认；没有自动重新生成，请先核对当前批次。'
        setDownloadIssue(issue)
        throw new Error(issue)
      }
    },isCurrent)
  }
  const download=(part:DownloadPart)=>{
    if(!ticket||retryUntil>Date.now()||needsRecovery||continuationStopped)return
    if(Date.parse(ticket.expiresAt)<=Date.now()){setClock(Date.now());return}
    const epoch=exportEpoch.current,project=projectId,id=ticket.id
    const isCurrent=()=>mounted.current&&currentProject.current===project&&exportEpoch.current===epoch&&currentTicket.current===id
    void execute(async()=>{
    try{
    const label=part==='readable'?'中文答卷':downloadParts.find(([key])=>key===part)![1]
    let artifact:Artifact
    try{
      const requestedParts=part==='readable'?(['csv','codebook'] as const):[part]
      const artifacts=await Promise.all(requestedParts.map(async requestedPart=>{
        const result=await api<Artifact>(base+'/exports/'+ticket.id+'/download?part='+requestedPart)
        if(result.id!==ticket.id||result.format!==ticket.format||
          (requestedPart==='csv'?typeof result.csv!=='string':!result[requestedPart]||typeof result[requestedPart]!=='object'))
          throw new Error('导出回执与当前批次不一致或内容不完整')
        return result
      }))
      artifact=Object.assign({},...artifacts)
    }catch(e){
      if(!isCurrent())return
      exportFailure(e,'read')
      const reason=e instanceof TypeError||e instanceof SyntaxError
        ||(e instanceof DOMException&&e.name==='SyntaxError')
        ?'未能读取服务器文件内容，请检查连接后重试此文件。'
        :e instanceof Error?e.message:'请重试原批次。'
      throw new Error(label+' 内容获取失败，尚未发起本次文件下载。'+reason)
    }
    if(!isCurrent())return
    const batchLabel=String(ticket.pageNumber??1).padStart(3,'0')
    const baseName='survey_'+projectId.slice(0,8)+'_'+artifact.format.toLowerCase()
      +'_batch'+batchLabel+(isCompactAttendance(ticket)
        ?'_attendance':'')+'_'+ticket.id.slice(0,8)
    const filename=baseName+(part==='readable'?'_中文答卷.csv':part==='csv'?'.csv':'_'+part+'.json')
    const readable=part==='readable'?readableAnswerCsv(artifact.csv!,artifact.codebook):null
    try{
      downloadBlob(filename,part==='readable'?'\uFEFF'+readable:part==='csv'?'\uFEFF'+artifact.csv:
        JSON.stringify(part==='codebook'?artifact.codebook:artifact.manifest,null,2),
      (part==='csv'||part==='readable')?'text/csv;charset=utf-8':'application/json;charset=utf-8')
    }catch{throw new Error(label+' 下载发起结果未确认，请先核对浏览器下载列表，再重试此文件。')}
    setDownloadsStarted(previous=>({...previous,[part]:true}))
    setMessage('已发起 '+filename+' 下载。请在浏览器下载列表核对是否保存；网页无法确认文件已落盘。若被取消或拦截，请重试此文件。')
    }catch(e){
      if(!isCurrent())return
      setDownloadIssue(e instanceof Error?e.message:'文件下载结果未确认，请核对浏览器下载列表。');throw e
    }
  },isCurrent)}
  return <section className="survey-studio-surface survey-data-surface border rounded-xl bg-white p-4 sm:p-6 my-5 space-y-4" aria-label="研究数据">
    <SurveySectionHeader compact section="data" title="研究数据" showNavigation={!!overview} actions={<button className="btn-secondary" disabled={busy||overviewLoading} onClick={()=>void execute(reload)}>刷新完成进度</button>}>
      <p className="text-sm text-slate-600">完成与配对统计只来源于可核对的加密 Survey FINAL；研究编号数不等于经过实名验证的自然人数。</p></SurveySectionHeader>
    {error&&(!downloadIssue||!ticket)&&<p role="alert" className="border-l-4 border-red-600 bg-red-50 p-3">{error}</p>}
    {message&&<p role="status" className="border-l-4 border-teal-600 bg-teal-50 p-3">{message}</p>}
    <fieldset id="survey-data-overview" tabIndex={-1} disabled={busy} className="min-w-0 border-0 p-0 space-y-4" aria-label="研究数据操作">
    {overviewLoading&&<p role="status">正在加载完成进度…</p>}
    {overviewError&&<p role="alert">完成进度加载失败：{overviewError}。请使用“刷新完成进度”重试。{overview?'下方保留上次成功读取的数据，可能不是最新状态。':''}</p>}
    {!overviewLoading&&!overviewError&&overview?.waves.length===0&&<p>本项目暂无研究波次。请先在发布入口创建并保存波次。</p>}
    {overview&&<><section className="survey-data-summary" aria-label="答卷完成概览"><div className="survey-data-summary-heading"><h3>答卷完成情况</h3><span>各波次累计答卷，不代表独立参与人数</span></div><div className="survey-data-metrics">{[
      {label:'已完成答卷',key:'finalCompleted' as const,Icon:ClipboardCheck},
      {label:'有效分析答卷',key:'analysisIncluded' as const,Icon:CheckCircle2},
      {label:'质量排除',key:'qualityExcluded' as const,Icon:Filter},
      {label:'撤回排除',key:'excluded' as const,Icon:UserMinus},
    ].map(({label,key,Icon})=><article key={key}><span><Icon size={17} aria-hidden="true"/>{label}</span><strong>{overview.waves.every(w=>typeof w[key]==='number')?overview.waves.reduce((sum,w)=>sum+w[key],0):'—'}</strong></article>)}</div></section>
    <div className="survey-data-wave-table overflow-x-auto" tabIndex={0} role="region" aria-label="研究波次完成统计"><table className="w-full text-sm border-collapse">
      <thead><tr className="bg-slate-100"><th className="p-2 text-left">波次</th><th className="p-2">状态</th>
        <th className="p-2">已启动</th><th className="p-2">已完成答卷</th>
        <th className="p-2">有效分析</th><th className="p-2">质量排除</th>
        <th className="p-2">研究编号数</th><th className="p-2">撤回排除</th></tr></thead>
      <tbody>{overview.waves.map(w=><tr key={w.id} className="border-b">
        <th scope="row" className="p-2 text-left">T{w.ordinal} · {w.title}</th><td className="p-2 text-center"><span className="survey-data-wave-state" data-status={w.status}>{{OPEN:'采集中',DRAFT:'未开放',PAUSED:'已暂停',CLOSED:'已结束'}[w.status]||w.status}</span></td>
        <td className="p-2 text-center">{w.starts}</td><td className="p-2 text-center">{w.finalCompleted}</td>
        <td className="p-2 text-center">{w.analysisIncluded}</td>
        <td className="p-2 text-center">{w.qualityExcluded}</td>
        <td className="p-2 text-center">{w.uniqueLinkedCodes??'不可关联'}</td>
        <td className="p-2 text-center">{w.excluded}</td></tr>)}</tbody></table></div>
      <details className="survey-data-count-note"><summary>答卷数量与统计口径</summary><p>{overview.note} 质量排除不修改原始答卷；参与者撤回另行处理。</p></details>
      <section id="survey-data-quality" data-empty={!qualityRows.length} tabIndex={-1} className="survey-task-card space-y-3" aria-label="科研样本质量复核">
        <h3 className="font-semibold">科研样本质量复核</h3>
        <p className="text-xs text-slate-600">只列出本人项目已完成且未撤回的 FINAL。审核决定可恢复，必须注明理由并留痕。</p>
        <label className="survey-quality-reason block text-sm">本次复核理由（必填）
          <textarea className="input block w-full" disabled={busy||!qualityRows.length} maxLength={1000} value={qualityReason}
            onChange={e=>setQualityReason(e.target.value)} placeholder="例如：注意力题未通过；或重新检查后符合纳入标准"/>
        </label>
        {qualityLoading&&<p role="status">正在加载质量复核列表…</p>}
        {qualityError&&<div role="alert"><p>质量复核列表加载失败：{qualityError}。{qualityRows.length?'下方保留上次成功读取的记录。':''}</p>
          <button type="button" className="btn-secondary" disabled={busy||qualityLoading} onClick={()=>void execute(()=>loadQuality())}>重试质量复核列表</button></div>}
        {!qualityLoading&&!qualityError&&!qualityRows.length&&<div className="survey-data-empty"><CheckCircle2 size={22} aria-hidden="true"/><p>此页暂无可复核的已完成答卷。</p><span>问卷提交后，可在这里检查答卷并记录复核决定。</span></div>}
        {qualityRows.map(row=><div className="survey-quality-record flex flex-wrap justify-between gap-3 border-b py-2" key={row.attemptId}>
          <div className="text-xs"><code>{row.attemptCode}</code>
            <p>{row.researchCode??'独立匿名作答'} · <span className="survey-quality-verdict" data-verdict={row.verdict}>{row.verdict==='EXCLUDED'?'当前排除':'当前纳入'}</span></p>
            <p>{row.reason??'尚无人工质量复核'} · {new Date(row.completedAt).toLocaleString('zh-CN')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={busy}
              onClick={()=>qualityHistory?.attemptId===row.attemptId
                ?setQualityHistory(null):openQualityHistory(row)}>
              {qualityHistory?.attemptId===row.attemptId?'收起审核历史':'查看审核历史'}</button>
            <button type="button" className="btn-secondary"
              disabled={busy||qualityReason.trim().length<2}
              onClick={()=>markQuality(row,row.verdict==='EXCLUDED'?'INCLUDED':'EXCLUDED')}>
              {row.verdict==='EXCLUDED'?'恢复纳入':'排除有效样本'}</button>
          </div>
          {qualityHistory?.attemptId===row.attemptId&&<div className="w-full text-xs bg-slate-50 p-3 space-y-2">
            <strong>按时间倒序的质量审核记录（不展示原始回答）</strong>
            {qualityHistory.list.length===0&&<p>无更多审核记录。</p>}
            {qualityHistory.list.map(event=><p key={event.revision}>
              {new Date(event.reviewedAt).toLocaleString('zh-CN')} ·
              第 {event.revision} 次审核：
              {event.previousVerdict==='INCLUDED'?'纳入':'排除'} →
              {event.verdict==='INCLUDED'?'纳入':'排除'}；
              理由：{event.reason}
            </p>)}
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" type="button"
                disabled={busy||qualityHistory.page<=1}
                onClick={()=>openQualityHistory(row,qualityHistory.page-1)}>上一页</button>
              <span>第 {qualityHistory.page} 页</span>
              <button className="btn-secondary" type="button"
                disabled={busy||qualityHistory.list.length<25}
                onClick={()=>openQualityHistory(row,qualityHistory.page+1)}>下一页</button>
            </div>
          </div>}
        </div>)}
        <div className="survey-workflow-pagination flex gap-3 items-center text-sm">
          <button className="btn-secondary" disabled={busy||qualityPage<=1}
            onClick={()=>void execute(()=>loadQuality(qualityPage-1))}>上一页</button>
          第 {qualityPage} 页
          <button className="btn-secondary" disabled={busy||qualityRows.length<25}
            onClick={()=>void execute(()=>loadQuality(qualityPage+1))}>下一页</button>
        </div>
      </section>
      {overview.collectionMode==='LINKED_WAVES'&&overview.waves.length>=2&&<div className="survey-data-matching border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">纵向匹配 · 有效完成记录</h3><p className="survey-data-section-intro">选择前后两次问卷，核对同一研究编号的有效答卷。</p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">基线<select className="input block" value={baseline}
            onChange={e=>setBaseline(e.target.value)}>{overview.waves.map(w=>
              <option key={w.id} value={w.id}>T{w.ordinal} {w.title}</option>)}</select></label>
          <label className="text-sm">后测<select className="input block" value={followup}
            onChange={e=>setFollowup(e.target.value)}>{overview.waves.map(w=>
              <option key={w.id} value={w.id}>T{w.ordinal} {w.title}</option>)}</select></label>
          <button type="button" className="btn-secondary" disabled={busy||baseline===followup} onClick={compare}>计算匹配答卷数</button>
        </div>
        {paired&&<div className="text-sm grid sm:grid-cols-3 gap-3">
          <p>基线完成 <strong>{paired.baselineN}</strong></p><p>后测完成 <strong>{paired.followupN}</strong></p>
          <p>真正匹配 <strong>{paired.matchedN}</strong></p><p>失访 <strong>{paired.attritionN}</strong></p>
          <p>中途加入 <strong>{paired.lateJoinN}</strong></p>
          <p className="sm:col-span-3 text-xs">{paired.note} 量表配对得分只能在确定可比的工具版本下进一步计算。</p>
        </div>}
      </div>}
      <div id="survey-data-statistics" tabIndex={-1} className="survey-task-card space-y-4">
        <h3 className="font-semibold">逐题与描述性统计</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">波次
            <select className="input block" value={waveId} onChange={e=>changeWave(e.target.value)}>
              {overview.waves.map(w=><option key={w.id} value={w.id}>T{w.ordinal} {w.title}</option>)}
            </select></label>
          <button type="button" className="btn-secondary" disabled={busy||!waveId} onClick={loadItems}>
            查看此波次题目频数与探索性得分</button>
        </div>
        <details className="survey-workflow-disclosure survey-bounded-statistics"><summary><span>大样本单题统计</span><span className="survey-workflow-summary">至多 6000 份有效 FINAL · 按需读取</span></summary><div className="survey-workflow-disclosure-body space-y-3">
          <p className="text-xs text-slate-600">先读取冻结变量字典，再选择一个非敏感题目。
            后台按 200 份分页，仅累积受控频数、缺失和数值统计；全部页校验通过后才返回结果。
            本入口不自动展示敏感自由文本。</p>
          <button type="button" className="btn-secondary" disabled={busy||!waveId}
            onClick={openBoundedDictionary}>读取当前波次变量字典</button>
          {boundedVariables.length>0&&<div className="flex flex-wrap gap-2 items-end">
            <label className="block text-sm flex-1 min-w-[180px]">选择冻结变量
              <select className="input block w-full" aria-label="大样本题目" value={boundedItemKey}
                onChange={e=>{setBoundedItemKey(e.target.value);setBoundedItem(null)}}>
                {boundedVariables.map(q=><option key={q.columnKey} value={q.columnKey}>
                  {q.instrumentKey} · {q.prompt}（{q.itemKey}）</option>)}
              </select>
            </label>
            <button type="button" className="btn-secondary" disabled={busy||!boundedItemKey}
              onClick={loadBoundedItem}>计算本题完整分批统计</button>
          </div>}
          {boundedItem&&<div className="border rounded-lg p-3 text-sm space-y-2">
            <p className="font-medium">{boundedItem.prompt}</p>
            <p>有效分析 FINAL N={boundedItem.analysisFinalCount}，本题有效回答 N={boundedItem.respondentN}，
              均值={boundedItem.numericMean?.toFixed(2)??'—'}，
              SD={boundedItem.numericSampleSd?.toFixed(2)??'—'}</p>
            {boundedItem.frequencies.length>0&&<p>选项频数：
              {boundedItem.frequencies.map(row=>row.value+'：'+row.count).join('；')}</p>}
            {Object.keys(boundedItem.missingByReason).length>0&&<p>缺失：
              {Object.entries(boundedItem.missingByReason).map(([why,count])=>why+'：'+count).join('；')}</p>}
            <p className="text-xs text-slate-500">已核对全部有效 FINAL ·
              数据截止 {new Date(boundedItem.sourceCutOff).toLocaleString('zh-CN')} · {boundedItem.note}</p>
          </div>}
        </div></details>
        {itemStats&&<div className="survey-statistics-results space-y-4">
          <p className="text-xs">{itemStats.note}</p>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr><th className="text-left p-2">题目</th><th>有效回答 N</th><th>频数 / 缺失</th><th>数值均值</th></tr></thead>
            <tbody>{itemStats.items.slice(0,150).map(q=><tr key={q.itemKey+'-'+q.instrumentKey} className="border-t">
              <th className="text-left p-2 font-normal">{q.prompt}</th>
              <td className="text-center">{q.respondentN}</td>
              <td className="text-xs p-2">{q.frequencies.map(c=>c.value+': '+c.count).join('；')}
                {(q.combinationFrequencies?.length??0)>0&&<p>多选组合：
                  {q.combinationFrequencies!.map(x=>x.value+': '+x.count).join('；')}</p>}
                {Object.entries(q.missingByReason).length>0&&<p>缺失：{Object.entries(q.missingByReason).map(([k,v])=>k+': '+v).join('；')}</p>}</td>
              <td className="text-center">{q.numericMean===null?'—':q.numericMean.toFixed(2)}</td>
            </tr>)}</tbody>
          </table></div>
          {itemStats.descriptiveScores.length>0&&<div>
            <h4 className="font-semibold text-sm">研究性维度得分（非诊断）</h4>
            {itemStats.completedFinals!==undefined&&<p className="text-xs">持久 FINAL：{itemStats.completedFinals}；完整完成：{itemStats.fullCompletionAttempts??'—'}；提前结束：{itemStats.earlyCompletionAttempts??'—'}。</p>}
            {itemStats.descriptiveScores.map((m,index)=><div key={m.instrumentKey+':'+m.scoreKey+':'+index} className="text-sm my-2"><p>
              {m.instrumentKey} · {m.scoreKey}：N={m.validN}，
              M={m.mean?.toFixed(2)??'—'}，
              SD={m.sampleSd?.toFixed(2)??'—'}{m.unit?'（单位：'+m.unit+'）':''}
              </p>
              {m.qualityCounts&&<p className="text-xs">质量状态：{Object.entries(m.qualityCounts).map(([k,v])=>k+' '+v).join('；')}。均值仅作描述，不能据此认定全部样本可解释。</p>}
              {m.completionCounts&&<p className="text-xs">完成类型：{Object.entries(m.completionCounts).map(([k,v])=>k+' '+v).join('；')}</p>}
              {m.provenance&&<p className="text-xs break-all">冻结测量：{m.provenance.measurementDigest}；评分 {m.provenance.scoringVersion}{m.provenance.engineVersion?'；引擎 '+m.provenance.engineVersion:''}{m.provenance.timingPolicy?'；计时 '+m.provenance.timingPolicy:''}</p>}
            </div>)}
          </div>}
        </div>}
        {itemStats&&itemStats.items.some(q=>q.kind==='FORM'&&['SINGLE','LIKERT'].includes(q.responseType||''))
          &&itemStats.descriptiveScores.length>0&&
          <div className="border-t pt-3 space-y-3">
            <h4 className="font-medium">Form 分组变量 · 描述性量表得分比较</h4>
            <p className="text-xs">仅使用本项目冻结的单选/量表回答，不展示少于 5 份完成回答的分组。</p>
            <select className="input block w-full" aria-label="选择 Form 分组题"
              value={groupItem} onChange={e=>{setGroupItem(e.target.value);setGroupResult(null)}}>
              <option value="">选择 Form 分组题</option>
              {itemStats.items.filter(q=>q.kind==='FORM'&&['SINGLE','LIKERT'].includes(q.responseType||''))
                .map(q=><option key={q.instrumentKey+':'+q.itemKey}
                  value={q.instrumentKey+':'+q.itemKey}>{q.prompt}</option>)}
            </select>
            <select className="input block w-full" aria-label="选择组内描述性计分"
              value={groupScore} onChange={e=>{setGroupScore(e.target.value);setGroupResult(null)}}>
              <option value="">选择需要比较的研究性得分</option>
              {itemStats.descriptiveScores.map(q=><option key={q.instrumentKey+':'+q.scoreKey}
                value={q.instrumentKey+':'+q.scoreKey}>{q.instrumentKey} / {q.scoreKey}</option>)}
            </select>
            <button type="button" className="btn-secondary" disabled={busy||!groupItem||!groupScore}
              onClick={compareGroups}>计算受控分组描述</button>
            {groupResult&&<div className="text-sm space-y-2">
              {groupResult.groups.map(g=><p key={g.optionCode}>{g.optionLabel}：
                N={g.respondentN}，得分有效 N={g.scoreValidN}，
                M={g.mean?.toFixed(2)??'—'}，SD={g.sampleSd?.toFixed(2)??'—'}</p>)}
              <p>未展示的小样本组：{groupResult.suppressedGroups}；最低单组样本数：{groupResult.minGroupN}</p>
              <p className="text-xs">{groupResult.note}</p>
            </div>}
          </div>}
        {itemStats&&overview.collectionMode==='LINKED_WAVES'&&itemStats.descriptiveScores.length>0&&
        <div className="border-t pt-3 space-y-3">
          <h4 className="font-medium">可比较指标的配对平均变化</h4>
          <select aria-label="选择配对比较指标" className="input block w-full"
            value={metricInstrument+':'+metricKey}
            onChange={e=>{const [instrument,score]=e.target.value.split(':')
              setMetricInstrument(instrument);setMetricKey(score);setPairedScore(null)}}>
            {itemStats.descriptiveScores.map(metric=>
              <option key={metric.instrumentKey+':'+metric.scoreKey}
                value={metric.instrumentKey+':'+metric.scoreKey}>
                {metric.instrumentKey} / {metric.scoreKey}</option>)}
          </select>
          <button type="button" className="btn-secondary" disabled={busy||!baseline||!followup||
            baseline===followup} onClick={compareScore}>计算真实配对样本的分数变化</button>
          {pairedScore&&<p className="text-sm">
            匹配 N={pairedScore.matchedN}，{pairedScore.comparability==='COMPARABLE'
              ?'配对均值变化 '+(pairedScore.meanPairedChange?.toFixed(2)??'样本不足')
              :'不可直接比较：'+(pairedScore.reason||'测量或计分版本不一致')}。
            这只是描述性比较，不构成干预因果或诊断结论。
          </p>}
        </div>}
      </div>
      <div id="survey-data-export" tabIndex={-1} className="survey-task-card survey-export-card space-y-4">
        <div className="survey-export-heading"><div><p className="survey-export-eyebrow">研究数据 / 导出</p><h3>导出答卷</h3><p>把回答带走，轻松阅读与整理。</p></div><span>中文题目 · 中文答案</span></div>
        <p className="survey-export-intro">中文答卷中，每位被试占一行，每道题占一列；表头为中文题目，单元格直接显示中文答案。</p>
        <details className="survey-workflow-help"><summary>导出流程说明</summary><ol aria-label="导出操作步骤" className="list-decimal pl-5 text-sm space-y-1">
          <li>完成二次认证，再选择数据范围与格式。</li>
          <li>手动创建受控导出，核对当前批次。</li>
          <li>分别下载三份文件，并在浏览器下载列表确认保存。</li>
        </ol></details>
        <details className="survey-export-policy rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">批次限制与文件合并说明</summary><p className="mt-2">每批至多 250 份 FINAL、2MB，复杂量表会按安全预算自动缩小批次；RAW_WAVE 以及选定单波次的 RAW_LONG / SCORE_LONG 可按签名游标连续分批。全部波次 Wide 与未限定波次的 Long 仍适用 250 FINAL 上限；新单波次分页的有效 FINAL 与非 FINAL 参与状态使用不同 CSV 结构，后者每人每波次一行，按研究编号和波次关联而非直接拼接。分批时请保留全部 CSV、Codebook、Manifest。</p></details>
        <section className="survey-export-step" aria-label="导出身份确认"><h4><span aria-hidden="true">1</span>确认身份</h4><form className="flex flex-wrap gap-3 items-end" onSubmit={stepUp}>
          <label className="text-sm">动态验证码
            <input className="input block" inputMode="numeric" type="password" autoComplete="off"
              value={otp} onChange={e=>setOtp(e.target.value)} placeholder="6 位验证码"/></label>
          <button className="btn-secondary" disabled={busy||otp.length<6}>验证身份</button>
        </form></section>
        <section className="survey-export-step" aria-label="导出数据范围"><h4><span aria-hidden="true">2</span>选择导出内容</h4><div className="survey-export-filters flex flex-wrap gap-3 items-end">
          <label className="text-sm">数据格式
            <select className="input block" value={format} onChange={e=>{setFormat(e.target.value as ExportFormat);invalidateExport()}}>
              {Object.entries(kindOptions).filter(([kind])=>
                overview.collectionMode==='LINKED_WAVES'||!kind.includes('WIDE'))
                .map(([kind,label])=><option key={kind} value={kind}>{label}</option>)}
            </select></label>
          {['RAW_LONG','SCORE_LONG'].includes(format)&&
             <label className="text-sm">大样本可选单波次分批导出
               <select className="input block" value={exportWaveId}
                 onChange={e=>{setExportWaveId(e.target.value);invalidateExport()}}>
                 <option value="">全部波次（≤250 FINAL）</option>
                 {overview.waves.map(w=><option key={w.id} value={w.id}>T{w.ordinal} {w.title}</option>)}
               </select>
             </label>}
           {['RAW_WAVE','COGNITIVE_TRIAL_LONG','INTERPRETATION_LONG'].includes(format)&&<label className="text-sm">波次
            <select className="input block" value={waveId} onChange={e=>changeWave(e.target.value)}>
              {overview.waves.map(w=><option key={w.id} value={w.id}>T{w.ordinal} {w.title}</option>)}
            </select></label>}
          {['RAW_WAVE','COGNITIVE_TRIAL_LONG','INTERPRETATION_LONG'].includes(format)&&<details className="survey-export-time-filter"><summary>按提交时间筛选（可选）</summary><div className="grid gap-2 text-sm">
            <label>完成时间起点（含）<input type="datetime-local" className="input block w-full"
              value={completedFrom} onChange={e=>{setCompletedFrom(e.target.value);invalidateExport()}}/></label>
            <label>完成时间终点（不含）<input type="datetime-local" className="input block w-full"
              value={completedBefore} onChange={e=>{setCompletedBefore(e.target.value);invalidateExport()}}/></label>
            <p className="text-xs">{format==='INTERPRETATION_LONG'?'留空表示不限制。仅按 FINAL 完成时间筛选已保存解释。':'留空表示不限制。按完成时间分段；未 FINAL 的记录可能重复出现，合并时请按研究编号和状态去重。'}</p>
          </div></details>}

        </div>
        {retryUntil>0&&<p role="status" className="text-sm text-amber-800">
          {waiting?'服务器要求等待至 '+new Date(retryUntil).toLocaleString('zh-CN')
            +'（剩余 '+Math.ceil((retryUntil-clock)/1000)+' 秒）；请勿重复请求。'
            :'服务器指定的等待时间已到；请手动继续，仍须通过服务端限流与二次认证。'}
          不会自动下载或重新生成；新建票据也不会重置读取限额。
        </p>}
        {previousFiles&&<p className="text-xs text-slate-600">
          旧票据 {previousFiles.ticketId}（第 {previousFiles.page} 批）的 {previousFiles.parts.join('、')} 曾发起，未确认保存。
          旧磁盘文件不会删除；不能将旧的部分文件与新票据三件混作同一批。
        </p>}
        {format==='INTERPRETATION_LONG'&&<p className="text-sm text-amber-800">独立导出 FINAL 时已保存的个人解释及精确版本指针，不按当前版本重算或重新选择参考。旧记录未保存解释时明确标记为 LEGACY_NOT_RECORDED；不包含自由文本、报告模板或常模来源清单。请保留每批 CSV、Codebook 与 Manifest。</p>}
        {format==='COGNITIVE_TRIAL_LONG'&&<p className="text-sm text-amber-800">认知试次按行与字节预算分批导出，只包含已被整轮 FINAL 引用的子结果；含协议、epoch、测量签名与研究授权范围内的复现信息。请保留每批 Codebook 与 Manifest，不将不同版本、输入设备的结果直接合并。</p>}
        {format.startsWith('RAW')&&<label className="flex gap-2 text-sm items-start rounded-lg border border-amber-200 bg-amber-50 p-3">
          <input type="checkbox" checked={includeFreeText}
            onChange={e=>{setIncludeFreeText(e.target.checked);invalidateExport()}}/>
          包含自由文本原始回答（可能含姓名、班级或间接身份线索）。默认不导出，需要确认本项目知情同意覆盖该用途，并妥善控制保存与共享。
        </label>}
        <div className="survey-export-create-action"><button type="button" className="btn-primary" disabled={busy||waiting||['RAW_WAVE','COGNITIVE_TRIAL_LONG','INTERPRETATION_LONG'].includes(format)&&!waveId}
            onClick={()=>createExport()}>生成导出文件</button></div>
        </section>
        {ticket&&<div role="region" aria-label="当前导出批次" className="survey-export-step survey-export-batch border rounded-lg p-3 space-y-2"><h4><span aria-hidden="true">3</span>下载答卷</h4>
          <div className="survey-export-batch-summary"><strong>文件已准备好</strong><span>第 {ticket.pageNumber||1} 批 · {ticket.manifest.rowCount} 条记录</span></div>
          <p className="text-xs">到期：{new Date(ticket.expiresAt).toLocaleString('zh-CN')}</p>
          {isCompactAttendance(ticket)&&
            <p className="text-xs text-amber-800">本批为独立参与状态表，不是逐题答案；请保留 Manifest 的关联说明。</p>}
          {supportsReadable(ticket)&&<div className="survey-export-readable-file">
            <div className="survey-export-file-icon" aria-hidden="true">文</div><div><h5>中文答卷</h5><p>每位被试一行、每道题一列。中文答案便于查看和统计，多选内容完整显示。</p></div>
            <button type="button" className="btn-primary" disabled={busy||waiting||needsRecovery||continuationStopped} onClick={()=>download('readable')}>
              {downloadsStarted.readable?'重新下载中文答卷':'下载中文答卷'}<span aria-hidden="true"> ↓</span></button>
          </div>}
          <div className="survey-export-source-note"><strong>原始数据与辅助文件</strong><p>用于统计处理与来源核对；日常查看可直接使用中文答卷。以下三份文件属于同一批次。</p></div>
          {downloadIssue&&<p role="alert" className="border-l-4 border-red-600 bg-red-50 p-3">{downloadIssue}</p>}
          {(needsRecovery||continuationStopped)&&<div className="space-y-2 text-sm">
            <p>{continuationStopped
              ?'原分页凭证或冻结来源已被拒绝，已停止此导出链；不会自动换新水位。'
              :'当前票据已到期或不可用，请勿继续读取旧票据。'}</p>
            {exportRequest?.cursor&&!continuationStopped
              ?<><p>可在原入站游标仍有效时，按冻结筛选重新生成当前页；服务端仍检查权限、五分钟二次认证、原修订与样本范围。游标超过一小时或来源变化会被拒绝。</p>
                <button type="button" className="btn-secondary" disabled={busy||waiting}
                  onClick={()=>createExport('recover')}>重新生成当前第 {ticket.pageNumber||1} 批</button></>
              :<p>当前没有可用的同水位恢复凭证。首批原本没有入站游标，无法保证重建原快照；必须明确选择新的完整导出。</p>}
            <p>重新开始将采用新水位；旧的部分文件不能与新导出混作同一批，操作前需要确认。</p>
            <button type="button" className="btn-secondary" disabled={busy||waiting}
              onClick={()=>createExport('restart')}>重新开始完整导出（新水位）</button>
          </div>}
          <div className="survey-export-files flex flex-wrap gap-2">{downloadParts.map(([part,label])=><div key={part} data-started={!!downloadsStarted[part]}>
            <button type="button" className="btn-secondary" disabled={busy||waiting||needsRecovery||continuationStopped} onClick={()=>download(part)}>
              {downloadsStarted[part]?'重新发起 ':'下载 '}{label}</button>
            <p className="text-xs">{label}：{downloadsStarted[part]?'已发起，请核对保存':'尚未发起'}</p>
          </div>)}</div>
          {ticket.nextCursor&&<button className="btn-secondary" type="button"
            disabled={busy||waiting||continuationStopped||!(downloadsStarted.readable||downloadParts.every(([part])=>downloadsStarted[part]))} onClick={()=>createExport('next')}>
            生成下一批（请先核对本批文件）</button>}
          {ticket.nextCursor&&<p className="text-xs">下载中文答卷，或下载全部三份原始文件后可继续。请先确认本批文件已保存；取消或失败时请重试。</p>}
          {ticket.nextCursor&&<p className="text-xs">分批数据以同一时间水位和研究修订版本固定样本范围；
            FINAL 页可合并，独立参与状态页按研究编号与波次关联；不要将两类 CSV 直接拼接。</p>}
        </div>}
      </div>
      {waveId&&<details className="survey-data-advanced">
        <summary>参考版本与历史报告 · 高级工具</summary>
        <p>需要编制项目样本参考或查看已保存报告时，再展开以下工具。</p>
        <SurveyPrivateReferenceStudio actorId={actorId} key={'reference:'+actorId+':'+projectId+':'+waveId} projectId={projectId} waveId={waveId} request={api}/>
        <StoredPackageReports key={'package:'+projectId+':'+waveId} projectId={projectId} waveId={waveId}/>
        <SurveyStoredReportReader actorId={actorId} key={projectId+':'+waveId} projectId={projectId} waveId={waveId} request={api}/>
      </details>}
    </>}
    </fieldset>
  </section>
}
