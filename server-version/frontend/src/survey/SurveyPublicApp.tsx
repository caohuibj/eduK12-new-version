import BundleProfileSummary,{type BundleProfileView} from '../pages/bundle/BundleProfileSummary'
import {clearSurveySituationalSessions,rememberSurveySituationalSession} from './survey-situational-local'
import {deferredPage} from '../components/page-loading/deferredPage'
const SurveySituationalUnit=deferredPage(async()=>({default:(await import('./SurveySituationalUnit')).SurveySituationalUnit}))
import type { SurveySituationalReference } from './survey-situational-api'
import {SurveyRandomCodeEntry} from './SurveyRandomCodeEntry'
import {SurveyMemorableCodeSetup,SurveyMemorableCodeSaved,SurveyMemorableCodeRecovery,type MemorableEnrollment} from './SurveyMemorableCode'
import {SurveyMaterialDisplay} from './SurveyMaterialDisplay'
import {SurveyCatalogScaleMedia} from './SurveyCatalogScaleMedia'
import {loadSurveyCognitiveUnit,loadSurveyPersonalLink,prepareSurveyCognitive,scheduleParticipantIdle} from './participant-loading'
import { clearSurveyCognitiveSessions,rememberSurveyCognitiveSession } from './survey-cognitive-local'
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { SurveyCognitiveReference,SurveyCognitiveSessionInfo } from './survey-cognitive-api'
import { visibleFormKeys,sanitizeFormAnswers } from './form-visibility'
import type { ProfessionalAnswer } from './ProfessionalFormAnswer'
import {hasSelectedOther} from './FormChoiceExtras'
import {saveLocalSurveyDraft,restoreLocalSurveyDraftEnvelope,clearLocalSurveyDraft,type SurveyFinalSubmission} from './local-answer-draft'
import {SurveyTimedScale} from './SurveyTimedScale'
import {SurveyScaleTimingTracker,sealSurveyScaleTimings,
  type SurveyWaveScaleTimings} from './survey-scale-timing'
import {SurveyParticipantImage} from './SurveyParticipantImage'
import { resolveClientSurveyFlow,type PublicFlow } from './flow.client'
import { resolveSurveyCheckpointDraft,sameSurveyCheckpointAnswers } from './checkpoint-recovery'
import { readRecruitmentEntry, rememberRecruitmentEntry, clearRecruitmentEntry, isRecruitmentEntryToken } from './recruitment-entry'
import {readPersonalParticipationProof,personalParticipationLink} from './personal-participation-link'
import {TaskForm,isTaskFormRefusal as isRefusal,type TaskFormUnit as Unit,type TaskFormQuestion as Question} from './TaskForm'
// Preserve the original public import for existing consumers.
export {TaskForm} from './TaskForm'
import './survey-participant.css'
import './survey-participant-polish.css'

// Load before the cognitive unit's own admission/instructions, never during trials.
// Form/Scale/SJT participants do not need its router, registry or task runners.
const singleResumeNotice='已恢复本标签页暂存的未提交答案。请复核后再提交。'
const singleStartNotice='本设备此标签页可在两小时内尝试恢复；离开或关闭标签前仍建议完成作答。它不会产生跨波次研究编号。'
const SurveyCognitiveUnit = lazy(() => loadSurveyCognitiveUnit().then(module => ({ default: module.SurveyCognitiveUnit })))
const SurveyPersonalLink = lazy(() => loadSurveyPersonalLink().then(module => ({default:module.SurveyPersonalLink})))

type ApiResult<T>={code:number|string;message:string;data:T|null}
type Wave={id:string;title:string;ordinal:number;status:string;consentText:string;consentVersion:number;
  opensAt:string|null;closesAt:string|null;allowNewParticipants:boolean;attempt?:{id:string;status:string}|null;
  groupIpPolicy?:{schemaVersion:1;timeZone:string;activationDate?:string}|null;groupIpActivatedAt?:string|null}
type StudyInfo={project:{name:string;description:string;collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES';status:string;participantIdentityMode?:'PERSONAL_LINK'|'MEMORABLE_CODE'|'SELF_CODE';participantCodeLabel?:string;participantCodeInstructions?:string};waves:Wave[];scopeWaveId?:string|null}
type Task={attemptId:string;waveId:string;status:string;definitionDigest:string;units:Unit[];reportMode:'GENERAL_ONLY'|'DESCRIPTIVE';cognitiveSessions?:SurveyCognitiveSessionInfo[];lockedPriorAnswers?:Record<string,Record<string,Answer>>;flow?:PublicFlow;checkpointPolicy?:{enabled:true;ttlHours:number}}
type ParticipantFeedbackBase={instrumentKey:string;title:string;quality:string;rawScoreFeedback?:import('../modules/scale/rawScoreFeedback').MatchedRawScoreFeedback[]}
type ParticipantFeedback=ParticipantFeedbackBase&(
  {feedbackKind:'RAW_METRICS';measurementReleaseId:string;metrics:{key:string;label:string;value:number|null;unit:null;status:string}[]}
  |{feedbackKind?:undefined;measurementDigest:string;maturity:'PILOT';metrics:{key:string;label:string;value:number|null;unit:'ratio'|'ms';status:string}[]})
type NativeFeedback={importId:string;title:string;status:string;factsHash:string|null;profileView:BundleProfileView|null}
type General={nativeBundles?:NativeFeedback[];kind:'GENERAL_ONLY'|'DESCRIPTIVE';text:string;disclaimer:string;completedAt:string;pending?:boolean;measurements?:ParticipantFeedback[]}
type FinalResponse={status:string;attemptId?:string;receiptId?:string;completedAt?:string;
  idempotent?:boolean;generalReceipt?:unknown;participantFeedbackReceipt?:unknown}
// Only the first, unambiguous committed FINAL may supply this submission-time
// receipt. Older servers or malformed payloads fall back to the GENERAL route.
function firstFinalGeneral(result:FinalResponse,attemptId:string):General|null {
  if(result.status!=='COMPLETED'||result.idempotent!==false||result.attemptId!==attemptId
    ||typeof result.receiptId!=='string'||!result.receiptId)return null
  const value=result.generalReceipt
  if(!value||typeof value!=='object'||Array.isArray(value))return null
  const receipt=value as Record<string,unknown>
  if(Object.keys(receipt).sort().join(',')!=='completedAt,disclaimer,text'
    ||typeof receipt.text!=='string'||typeof receipt.disclaimer!=='string'
    ||typeof receipt.completedAt!=='string'||receipt.completedAt!==result.completedAt
    ||!Number.isFinite(Date.parse(receipt.completedAt)))return null
  return {kind:'GENERAL_ONLY',text:receipt.text,disclaimer:receipt.disclaimer,completedAt:receipt.completedAt}
}
// Accept only a fresh, bound server projection. Old/malformed replies and
// replay/refresh still use the independently authorized reader.
function firstFinalParticipantFeedback(result:FinalResponse,attemptId:string):General|null {
  const general=firstFinalGeneral(result,attemptId),value=result.participantFeedbackReceipt
  if(!general||!value||typeof value!=='object'||Array.isArray(value))return null
  const receipt=value as Record<string,unknown>
  if(receipt.text!==general.text||receipt.disclaimer!==general.disclaimer||receipt.completedAt!==general.completedAt)return null
  if(receipt.kind==='GENERAL_ONLY')return Object.keys(receipt).sort().join(',')==='completedAt,disclaimer,kind,text'?general:null
  if(receipt.kind!=='DESCRIPTIVE'||Object.keys(receipt).filter(k=>k!=='nativeBundles').sort().join(',')!=='completedAt,disclaimer,kind,measurements,pending,text'
    ||typeof receipt.pending!=='boolean'||!Array.isArray(receipt.measurements))return null
  const valid=receipt.measurements.every(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))return false
    const item=value as Record<string,unknown>,raw=item.feedbackKind==='RAW_METRICS'
    if(typeof item.instrumentKey!=='string'||typeof item.title!=='string'||typeof item.quality!=='string'
      ||(raw?typeof item.measurementReleaseId!=='string':item.feedbackKind!==undefined||item.maturity!=='PILOT'||typeof item.measurementDigest!=='string')
      ||!Array.isArray(item.metrics))return false
    if(!item.metrics.every(value=>{
      if(!value||typeof value!=='object'||Array.isArray(value))return false
      const metric=value as Record<string,unknown>
      return typeof metric.key==='string'&&typeof metric.label==='string'&&typeof metric.status==='string'
        &&(metric.value===null||typeof metric.value==='number'&&Number.isFinite(metric.value))
        &&(raw?metric.unit===null:metric.unit==='ratio'||metric.unit==='ms')
    }))return false
    if(item.rawScoreFeedback!==undefined&&(!Array.isArray(item.rawScoreFeedback)||!item.rawScoreFeedback.every(value=>{
      if(!value||typeof value!=='object'||Array.isArray(value))return false
      const feedback=value as Record<string,unknown>
      return typeof feedback.scoreKey==='string'&&typeof feedback.text==='string'
        &&(feedback.rangeKey===null||typeof feedback.rangeKey==='string')
        &&(feedback.images===undefined||Array.isArray(feedback.images))&&(feedback.materials===undefined||Array.isArray(feedback.materials))
    })))return false
    return true
  })
  const native=receipt.nativeBundles
  if(native!==undefined&&(!Array.isArray(native)||native.some(v=>!v||typeof v!=='object'||typeof v.importId!=='string'||typeof v.title!=='string'||typeof v.status!=='string'||(v.factsHash!==null&&typeof v.factsHash!=='string')||(v.profileView!==null&&(!v.profileView||typeof v.profileView!=='object'||v.profileView.schemaVersion!=='bundle-profile-view-v1'||!Array.isArray(v.profileView.constructs)||!Array.isArray(v.profileView.actions))))))return null
  return valid?{...general,kind:'DESCRIPTIVE',pending:receipt.pending,measurements:receipt.measurements as ParticipantFeedback[],...(native?{nativeBundles:native as NativeFeedback[]}:{})}:null
}
const feedbackQualityText=(value:string)=>({interpretable:'本次结果可作参考',limited:'本次结果仅供有限参考',invalid:'本次作答不足以形成有效解释'} as Record<string,string>)[value]??'本次结果暂无法解释'
const feedbackMetricStatusText=(value:string)=>({OK:'已计算',calculated:'已计算',INSUFFICIENT_DATA:'有效作答不足',insufficient_data:'有效作答不足',INVALID:'本次数据无效',invalid:'本次数据无效',not_calculable:'暂无法计算',limited:'仅供有限参考'} as Record<string,string>)[value]??'暂无法说明'
type SingleResume={attemptId:string;accessCredential:string;createdAt:number}
const singleStorageKey=(id:string)=>'huisurvey:v1:single:'+id
const readSingleResume=(id:string):SingleResume|null=>{
  try{
    const json=sessionStorage.getItem(singleStorageKey(id))
    if(!json)return null
    const saved=JSON.parse(json) as SingleResume
    if(!/^[a-f0-9-]{36}$/i.test(saved.attemptId)
      ||!/^[A-Za-z0-9_-]{43}$/.test(saved.accessCredential)
      ||typeof saved.createdAt!=='number'
      ||Date.now()-saved.createdAt>2*60*60*1000
      ||saved.createdAt>Date.now()){
      sessionStorage.removeItem(singleStorageKey(id))
      return null
    }
    return saved
  }catch{return null}
}
type Answer=ProfessionalAnswer
const safePattern=/^[a-f0-9-]{36}$/i
// A valid research key can equal a property inherited from Object.prototype.
const own=<T,>(values:Record<string,T>,key:string):T|undefined=>
  Object.prototype.hasOwnProperty.call(values,key)?values[key]:undefined
const parseError=(e:unknown)=>e instanceof TypeError&&/^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/.test(e.message)
  ?'网络连接未完成，服务器结果尚未确认。请检查网络，并按页面提示核对或重试。'
  :e instanceof Error?e.message:'研究访问失败，请重试'
class SurveyPublicApiError extends Error {
  constructor(message:string,readonly status:number){super(message)}
}
const publicApi=async <T,>(path:string,method='GET',body?:unknown):Promise<T>=>{
  const result=await fetch('/api/public/survey'+path,{method,credentials:'omit',
    cache:'no-store',headers:{'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})})
  const envelope=await result.json() as ApiResult<T>
  if(!result.ok||envelope.code!==0||!envelope.data)throw new SurveyPublicApiError(envelope.message||'操作未完成',result.status)
  return envelope.data
}
/** Research participants have NO platform account or Student/Teacher session.
 * This UI contains no researcher or management cookie-based fallbacks.
 */
export default function SurveyPublicApp(){
  useEffect(()=>scheduleParticipantIdle(()=>{
    void import('./survey-cognitive-retention').then(module=>module.cleanupExpiredSurveyCognitiveDrafts()).catch(()=>{/* optional maintenance retries on a later Survey open */})
  }),[])
  const publicId=useMemo(()=>window.location.pathname.match(/^\/r\/([a-f0-9-]{36})$/i)?.[1]||'',[])
  const [personalProof]=useState(()=>readPersonalParticipationProof(window.location.hash))
  const [entryToken,setEntryToken]=useState(()=>{
    if(personalProof)return ''
    try{return readRecruitmentEntry(publicId,window.location.hash,sessionStorage)}
    catch{return readRecruitmentEntry(publicId,window.location.hash,null)}
  })
  const [info,setInfo]=useState<StudyInfo|null>(null),[loading,setLoading]=useState(true)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [busyLabel,setBusyLabel]=useState('')
  const [researchCode,setResearchCode]=useState(personalProof?.researchCode??''),[accessCredential,setAccessCredential]=useState(personalProof?.accessCredential??'')
  const [proofReceived,setProofReceived]=useState(false),[home,setHome]=useState<Wave[]|null>(null)
  const [linkedIdentityReady,setLinkedIdentityReady]=useState(false)
  const [legacyRecoveryOpen,setLegacyRecoveryOpen]=useState(false)
  const [codeSetup,setCodeSetup]=useState(false),[fullMemorableCode,setFullMemorableCode]=useState('')
  const generatedCodeMode=info?.project.participantIdentityMode==='SELF_CODE'
  const codeMode=generatedCodeMode||info?.project.participantIdentityMode==='MEMORABLE_CODE'
  const [selectedWave,setSelectedWave]=useState<Wave|null>(null),[agreed,setAgreed]=useState(false)
  const [receiptsOpen,setReceiptsOpen]=useState(false)
  const [personalLinkOpen,setPersonalLinkOpen]=useState(false)
  const [completionOptionsOpen,setCompletionOptionsOpen]=useState(false)
  const [task,setTask]=useState<Task|null>(null),[answers,setAnswers]=useState<Record<string,Record<string,Answer>>>({})
  const [formPages,setFormPages]=useState<Record<string,number>>({})
  const [scalePages,setScalePages]=useState<Record<string,number>>({})
  const [videoCompletions,setVideoCompletions]=useState<Record<string,boolean>>({})
  const [imageReadiness,setImageReadiness]=useState<Record<string,boolean>>({})
  const [toolStep,setToolStep]=useState(0)
  const [itemTimings,setItemTimings]=useState<SurveyWaveScaleTimings>({})
  const timingTrackers=useRef<Record<string,SurveyScaleTimingTracker>>({})
  const [flowStep,setFlowStep]=useState(0),[screenedOut,setScreenedOut]=useState(false)
  const [checkpointRevision,setCheckpointRevision]=useState(0)
  const [checkpointOverwritePending,setCheckpointOverwritePending]=useState(false)
  const [attemptId,setAttemptId]=useState(''),[submissionId,setSubmissionId]=useState('')
  const [general,setGeneral]=useState<General|null>(null),[notice,setNotice]=useState('')
  useEffect(()=>{
    if(notice!==singleResumeNotice)return
    const timer=window.setTimeout(()=>setNotice(current=>current===singleResumeNotice?'':current),4000)
    return()=>window.clearTimeout(timer)
  },[notice])
  const [finalSealed,setFinalSealed]=useState(false)
  const [cognitiveRunning,setCognitiveRunning]=useState(false)
  const cognitiveRunningRef=useRef(false)
  cognitiveRunningRef.current=cognitiveRunning
  const [cognitiveSessions,setCognitiveSessions]=useState<SurveyCognitiveSessionInfo[]>([])
  const knownCognitiveSessions=useRef(new Map<string,{attemptId:string;researchCode:string}>())
  const rememberCognitive=(parentId:string,childId:string)=>{knownCognitiveSessions.current.set(childId,{attemptId:parentId,researchCode});rememberSurveyCognitiveSession(publicId,parentId,childId,researchCode)}
  const knownSituationalSessions=useRef(new Map<string,{attemptId:string;researchCode:string}>())
  const clearCognitive=async(parentId?:string)=>{
    const known=[...knownCognitiveSessions.current].filter(([,owner])=>parentId?owner.attemptId===parentId:owner.researchCode===researchCode).map(([id])=>id)
    const nativeIds=[...knownSituationalSessions.current].filter(([,owner])=>parentId?owner.attemptId===parentId:owner.researchCode===researchCode).map(([id])=>id)
    const results=await Promise.all([clearSurveyCognitiveSessions(publicId,parentId,known,researchCode||undefined),
      clearSurveySituationalSessions(publicId,parentId,nativeIds,researchCode||undefined)])
    return results.every(Boolean)
  }
  const [cognitiveReferences,setCognitiveReferences]=useState<SurveyCognitiveReference[]>([])
  const [situationalReferences,setSituationalReferences]=useState<Record<string,SurveySituationalReference>>({})
  useEffect(()=>setSituationalReferences({}),[attemptId])
  useEffect(()=>{
    if(!task||task.status!=='STARTED'||cognitiveRunning||!task.units.some(unit=>unit.kind==='COGNITIVE'))return
    return scheduleParticipantIdle(()=>{void prepareSurveyCognitive().catch(()=>{/* the task retains its normal loading/error path */})})
  },[task,cognitiveRunning])
  useEffect(()=>{
    if(info?.project.collectionMode!=='LINKED_WAVES'||['SELF_CODE','MEMORABLE_CODE'].includes(info.project.participantIdentityMode??''))return
    return scheduleParticipantIdle(()=>{void loadSurveyPersonalLink().catch(()=>{/* preserve normal on-demand loading */})})
  },[info?.project.collectionMode,info?.project.participantIdentityMode])

  const [lockedAnswers,setLockedAnswers]=useState<Record<string,Record<string,Answer>>>({})
  // Server-frozen prerequisites remain immutable even when FINAL rejects another answer.
  const serverLockedKeys=useRef(new Set<string>())
  const finalRequest=useRef<{attemptId:string;path:string;
    body:{accessCredential:string;researchCode?:string;submissionId:string;answers:Record<string,Record<string,Answer>>;
      itemTimings?:SurveyWaveScaleTimings;presentation?:{shownBlocks:string[]};cognitiveReferences?:SurveyCognitiveReference[];situationalReferences?:SurveySituationalReference[]}}|null>(null)
  const finalInFlight=useRef(false)
  const completedAttempts=useRef(new Set<string>())
  const [completion,setCompletion]=useState<{attemptId:string;proof:{accessCredential:string;researchCode?:string}}|null>(null)
  const draftState=useRef({answers,itemTimings})
  draftState.current={answers,itemTimings}
  const [withdrawn,setWithdrawn]=useState(false),[revoked,setRevoked]=useState(false)
  // SHORT-LIVED same-tab recovery only. Never shared across waves or devices.
  const [singleResume,setSingleResume]=useState<SingleResume|null>(()=>readSingleResume(publicId))
  const taskState=useRef<Task|null>(null)
  taskState.current=task
  const base='/r/'+publicId
  const validEntry=isRecruitmentEntryToken(entryToken)
  const infoEntryToken=validEntry?entryToken:''
  const hasScopedInfoRequest=useRef(false),infoRequest=useRef(0)
  const groupWave=info?.waves.length===1&&info.waves[0].groupIpPolicy?info.waves[0]:null
  const discardEntry=()=>{
    try{clearRecruitmentEntry(publicId,sessionStorage)}catch{/* private storage unavailable */}
    setEntryToken('')
  }
  // A valid recruitment bearer can survive an accidental same-tab refresh.
  // Never refresh its absolute 30-minute deadline simply by reloading.
  useEffect(()=>{
    if(!validEntry)return
    try{rememberRecruitmentEntry(publicId,entryToken,sessionStorage)}catch{/* ephemeral fallback */}
  },[publicId,entryToken,validEntry])
  // Only the already-authorized local browser tab may recover unfinished answers.
  useEffect(()=>{
    if(!task||task.status!=='STARTED'||!attemptId)return
    const flush=(leaving=false)=>{
      if(completedAttempts.current.has(attemptId)||taskState.current?.attemptId!==attemptId)return
      const sealed=finalRequest.current?.attemptId===attemptId?finalRequest.current:null
      if(sealed){
        saveLocalSurveyDraft(publicId,attemptId,task.definitionDigest,sealed.body.answers,
          sealed.body.itemTimings,{submissionId:sealed.body.submissionId,screenOut:sealed.path.endsWith('/screen-out'),
            ...(sealed.body.presentation?{presentation:sealed.body.presentation}:{}),
            ...(sealed.body.situationalReferences?{situationalReferences:sealed.body.situationalReferences}:{}),
            ...(sealed.body.cognitiveReferences?{cognitiveReferences:sealed.body.cognitiveReferences}:{})})
        return
      }
      const liveTimings={...draftState.current.itemTimings}
      for(const [key,tracker] of Object.entries(timingTrackers.current)){
        if(leaving)tracker.suspend()
        liveTimings[key]=tracker.snapshot()
      }
      if(!saveLocalSurveyDraft(publicId,attemptId,task.definitionDigest,draftState.current.answers,liveTimings))
        setNotice('本标签页临时保存失败（空间或权限不足）。刷新、关闭页面可能丢失未提交答案；如已开放服务器加密暂存，请主动保存，或完成本轮正式提交。')
    }
    const timeout=window.setTimeout(()=>flush(),450)
    const leaving=()=>flush(true)
    // beforeunload can be cancelled; only pagehide establishes an actual pause.
    const beforeUnload=()=>flush()
    window.addEventListener('pagehide',leaving)
    window.addEventListener('beforeunload',beforeUnload)
    return ()=>{
      window.clearTimeout(timeout)
      window.removeEventListener('pagehide',leaving)
      window.removeEventListener('beforeunload',beforeUnload)
    }
  },[publicId,attemptId,task,answers,itemTimings])
  useEffect(()=>{
    document.title='Huisurvey · 研究参与'
    // Both invitation and personal capabilities leave history before any fetch.
    // The participant deliberately saves the generated link; never persist it here.
    window.history.replaceState(null,'',window.location.pathname)
    if(!safePattern.test(publicId)){setError('研究链接格式不正确');setLoading(false);return}
    // Token-scoped discovery avoids a shared-network request revealing or
    // borrowing admission from another wave. Discarding a consumed token must
    // preserve this scope rather than trigger the unscoped GET fallback.
    if(hasScopedInfoRequest.current&&!infoEntryToken)return
    if(infoEntryToken)hasScopedInfoRequest.current=true
    let current=true
    const requests=infoRequest,request=++requests.current
    setLoading(true);setError('');setInfo(null);setHome(null);setSelectedWave(null);setAgreed(false)
    void publicApi<StudyInfo>(base+'/info',infoEntryToken?'POST':'GET',
      infoEntryToken?{entryToken:infoEntryToken}:undefined)
      .then(async data=>{
        if(!current||request!==requests.current)return
        setInfo(data)
        if(!personalProof)return
        if(['MEMORABLE_CODE','SELF_CODE'].includes(data.project.participantIdentityMode??''))throw new Error('本研究使用研究编码，请输入完整编码继续参加。')
        if(data.project.collectionMode!=='LINKED_WAVES')throw new Error('此问卷不支持专属链接，请使用原邀请参加。')
        const own=await publicApi<{waves:Wave[]}>(base+'/enter','POST',personalProof)
        if(!current||request!==requests.current)return
        setHome(own.waves);setLinkedIdentityReady(true)
        const next=own.waves.filter(wave=>wave.status==='OPEN'&&
          !['COMPLETED','SCREENED_OUT'].includes(wave.attempt?.status??''))
          .sort((a,b)=>a.ordinal-b.ordinal)[0]
        setSelectedWave(next??null);setAgreed(false)
      })
      .catch(e=>{if(current&&request===requests.current)setError(parseError(e))})
      .finally(()=>{if(current&&request===requests.current)setLoading(false)})
    return()=>{current=false;requests.current++}
  },[base,publicId,infoEntryToken,personalProof])
  const focusStep=()=>window.requestAnimationFrame(()=>{if(!cognitiveRunningRef.current)document.getElementById('survey-task-step')?.focus()})
  const revealAnswer=(unit:Unit,itemKey?:string,correctRejectedAnswer=false)=>{
    if(cognitiveRunningRef.current)return
    const activeTask=taskState.current
    if(!activeTask)return
    if(Object.prototype.hasOwnProperty.call(lockedAnswers,unit.instrumentKey)){
      // Ordinary navigation stays within this section. Only a definitive FINAL
      // rejection can reopen a locally completed section, never a server lock.
      if(correctRejectedAnswer&&!serverLockedKeys.current.has(unit.instrumentKey)){
        setLockedAnswers(previous=>{const next={...previous};delete next[unit.instrumentKey];return next})
      }else if(flowUnit?.instrumentKey!==unit.instrumentKey)return
    }
    if(unit.kind==='FORM'){
      const visible=visibleFormKeys(unit.pages?.flatMap(page=>page.questions)??[],own(answers,unit.instrumentKey)??{})
      const pages=unit.pages?.filter(page=>page.questions.some(q=>visible.has(q.itemKey)))??[]
      const index=itemKey?pages.findIndex(page=>page.questions.some(q=>q.itemKey===itemKey)):-1
      if(index>=0)setFormPages(previous=>({...previous,[unit.instrumentKey]:index}))
    }else if(unit.kind==='SCALE'&&itemKey){
      const index=unit.items?.findIndex(item=>item.itemKey===itemKey)??-1
      if(index>=0)setScalePages(previous=>({...previous,[unit.instrumentKey]:index}))
    }
    if(activeTask.flow){
      const route=resolveClientSurveyFlow(activeTask.flow,activeTask.units,answers)
      const step=route.blocks.findIndex(block=>block.kind==='INSTRUMENT'&&block.instrumentKey===unit.instrumentKey)
      if(step>=0)setFlowStep(step)
    }else setToolStep(activeTask.units.findIndex(candidate=>candidate.instrumentKey===unit.instrumentKey))
    window.requestAnimationFrame(()=>{
      if(cognitiveRunningRef.current)return
      const target=(itemKey?document.getElementById('survey-answer-'+unit.instrumentKey+'-'+itemKey):null)
        ??document.getElementById('survey-page-'+unit.instrumentKey)??document.getElementById('survey-task-step')
      target?.focus();target?.scrollIntoView({block:'center'})
    })
  }
  const rejectedAnswerTarget=(message:string)=>{
    const location=message.match(/answers\.([a-z][a-z0-9_-]*)(?:\.([a-z][a-z0-9_-]*))?/i)
    const instrumentKey=location?.[2]?location[1]:undefined
    const itemKey=location?.[2]||location?.[1]
    const unit=itemKey?taskState.current?.units.find(candidate=>
      (!instrumentKey||candidate.instrumentKey===instrumentKey)&&(
        candidate.pages?.some(page=>page.questions.some(q=>q.itemKey===itemKey))||
        candidate.items?.some(q=>q.itemKey===itemKey)||
        (candidate.scenes?.flatMap(scene=>scene.questions)??candidate.questions)?.some(q=>q.questionKey===itemKey))):undefined
    return unit&&itemKey?{unit,itemKey}:null
  }
  const run=async(task:()=>Promise<void>,label='正在处理，请稍候…')=>{
    setError('');setNotice('');setBusyLabel(label);setBusy(true)
    try{await task()}catch(e){
      const message=parseError(e);setError(message)
      // Locate a server-rejected answer without changing validation or payloads.
      const target=rejectedAnswerTarget(message)
      if(target)revealAnswer(target.unit,target.itemKey)
    }finally{setBusy(false);setBusyLabel('')}
  }
  const recoverWithoutInvitation=()=>void run(async()=>{
    // Existing participant rights do not depend on an unexpired invitation.
    // This explicit fallback retains the ordinary, unscoped rate limit.
    const request=++infoRequest.current
    try{
      const data=await publicApi<StudyInfo>(base+'/info')
      if(request!==infoRequest.current)return
      setInfo(data);setHome(null);setSelectedWave(null);setAgreed(false)
      discardEntry()
    }catch(e){if(request===infoRequest.current)throw e}
  })
  const recover=(e:FormEvent)=>{e.preventDefault();void run(async()=>{
    const data=await publicApi<{waves:Wave[]}>(base+'/enter','POST',{
      researchCode:researchCode.trim().toUpperCase(),accessCredential:accessCredential.trim(),
      ...(info?.scopeWaveId?{waveId:info.scopeWaveId}:{}),
    })
    setResearchCode(x=>x.trim().toUpperCase());setAccessCredential(x=>x.trim())
    setHome(data.waves);setProofReceived(false);setLinkedIdentityReady(true)
  },'正在读取你的波次任务…')}
  const join=(wave:Wave)=>void run(async()=>{
    const result=await publicApi<{researchCode:string;accessCredential:string}>(
      base+'/waves/'+wave.id+'/join','POST',{entryToken,consent:true,consentVersion:wave.consentVersion})
    setResearchCode(result.researchCode);setAccessCredential(result.accessCredential);setLinkedIdentityReady(true)
    discardEntry()
    setProofReceived(true);setNotice('')
  },'正在领取研究编号，请勿重复操作…')
  const joinCode=(value:MemorableEnrollment)=>{if(!consentWave||!consentAccepted)return;void run(async()=>{
    const result=await publicApi<{researchCode:string;accessCredential:string}>(base+'/waves/'+consentWave.id+'/join-code','POST',{
      entryToken,consent:true,consentVersion:consentWave.consentVersion,...value,
    })
    setResearchCode(result.researchCode);setAccessCredential(result.accessCredential);setLinkedIdentityReady(true)
    setFullMemorableCode(value.prefix+'-'+value.suffix);setProofReceived(true);setCodeSetup(false);discardEntry()
  })}
  const randomEnrollmentInFlight=useRef(false)
  const joinRandomCode=()=>{
    if(!consentWave||!generatedCodeMode||!validEntry||busy||linkedIdentityReady||randomEnrollmentInFlight.current)return
    randomEnrollmentInFlight.current=true
    setSelectedWave(consentWave);setAgreed(true);setAgreementIdentity(consentIdentity)
    void run(async()=>{try{
    const result=await publicApi<{researchCode:string;accessCredential:string;fullCode:string}>(base+'/waves/'+consentWave.id+'/join-random-code','POST',{
      entryToken,consent:true,consentVersion:consentWave.consentVersion,
    })
    setResearchCode(result.researchCode);setAccessCredential(result.accessCredential);setLinkedIdentityReady(true)
    setFullMemorableCode(result.fullCode);setProofReceived(true);setCodeSetup(false);discardEntry()
    }finally{randomEnrollmentInFlight.current=false}
  },'正在生成你的研究编码…')}
  const codeHome=(waves:Wave[])=>{
    setReceiptsOpen(false)
    setHome(waves);setSelectedWave(waves.filter(wave=>wave.status==='OPEN'&&!['COMPLETED','SCREENED_OUT'].includes(wave.attempt?.status??''))
      .sort((a,b)=>a.ordinal-b.ordinal)[0]??null);setAgreed(false)
  }
  const enterCode=(fullCode:string)=>void run(async()=>{
    const result=await publicApi<{researchCode:string;accessCredential:string;waves:Wave[];revoked?:boolean}>(base+'/enter-code','POST',{
      fullCode,...(info?.scopeWaveId?{waveId:info.scopeWaveId}:{}),
    })
    setResearchCode(result.researchCode);setAccessCredential(result.accessCredential);setLinkedIdentityReady(true);setRevoked(!!result.revoked)
    setFullMemorableCode('');setProofReceived(false);codeHome(result.waves)
  },'正在核对研究编码…')
  const resetCode=(resetCode:string,suffix:string)=>void run(async()=>{
    const identity=await publicApi<{researchCode:string;accessCredential:string}>(base+'/reset-code','POST',{resetCode,suffix})
    const prefix=resetCode.normalize('NFKC').trim().toUpperCase().split('-')[0]
    const fullCode=prefix+'-'+suffix.normalize('NFKC').trim().toUpperCase()
    setFullMemorableCode(fullCode)
    setResearchCode(identity.researchCode);setAccessCredential(identity.accessCredential);setLinkedIdentityReady(true);setProofReceived(true)
    const result=await publicApi<{waves:Wave[]}>(base+'/enter','POST',identity)
    codeHome(result.waves)
  })
  const chooseWave=(wave:Wave)=>{
    setSelectedWave(wave);setAgreed(false);setTask(null);setGeneral(null);setCompletion(null);setWithdrawn(false);setRevoked(false)
    window.requestAnimationFrame(()=>{
      const consent=document.getElementById('survey-participant-consent')
      consent?.scrollIntoView?.({block:'start',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'})
      consent?.focus({preventScroll:true})
    })
  }
  const readCompletion=async(id:string,proof:{accessCredential:string;researchCode?:string})=>{
    const result=await publicApi<General>(base+'/attempts/'+id+'/general','POST',proof)
    setCompletionOptionsOpen(false);setGeneral(result);setNotice('')
  }
  const markCompleted=(id:string,proof:{accessCredential:string;researchCode?:string})=>{
    completedAttempts.current.add(id)
    clearLocalSurveyDraft(publicId,id)
    void clearCognitive(id).then(ok=>{if(!ok)setError('服务器已确认完成，但本机试次清理失败，请清理本网站存储。')})
    setCheckpointRevision(0);setTask(null);setCompletion({attemptId:id,proof})
    finalRequest.current=null;setFinalSealed(false)
  }
  const markScreenedOut=(id:string)=>{
    completedAttempts.current.add(id)
    finalRequest.current=null;setFinalSealed(false)
    clearLocalSurveyDraft(publicId,id);void clearCognitive(id);setCheckpointRevision(0)
    try{sessionStorage.removeItem(singleStorageKey(publicId))}catch{/* private session unavailable */}
    setAttemptId(id);setSingleResume(null);setTask(null);setCompletion(null);setGeneral(null)
    setScreenedOut(true)
    setNotice('本轮研究筛选已结束。未生成正式答卷（FINAL），未将筛选答案保存为正式测量记录。')
  }
  const loadTask=async(id:string,code:string,secret:string)=>{
    const data=await publicApi<Task>(base+'/attempts/'+id+'/task','POST',{
      ...(code?{researchCode:code}:{}),accessCredential:secret,
    })
    // The authenticated terminal projection contains no answers or task units.
    // A lost screen-out response must not reopen its sealed qualifying draft.
    for(const session of data.cognitiveSessions??[])rememberCognitive(id,session.sessionId)
    if(data.status==='COMPLETED'){
      // The authorized terminal projection has no runnable task to hydrate.
      // markCompleted owns cleanup, including the single cognitive cleanup attempt.
      const proof={...(code?{researchCode:code}:{}),accessCredential:secret}
      timingTrackers.current={}
      setAnswers({});setItemTimings({});setLockedAnswers({})
      setCognitiveSessions([]);setCognitiveReferences([]);setCognitiveRunning(false)
      setFormPages({});setScalePages({});setFlowStep(0);setToolStep(0)
      setCheckpointOverwritePending(false);setScreenedOut(false);setAttemptId(id)
      markCompleted(id,proof)
      await readCompletion(id,proof)
      return
    }
    if(data.status==='SCREENED_OUT'){markScreenedOut(id);return}
    // Reconcile complete local+remote envelopes before mounting any timed
    // Scale runner. An older local revision can never silently replace remote.
    const saved=restoreLocalSurveyDraftEnvelope<Record<string,Record<string,Answer>>>(
        publicId,id,data.definitionDigest)
    let restoredAnswers=saved?.answers??{}
    let restoredTimings=(saved?.itemTimings??{}) as SurveyWaveScaleTimings
    let restoredRevision=0,overwritePending=false
    if(saved)setNotice(singleResumeNotice)
    if(data.status==='STARTED'&&data.checkpointPolicy?.enabled&&!saved?.finalSubmission){
      try{
        const remote=await publicApi<{revision:number;checkpoint:{
          answers:Record<string,Record<string,Answer>>;
          itemTimings?:SurveyWaveScaleTimings;updatedAt:string;expiresAt:string
        }|null}>(base+'/attempts/'+id+'/checkpoint/read','POST',{
          ...(code?{researchCode:code}:{}),accessCredential:secret,
        })
        const conflict=!!saved&&!!remote.checkpoint&&(
          !sameSurveyCheckpointAnswers(saved.answers,remote.checkpoint.answers)||
          !sameSurveyCheckpointAnswers(restoredTimings,remote.checkpoint.itemTimings??{}))
        const useRemote=!conflict||window.confirm(
          '本标签页草稿与服务器加密存档的答案或逐题时间不同。确定：选用服务器版本；取消：保留本地版本，覆盖服务器前须再次明确确认。',
        )
        const plan=resolveSurveyCheckpointDraft(saved?.answers??null,remote,useRemote)
        restoredAnswers=plan.answers
        restoredRevision=plan.revision
        overwritePending=conflict&&!useRemote
        restoredTimings=useRemote&&remote.checkpoint
          ?(remote.checkpoint.itemTimings??{}):restoredTimings
        if(conflict)setNotice(useRemote
          ?'已选用服务器版本的答案与逐题计时，未自动覆盖较新的存档。'
          :'保留了本地答案及计时；若要覆盖服务器存档，保存前需要再次确认。')
        else if(remote.checkpoint&&!saved)setNotice('已恢复服务器上的加密答案及已有计时记录。')
      }catch(e){setNotice('无法恢复服务器临时存档：'+parseError(e))}
    }
    if(!saved?.finalSubmission)restoredAnswers={...restoredAnswers,...data.lockedPriorAnswers}
    serverLockedKeys.current=new Set(Object.keys(data.lockedPriorAnswers??{}))
    setLockedAnswers(data.lockedPriorAnswers??{});setCognitiveSessions(data.cognitiveSessions??[])
    setCognitiveReferences((data.cognitiveSessions??[]).flatMap(s=>s.resultReference?[s.resultReference]:[]));setCognitiveRunning(false)
    timingTrackers.current={}
    const savedFinal=saved?.finalSubmission
    finalRequest.current=savedFinal?{attemptId:id,
      path:base+'/attempts/'+id+(savedFinal.screenOut?'/screen-out':'/final'),
      body:{...(code?{researchCode:code}:{}),accessCredential:secret,
        submissionId:savedFinal.submissionId,answers:restoredAnswers,
        ...(saved.itemTimings?{itemTimings:restoredTimings}:{}),
        ...(savedFinal.presentation?{presentation:savedFinal.presentation}:{}),
        ...(savedFinal.situationalReferences?{situationalReferences:savedFinal.situationalReferences}:{}),
        ...(savedFinal.cognitiveReferences?{cognitiveReferences:savedFinal.cognitiveReferences}:{})}}:null
    setFinalSealed(!!savedFinal);setCompletion(null)
    setAttemptId(id);setSubmissionId(savedFinal?.submissionId??crypto.randomUUID())
    setTask(data);setFormPages({});setScalePages({});setFlowStep(0);setToolStep(0);setScreenedOut(false)
    setCheckpointRevision(restoredRevision);setCheckpointOverwritePending(overwritePending)
    setAnswers(restoredAnswers);setItemTimings(restoredTimings)
  }
  const resumeSingle=()=>{if(!singleResume)return;void run(async()=>{
    setAccessCredential(singleResume.accessCredential)
    setNotice('正在恢复本设备尚在有效期内的单次匿名研究作答。')
    await loadTask(singleResume.attemptId,'',singleResume.accessCredential)
  },'正在恢复本次作答，请稍候…')}
  const startInFlight=useRef(false)
  const beginAnswering=(saved:boolean)=>{
    if(!consentWave||!consentAccepted||(proofReceived&&!saved)||busy||startInFlight.current)return
    startInFlight.current=true
    if(saved)setProofReceived(false)
    void run(async()=>{
    const wave=consentWave
    if(info?.project.collectionMode==='LINKED_WAVES'&&!linkedIdentityReady)throw new Error('请先获取专属链接，或验证已有参与凭证。')
    if(info?.project.collectionMode==='LINKED_WAVES'&&wave.attempt){
      await loadTask(wave.attempt.id,researchCode.trim().toUpperCase(),accessCredential.trim())
      return
    }
    if(info?.project.collectionMode==='LINKED_WAVES'){
      if(!researchCode||!accessCredential)throw new Error('请先使用你的专属链接进入，或首次参加。')
      const started=await publicApi<{attemptId:string}>(base+'/waves/'+wave.id+'/start','POST',{
        researchCode:researchCode.trim().toUpperCase(),accessCredential:accessCredential.trim(),
        consent:true,consentVersion:wave.consentVersion,
      })
      await loadTask(started.attemptId,researchCode.trim().toUpperCase(),accessCredential.trim())
    }else{
      const started=await publicApi<{attemptId:string;accessCredential:string}>(
        base+'/waves/'+wave.id+'/start-unlinked','POST',{
          entryToken,consent:true,consentVersion:wave.consentVersion,
        })
      setAccessCredential(started.accessCredential)
      discardEntry()
      const temp:SingleResume={attemptId:started.attemptId,
        accessCredential:started.accessCredential,createdAt:Date.now()}
      setSingleResume(temp)
      try{sessionStorage.setItem(singleStorageKey(publicId),JSON.stringify(temp))}
      catch{/* private-storage disabled: valid credentials remain in this tab memory */}
      setNotice(singleStartNotice)
      await loadTask(started.attemptId,'',started.accessCredential)
    }
  },'正在读取本轮作答，请勿重复开始…').finally(()=>{startInFlight.current=false})}
  const start=()=>beginAnswering(false)
  const confirmSavedAndStart=()=>beginAnswering(true)
  const currentFlow=useMemo(()=>task?.flow?resolveClientSurveyFlow(task.flow,task.units,answers):null,[task,answers])
  const timedScaleUnits=useMemo(()=>new Map((task?.units??[]).filter(unit=>unit.kind==='SCALE').map(unit=>[
    unit.instrumentKey,{instrumentKey:unit.instrumentKey,title:unit.title,instruction:unit.instruction,
      items:unit.items??[],responseOptions:unit.responseOptions??[]},
  ])),[task])
  const flowBlock=currentFlow?.blocks[Math.min(flowStep,Math.max(0,currentFlow.blocks.length-1))]
  // One-by-one studies must not render multiple Scale timers simultaneously.
  // Keep historical all-at-once Waves on their original multi-tool layout.
  const timedSequence=!!task&&!task.flow&&task.units.some(u=>
    u.kind==='COGNITIVE'||u.kind==='SCALE'&&u.presentationMode==='ONE_BY_ONE')
  const activeTool=timedSequence?task!.units[Math.min(toolStep,task!.units.length-1)]:undefined
  const flowUnit=flowBlock?.kind==='INSTRUMENT'
    ?task?.units.find(u=>u.instrumentKey===flowBlock.instrumentKey):activeTool
  const finalFlowStep=currentFlow
    ?flowStep>=currentFlow.blocks.length-1
    :!timedSequence||toolStep>=task!.units.length-1
  const finalSubmitVisible=finalSealed||finalFlowStep&&!cognitiveRunning&&
    (flowUnit?.kind!=='COGNITIVE'||cognitiveReferences.some(ref=>ref.slotKey===flowUnit.instrumentKey))
  const canAdvanceFlow=(focusMissing=false):boolean=>{
    const incomplete=(itemKey?:string)=>{if(focusMissing&&flowUnit)revealAnswer(flowUnit,itemKey);return false}
    if(cognitiveRunning)return false
    if(!flowUnit)return true
    if(flowUnit.executionProtocol==='SITUATIONAL_NATIVE_V1')return !!situationalReferences[flowUnit.instrumentKey]||incomplete()
    if(flowUnit.kind==='COGNITIVE')return cognitiveReferences.some(ref=>ref.slotKey===flowUnit.instrumentKey)||incomplete()
    const existing=own(answers,flowUnit.instrumentKey)??{}
    if(flowUnit.kind==='FORM'){
      const visible=visibleFormKeys(flowUnit.pages?.flatMap(page=>page.questions)??[],existing)
      const pages=flowUnit.pages?.filter(page=>page.questions.some(q=>visible.has(q.itemKey)))??[]
      if((own(formPages,flowUnit.instrumentKey)??0)<pages.length-1)return incomplete()
      for(const page of pages)for(const question of page.questions){
        if(!visible.has(question.itemKey)||!question.required)continue
        const keys=['MATRIX','MATRIX_MULTIPLE'].includes(question.type)
          ?(question.rows??[]).map(row=>question.itemKey+':'+row.rowKey):[question.itemKey]
        for(const key of keys){
          const value=existing[key]
          if(value===undefined||value===null||value===''||
            (Array.isArray(value)&&!value.length))return incomplete(question.itemKey)
        }
      }
      return true
    }
    if(flowUnit.kind==='SCALE'&&!mountedScaleImagesReady(flowUnit))return incomplete(flowUnit.items?.[own(scalePages,flowUnit.instrumentKey)??0]?.itemKey)
    if(flowUnit.kind==='SCALE')return (flowUnit.items??[]).every(q=>
      (!q.required||typeof existing[q.itemKey]==='string'&&(existing[q.itemKey] as string).length>0)&&(!q.video||Object.prototype.hasOwnProperty.call(lockedAnswers,flowUnit.instrumentKey)||videoCompletions[videoKey(flowUnit,q.itemKey)]===true)||incomplete(q.itemKey))
    return (flowUnit.scenes?.flatMap(scene=>scene.questions)??flowUnit.questions??[]).every(q=>{
      const answer=existing[q.questionKey]
      // Optional means it can be empty, not that a supplied partial selection
      // can bypass the frozen bounds and strand a forward-only Flow at FINAL.
      if(q.required===false&&(answer===undefined||answer===null||
        q.responseType==='MULTIPLE'&&Array.isArray(answer)&&answer.length===0))return true
      if(q.allowRefusal&&isRefusal(answer))return true
      if(q.responseType==='MULTIPLE'){
        if(!Array.isArray(answer)||new Set(answer).size!==answer.length)return incomplete(q.questionKey)
        const selected=q.options.filter(option=>answer.includes(option.optionKey))
        if(selected.length!==answer.length)return incomplete(q.questionKey)
        if(selected.some(option=>option.nonanswerReason))return selected.length===1||incomplete(q.questionKey)
        if(selected.length>1&&selected.some(option=>q.exclusiveOptionKeys?.includes(option.optionKey)))return incomplete(q.questionKey)
        return selected.length>=(q.minSelections??1)&&selected.length<=(q.maxSelections??q.options.length)||incomplete(q.questionKey)
      }
      return typeof answer==='string'&&q.options.some(option=>option.optionKey===answer)||incomplete(q.questionKey)
    })
  }
  const advanceFlow=()=>{
    if(!canAdvanceFlow(true)){setError('请完成当前工具的必答内容和全部页，再进入下一步骤');return}
    setError('')
    if(flowUnit&&flowUnit.kind!=='COGNITIVE'&&flowUnit.executionProtocol!=='SITUATIONAL_NATIVE_V1')setLockedAnswers(previous=>({...previous,[flowUnit.instrumentKey]:{...(own(answers,flowUnit.instrumentKey)??{})}}))
    if(currentFlow)setFlowStep(i=>Math.min(i+1,currentFlow.blocks.length-1))
    else if(timedSequence)setToolStep(i=>Math.min(i+1,task!.units.length-1))
    focusStep()
  }
  const updateAnswer=(unit:Unit,key:string,value:Answer)=>setAnswers(previous=>{
    if(finalRequest.current||completedAttempts.current.has(attemptId)||Object.prototype.hasOwnProperty.call(lockedAnswers,unit.instrumentKey))return previous
    const next={...(own(previous,unit.instrumentKey)??{}),[key]:value}
    const question=unit.kind==='FORM'?unit.pages?.flatMap(page=>page.questions)
      .find(q=>q.itemKey===key&&q.otherOptionKey):undefined
    if(question&&!hasSelectedOther(question,value))delete next[question.itemKey+':other']
    return {...previous,[unit.instrumentKey]:next}
  })
  const recordTiming=(instrumentKey:string,next:import('./survey-scale-timing').SurveyScaleTimings)=>
    setItemTimings(prev=>({...prev,[instrumentKey]:next}))
  const timingFor=(unit:Unit)=>{
    const current=own(timingTrackers.current,unit.instrumentKey)
    if(current)return current
    const tracker=new SurveyScaleTimingTracker(own(itemTimings,unit.instrumentKey)??{},
      own(answers,unit.instrumentKey)??{})
    timingTrackers.current[unit.instrumentKey]=tracker
    return tracker
  }
  const priorAnswersFor=(key:string)=>{
    const order=currentFlow?.visibleUnitKeys??task?.units.map(u=>u.instrumentKey)??[]
    const index=order.indexOf(key),prior=new Set(order.slice(0,index))
    // Native task prerequisites are verified from server receipts, not ordinary answer locks.
    return Object.fromEntries((task?.units??[]).filter(u=>u.kind!=='COGNITIVE'&&u.executionProtocol!=='SITUATIONAL_NATIVE_V1'&&prior.has(u.instrumentKey)).map(u=>{
      const raw=own(answers,u.instrumentKey)??{}
      return [u.instrumentKey,u.kind==='FORM'?sanitizeFormAnswers(u.pages?.flatMap(p=>p.questions)??[],raw):raw]
    }))
  }
  const lockPriorAnswers=(canonical:Record<string,Record<string,unknown>>)=>{
    const locked=canonical as Record<string,Record<string,Answer>>
    // A later child may add prerequisites, never replace an earlier server lock.
    if(Object.entries(locked).some(([key,value])=>serverLockedKeys.current.has(key)&&
      !sameSurveyCheckpointAnswers(own(lockedAnswers,key),value)))
      throw new Error('服务器已锁定的前置答案不一致，请重新读取任务')
    for(const key of Object.keys(locked))serverLockedKeys.current.add(key)
    setLockedAnswers(old=>({...old,...locked}));if(!finalRequest.current)setAnswers(old=>({...old,...locked}))
  }
  const videoKey=(unit:Unit,itemKey:string)=>[attemptId,task?.definitionDigest,unit.instrumentKey,itemKey].join(':')
  const imageReadyFor=(unit:Unit,item:Question)=>!item.images?.length||imageReadiness[videoKey(unit,item.itemKey)]===true
  // Gate mounted stimuli, not an invented historical browser-viewing record.
  // Restored answers and unmounted earlier timed items retain their existing semantics.
  const mountedScaleImagesReady=(unit:Unit)=>{
    if(Object.prototype.hasOwnProperty.call(lockedAnswers,unit.instrumentKey))return true
    if((currentFlow||timedSequence)&&flowUnit?.instrumentKey!==unit.instrumentKey)return true
    const items=unit.items??[]
    const shown=unit.presentationMode==='ONE_BY_ONE'?items.slice(Math.min(own(scalePages,unit.instrumentKey)??0,Math.max(0,items.length-1)),Math.min(own(scalePages,unit.instrumentKey)??0,Math.max(0,items.length-1))+1):items
    return shown.every(item=>imageReadyFor(unit,item))
  }
  const markImagesReady=(unit:Unit,itemKey:string,ready:boolean)=>setImageReadiness(old=>{
    const key=videoKey(unit,itemKey);return old[key]===ready?old:{...old,[key]:ready}
  })
  const markVideoComplete=(unit:Unit,itemKey:string)=>setVideoCompletions(old=>({...old,[videoKey(unit,itemKey)]:true}))
  const renderSurveyTaskBody=(unit:Unit)=>{
    if(unit.executionProtocol==='SITUATIONAL_NATIVE_V1')return <SurveySituationalUnit key={attemptId+':'+unit.instrumentKey}
      publicId={publicId} attemptId={attemptId} slotKey={unit.instrumentKey} title={unit.title}
      accessCredential={accessCredential.trim()} researchCode={info?.project.collectionMode==='LINKED_WAVES'?researchCode.trim().toUpperCase():undefined}
      priorAnswers={currentFlow?priorAnswersFor(unit.instrumentKey):undefined}
      onStarted={(id,canonical)=>{
        knownSituationalSessions.current.set(id,{attemptId,researchCode});rememberSurveySituationalSession(publicId,attemptId,id,researchCode||undefined)
        if(canonical)lockPriorAnswers(canonical)
      }}
      onCommitted={receipt=>setSituationalReferences(old=>({...old,[unit.instrumentKey]:receipt}))}/>
    if(unit.kind==='COGNITIVE')return <Suspense key={unit.instrumentKey} fallback={<p role="status">正在加载认知测评…</p>}><SurveyCognitiveUnit publicId={publicId} attemptId={attemptId}
      instrumentKey={unit.instrumentKey} title={unit.title} request={publicApi}
      proof={{accessCredential,...(info?.project.collectionMode==='LINKED_WAVES'?{researchCode}:{})}}
      priorAnswers={priorAnswersFor(unit.instrumentKey)} existing={cognitiveSessions.find(s=>s.slotKey===unit.instrumentKey)}
      onStarted={(session,canonical)=>{
        rememberCognitive(attemptId,session.sessionId)
        lockPriorAnswers(canonical??priorAnswersFor(unit.instrumentKey))
        setCognitiveSessions(old=>[...old.filter(s=>s.slotKey!==session.slotKey),session])
      }}
      onCommitted={reference=>{setCognitiveReferences(old=>[...old.filter(r=>r.slotKey!==reference.slotKey),reference]);setCognitiveRunning(false)}}
      onRunningChange={setCognitiveRunning}/></Suspense>
    if(unit.kind==='SCALE'&&unit.presentationMode==='ONE_BY_ONE')
      return <fieldset key={unit.instrumentKey} className="border-0 p-0 min-w-0"><SurveyTimedScale
        unit={timedScaleUnits.get(unit.instrumentKey)!}
        imagesReady={mountedScaleImagesReady(unit)}
        autoAdvanceReady={(()=>{
          const item=unit.items?.[Math.min(own(scalePages,unit.instrumentKey)??0,Math.max(0,(unit.items?.length??0)-1))]
          return !item?.video||Object.prototype.hasOwnProperty.call(lockedAnswers,unit.instrumentKey)||videoCompletions[videoKey(unit,item.itemKey)]===true
        })()}
        renderMedia={itemKey=>{const item=unit.items?.find(q=>q.itemKey===itemKey);return item?<SurveyCatalogScaleMedia key={videoKey(unit,itemKey)} item={item} proof={{publicId,attemptId,accessCredential,...(info?.project.collectionMode==='LINKED_WAVES'?{researchCode}:{})}} instrumentKey={unit.instrumentKey} itemKey={itemKey} complete={videoCompletions[videoKey(unit,itemKey)]} onComplete={()=>markVideoComplete(unit,itemKey)} onImagesReadyChange={ready=>markImagesReady(unit,itemKey,ready)} readOnly={Object.prototype.hasOwnProperty.call(lockedAnswers,unit.instrumentKey)}/>:null}}
        answer={own(answers,unit.instrumentKey)??{}}
        tracker={timingFor(unit)} paused={finalSealed}
        readOnly={Object.prototype.hasOwnProperty.call(lockedAnswers,unit.instrumentKey)}
        index={own(scalePages,unit.instrumentKey)??0}
        onIndexChange={next=>setScalePages(prev=>({...prev,[unit.instrumentKey]:next}))}
        onAnswer={(key,value)=>updateAnswer(unit,key,value)}
        onTiming={next=>recordTiming(unit.instrumentKey,next)}/></fieldset>
    // Lock answer controls, not pagination: recovery starts at page zero and
    // must still let participants review a locked multi-page prerequisite.
    return <fieldset key={unit.instrumentKey} className="min-w-0 border-0 p-0"><TaskForm unit={unit}
      imageReady={Object.fromEntries((unit.items??[]).map(q=>[q.itemKey,imageReadyFor(unit,q)]))} onImageReadyChange={(itemKey,ready)=>markImagesReady(unit,itemKey,ready)}
      videoComplete={Object.fromEntries((unit.items??[]).map(q=>[q.itemKey,videoCompletions[videoKey(unit,q.itemKey)]]))} onVideoComplete={itemKey=>markVideoComplete(unit,itemKey)}
      readOnly={Object.prototype.hasOwnProperty.call(lockedAnswers,unit.instrumentKey)}
      pageIndex={own(formPages,unit.instrumentKey)??0}
      onPageChange={next=>setFormPages(current=>({...current,[unit.instrumentKey]:next}))}
      proof={{publicId,attemptId,accessCredential,
        ...(info?.project.collectionMode==='LINKED_WAVES'?{researchCode}:{}),
      }}
      answer={answers[unit.instrumentKey]||{}}
      onChange={(key,value)=>updateAnswer(unit,key,value)}/></fieldset>
  }
  const renderSurveyTask=(unit:Unit)=><div key={unit.instrumentKey}>
    {unit.materials?.map(item=><SurveyMaterialDisplay key={item.asset.assetId} item={item} proof={{publicId,attemptId,accessCredential,...(info?.project.collectionMode==='LINKED_WAVES'?{researchCode}:{})}}/>)}
    {renderSurveyTaskBody(unit)}
  </div>
  const submit=(e:FormEvent)=>{e.preventDefault();if(!task||!attemptId||finalInFlight.current||cognitiveRunning)return;
    if(!finalSealed&&task.units.some(unit=>unit.executionProtocol==='SITUATIONAL_NATIVE_V1'&&(!currentFlow||currentFlow.visibleUnitKeys.includes(unit.instrumentKey))&&!situationalReferences[unit.instrumentKey])){setNotice('请先完成情境化任务并核实保存回执');return}
    if(!finalRequest.current&&(currentFlow||timedSequence)&&!finalFlowStep){
      setError('请按顺序完成当前研究步骤');return
    }
    if(!finalRequest.current&&(currentFlow||timedSequence)&&!canAdvanceFlow(true)){
      setError('请完成当前工具后再提交');return
    }
    if(!finalRequest.current&&task.units.some(unit=>unit.kind==='SCALE'&&!Object.prototype.hasOwnProperty.call(lockedAnswers,unit.instrumentKey)&&(currentFlow===null||currentFlow===undefined||currentFlow.visibleUnitKeys.includes(unit.instrumentKey))&&unit.items?.some(q=>q.video&&!videoCompletions[videoKey(unit,q.itemKey)]))){setError('请完整观看量表题目中的视频后再提交');return}
    if(!finalRequest.current&&task.units.some(unit=>unit.kind==='SCALE'&&!mountedScaleImagesReady(unit))){setError('请等待当前量表图片加载完成；加载失败时请重试图片');return}
    finalInFlight.current=true
    void run(async()=>{
    const screened=finalRequest.current?finalRequest.current.path.endsWith('/screen-out')
      :currentFlow?.termination==='SCREEN_OUT'
    // A sealed request from a prior error/reload has an ambiguous outcome even
    // if its retry creates the first FINAL. Keep the current GENERAL recheck.
    const firstRequest=finalRequest.current===null
    if(!finalRequest.current){
      // Retry sends the original envelope; do not sanitize answers or reseal clocks.
      // Match the frozen conditional form. An earlier selection change must
      // clear fields that are now hidden; the server repeats this validation.
      const eligible=task.flow?new Set(currentFlow?.visibleUnitKeys??[]):null
      const payload=Object.fromEntries(task.units.filter(unit=>
        eligible===null||eligible.has(unit.instrumentKey)).map(unit=>{
        const original=own(answers,unit.instrumentKey)??{}
        return [unit.instrumentKey,unit.kind==='FORM'
          ?sanitizeFormAnswers(unit.pages?.flatMap(p=>p.questions)||[],original)
          :original]
      }))
      for(const tracker of Object.values(timingTrackers.current))tracker.pause()
      const timedUnits=task.units.filter(unit=>
        unit.kind==='SCALE'&&unit.presentationMode==='ONE_BY_ONE'&&
        (eligible===null||eligible.has(unit.instrumentKey)))
      const sealedTimings=Object.fromEntries(timedUnits.map(unit=>[
        unit.instrumentKey,sealSurveyScaleTimings(
          (unit.items??[]).map(item=>item.itemKey),payload[unit.instrumentKey]??{},
          own(timingTrackers.current,unit.instrumentKey)?.snapshot()??
            own(itemTimings,unit.instrumentKey)??{},
        ),
      ]))
      const path=base+'/attempts/'+attemptId+(screened?'/screen-out':'/final')
      finalRequest.current={attemptId,path,body:{
      ...(info?.project.collectionMode==='LINKED_WAVES'?{researchCode:researchCode.trim().toUpperCase()}:{}),
      accessCredential:accessCredential.trim(),submissionId,answers:payload,
      ...(timedUnits.length?{itemTimings:sealedTimings}:{}),
      ...(task.units.some(u=>u.executionProtocol==='SITUATIONAL_NATIVE_V1')?{situationalReferences:task.units.filter(u=>u.executionProtocol==='SITUATIONAL_NATIVE_V1'&&(eligible===null||eligible.has(u.instrumentKey))).flatMap(u=>situationalReferences[u.instrumentKey]?[situationalReferences[u.instrumentKey]]:[])}:{}),
      ...(task.units.some(u=>u.kind==='COGNITIVE')?{cognitiveReferences:cognitiveReferences.filter(ref=>eligible===null||eligible.has(ref.slotKey))}:{}),
      ...(currentFlow?{presentation:{shownBlocks:currentFlow.shownBlocks}}:{}),
      }}
      setFinalSealed(true)
      const descriptor:SurveyFinalSubmission={submissionId,screenOut:!!screened,
        ...(finalRequest.current.body.situationalReferences?{situationalReferences:finalRequest.current.body.situationalReferences}:{}),
        ...(finalRequest.current.body.cognitiveReferences?{cognitiveReferences:finalRequest.current.body.cognitiveReferences}:{}),
        ...(currentFlow?{presentation:{shownBlocks:currentFlow.shownBlocks}}:{})}
      if(!saveLocalSurveyDraft(publicId,attemptId,task.definitionDigest,payload,
        timedUnits.length?sealedTimings:undefined,descriptor))
        setNotice('本标签页无法保存封存提交。重试仅在当前页面有效，请勿刷新或关闭页面，直至确认完成。')
    }
    const sealed=finalRequest.current
    if(sealed.attemptId!==attemptId)throw new Error('提交所属作答已变化，请重新读取本轮')
    let final:FinalResponse
    try{final=await publicApi<FinalResponse>(sealed.path,'POST',sealed.body)}
    catch(e){
      // Only an explicit validation rejection proves this request did not commit.
      // Ambiguous network/server failures must keep the exact request for retry.
      if(e instanceof SurveyPublicApiError&&[400,413].includes(e.status)){
        finalRequest.current=null;setFinalSealed(false)
        const target=rejectedAnswerTarget(e.message)
        if(target)revealAnswer(target.unit,target.itemKey,true)
        if(document.visibilityState!=='hidden'&&document.hasFocus())
          for(const tracker of Object.values(timingTrackers.current))tracker.resume()
        saveLocalSurveyDraft(publicId,attemptId,task.definitionDigest,
          draftState.current.answers,draftState.current.itemTimings)
      }
      throw e
    }
    if(screened){
      if(final.status!=='SCREENED_OUT')throw new Error('资格筛除未确认')
      markScreenedOut(attemptId)
      return
    }
    if(final.status!=='COMPLETED')throw new Error('作答尚未完成提交')
    // FINAL is authoritative even if the subsequent General request fails.
    // Never keep a local draft after the server accepted completion.
    const proof={
      ...(info?.project.collectionMode==='LINKED_WAVES'?{researchCode:researchCode.trim().toUpperCase()}:{}),
      accessCredential:accessCredential.trim(),
    }
    markCompleted(attemptId,proof)
    const inline=firstRequest?firstFinalParticipantFeedback(final,attemptId):null
    const requiresDescription=task.reportMode==='DESCRIPTIVE'||task.units.some(u=>u.kind==='COGNITIVE'&&u.feedback?.mode==='DESCRIPTIVE')
    const receipt=inline??(firstRequest&&!requiresDescription?firstFinalGeneral(final,attemptId):null)
    if(receipt){
      // In-memory display only. Refresh/reopen and explicit reads reauthorize.
      setCompletionOptionsOpen(false);setGeneral(receipt)
      setNotice('')
    }else await readCompletion(attemptId,proof)
  },'正在提交，请勿刷新或重复操作…').finally(()=>{finalInFlight.current=false})}
  const saveCheckpoint=()=>{if(!task?.checkpointPolicy?.enabled||!attemptId)return
    if(checkpointOverwritePending&&!window.confirm(
      '确认用当前本地答案替换另一设备保存的服务器 Checkpoint？此操作不能恢复被覆盖的未提交草稿。',
    ))return
    void run(async()=>{
      // Only the current route is eligible for a voluntary server checkpoint.
      const enabled=task.flow?new Set(currentFlow?.visibleUnitKeys??[]):null
      const partial=Object.fromEntries(task.units.filter(unit=>
        enabled===null||enabled.has(unit.instrumentKey)).map(unit=>{
        const answer=own(answers,unit.instrumentKey)??{}
        return [unit.instrumentKey,unit.kind==='FORM'
          ?sanitizeFormAnswers(unit.pages?.flatMap(p=>p.questions)??[],answer):answer]
      }))
      const timedUnits=task.units.filter(unit=>
        unit.kind==='SCALE'&&unit.presentationMode==='ONE_BY_ONE'&&
        (enabled===null||enabled.has(unit.instrumentKey)))
      const partialTimings=Object.fromEntries(timedUnits.map(unit=>[
        unit.instrumentKey,sealSurveyScaleTimings((unit.items??[]).map(q=>q.itemKey),
          partial[unit.instrumentKey]??{},
          own(timingTrackers.current,unit.instrumentKey)?.snapshot()??
            itemTimings[unit.instrumentKey]??{}),
      ]))
      const saved=await publicApi<{revision:number;expiresAt:string}>(
        base+'/attempts/'+attemptId+'/checkpoint/save','POST',{
        ...(info?.project.collectionMode==='LINKED_WAVES'
          ?{researchCode:researchCode.trim().toUpperCase()}:{}),
        accessCredential:accessCredential.trim(),revision:checkpointRevision,answers:partial,
        ...(timedUnits.length?{itemTimings:partialTimings}:{}),
      })
      setCheckpointRevision(saved.revision)
      setCheckpointOverwritePending(false)
      setNotice('已加密暂存未完成答案，至 '+new Date(saved.expiresAt).toLocaleString('zh-CN')+
        ' 有效。这不是正式答卷（FINAL）；另一设备更改后须重新读取以避免覆盖。')
    })
  }
  const revokeAccess=()=>{if(info?.project.collectionMode!=='LINKED_WAVES'||!researchCode||!accessCredential)return
    if(!window.confirm('确认撤销此研究编号的未来访问权限？撤销后无法读取波次或回执，但凭编号和原始密钥仍可申请撤回历史研究数据。'))return
    void run(async()=>{
      await publicApi(base+'/revoke-access','POST',{
        researchCode:researchCode.trim().toUpperCase(),accessCredential:accessCredential.trim(),
      })
      if(attemptId)clearLocalSurveyDraft(publicId,attemptId)
      const cleared=await clearCognitive()
      if(!cleared)setError('访问已撤销，但本机试次清理失败，请清理本网站存储。')
      setRevoked(true);setHome(null);setTask(null);setGeneral(null);setCompletion(null)
      setSelectedWave(null);setAgreed(false);setProofReceived(false)
      discardEntry()
      setNotice('已终止未来访问，仍可凭原始研究身份申请撤回数据。')
    })
  }
  const withdraw=()=>{if(!general&&!revoked&&!screenedOut
    &&!(info?.project.collectionMode==='LINKED_WAVES'&&researchCode&&accessCredential))return
    if(!window.confirm(
      '确认申请撤回本研究可定位的数据吗？后续统计和新导出将排除这些记录；此前合法保存的研究资料仍须按研究说明处理，已下载的外部副本无法自动追回。'
    ))return
    void run(async()=>{
      if(info?.project.collectionMode==='LINKED_WAVES'){
        await publicApi(base+'/withdraw-linked','POST',{
          researchCode:researchCode.trim().toUpperCase(),
          accessCredential:accessCredential.trim(),
        })
      }else{
        await publicApi(base+'/attempts/'+attemptId+'/withdraw-data','POST',{
          accessCredential:accessCredential.trim(),
        })
      }
      if(attemptId)clearLocalSurveyDraft(publicId,attemptId)
      const cleared=await clearCognitive(info?.project.collectionMode==='LINKED_WAVES'?undefined:attemptId)
      if(!cleared)setError('撤回已记录，但本机试次清理失败，请清理本网站存储。')
      setWithdrawn(true);setGeneral(null);setCompletion(null);setTask(null);setHome(null)
      setSingleResume(null)
      try{sessionStorage.removeItem(singleStorageKey(publicId))}catch{/* storage unavailable */}
      setResearchCode('');setAccessCredential('')
      discardEntry()
      setNotice('已记录撤回请求。相关回答将从后续统计和新导出排除；物理删除与历史留存按研究说明处理。')
    })
  }

  const returnHome=()=>void run(async()=>{
    const data=await publicApi<{waves:Wave[]}>(base+'/enter','POST',{
      researchCode:researchCode.trim().toUpperCase(),accessCredential:accessCredential.trim(),
      ...(info?.scopeWaveId?{waveId:info.scopeWaveId}:{}),
    })
    setHome(data.waves);setSelectedWave(null);setGeneral(null);setCompletion(null);setTask(null);setReceiptsOpen(false)
  })
  // Timed cognitive administration retains the exact existing ancestor layout.
  // Only peripheral siblings opt in, and that opt-in stops while a runner is active.
  const panel=(base:string)=>cognitiveRunning?base:base+' survey-participant-panel'
  const message=(base:string)=>cognitiveRunning?base:base+' survey-participant-message'
  const action=(base:string)=>cognitiveRunning?base:base+' survey-participant-action'
  const personalUrl=!codeMode&&info?.project.collectionMode==='LINKED_WAVES'&&linkedIdentityReady&&!revoked&&!withdrawn
    ?personalParticipationLink(window.location.origin,publicId,{researchCode,accessCredential}):''
  const participantEntry=!!info&&!task&&!general&&!completion&&!revoked&&!withdrawn
  const identityStarting=participantEntry&&busy&&busyLabel==='正在读取本轮作答，请勿重复开始…'
  const identitySavePending=participantEntry&&(proofReceived||identityStarting)
  const visibleWaves=home||info?.waves||[]
  const completedWaves=visibleWaves.filter(wave=>wave.attempt?.status==='COMPLETED')
  const participationWaves=visibleWaves.filter(wave=>wave.attempt?.status!=='COMPLETED')
  const automaticConsentWave=info?.project.collectionMode==='SINGLE_UNLINKED'&&visibleWaves.length===1&&!singleResume
    &&visibleWaves[0].attempt?.status!=='SCREENED_OUT'
    &&(visibleWaves[0].status==='OPEN'||!!visibleWaves[0].attempt)
    ?visibleWaves[0]:null
  const automaticGeneratedConsentWave=generatedCodeMode&&!home&&(validEntry||!!fullMemorableCode&&linkedIdentityReady)
    ?visibleWaves.filter(wave=>wave.status==='OPEN'&&wave.allowNewParticipants!==false&&!wave.attempt).sort((a,b)=>a.ordinal-b.ordinal)[0]??null:null
  const consentWave=selectedWave||automaticConsentWave||automaticGeneratedConsentWave
  const [agreementIdentity,setAgreementIdentity]=useState('')
  const consentIdentity=consentWave?JSON.stringify([consentWave.id,consentWave.consentVersion,consentWave.consentText]):''
  const consentAccepted=agreed&&agreementIdentity===consentIdentity
  const directConsentEntry=participantEntry&&!!automaticConsentWave
  const codeReturnEntry=participantEntry&&codeMode&&!validEntry&&!linkedIdentityReady
  const streamlinedRandomEntry=participantEntry&&generatedCodeMode&&!home&&!!consentWave&&(validEntry||!!fullMemorableCode&&linkedIdentityReady)
  return <div className={'min-h-screen bg-slate-50 text-slate-800'+(!cognitiveRunning?' survey-participant-shell'+(task&&!general&&!completion?' survey-active-answer':''):'')}>
    {!cognitiveRunning&&<a className="survey-participant-skip" href="#survey-participant-content">跳至研究内容</a>}
    <header className={'border-b bg-white'+(!cognitiveRunning?' survey-participant-header':'')}>
      {cognitiveRunning?<div className="max-w-3xl mx-auto p-5"><h1 className="text-2xl font-semibold">Huisurvey</h1><p className="text-sm text-slate-500">问卷作答</p></div>
        :<div className="max-w-3xl mx-auto p-5 survey-participant-brand survey-participant-vector-brand">
          <img src="/survey/huisurvey-w2-emblem.svg" alt="" width="216" height="184"/>
          <img className="survey-participant-wordmark" src="/survey/research-wordmark.svg" alt="Research @EduK12.top" width="517" height="190"/>
          <h1 className="sr-only">问卷作答</h1>
        </div>}
    </header>
    <main id={cognitiveRunning?undefined:'survey-participant-content'} tabIndex={cognitiveRunning?undefined:-1}
      className="max-w-3xl mx-auto p-4 sm:p-7 space-y-5">
      {!cognitiveRunning&&!task&&!codeReturnEntry&&!identitySavePending&&!streamlinedRandomEntry&&<ol className="survey-participant-steps" aria-label="研究参与步骤">
        {['阅读并同意','填写问卷','提交完成'].map((label,index)=><li key={label}
          aria-current={index===(general||completion?2:task?1:0)?'step':undefined}>
          <span aria-hidden="true">0{index+1}</span>{label}</li>)}
      </ol>}
      {busy&&<p role="status" aria-live="polite" aria-atomic="true">{busyLabel}</p>}
      {loading&&<p role="status">正在读取研究说明…</p>}
      {error&&<p role="alert" className={message('border-l-4 border-red-600 bg-red-50 p-3')}>{error}</p>}
      {notice&&notice!==singleStartNotice&&(notice!==singleResumeNotice||!cognitiveRunning)&&<p role="status" className={message('border-l-4 border-teal-600 bg-teal-50 p-3')}>{notice}</p>}
      {revoked&&!withdrawn&&<section className={panel('border p-4 rounded-lg bg-white')}>
        <p role="status">访问已撤销；仍可申请撤回研究数据。</p>
        <button type="button" className={action('btn-secondary')} disabled={busy} onClick={withdraw}>申请排除历史研究数据</button>
      </section>}
      {withdrawn&&<p role="status" className="border-l-4 border-teal-600 p-4">
        您的研究数据撤回请求已被记录。后续统计和新导出将排除可定位回答。
      </p>}
      {!info&&!loading&&<section className="space-y-3"><label className="block text-sm">请从原研究邀请中复制 43 位凭证重试。
        <input className="input block w-full mt-2" autoComplete="off"
          aria-label="重新输入研究邀请凭证" value={entryToken}
          onChange={event=>setEntryToken(event.target.value.trim())}/>
      </label><button type="button" className={action('btn-secondary')} disabled={busy||!safePattern.test(publicId)}
        onClick={recoverWithoutInvitation}>已有私密凭据 · 恢复作答或撤回数据</button></section>}
      {info&&<>{participantEntry&&!screenedOut&&!directConsentEntry&&!streamlinedRandomEntry&&!codeReturnEntry&&!identitySavePending&&<section className={panel('bg-white rounded-xl border p-5')+(participantEntry?' survey-entry-intro':'')}>
        {participantEntry&&<p className="survey-entry-eyebrow">邀请你填写一份问卷</p>}
        <h2 className="text-xl font-semibold">{info.project.name}</h2>
        {participantEntry?<>
          <p className="survey-entry-lead">先阅读参与说明，再决定是否开始。</p>
          <div className="survey-entry-facts" aria-label="参与方式">
            <span>无需登录</span><span>{info.project.collectionMode==='LINKED_WAVES'?'分次参与':'独立作答'}</span>
          </div>
          {info.project.collectionMode==='LINKED_WAVES'&&<p className="survey-entry-privacy">{codeMode?(generatedCodeMode?'使用系统生成的随机编码关联多次回答，无需提供个人信息。请保存编码，丢失后无法找回。':'使用同一研究编码，关联你在本研究中的多次回答。短编号可能对应研究者已有的报名或班级名单。'):'无需提供真实身份信息。使用同一专属链接，可关联你在本研究中的多次回答。'}</p>}
          {info.project.description&&<details className="survey-entry-about"><summary>查看研究介绍</summary>
            <p className="whitespace-pre-wrap">{info.project.description}</p></details>}
        </>:<p className="my-3 whitespace-pre-wrap">{info.project.description}</p>}
        {groupWave?.groupIpPolicy&&groupWave.closesAt&&<p className="mt-3 text-sm text-amber-800">
          同 IP 集体作答截止：{new Date(groupWave.closesAt).toLocaleString('zh-CN',{
            timeZone:groupWave.groupIpPolicy.timeZone,year:'numeric',month:'2-digit',day:'2-digit',
            hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,
          })}（{groupWave.groupIpPolicy.timeZone}）。请在截止前完成提交；到期无宽限，暂停不延长窗口。
        </p>}
      </section>}
      {codeMode&&proofReceived&&!task&&!revoked&&!withdrawn&&!streamlinedRandomEntry&&<SurveyMemorableCodeSaved generated={generatedCodeMode} fullCode={fullMemorableCode} busy={busy} onSaved={confirmSavedAndStart}/>}
      {personalUrl&&!task&&!identityStarting&&(proofReceived?<Suspense fallback={<p role="status">正在准备参与链接…</p>}><SurveyPersonalLink url={personalUrl} firstTime busy={busy} onSaved={confirmSavedAndStart}/></Suspense>
        :<details className="survey-returning-link" open={personalLinkOpen} onToggle={event=>setPersonalLinkOpen(event.currentTarget.open)}><summary onClick={event=>{event.preventDefault();setPersonalLinkOpen(open=>!open)}}>查看原有链接与二维码</summary>{personalLinkOpen&&<Suspense fallback={<p role="status">正在准备参与链接…</p>}><SurveyPersonalLink url={personalUrl} firstTime={false} busy={busy} onSaved={()=>{}}/></Suspense>}</details>)}
      {info.project.collectionMode==='SINGLE_UNLINKED'&&singleResume&&!task&&!general&&!completion&&
        <section className={panel('bg-white border rounded-xl p-4')}>
          <h3 className="font-semibold">恢复本次单次匿名作答</h3>
          <p className="text-sm my-2">请在原浏览器标签页继续作答。公共设备使用完毕后，请关闭页面。</p>
          <button className={action('btn-secondary')} type="button" disabled={busy} onClick={resumeSingle}>
            {busyLabel==='正在恢复本次作答，请稍候…'?'正在恢复…':'恢复本次作答／查看已完成回执'}</button>
        </section>}
      {home&&!task&&!general&&!completion&&info.project.collectionMode==='LINKED_WAVES'&&
        <button type="button" className={action('btn-secondary')} disabled={busy} onClick={revokeAccess}>
          停止后续研究参与并撤销未来访问权限（已收集数据不自动删除）
        </button>}
      {streamlinedRandomEntry&&consentWave&&<SurveyRandomCodeEntry name={info.project.name} consentText={consentWave.consentText}
        fullCode={fullMemorableCode} copied={linkedIdentityReady&&!proofReceived} busy={busy}
        deadline={groupWave?.groupIpPolicy&&groupWave.closesAt?'请在 '+new Date(groupWave.closesAt).toLocaleString('zh-CN',{timeZone:groupWave.groupIpPolicy.timeZone})+' 前完成提交。':undefined}
        onConsent={joinRandomCode} onCopied={()=>setProofReceived(false)} onStart={start}
        recovery={<SurveyMemorableCodeRecovery busy={busy} generated onEnter={enterCode} onReset={resetCode}/>}/>}
      {!task&&!general&&!completion&&!revoked&&!streamlinedRandomEntry&&!codeReturnEntry&&!identitySavePending&&<section className={panel('bg-white rounded-xl border p-5')+' survey-entry-options'}>
        {directConsentEntry?<div className="survey-consent-intro">
          <div className="survey-consent-anonymity" aria-label="匿名参与方式">
            <strong>完全匿名：</strong><span>无需登录，不记录个人信息，放心作答</span>
          </div>
          <p className="survey-entry-eyebrow">诚邀你参与</p>
          <h2>{info.project.name}</h2>
          {groupWave?.groupIpPolicy&&groupWave.closesAt&&<p className="mt-3 text-sm text-amber-800">
            同 IP 集体作答截止：{new Date(groupWave.closesAt).toLocaleString('zh-CN',{
              timeZone:groupWave.groupIpPolicy.timeZone,year:'numeric',month:'2-digit',day:'2-digit',
              hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,
            })}（{groupWave.groupIpPolicy.timeZone}）。请在截止前完成提交；到期无宽限，暂停不延长窗口。
          </p>}
          <p className="survey-consent-invitation">请先阅读下方说明，是否参加由你决定。</p>
        </div>:<>
          <h3 className="font-semibold text-lg">{consentWave?'阅读参与说明':home&&completedWaves.length>0&&participationWaves.length===0?'本次问卷已完成':participationWaves.length>1?'请选择本次要填写的问卷':'准备开始'}</h3>
          {!consentWave&&participationWaves.length>1&&<p className="survey-entry-next">选择对应问卷，先阅读说明，再确认参加。</p>}
        </>}
        {!validEntry&&!researchCode&&!codeMode&&<label className="block text-sm my-3">需要原邀请链接中的访问凭证。请重新打开邀请链接，或在下方粘贴凭证。
          <input className="input block w-full mt-2" autoComplete="off"
            aria-label="重新输入研究邀请凭证" value={entryToken}
            onChange={event=>setEntryToken(event.target.value.trim())}
            placeholder="输入研究邀请凭证"/>
        </label>}
        {home&&visibleWaves.every(wave=>wave.status!=='OPEN'||['COMPLETED','SCREENED_OUT'].includes(wave.attempt?.status??''))&&
          <p className="survey-entry-next">目前没有待填写的问卷。请保存专属链接，下次开放后再来。</p>}
        {!directConsentEntry&&participationWaves.map(wave=><div key={wave.id} className="survey-wave-row border-b py-3 flex items-center justify-between gap-3">
          <div><strong>第 {wave.ordinal} 轮 · {wave.title}</strong>
            <p className="text-sm text-slate-500">{wave.status==='OPEN'?'现在可以填写':wave.status==='CLOSED'?'已结束':'尚未开放'}
              {wave.attempt?' · '+(wave.attempt.status==='COMPLETED'?'已完成':wave.attempt.status==='SCREENED_OUT'?'已筛除':'进行中'):''}</p>
          </div>
          <button className={action('btn-primary')+' survey-entry-action'} aria-expanded={selectedWave?.id===wave.id}
            aria-controls={selectedWave?.id===wave.id?'survey-participant-consent':undefined}
            disabled={busy||wave.attempt?.status==='SCREENED_OUT'||(wave.status!=='OPEN'&&!wave.attempt)}
            onClick={()=>chooseWave(wave)}>{wave.attempt?.status==='COMPLETED'?'查看回执':'查看参与说明'}<span aria-hidden="true"> →</span></button>
        </div>)}
        {consentWave&&<div id="survey-participant-consent" role="region" aria-label="参与说明" tabIndex={-1} className="survey-entry-consent bg-slate-50 border rounded-lg p-4 mt-4 space-y-3">
          <h3 className="font-semibold">知情同意书</h3>
          <p className="whitespace-pre-wrap text-sm survey-consent-text">{consentWave.consentText}</p>
          {info.project.collectionMode==='LINKED_WAVES'&&<p className="text-sm text-sky-800">
            {codeMode?(generatedCodeMode?'系统将为你生成一个随机研究编码，用于关联本研究内的回答。请自行保存，不要转发；丢失后无法找回。':'完整研究编码用于关联本研究内的多次回答。私人后缀不要交给研究者或他人；短编号可能对应报名或班级名单。'):'无需姓名或账号。我们会通过专属链接，关联你在本研究中的多次回答。'}</p>}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consentAccepted}
            onChange={e=>{setAgreed(e.target.checked);setAgreementIdentity(e.target.checked?consentIdentity:'')}}/>
            {info.project.collectionMode==='LINKED_WAVES'?'我已阅读并同意本轮研究说明及相应的数据关联范围。':'我已阅读以上说明，自愿参加本次问卷。'}</label>
          <p className="survey-consent-choice">若不愿参加，可直接关闭本页。未确认同意前，不会开始作答。</p>
          {!codeMode&&info.project.collectionMode==='LINKED_WAVES'&&!linkedIdentityReady&&!personalProof&&<button
            className={action('btn-secondary')} disabled={busy||!consentAccepted||!validEntry}
            onClick={()=>join(consentWave)}>首次参加 · 获取专属链接</button>}
          {codeMode&&!linkedIdentityReady&&!codeSetup&&<button type="button" className={action('btn-primary')}
            disabled={busy||!consentAccepted||!validEntry} onClick={()=>generatedCodeMode?joinRandomCode():setCodeSetup(true)}>{generatedCodeMode?'首次参加 · 领取研究编码':'首次参加 · 设置研究编码'}</button>}
          {codeMode&&!generatedCodeMode&&codeSetup&&consentAccepted&&!linkedIdentityReady&&<SurveyMemorableCodeSetup busy={busy}
            label={info.project.participantCodeLabel||'报名序号'} instructions={info.project.participantCodeInstructions||''} onSubmit={joinCode}/>}
          <button className={action('btn-primary')} disabled={busy||!consentAccepted||
            (info.project.collectionMode==='LINKED_WAVES'?(!linkedIdentityReady||!researchCode||!accessCredential||proofReceived):!validEntry)}
            onClick={start}>{busyLabel==='正在读取本轮作答，请勿重复开始…'?'正在读取本轮…':consentWave.attempt?.status==='COMPLETED'?'查看完成情况':'开始填写问卷'}</button>
        </div>}
      </section>}
      {!codeMode&&info.project.collectionMode==='LINKED_WAVES'&&!home&&!task&&!general&&!completion&&!revoked&&!linkedIdentityReady&&<section className={panel('bg-white rounded-xl border p-5 survey-entry-recovery')}>
        <h3 className="font-semibold text-lg">继续参加</h3>
        <p className="text-sm my-2">已参加过？打开你保存的专属链接即可继续。</p>
        <details open={legacyRecoveryOpen} onToggle={event=>setLegacyRecoveryOpen(event.currentTarget.open)}>
          <summary className="survey-legacy-summary" onClick={event=>{event.preventDefault();setLegacyRecoveryOpen(value=>!value)}}>使用旧编号和恢复凭证</summary>
        {legacyRecoveryOpen&&<><form onSubmit={recover} className="grid gap-3">
          <label>研究编号<input className="input block w-full" value={researchCode}
            onChange={e=>setResearchCode(e.target.value)} autoComplete="off" placeholder="R-…"/></label>
          <label>私密恢复凭证<input className="input block w-full" type="password" autoComplete="off"
            value={accessCredential} onChange={e=>setAccessCredential(e.target.value)}/></label>
          <button className={action('btn-primary')} disabled={busy||!researchCode||!accessCredential}>{busyLabel==='正在读取你的波次任务…'?'正在读取…':'读取我的波次任务'}</button>
        </form>
        <button type="button" className={action('btn-secondary mt-3')} disabled={busy||!researchCode||!accessCredential}
          onClick={withdraw}>持原有研究凭证申请数据撤回（包括已撤销访问者）</button></>}
        </details>
      </section>}
      {codeMode&&!linkedIdentityReady&&!revoked&&!withdrawn&&!streamlinedRandomEntry&&<SurveyMemorableCodeRecovery busy={busy} generated={generatedCodeMode} entryTitle={codeReturnEntry?info.project.name:undefined} onEnter={enterCode} onReset={resetCode}/>}
      {task&&!general&&<form className="space-y-5" onSubmit={submit}>
        <fieldset disabled={busy||finalSealed} className="space-y-5 min-w-0 border-0 p-0">
        <h3 id="survey-task-step" tabIndex={-1} className="sr-only">填写问卷</h3>
        {task.checkpointPolicy?.enabled&&<section className={panel('bg-white border rounded-xl p-4 space-y-2')}>
          <p className="text-sm">此研究启用了可选服务器加密暂存：您可主动保存尚未完成的内容。
            每次最多 64KB，保存期 {task.checkpointPolicy.ttlHours} 小时；不计入正式研究答卷（FINAL）。</p>
          <button type="button" className={action('btn-secondary')} disabled={busy||cognitiveRunning} onClick={saveCheckpoint}>
            保存加密临时进度（第 {checkpointRevision+1} 版）</button>
          <p className="text-xs text-slate-500">研究者不会通过此按钮获得正式作答，取消、撤回或最终提交后将按策略清理。
            仅拥有本研究合法私密凭证的当前参与者可以恢复。</p>
        </section>}
        {cognitiveSessions.length>0&&Object.keys(lockedAnswers).length>0&&<p role="status" className="text-sm text-amber-800">认知任务已经开始，前置工具答案已锁定。此任务已提交与本轮研究已提交分别确认。</p>}
        {cognitiveRunning&&<p role="status" className="text-sm">认知任务运行／提交期间不能切换外层研究步骤。请勿刷新或离开页面。</p>}
        {task.flow&&currentFlow?<>
          <p className="text-xs text-slate-500">研究流程 · 步骤 {Math.min(flowStep+1,currentFlow.blocks.length)} / {currentFlow.blocks.length}</p>
          {flowBlock?.kind==='MATERIAL'&&<section className={panel('bg-white border rounded-xl p-5 space-y-3')}>
            <h4 className="font-semibold">{flowBlock.title||'研究材料'}</h4>
            <p className="whitespace-pre-wrap text-sm">{flowBlock.body}</p>
          </section>}
          {flowBlock?.kind==='INSTRUMENT'&&flowUnit&&renderSurveyTask(flowUnit)}
          {flowBlock?.kind==='END'&&<section className={panel('bg-white border rounded-xl p-5')}>
            <h4 className="font-semibold">{flowBlock.title||'本轮流程结束'}</h4>
            <p className="text-sm">{flowBlock.termination==='SCREEN_OUT'
              ?'当前路径为资格筛除，不形成正式测量答卷（FINAL）。'
              :'按本轮已固定的流程，后续研究工具无需作答（未呈现，NOT_SHOWN）。'}</p>
          </section>}
          {!finalFlowStep&&<button type="button" className={action('btn-secondary')} disabled={busy||cognitiveRunning}
            onClick={advanceFlow}>确认当前步骤，继续研究</button>}
        </>:timedSequence&&flowUnit?<section className="space-y-3">
          <p className="text-xs text-slate-600" role="status">第 {toolStep+1} / {task.units.length} 部分</p>
          {renderSurveyTask(flowUnit)}
          <nav aria-label="问卷部分导航" className={cognitiveRunning?'flex flex-wrap gap-3':'survey-section-navigation'}>
            {!finalFlowStep&&<button type="button" className={action('btn-primary')} disabled={cognitiveRunning}
              onClick={advanceFlow}>下一部分</button>}
          </nav>
        </section>:task.units.map(renderSurveyTask)}
        </fieldset>
        {finalSealed&&<p role="status" className={message('')}>本次答案已封存，尚未确认提交结果。请使用下方按钮重试原提交，不会创建另一份答卷；暂不能修改答案，请勿刷新或关闭页面。</p>}
        {finalSubmitVisible&&<button className={action('btn-primary')} disabled={busy||cognitiveRunning||(!finalSealed&&task.units.some(unit=>unit.kind==='SCALE'&&!mountedScaleImagesReady(unit)))||(!finalSealed&&!task.flow&&!task.units.every(unit=>{
          if(unit.executionProtocol==='SITUATIONAL_NATIVE_V1')return !!situationalReferences[unit.instrumentKey]
          if(unit.kind!=='FORM')return true
          const vis=visibleFormKeys(unit.pages?.flatMap(p=>p.questions)||[],
            own(answers,unit.instrumentKey)??{})
          const pages=(unit.pages||[]).filter(p=>p.questions.some(q=>vis.has(q.itemKey)))
          return (own(formPages,unit.instrumentKey)??0)>=pages.length-1
        }))}>{busy&&finalInFlight.current?'正在提交…':finalSealed?'重试原提交':currentFlow?.termination==='SCREEN_OUT'?'完成资格筛选':'提交本轮正式回答'}</button>}
        {!cognitiveRunning&&!finalSealed&&<div className="text-xs text-slate-500 space-y-1" aria-label="作答提醒">
          <p>{task.checkpointPolicy?.enabled
            ?'离开前请保存加密临时进度，并保管好私密凭证。'
            :'答案仅在此标签页暂存，最长两小时；关闭页面或更换设备后无法恢复，请尽量一次完成。'}</p>
          {finalSubmitVisible&&<p>检查完成后点击提交，看到完成提示即表示已保存。</p>}
        </div>}
      </form>}
      {screenedOut&&!task&&<section className={panel('bg-white border rounded-xl p-5 space-y-3')}>
        <h2 className="text-lg font-semibold">本轮资格筛选已结束</h2>
        <p className="text-sm">未产生完整正式研究答卷（FINAL）；筛选路径不会作为有效测量样本统计。</p>
        {info.project.collectionMode==='LINKED_WAVES'
          ?<button type="button" className={action('btn-secondary')} disabled={busy}
              onClick={returnHome}>返回我的研究波次</button>
          :<button type="button" className={action('btn-secondary')} disabled={busy}
              onClick={withdraw}>撤回本轮筛选记录</button>}
      </section>}
      {completion&&!general&&<section className={panel('bg-white border rounded-xl p-5 space-y-3')}>
        <h2 className="text-xl font-semibold">感谢参与，问卷已提交</h2>
        <p className="survey-completion-state">你已完成问卷，可以关闭此页面。</p>
        <p>你的回答已保存。暂时无法显示后续信息，你可以稍后重试。</p>
        <button type="button" className={action('btn-secondary')} disabled={busy}
          onClick={()=>void run(()=>readCompletion(completion.attemptId,completion.proof))}>重新查看</button>
      </section>}
      {general&&<section className={panel('survey-completion-card bg-white border rounded-xl p-5 space-y-3')}>
        <div className="survey-completion-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m6 12 4 4 8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
        <h2 className="text-xl font-semibold">感谢参与，问卷已提交</h2>
        <p className="survey-completion-copy whitespace-pre-wrap">{general.text||'你已完成问卷，可以关闭此页面。'}</p>
        {general.kind==='DESCRIPTIVE'&&<section className="border rounded-lg p-3 space-y-3" aria-label="本次表现描述性反馈">
          <h3 className="font-semibold">本次表现反馈</h3>
          {general.pending&&<p role="status">部分反馈将在问卷收集结束后开放。</p>}
          {general.measurements?.map(measurement=><article key={measurement.instrumentKey} className="space-y-2">
            <h4 className="font-medium">{measurement.title}</h4>
            <p className="text-xs">{measurement.feedbackKind==='RAW_METRICS'?feedbackQualityText(measurement.quality):'试点测量 · 质量状态：'+measurement.quality}。仅反映本次条件下的表现。</p>
            {measurement.metrics.map(metric=><p key={metric.key}>{metric.label}：{metric.value===null?'不可计算':measurement.feedbackKind==='RAW_METRICS'?String(metric.value):metric.unit==='ratio'?(metric.value*100).toFixed(1)+'%':metric.unit==='ms'?metric.value+' ms':String(metric.value)}（{measurement.feedbackKind==='RAW_METRICS'?feedbackMetricStatusText(metric.status):metric.status}）</p>)}
            {measurement.feedbackKind==='RAW_METRICS'&&measurement.rawScoreFeedback?.map((feedback,index)=><section className="border-l-2 border-slate-300 pl-3 space-y-2" key={feedback.scoreKey+':'+index} aria-label="原始分描述性反馈">
              <p className="whitespace-pre-wrap text-sm">{feedback.text}</p>
              {completion&&feedback.materials?.map(item=><SurveyMaterialDisplay key={item.asset.assetId} item={item} purpose="report" proof={{publicId,attemptId:completion.attemptId,...completion.proof}}/>)}
              {completion&&feedback.images?.map(image=><SurveyParticipantImage key={image.asset.assetId} image={image} purpose="report" proof={{publicId,attemptId:completion.attemptId,...completion.proof}}/>)}
            </section>)}
          </article>)}
        </section>}
        {general.nativeBundles?.map(bundle=><section key={bundle.importId} aria-label="整体理论报告"><h2>{bundle.title}</h2>{bundle.profileView?<BundleProfileSummary view={bundle.profileView}/>:<p>综合结果暂不可用；单项作答已保存。</p>}</section>)}
        <p className="survey-completion-time">完成时间：{new Date(general.completedAt).toLocaleString('zh-CN')}</p>
        {info.project.collectionMode==='LINKED_WAVES'&&<div className="survey-completion-primary">
          <button type="button" className={action('btn-secondary')} disabled={busy} onClick={returnHome}>返回我的研究波次</button>
        </div>}
        {general.disclaimer&&<p className="survey-completion-disclaimer">{general.disclaimer}</p>}
        <details className="survey-completion-options" open={completionOptionsOpen}
          onToggle={event=>setCompletionOptionsOpen(event.currentTarget.open)}>
          <summary onClick={event=>{event.preventDefault();setCompletionOptionsOpen(open=>!open)}}>参与与数据管理</summary>
          {completionOptionsOpen&&<div className="survey-completion-option-list">
            {info.project.collectionMode==='LINKED_WAVES'&&<div className="survey-completion-option">
              <p>如不再参加后续问卷，可停止此编码的后续访问；已提交的回答会保留。</p>
              <button type="button" className="survey-completion-management-action" disabled={busy} onClick={revokeAccess}>
                只撤销未来访问（保留研究数据）</button>
            </div>}
            <div className="survey-completion-option">
              <p>如希望退出研究，可申请将已提交的回答排除在后续统计之外。</p>
              <button type="button" className="survey-completion-management-action" disabled={busy} onClick={withdraw}>
                申请撤回本研究数据（排除未来统计）</button>
            </div>
          </div>}
        </details>
      </section>}
      {participantEntry&&!identitySavePending&&home&&completedWaves.length>0&&<details className="survey-completed-receipts" open={receiptsOpen}
        onToggle={event=>setReceiptsOpen(event.currentTarget.open)}>
        <summary onClick={event=>{event.preventDefault();setReceiptsOpen(open=>!open)}}>已完成问卷<span>{completedWaves.length} 份</span></summary>
        {receiptsOpen&&<div className="survey-receipt-list">
          <p>这里可查看已提交问卷的回执。</p>
          {completedWaves.map(wave=><div key={wave.id} className="survey-receipt-row">
            <div><strong>第 {wave.ordinal} 轮 · {wave.title}</strong><span>已完成</span></div>
            <button type="button" className="survey-receipt-link" disabled={busy} onClick={()=>chooseWave(wave)}>查看回执</button>
          </div>)}
        </div>}
      </details>}
      </>}
    </main></div>
}
