import { clearSurveyCognitiveSessions,rememberSurveyCognitiveSession } from './survey-cognitive-local'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { SurveyCognitiveUnit } from './SurveyCognitiveUnit'
import type { SurveyCognitiveReference,SurveyCognitiveSessionInfo } from './survey-cognitive-api'
import type { SurveyPublicImage } from './builder.types'
import { visibleFormKeys,sanitizeFormAnswers } from './form-visibility'
import { ProfessionalFormAnswer,type ProfessionalAnswer } from './ProfessionalFormAnswer'
import { FormChoiceExtras,hasSelectedOther,toggleFormMultiple } from './FormChoiceExtras'
import {saveLocalSurveyDraft,restoreLocalSurveyDraftEnvelope,clearLocalSurveyDraft,type SurveyFinalSubmission} from './local-answer-draft'
import {SurveyTimedScale} from './SurveyTimedScale'
import {SurveyScaleTimingTracker,sealSurveyScaleTimings,
  type SurveyWaveScaleTimings} from './survey-scale-timing'
import { SurveyParticipantImage,type SurveyImageProof } from './SurveyParticipantImage'
import { resolveClientSurveyFlow,type PublicFlow } from './flow.client'
import { resolveSurveyCheckpointDraft,sameSurveyCheckpointAnswers } from './checkpoint-recovery'
import { readRecruitmentEntry, rememberRecruitmentEntry, clearRecruitmentEntry, isRecruitmentEntryToken } from './recruitment-entry'

type ApiResult<T>={code:number|string;message:string;data:T|null}
type Wave={id:string;title:string;ordinal:number;status:string;consentText:string;consentVersion:number;
  opensAt:string|null;closesAt:string|null;allowNewParticipants:boolean;attempt?:{id:string;status:string}|null}
type StudyInfo={project:{name:string;description:string;collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES';status:string};waves:Wave[]}
type Choice={optionKey:string;label:string;nonanswerReason?:'DECLINED'|'UNABLE_TO_JUDGE'}
type Question={itemKey:string;questionKey?:string;type:string;prompt:string;image?:SurveyPublicImage;required:boolean;
  options:Choice[];rows?:{rowKey:string;label:string}[];allowRefusal?:boolean;displayIf?:{itemKey:string;operator:'EQUALS'|'INCLUDES';optionKey:string};
  min?:number;max?:number;integerOnly?:boolean;step?:number;precision?:number;
  maxLength?:number;minSelections?:number;maxSelections?:number;
  total?:number;timeZone?:string;textValidation?:'EMAIL'|'DIGITS'|'ALPHANUMERIC';
  otherOptionKey?:string;otherMaxLength?:number;exclusiveOptionKeys?:string[]}
type SjtPublicQuestion={questionKey:string;prompt:string;responseType?:'SINGLE'|'MULTIPLE';required?:boolean;allowRefusal?:boolean;exclusiveOptionKeys?:string[];minSelections?:number;maxSelections?:number;options:Choice[]}
type Unit={kind:'FORM'|'SCALE'|'SJT'|'COGNITIVE';instrumentKey:string;title:string;image?:SurveyPublicImage;
  presentationMode?:'ONE_BY_ONE'|'ALL_AT_ONCE';
  stimulus?:string;scenarioTitle?:string;
  pages?:{pageKey:string;title:string;description?:string;questions:Question[]}[];
  responseOptions?:Choice[];
  items?:Question[];
  feedback?:{mode:'GENERAL'|'DESCRIPTIVE';release:'AFTER_FINAL'|'AFTER_COLLECTION'};
  scenes?:{sceneKey:string;title:string;stimulus:string;image?:SurveyPublicImage;questions:SjtPublicQuestion[]}[];
  questions?:SjtPublicQuestion[]}
type Task={attemptId:string;waveId:string;status:string;definitionDigest:string;units:Unit[];reportMode:'GENERAL_ONLY'|'DESCRIPTIVE';cognitiveSessions?:SurveyCognitiveSessionInfo[];lockedPriorAnswers?:Record<string,Record<string,Answer>>;flow?:PublicFlow;checkpointPolicy?:{enabled:true;ttlHours:number}}
type General={kind:'GENERAL_ONLY'|'DESCRIPTIVE';text:string;disclaimer:string;completedAt:string;pending?:boolean;measurements?:{instrumentKey:string;title:string;measurementDigest:string;maturity:'PILOT';quality:string;metrics:{key:string;label:string;value:number|null;unit:'ratio'|'ms';status:string}[]}[]}
type FinalResponse={status:string;attemptId?:string;receiptId?:string;completedAt?:string;
  idempotent?:boolean;generalReceipt?:unknown}
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
const isRefusal=(answer:Answer|undefined):answer is {_surveyRefusal:true}=>
  !!answer&&typeof answer==='object'&&!Array.isArray(answer)&&'_surveyRefusal' in answer
  &&answer._surveyRefusal===true
const refusal=():{_surveyRefusal:true}=>({_surveyRefusal:true})
const safePattern=/^[a-f0-9-]{36}$/i
// A valid research key can equal a property inherited from Object.prototype.
const own=<T,>(values:Record<string,T>,key:string):T|undefined=>
  Object.prototype.hasOwnProperty.call(values,key)?values[key]:undefined
const parseError=(e:unknown)=>e instanceof Error?e.message:'研究访问失败，请重试'
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
export function TaskForm({unit,answer,onChange,proof,pageIndex,onPageChange,purpose='SURVEY'}:{unit:Unit;answer:Record<string,Answer>;
  onChange:(name:string,value:Answer)=>void;proof?:SurveyImageProof;
  pageIndex:number;onPageChange:(next:number)=>void;
  purpose?:'SURVEY'|'HUITEACHER'}){
  const [pageError,setPageError]=useState('')

  const shownFormKeys=unit.kind==='FORM'
    ?visibleFormKeys(unit.pages?.flatMap(p=>p.questions)||[],answer)
    :null
  const visiblePages=unit.kind==='FORM'?(unit.pages||[])
    .filter(p=>p.questions.some(q=>shownFormKeys?.has(q.itemKey))):[]
  const currentIndex=Math.min(pageIndex,Math.max(0,visiblePages.length-1))
  const activePage=visiblePages[currentIndex]
  const nextPage=()=>{
    if(!activePage||currentIndex>=visiblePages.length-1)return
    for(const q of activePage.questions){
      if(!shownFormKeys?.has(q.itemKey)||!q.required)continue
      if(q.allowRefusal&&!['MATRIX','MATRIX_MULTIPLE'].includes(q.type)&&
        isRefusal(answer[q.itemKey]))continue
      const keys=['MATRIX','MATRIX_MULTIPLE'].includes(q.type)
        ?(q.rows||[]).map(row=>q.itemKey+':'+row.rowKey):[q.itemKey]
      const empty=keys.some(key=>{
        const value=answer[key]
        return !isRefusal(value)&&(value===null||value===undefined||value===''||
          (Array.isArray(value)&&value.length===0))
      })
      const rankInvalid=q.type==='RANK_ORDER'&&
        (!Array.isArray(answer[q.itemKey])||(answer[q.itemKey] as string[]).length!==q.options.length)
      const totalInvalid=q.type==='CONSTANT_SUM'&&(()=>{
        const v=answer[q.itemKey]
        if(!v||typeof v!=='object'||Array.isArray(v)||isRefusal(v))return true
        const numbers=v as Record<string,number>
        return q.options.some(opt=>!Number.isFinite(numbers[opt.optionKey]))||
          Math.abs(q.options.reduce((n,opt)=>n+numbers[opt.optionKey],0)-(q.total??0))>1e-7
      })()
      const otherInvalid=hasSelectedOther(q,answer[q.itemKey])&&
        (typeof answer[q.itemKey+':other']!=='string'||
          !(answer[q.itemKey+':other'] as string).trim())
      if(empty||rankInvalid||totalInvalid||otherInvalid){
        setPageError('请先完成当前页的必答题：'+q.prompt)
        document.getElementById('survey-answer-'+unit.instrumentKey+'-'+q.itemKey)?.focus()
        return
      }
    }
    setPageError('')
    onPageChange(currentIndex+1)
    window.requestAnimationFrame(()=>document.getElementById(
      'survey-page-'+unit.instrumentKey)?.focus())
  }
  const choice=(q:Question,options:Choice[],kind:'SINGLE'|'MULTIPLE'|'MATRIX'|'LIKERT')=>
    kind==='MULTIPLE'?options.map(o=>{
      const selected=Array.isArray(answer[q.itemKey])?answer[q.itemKey] as string[]:[]
      return <label className="block my-2 text-sm" key={o.optionKey}>
        <input type="checkbox" checked={selected.includes(o.optionKey)}
          disabled={!selected.includes(o.optionKey)&&q.maxSelections!==undefined
            &&selected.length>=q.maxSelections&&!q.exclusiveOptionKeys?.includes(o.optionKey)}
          onChange={e=>onChange(q.itemKey,toggleFormMultiple(
            selected,o.optionKey,e.target.checked,q.exclusiveOptionKeys))}/> {o.label}</label>
    }):options.map(o=><label className="block my-2 text-sm" key={o.optionKey}>
      <input type="radio" name={unit.instrumentKey+'-'+q.itemKey}
        checked={answer[q.itemKey]===o.optionKey}
        onChange={()=>onChange(q.itemKey,o.optionKey)}/> {o.label}</label>)
  const item=(q:Question)=>{
    if(shownFormKeys&&!shownFormKeys.has(q.itemKey))return null
    return <fieldset className="border rounded-lg p-4 my-4 bg-white scroll-mt-4"
      id={'survey-answer-'+unit.instrumentKey+'-'+q.itemKey} tabIndex={-1} key={q.itemKey}>
      <legend className="font-medium text-sm">{q.prompt}{q.required?' *':''}</legend>
      {q.image&&proof&&<SurveyParticipantImage image={q.image} proof={proof}/>}
      {q.type==='MULTIPLE'&&q.maxSelections!==undefined&&<p className="text-xs mb-2">
        请选 {q.minSelections??1} 至 {q.maxSelections} 项。</p>}
      {['SINGLE','LIKERT','MULTIPLE'].includes(q.type)&&choice(q,q.options,q.type as 'SINGLE'|'LIKERT'|'MULTIPLE')}
      {unit.kind==='FORM'&&['SINGLE','MULTIPLE'].includes(q.type)&&q.otherOptionKey&&
        <FormChoiceExtras question={q} answers={answer} onChange={onChange}/>}
      {q.type==='MATRIX'&&<div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr><th scope="col">项目</th>{q.options.map(o=><th scope="col" key={o.optionKey}>{o.label}</th>)}
          {q.allowRefusal&&<th scope="col">不愿回答</th>}</tr></thead>
        <tbody>{(q.rows||[]).map(row=><tr key={row.rowKey}><th scope="row">{row.label}</th>{q.options.map(o=><td className="text-center" key={o.optionKey}>
          <input type="radio" name={unit.instrumentKey+'-'+q.itemKey+'-'+row.rowKey}
            checked={answer[q.itemKey+':'+row.rowKey]===o.optionKey}
            onChange={()=>onChange(q.itemKey+':'+row.rowKey,o.optionKey)}/>
        </td>)}
        {q.allowRefusal&&<td className="text-center"><input type="radio"
          aria-label={'不愿回答：'+row.label}
          name={unit.instrumentKey+'-'+q.itemKey+'-'+row.rowKey}
          checked={isRefusal(answer[q.itemKey+':'+row.rowKey])}
          onChange={()=>onChange(q.itemKey+':'+row.rowKey,refusal())}/></td>}</tr>)}</tbody></table></div>}
      {['DATE','TIME','RANK_ORDER','SLIDER','CONSTANT_SUM','MATRIX_MULTIPLE'].includes(q.type)&&
        <ProfessionalFormAnswer question={q} answers={answer} prefix={unit.instrumentKey} onAnswer={onChange}/>}
      {q.type==='NUMBER'&&<input className="input block w-full" type="number" min={q.min} max={q.max} step={q.step??(q.integerOnly?1:'any')}
        aria-label={q.prompt} value={isRefusal(answer[q.itemKey])?'':String(answer[q.itemKey]??'')}
        disabled={isRefusal(answer[q.itemKey])}
        onChange={e=>onChange(q.itemKey,e.target.value===''?null:Number(e.target.value))}/>}
      {q.allowRefusal&&!['MATRIX','MATRIX_MULTIPLE'].includes(q.type)&&<label className="block my-3 text-sm">
        <input type="checkbox" checked={isRefusal(answer[q.itemKey])}
          onChange={e=>onChange(q.itemKey,e.target.checked?refusal():null)}/>
        我选择不回答这一题（REFUSED）
      </label>}
      {['SHORT_TEXT','LONG_TEXT'].includes(q.type)&&<textarea className="input block w-full" aria-label={q.prompt}
        rows={q.type==='SHORT_TEXT'?2:5} maxLength={q.maxLength??(q.type==='SHORT_TEXT'?300:10000)}
        value={isRefusal(answer[q.itemKey])?'':String(answer[q.itemKey]??'')}
        disabled={isRefusal(answer[q.itemKey])}
        onChange={e=>onChange(q.itemKey,e.target.value)}/>}
    </fieldset>
  }
  return <section className="border rounded-xl bg-slate-50 p-4 my-5">
    <h3 className="text-lg font-semibold">{unit.title}</h3>
    {unit.kind==='FORM'&&<div>
      <p className="text-sm mt-3" role="status">第 {activePage?currentIndex+1:0} / {visiblePages.length} 页
        （{purpose==='HUITEACHER'?'所有页面完成后一次性提交正式评价':'本研究所有页面完成后只提交一次正式答卷'}）</p>
      <progress className="w-full" max={Math.max(1,visiblePages.length)}
        value={activePage?currentIndex+1:0} aria-label="本工具作答进度"/>
      {activePage&&<div key={activePage.pageKey}>
        <h4 className="mt-4 font-medium scroll-mt-5" id={'survey-page-'+unit.instrumentKey}
          tabIndex={-1}>{activePage.title}</h4>{activePage.description&&<p className="whitespace-pre-wrap text-sm">{activePage.description}</p>}
        {activePage.questions.map(item)}
      </div>}
      {pageError&&<p role="alert" className="text-sm text-red-700 my-2">{pageError}</p>}
      <nav aria-label="问卷分页" className="flex justify-between gap-3 mt-4">
        <button type="button" className="btn-secondary" disabled={currentIndex===0}
          onClick={()=>{setPageError('');onPageChange(Math.max(0,currentIndex-1))}}>上一页</button>
        <button type="button" className="btn-secondary"
          disabled={!activePage||currentIndex>=visiblePages.length-1} onClick={nextPage}>下一页</button>
      </nav>
    </div>}
    {unit.kind==='SCALE'&&unit.items?.map(q=>item({...q,type:'LIKERT',options:unit.responseOptions||[]}))}
    {unit.kind==='SJT'&&(unit.scenes??[{sceneKey:'legacy',title:unit.scenarioTitle,stimulus:unit.stimulus,image:unit.image,questions:unit.questions??[]}]).map(scene=><section key={scene.sceneKey} aria-label={'情境 '+scene.title} className="mt-4 space-y-3">
      <h4 className="font-medium">{scene.title}</h4><p className="whitespace-pre-wrap text-sm">{scene.stimulus}</p>
      {scene.image&&proof&&<SurveyParticipantImage image={scene.image} proof={proof}/>}
      {scene.questions.map(q=>item({itemKey:q.questionKey,type:q.responseType==='MULTIPLE'?'MULTIPLE':'SINGLE',
        prompt:q.prompt,options:q.options,required:q.required??true,allowRefusal:q.allowRefusal,
        minSelections:q.minSelections,maxSelections:q.maxSelections,
        exclusiveOptionKeys:[...(q.exclusiveOptionKeys??[]),...q.options.filter(o=>o.nonanswerReason).map(o=>o.optionKey)]}))}
    </section>)}
  </section>
}
/** Research participants have NO platform account or Student/Teacher session.
 * This UI contains no researcher or management cookie-based fallbacks.
 */
export default function SurveyPublicApp(){
  const publicId=useMemo(()=>window.location.pathname.match(/^\/r\/([a-f0-9-]{36})$/i)?.[1]||'',[])
  const [entryToken,setEntryToken]=useState(()=>{
    try{return readRecruitmentEntry(publicId,window.location.hash,sessionStorage)}
    catch{return readRecruitmentEntry(publicId,window.location.hash,null)}
  })
  const [info,setInfo]=useState<StudyInfo|null>(null),[loading,setLoading]=useState(true)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [researchCode,setResearchCode]=useState(''),[accessCredential,setAccessCredential]=useState('')
  const [proofReceived,setProofReceived]=useState(false),[home,setHome]=useState<Wave[]|null>(null)
  const [selectedWave,setSelectedWave]=useState<Wave|null>(null),[agreed,setAgreed]=useState(false)
  const [task,setTask]=useState<Task|null>(null),[answers,setAnswers]=useState<Record<string,Record<string,Answer>>>({})
  const [formPages,setFormPages]=useState<Record<string,number>>({})
  const [scalePages,setScalePages]=useState<Record<string,number>>({})
  const [toolStep,setToolStep]=useState(0)
  const [itemTimings,setItemTimings]=useState<SurveyWaveScaleTimings>({})
  const timingTrackers=useRef<Record<string,SurveyScaleTimingTracker>>({})
  const [flowStep,setFlowStep]=useState(0),[screenedOut,setScreenedOut]=useState(false)
  const [checkpointRevision,setCheckpointRevision]=useState(0)
  const [checkpointOverwritePending,setCheckpointOverwritePending]=useState(false)
  const [attemptId,setAttemptId]=useState(''),[submissionId,setSubmissionId]=useState('')
  const [general,setGeneral]=useState<General|null>(null),[notice,setNotice]=useState('')
  const [finalSealed,setFinalSealed]=useState(false)
  const [cognitiveRunning,setCognitiveRunning]=useState(false)
  const [cognitiveSessions,setCognitiveSessions]=useState<SurveyCognitiveSessionInfo[]>([])
  const knownCognitiveSessions=useRef(new Map<string,{attemptId:string;researchCode:string}>())
  const rememberCognitive=(parentId:string,childId:string)=>{knownCognitiveSessions.current.set(childId,{attemptId:parentId,researchCode});rememberSurveyCognitiveSession(publicId,parentId,childId,researchCode)}
  const clearCognitive=async(parentId?:string)=>{
    const known=[...knownCognitiveSessions.current].filter(([,owner])=>parentId?owner.attemptId===parentId:owner.researchCode===researchCode).map(([id])=>id)
    return clearSurveyCognitiveSessions(publicId,parentId,known,researchCode||undefined)
  }
  const [cognitiveReferences,setCognitiveReferences]=useState<SurveyCognitiveReference[]>([])
  const [lockedAnswers,setLockedAnswers]=useState<Record<string,Record<string,Answer>>>({})
  const finalRequest=useRef<{attemptId:string;path:string;
    body:{accessCredential:string;researchCode?:string;submissionId:string;answers:Record<string,Record<string,Answer>>;
      itemTimings?:SurveyWaveScaleTimings;presentation?:{shownBlocks:string[]};cognitiveReferences?:SurveyCognitiveReference[]}}|null>(null)
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
            ...(sealed.body.cognitiveReferences?{cognitiveReferences:sealed.body.cognitiveReferences}:{})})
        return
      }
      const liveTimings={...draftState.current.itemTimings}
      for(const [key,tracker] of Object.entries(timingTrackers.current)){
        if(leaving)tracker.suspend()
        liveTimings[key]=tracker.snapshot()
      }
      if(!saveLocalSurveyDraft(publicId,attemptId,task.definitionDigest,draftState.current.answers,liveTimings))
        setNotice('本标签页临时保存失败（空间或权限不足）。刷新、关闭页面可能丢失未提交答案；如已开放服务器加密暂存，请主动保存，或完成本次 FINAL。')
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
    // Recruitment capability stays in memory, not browser history/Referrer.
    window.history.replaceState(null,'',window.location.pathname)
    if(!safePattern.test(publicId)){setError('研究链接格式不正确');setLoading(false);return}
    void publicApi<StudyInfo>(base+'/info').then(setInfo)
      .catch(e=>setError(parseError(e))).finally(()=>setLoading(false))
  },[base,publicId])
  const run=async(task:()=>Promise<void>)=>{
    setError('');setNotice('');setBusy(true)
    try{await task()}catch(e){
      const message=parseError(e);setError(message)
      // FINAL qualifies the failing Form by instrumentKey: different Forms
      // may intentionally share copied itemKeys within the same Wave.
      const location=message.match(/answers\.([a-z][a-z0-9_-]*)(?:\.([a-z][a-z0-9_-]*))?/i)
      const instrumentKey=location?.[2]?location[1]:undefined
      const itemKey=location?.[2]||location?.[1]
      const targetUnit=itemKey?taskState.current?.units.find(unit=>unit.kind==='FORM'&&
        (!instrumentKey||unit.instrumentKey===instrumentKey)&&unit.pages?.some(
          page=>page.questions.some(q=>q.itemKey===itemKey))):undefined
      if(targetUnit&&itemKey){
        const current=own(answers,targetUnit.instrumentKey)??{}
        const visible=visibleFormKeys(targetUnit.pages?.flatMap(p=>p.questions)||[],current)
        const pages=targetUnit.pages?.filter(p=>p.questions.some(q=>visible.has(q.itemKey)))||[]
        const index=pages.findIndex(p=>p.questions.some(q=>q.itemKey===itemKey))
        if(index>=0)setFormPages(prev=>({...prev,[targetUnit.instrumentKey]:index}))
        // A rejected answer may belong to a tool that is no longer mounted.
        // Reveal its exact frozen Flow block/tool before focusing its page.
        const activeTask=taskState.current
        if(activeTask?.flow){
          const route=resolveClientSurveyFlow(activeTask.flow,activeTask.units,answers)
          const step=route.blocks.findIndex(block=>block.kind==='INSTRUMENT'&&
            block.instrumentKey===targetUnit.instrumentKey)
          if(step>=0)setFlowStep(step)
        }else if(activeTask){
          setToolStep(activeTask.units.findIndex(unit=>unit.instrumentKey===targetUnit.instrumentKey))
        }
        window.setTimeout(()=>{
          const target=document.getElementById('survey-answer-'+targetUnit.instrumentKey+'-'+itemKey)
          target?.focus();target?.scrollIntoView({block:'center'})
        },0)
      }
    }finally{setBusy(false)}
  }
  const recover=(e:FormEvent)=>{e.preventDefault();void run(async()=>{
    const data=await publicApi<{waves:Wave[]}>(base+'/enter','POST',{
      researchCode:researchCode.trim().toUpperCase(),accessCredential:accessCredential.trim(),
    })
    setResearchCode(x=>x.trim().toUpperCase());setAccessCredential(x=>x.trim())
    setHome(data.waves);setProofReceived(false)
  })}
  const join=(wave:Wave)=>void run(async()=>{
    const result=await publicApi<{researchCode:string;accessCredential:string}>(
      base+'/waves/'+wave.id+'/join','POST',{entryToken,consent:true,consentVersion:wave.consentVersion})
    setResearchCode(result.researchCode);setAccessCredential(result.accessCredential)
    discardEntry()
    setProofReceived(true);setNotice('此研究编号与私密恢复凭证只显示在当前设备页面，请分别妥善保存。')
  })
  const chooseWave=(wave:Wave)=>{setSelectedWave(wave);setAgreed(false);setTask(null);setGeneral(null);setCompletion(null);setWithdrawn(false);setRevoked(false)}
  const readCompletion=async(id:string,proof:{accessCredential:string;researchCode?:string})=>{
    const result=await publicApi<General>(base+'/attempts/'+id+'/general','POST',proof)
    setGeneral(result);setNotice('提交成功。系统不会提供未经验证的诊断或常模等级。')
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
    setNotice('本轮研究筛选已结束。未生成正式 FINAL，未将筛选答案保存为正式测量记录。')
  }
  const loadTask=async(id:string,code:string,secret:string)=>{
    const data=await publicApi<Task>(base+'/attempts/'+id+'/task','POST',{
      ...(code?{researchCode:code}:{}),accessCredential:secret,
    })
    // The authenticated terminal projection contains no answers or task units.
    // A lost screen-out response must not reopen its sealed qualifying draft.
    for(const session of data.cognitiveSessions??[])rememberCognitive(id,session.sessionId)
    if(data.status==='COMPLETED')void clearCognitive(id)
    if(data.status==='SCREENED_OUT'){markScreenedOut(id);return}
    // Reconcile complete local+remote envelopes before mounting any timed
    // Scale runner. An older local revision can never silently replace remote.
    const saved=data.status==='COMPLETED'?null:
      restoreLocalSurveyDraftEnvelope<Record<string,Record<string,Answer>>>(
        publicId,id,data.definitionDigest)
    let restoredAnswers=saved?.answers??{}
    let restoredTimings=(saved?.itemTimings??{}) as SurveyWaveScaleTimings
    let restoredRevision=0,overwritePending=false
    if(data.status==='COMPLETED')clearLocalSurveyDraft(publicId,id)
    else if(saved)setNotice('已恢复本标签页暂存的未提交答案。请复核后再提交。')
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
        ...(savedFinal.cognitiveReferences?{cognitiveReferences:savedFinal.cognitiveReferences}:{})}}:null
    setFinalSealed(!!savedFinal);setCompletion(null)
    setAttemptId(id);setSubmissionId(savedFinal?.submissionId??crypto.randomUUID())
    setTask(data);setFormPages({});setScalePages({});setFlowStep(0);setToolStep(0);setScreenedOut(false)
    setCheckpointRevision(restoredRevision);setCheckpointOverwritePending(overwritePending)
    setAnswers(restoredAnswers);setItemTimings(restoredTimings)
    if(data.status==='COMPLETED'){
      const proof={...(code?{researchCode:code}:{}),accessCredential:secret}
      markCompleted(id,proof)
      await readCompletion(id,proof)
    }
  }
  const resumeSingle=()=>{if(!singleResume)return;void run(async()=>{
    setAccessCredential(singleResume.accessCredential)
    setNotice('正在恢复本设备尚在有效期内的单次匿名研究作答。')
    await loadTask(singleResume.attemptId,'',singleResume.accessCredential)
  })}
  const start=()=>{if(!selectedWave||!agreed)return;void run(async()=>{
    const wave=selectedWave
    if(info?.project.collectionMode==='LINKED_WAVES'&&wave.attempt){
      await loadTask(wave.attempt.id,researchCode.trim().toUpperCase(),accessCredential.trim())
      return
    }
    if(info?.project.collectionMode==='LINKED_WAVES'){
      if(!researchCode||!accessCredential)throw new Error('请先获取或输入研究编号及私密恢复凭证')
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
      setNotice('本设备此标签页可在两小时内尝试恢复；离开或关闭标签前仍建议完成作答。它不会产生跨波次研究编号。')
      await loadTask(started.attemptId,'',started.accessCredential)
    }
  })}
  const currentFlow=task?.flow?resolveClientSurveyFlow(task.flow,task.units,answers):null
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
  const canAdvanceFlow=():boolean=>{
    if(cognitiveRunning)return false
    if(!flowUnit)return true
    if(flowUnit.kind==='COGNITIVE')return cognitiveReferences.some(ref=>ref.slotKey===flowUnit.instrumentKey)
    const existing=own(answers,flowUnit.instrumentKey)??{}
    if(flowUnit.kind==='FORM'){
      const visible=visibleFormKeys(flowUnit.pages?.flatMap(page=>page.questions)??[],existing)
      const pages=flowUnit.pages?.filter(page=>page.questions.some(q=>visible.has(q.itemKey)))??[]
      if((own(formPages,flowUnit.instrumentKey)??0)<pages.length-1)return false
      for(const page of pages)for(const question of page.questions){
        if(!visible.has(question.itemKey)||!question.required)continue
        const keys=['MATRIX','MATRIX_MULTIPLE'].includes(question.type)
          ?(question.rows??[]).map(row=>question.itemKey+':'+row.rowKey):[question.itemKey]
        for(const key of keys){
          const value=existing[key]
          if(value===undefined||value===null||value===''||
            (Array.isArray(value)&&!value.length))return false
        }
      }
      return true
    }
    if(flowUnit.kind==='SCALE')return (flowUnit.items??[]).every(q=>
      typeof existing[q.itemKey]==='string'&&(existing[q.itemKey] as string).length>0)
    return (flowUnit.scenes?.flatMap(scene=>scene.questions)??flowUnit.questions??[]).every(q=>{
      if(q.required===false)return true
      const answer=existing[q.questionKey]
      if(q.allowRefusal&&isRefusal(answer))return true
      if(q.responseType==='MULTIPLE'&&Array.isArray(answer))return answer.length===1&&q.options.some(o=>o.optionKey===answer[0]&&o.nonanswerReason)||answer.length>=(q.minSelections??1)&&answer.length<=(q.maxSelections??q.options.length)
      return typeof answer==='string'&&answer.length>0
    })
  }
  const advanceFlow=()=>{
    if(!canAdvanceFlow()){setError('请完成当前工具的必答内容和全部页，再进入下一步骤');return}
    setError('')
    if(currentFlow)setFlowStep(i=>Math.min(i+1,currentFlow.blocks.length-1))
    else if(timedSequence)setToolStep(i=>Math.min(i+1,task!.units.length-1))
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
    return Object.fromEntries((task?.units??[]).filter(u=>u.kind!=='COGNITIVE'&&prior.has(u.instrumentKey)).map(u=>{
      const raw=own(answers,u.instrumentKey)??{}
      return [u.instrumentKey,u.kind==='FORM'?sanitizeFormAnswers(u.pages?.flatMap(p=>p.questions)??[],raw):raw]
    }))
  }
  const renderSurveyTask=(unit:Unit)=>{
    if(unit.kind==='COGNITIVE')return <SurveyCognitiveUnit key={unit.instrumentKey} publicId={publicId} attemptId={attemptId}
      instrumentKey={unit.instrumentKey} title={unit.title} request={publicApi}
      proof={{accessCredential,...(info?.project.collectionMode==='LINKED_WAVES'?{researchCode}:{})}}
      priorAnswers={priorAnswersFor(unit.instrumentKey)} existing={cognitiveSessions.find(s=>s.slotKey===unit.instrumentKey)}
      onStarted={(session,canonical)=>{
        rememberCognitive(attemptId,session.sessionId)
        const locked=(canonical??priorAnswersFor(unit.instrumentKey)) as Record<string,Record<string,Answer>>
        setLockedAnswers(old=>({...old,...locked}));if(!finalRequest.current)setAnswers(old=>({...old,...locked}))
        setCognitiveSessions(old=>[...old.filter(s=>s.slotKey!==session.slotKey),session])
      }}
      onCommitted={reference=>{setCognitiveReferences(old=>[...old.filter(r=>r.slotKey!==reference.slotKey),reference]);setCognitiveRunning(false)}}
      onRunningChange={setCognitiveRunning}/>
    if(unit.kind==='SCALE'&&unit.presentationMode==='ONE_BY_ONE')
      return <fieldset key={unit.instrumentKey} disabled={Object.prototype.hasOwnProperty.call(lockedAnswers,unit.instrumentKey)} className="border-0 p-0 min-w-0"><SurveyTimedScale
        unit={{instrumentKey:unit.instrumentKey,title:unit.title,
          items:(unit.items??[]).map(q=>({itemKey:q.itemKey,prompt:q.prompt,required:q.required})),
          responseOptions:unit.responseOptions??[]}}
        answer={own(answers,unit.instrumentKey)??{}}
        tracker={timingFor(unit)} paused={finalSealed||Object.prototype.hasOwnProperty.call(lockedAnswers,unit.instrumentKey)}
        index={own(scalePages,unit.instrumentKey)??0}
        onIndexChange={next=>setScalePages(prev=>({...prev,[unit.instrumentKey]:next}))}
        onAnswer={(key,value)=>updateAnswer(unit,key,value)}
        onTiming={next=>recordTiming(unit.instrumentKey,next)}/></fieldset>
    return <fieldset key={unit.instrumentKey} disabled={Object.prototype.hasOwnProperty.call(lockedAnswers,unit.instrumentKey)} className="min-w-0 border-0 p-0"><TaskForm unit={unit}
      pageIndex={own(formPages,unit.instrumentKey)??0}
      onPageChange={next=>setFormPages(current=>({...current,[unit.instrumentKey]:next}))}
      proof={{publicId,attemptId,accessCredential,
        ...(info?.project.collectionMode==='LINKED_WAVES'?{researchCode}:{}),
      }}
      answer={answers[unit.instrumentKey]||{}}
      onChange={(key,value)=>updateAnswer(unit,key,value)}/></fieldset>
  }
  const submit=(e:FormEvent)=>{e.preventDefault();if(!task||!attemptId||finalInFlight.current||cognitiveRunning)return;
    if(!finalRequest.current&&(currentFlow||timedSequence)&&!finalFlowStep){
      setError('请按顺序完成当前研究步骤');return
    }
    if(!finalRequest.current&&(currentFlow||timedSequence)&&!canAdvanceFlow()){
      setError('请完成当前工具后再提交');return
    }
    finalInFlight.current=true
    void run(async()=>{
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
    if(!finalRequest.current)for(const tracker of Object.values(timingTrackers.current))tracker.pause()
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
    const screened=finalRequest.current?finalRequest.current.path.endsWith('/screen-out')
      :currentFlow?.termination==='SCREEN_OUT'
    const path=base+'/attempts/'+attemptId+(screened?'/screen-out':'/final')
    // A sealed request from a prior error/reload has an ambiguous outcome even
    // if its retry creates the first FINAL. Keep the current GENERAL recheck.
    const firstRequest=finalRequest.current===null
    if(!finalRequest.current){
      finalRequest.current={attemptId,path,body:{
      ...(info?.project.collectionMode==='LINKED_WAVES'?{researchCode:researchCode.trim().toUpperCase()}:{}),
      accessCredential:accessCredential.trim(),submissionId,answers:payload,
      ...(timedUnits.length?{itemTimings:sealedTimings}:{}),
      ...(task.units.some(u=>u.kind==='COGNITIVE')?{cognitiveReferences:cognitiveReferences.filter(ref=>eligible===null||eligible.has(ref.slotKey))}:{}),
      ...(currentFlow?{presentation:{shownBlocks:currentFlow.shownBlocks}}:{}),
      }}
      setFinalSealed(true)
      const descriptor:SurveyFinalSubmission={submissionId,screenOut:!!screened,
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
    const receipt=firstRequest?firstFinalGeneral(final,attemptId):null
    if(receipt&&!task.units.some(u=>u.kind==='COGNITIVE'&&u.feedback?.mode==='DESCRIPTIVE')){
      // In-memory display only. Refresh/reopen and explicit reads reauthorize.
      setGeneral(receipt)
      setNotice('提交成功。以下为本次提交时确认的完成回执。')
    }else await readCompletion(attemptId,proof)
  }).finally(()=>{finalInFlight.current=false})}
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
        ' 有效。这不是正式 FINAL；另一设备更改后须重新读取以避免覆盖。')
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
    })
    setHome(data.waves);setSelectedWave(null);setGeneral(null);setCompletion(null);setTask(null)
  })
  return <div className="min-h-screen bg-slate-50 text-slate-800">
    <header className="border-b bg-white"><div className="max-w-3xl mx-auto p-5">
      <h1 className="text-2xl font-semibold">Huisurvey</h1>
      <p className="text-sm text-slate-500">观风知微 · 研究参与</p></div></header>
    <main className="max-w-3xl mx-auto p-4 sm:p-7 space-y-5">
      {loading&&<p role="status">正在读取研究说明…</p>}
      {error&&<p role="alert" className="border-l-4 border-red-600 bg-red-50 p-3">{error}</p>}
      {notice&&<p role="status" className="border-l-4 border-teal-600 bg-teal-50 p-3">{notice}</p>}
      {revoked&&!withdrawn&&<section className="border p-4 rounded-lg bg-white">
        <p role="status">访问已撤销；仍可申请撤回研究数据。</p>
        <button type="button" className="btn-secondary" disabled={busy} onClick={withdraw}>申请排除历史研究数据</button>
      </section>}
      {withdrawn&&<p role="status" className="border-l-4 border-teal-600 p-4">
        您的研究数据撤回请求已被记录。后续统计和新导出将排除可定位回答。
      </p>}
      {info&&<><section className="bg-white rounded-xl border p-5">
        <h2 className="text-xl font-semibold">{info.project.name}</h2>
        <p className="my-3 whitespace-pre-wrap">{info.project.description}</p>
        <p className="text-sm">{info.project.collectionMode==='LINKED_WAVES'
          ?'多波次研究：同一研究编号的回答将在本研究内关联。无需登录或提供真实姓名。'
          :'独立匿名研究：本次作答不与其他波次关联，无需登录或提供真实姓名。'}</p>
      </section>
      {info.project.collectionMode==='LINKED_WAVES'&&!home&&!task&&!general&&!completion&&!revoked&&<section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-lg">已有研究编号 · 继续参加后续波次</h3>
        <p className="text-sm my-2">公开研究编号不是登录密码，必须同时提供本人私密恢复凭证。</p>
        <form onSubmit={recover} className="grid gap-3">
          <label>研究编号<input className="input block w-full" value={researchCode}
            onChange={e=>setResearchCode(e.target.value)} autoComplete="off" placeholder="R-…"/></label>
          <label>私密恢复凭证<input className="input block w-full" type="password" autoComplete="off"
            value={accessCredential} onChange={e=>setAccessCredential(e.target.value)}/></label>
          <button className="btn-primary" disabled={busy||!researchCode||!accessCredential}>读取我的波次任务</button>
        </form>
        <button type="button" className="btn-secondary mt-3" disabled={busy||!researchCode||!accessCredential}
          onClick={withdraw}>持原有研究凭证申请数据撤回（包括已撤销访问者）</button>
      </section>}
      {info.project.collectionMode==='LINKED_WAVES'&&proofReceived&&<section className="bg-white rounded-xl border-2 border-teal-600 p-5">
        <h3 className="font-semibold text-lg">请保存研究身份</h3>
        <p className="text-sm">研究编号可供本项目数据匹配；<strong>私密恢复凭证不可交给研究者或其他人</strong>。页面关闭后不再显示原始密钥。</p>
        <p className="mt-3">研究编号</p><code className="block bg-slate-100 p-3 break-all">{researchCode}</code>
        <p className="mt-3">私密恢复凭证</p><code className="block bg-slate-100 p-3 break-all">{accessCredential}</code>
        <button className="btn-secondary mt-3" type="button" onClick={()=>setProofReceived(false)}>
          我已分别保存这两个凭证</button>
      </section>}
      {info.project.collectionMode==='SINGLE_UNLINKED'&&singleResume&&!task&&!general&&!completion&&
        <section className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold">恢复本次单次匿名作答</h3>
          <p className="text-sm my-2">仅此浏览器标签可尝试恢复短期作答；不建立跨波次身份。公共设备请在完成后关闭标签。</p>
          <button className="btn-secondary" type="button" disabled={busy} onClick={resumeSingle}>
            恢复本次作答／查看已完成回执</button>
        </section>}
      {home&&!task&&!general&&!completion&&info.project.collectionMode==='LINKED_WAVES'&&
        <button type="button" className="btn-secondary" disabled={busy} onClick={revokeAccess}>
          停止后续研究参与并撤销未来访问权限（已收集数据不自动删除）
        </button>}
      {!task&&!general&&!completion&&!revoked&&<section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-lg">研究波次</h3>
        {!validEntry&&<label className="block text-sm my-3">缺少有效邀请凭证？从原研究邀请中复制 43 位凭证到这里。
          <input className="input block w-full mt-2" autoComplete="off"
            aria-label="重新输入研究邀请凭证" value={entryToken}
            onChange={event=>setEntryToken(event.target.value.trim())}
            placeholder="输入研究邀请凭证"/>
        </label>}
        {(home||info.waves).map(wave=><div key={wave.id} className="border-b py-3 flex items-center justify-between gap-3">
          <div><strong>第 {wave.ordinal} 轮 · {wave.title}</strong>
            <p className="text-sm text-slate-500">{wave.status==='OPEN'?'开放采集中':wave.status==='CLOSED'?'已结束':'尚未开放'}
              {wave.attempt?' · '+(wave.attempt.status==='COMPLETED'?'已完成':wave.attempt.status==='SCREENED_OUT'?'已筛除':'进行中'):''}</p>
          </div>
          <button className="btn-secondary" disabled={busy||wave.attempt?.status==='SCREENED_OUT'||(wave.status!=='OPEN'&&!wave.attempt)}
            onClick={()=>chooseWave(wave)}>{wave.attempt?.status==='COMPLETED'?'查看回执':'选择本轮'}</button>
        </div>)}
        {selectedWave&&<div className="bg-slate-50 border rounded-lg p-4 mt-4 space-y-3">
          <h4 className="font-semibold">本轮知情同意 · {selectedWave.title}</h4>
          <p className="whitespace-pre-wrap text-sm">{selectedWave.consentText}</p>
          {info.project.collectionMode==='LINKED_WAVES'&&<p className="text-sm text-sky-800">
            本研究以随机编号关联该研究内的多次回答；它是研究内假名化，不是完全不可关联的匿名。</p>}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={agreed}
            onChange={e=>setAgreed(e.target.checked)}/>
            我已阅读并同意本轮研究说明及相应的数据关联范围。</label>
          {info.project.collectionMode==='LINKED_WAVES'&&!researchCode&&<button
            className="btn-secondary" disabled={busy||!agreed||!validEntry}
            onClick={()=>join(selectedWave)}>首次参加 · 领取随机研究编号</button>}
          <button className="btn-primary" disabled={busy||!agreed||
            (info.project.collectionMode==='LINKED_WAVES'?(!researchCode||!accessCredential):!validEntry)}
            onClick={start}>{selectedWave.attempt?.status==='COMPLETED'?'查看完成情况':'开始或恢复本轮作答'}</button>
        </div>}
      </section>}
      {task&&!general&&<form className="space-y-5" onSubmit={submit}>
        <fieldset disabled={busy||finalSealed} className="space-y-5 min-w-0 border-0 p-0">
        <div className="bg-white border rounded-xl p-4"><h3 className="font-semibold">本轮研究作答</h3>
          <p className="text-sm text-slate-500">请按实际情况回答。研究内部计分不作为个人诊断反馈。</p>
          <p className="text-xs text-slate-500 mt-2">未提交答案仅在当前浏览器标签页暂存，至多两小时；
            关闭标签、使用其他设备或清理浏览器数据后无法恢复。公共电脑建议完成后立即退出。</p></div>
        {task.checkpointPolicy?.enabled&&<section className="bg-white border rounded-xl p-4 space-y-2">
          <p className="text-sm">此研究启用了可选服务器加密暂存：您可主动保存尚未完成的内容。
            每次最多 64KB，保存期 {task.checkpointPolicy.ttlHours} 小时；不计入研究 FINAL。</p>
          <button type="button" className="btn-secondary" disabled={busy||cognitiveRunning} onClick={saveCheckpoint}>
            保存加密临时进度（第 {checkpointRevision+1} 版）</button>
          <p className="text-xs text-slate-500">研究者不会通过此按钮获得正式作答，取消、撤回或最终提交后将按策略清理。
            仅拥有本研究合法私密凭证的当前参与者可以恢复。</p>
        </section>}
        {Object.keys(lockedAnswers).length>0&&<p role="status" className="text-sm text-amber-800">认知任务已经开始，前置工具答案已锁定。此任务已提交与本轮研究已提交分别确认。</p>}
        {cognitiveRunning&&<p role="status" className="text-sm">认知任务运行／提交期间不能切换外层研究步骤。请勿刷新或离开页面。</p>}
        {task.flow&&currentFlow?<>
          <p className="text-xs text-slate-500">研究流程 · 步骤 {Math.min(flowStep+1,currentFlow.blocks.length)} / {currentFlow.blocks.length}</p>
          {flowBlock?.kind==='MATERIAL'&&<section className="bg-white border rounded-xl p-5 space-y-3">
            <h4 className="font-semibold">{flowBlock.title||'研究材料'}</h4>
            <p className="whitespace-pre-wrap text-sm">{flowBlock.body}</p>
          </section>}
          {flowBlock?.kind==='INSTRUMENT'&&flowUnit&&renderSurveyTask(flowUnit)}
          {flowBlock?.kind==='END'&&<section className="bg-white border rounded-xl p-5">
            <h4 className="font-semibold">{flowBlock.title||'本轮流程结束'}</h4>
            <p className="text-sm">{flowBlock.termination==='SCREEN_OUT'
              ?'当前路径为资格筛除，不形成测量 FINAL。'
              :'后续研究工具按冻结规则不予呈现，并标记为 NOT_SHOWN。'}</p>
          </section>}
          {!finalFlowStep&&<button type="button" className="btn-secondary" disabled={busy||cognitiveRunning}
            onClick={advanceFlow}>确认当前步骤，继续研究</button>}
        </>:timedSequence&&flowUnit?<section className="space-y-3">
          <p className="text-xs text-slate-600" role="status">研究工具 {toolStep+1} / {task.units.length}</p>
          {renderSurveyTask(flowUnit)}
          <nav aria-label="研究工具导航" className="flex flex-wrap gap-3">
            <button type="button" className="btn-secondary" disabled={toolStep===0||cognitiveRunning}
              onClick={()=>{setError('');setToolStep(i=>Math.max(0,i-1))}}>上一工具</button>
            {!finalFlowStep&&<button type="button" className="btn-secondary" disabled={cognitiveRunning}
              onClick={advanceFlow}>确认当前工具，继续</button>}
          </nav>
        </section>:task.units.map(renderSurveyTask)}
        </fieldset>
        {finalSealed&&<p role="status">本次答案已封存。结果未确认时请重试原提交，暂不能修改答案。</p>}
        {(finalSealed||finalFlowStep)&&<button className="btn-primary" disabled={busy||cognitiveRunning||(!finalSealed&&!task.flow&&!task.units.every(unit=>{
          if(unit.kind!=='FORM')return true
          const vis=visibleFormKeys(unit.pages?.flatMap(p=>p.questions)||[],
            own(answers,unit.instrumentKey)??{})
          const pages=(unit.pages||[]).filter(p=>p.questions.some(q=>vis.has(q.itemKey)))
          return (own(formPages,unit.instrumentKey)??0)>=pages.length-1
        }))}>{currentFlow?.termination==='SCREEN_OUT'?'完成资格筛选':'提交本轮正式回答'}</button>}
      </form>}
      {screenedOut&&!task&&<section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-semibold">本轮资格筛选已结束</h2>
        <p className="text-sm">未产生完整研究 FINAL；筛选路径不会作为有效测量样本统计。</p>
        {info.project.collectionMode==='LINKED_WAVES'
          ?<button type="button" className="btn-secondary" disabled={busy}
              onClick={returnHome}>返回我的研究波次</button>
          :<button type="button" className="btn-secondary" disabled={busy}
              onClick={withdraw}>撤回本轮筛选记录</button>}
      </section>}
      {completion&&!general&&<section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="text-xl font-semibold">本轮研究已提交</h2>
        <p>正式回答已保存，完成回执尚未读取。</p>
        <button type="button" className="btn-secondary" disabled={busy}
          onClick={()=>void run(()=>readCompletion(completion.attemptId,completion.proof))}>重试读取完成回执</button>
      </section>}
      {general&&<section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="text-xl font-semibold">本轮研究已提交</h2>
        <p className="whitespace-pre-wrap">{general.text}</p>
        <p className="text-sm text-slate-600">{general.disclaimer}</p>
        {general.kind==='DESCRIPTIVE'&&<section className="border rounded-lg p-3 space-y-3" aria-label="本次表现描述性反馈">
          <h3 className="font-semibold">本次表现反馈</h3>
          {general.pending&&<p role="status">本轮已经提交；部分反馈将在统一收集结束后开放。</p>}
          {general.measurements?.map(measurement=><article key={measurement.instrumentKey} className="space-y-2">
            <h4 className="font-medium">{measurement.title}</h4>
            <p className="text-xs">试点测量 · 质量状态：{measurement.quality}。仅反映本次条件下的表现。</p>
            {measurement.metrics.map(metric=><p key={metric.key}>{metric.label}：{metric.value===null?'不可计算':metric.unit==='ratio'?(metric.value*100).toFixed(1)+'%':metric.value+' ms'}（{metric.status}）</p>)}
          </article>)}
        </section>}
        <p className="text-xs">完成时间：{new Date(general.completedAt).toLocaleString('zh-CN')}</p>
        <div className="flex flex-wrap gap-3">
          {info.project.collectionMode==='LINKED_WAVES'&&<>
            <button className="btn-secondary" disabled={busy} onClick={returnHome}>返回我的研究波次</button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={revokeAccess}>
              只撤销未来访问（保留研究数据）</button>
          </>}
          <button className="btn-secondary" type="button" disabled={busy} onClick={withdraw}>
            申请撤回本研究数据（排除未来统计）</button>
        </div>
      </section>}
      </>}
    </main></div>
}
