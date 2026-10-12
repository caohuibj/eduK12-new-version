import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { SurveyPublicImage } from './builder.types'
import { visibleFormKeys,sanitizeFormAnswers } from './form-visibility'
import { ProfessionalFormAnswer,type ProfessionalAnswer } from './ProfessionalFormAnswer'
import { FormChoiceExtras,hasSelectedOther,toggleFormMultiple } from './FormChoiceExtras'
import {saveLocalSurveyDraft,restoreLocalSurveyDraftEnvelope,clearLocalSurveyDraft} from './local-answer-draft'
import {SurveyTimedScale} from './SurveyTimedScale'
import {SurveyScaleTimingTracker,sealSurveyScaleTimings,
  type SurveyWaveScaleTimings} from './survey-scale-timing'
import { SurveyParticipantImage,type SurveyImageProof } from './SurveyParticipantImage'
import { resolveClientSurveyFlow,type PublicFlow } from './flow.client'
import { resolveSurveyCheckpointDraft,sameSurveyCheckpointAnswers } from './checkpoint-recovery'

type ApiResult<T>={code:number|string;message:string;data:T|null}
type Wave={id:string;title:string;ordinal:number;status:string;consentText:string;consentVersion:number;
  opensAt:string|null;closesAt:string|null;allowNewParticipants:boolean;attempt?:{id:string;status:string}|null}
type StudyInfo={project:{name:string;description:string;collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES';status:string};waves:Wave[]}
type Choice={optionKey:string;label:string}
type Question={itemKey:string;questionKey?:string;type:string;prompt:string;image?:SurveyPublicImage;required:boolean;
  options:Choice[];rows?:{rowKey:string;label:string}[];allowRefusal?:boolean;displayIf?:{itemKey:string;operator:'EQUALS'|'INCLUDES';optionKey:string};
  min?:number;max?:number;integerOnly?:boolean;step?:number;precision?:number;
  maxLength?:number;minSelections?:number;maxSelections?:number;
  total?:number;timeZone?:string;textValidation?:'EMAIL'|'DIGITS'|'ALPHANUMERIC';
  otherOptionKey?:string;otherMaxLength?:number;exclusiveOptionKeys?:string[]}
type Unit={kind:'FORM'|'SCALE'|'SJT';instrumentKey:string;title:string;image?:SurveyPublicImage;
  presentationMode?:'ONE_BY_ONE'|'ALL_AT_ONCE';
  stimulus?:string;scenarioTitle?:string;
  pages?:{pageKey:string;title:string;questions:Question[]}[];
  responseOptions?:Choice[];
  items?:Question[];
  questions?:{questionKey:string;prompt:string;responseType?:'SINGLE'|'MULTIPLE';
    minSelections?:number;maxSelections?:number;options:Choice[]}[]}
type Task={attemptId:string;waveId:string;status:string;definitionDigest:string;units:Unit[];reportMode:'GENERAL_ONLY';flow?:PublicFlow;checkpointPolicy?:{enabled:true;ttlHours:number}}
type General={kind:'GENERAL_ONLY';text:string;disclaimer:string;completedAt:string}
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
const parseError=(e:unknown)=>e instanceof Error?e.message:'研究访问失败，请重试'
const publicApi=async <T,>(path:string,method='GET',body?:unknown):Promise<T>=>{
  const result=await fetch('/api/public/survey'+path,{method,credentials:'omit',
    cache:'no-store',headers:{'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})})
  const envelope=await result.json() as ApiResult<T>
  if(!result.ok||envelope.code!==0||!envelope.data)throw new Error(envelope.message||'操作未完成')
  return envelope.data
}
export function TaskForm({unit,answer,onChange,proof,pageIndex,onPageChange}:{unit:Unit;answer:Record<string,Answer>;
  onChange:(name:string,value:Answer)=>void;proof:SurveyImageProof;
  pageIndex:number;onPageChange:(next:number)=>void}){
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
            &&selected.length>=q.maxSelections}
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
      {q.image&&<SurveyParticipantImage image={q.image} proof={proof}/>}
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
        （本研究所有页面完成后只提交一次正式答卷）</p>
      <progress className="w-full" max={Math.max(1,visiblePages.length)}
        value={activePage?currentIndex+1:0} aria-label="本工具作答进度"/>
      {activePage&&<div key={activePage.pageKey}>
        <h4 className="mt-4 font-medium scroll-mt-5" id={'survey-page-'+unit.instrumentKey}
          tabIndex={-1}>{activePage.title}</h4>
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
    {unit.kind==='SJT'&&<><p className="mt-2 font-medium">{unit.scenarioTitle}</p>
      <p className="whitespace-pre-wrap mb-4 text-sm">{unit.stimulus}</p>
      {unit.image&&<SurveyParticipantImage image={unit.image} proof={proof}/>}
      {unit.questions?.map(q=>item({itemKey:q.questionKey,
        type:q.responseType==='MULTIPLE'?'MULTIPLE':'SINGLE',
        prompt:q.prompt,options:q.options,required:true,
        minSelections:q.minSelections,maxSelections:q.maxSelections}))}</>}
  </section>
}
/** Research participants have NO platform account or Student/Teacher session.
 * This UI contains no researcher or management cookie-based fallbacks.
 */
export default function SurveyPublicApp(){
  const publicId=useMemo(()=>window.location.pathname.match(/^\/r\/([a-f0-9-]{36})$/i)?.[1]||'',[])
  const [entryToken]=useState(()=>new URLSearchParams(window.location.hash.replace(/^#/,'' )).get('entry')||'')
  const [info,setInfo]=useState<StudyInfo|null>(null),[loading,setLoading]=useState(true)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [researchCode,setResearchCode]=useState(''),[accessCredential,setAccessCredential]=useState('')
  const [proofReceived,setProofReceived]=useState(false),[home,setHome]=useState<Wave[]|null>(null)
  const [selectedWave,setSelectedWave]=useState<Wave|null>(null),[agreed,setAgreed]=useState(false)
  const [task,setTask]=useState<Task|null>(null),[answers,setAnswers]=useState<Record<string,Record<string,Answer>>>({})
  const [formPages,setFormPages]=useState<Record<string,number>>({})
  const [toolStep,setToolStep]=useState(0)
  const [itemTimings,setItemTimings]=useState<SurveyWaveScaleTimings>({})
  const timingTrackers=useRef<Record<string,SurveyScaleTimingTracker>>({})
  const [flowStep,setFlowStep]=useState(0),[screenedOut,setScreenedOut]=useState(false)
  const [checkpointRevision,setCheckpointRevision]=useState(0)
  const [checkpointOverwritePending,setCheckpointOverwritePending]=useState(false)
  const [attemptId,setAttemptId]=useState(''),[submissionId,setSubmissionId]=useState('')
  const [general,setGeneral]=useState<General|null>(null),[notice,setNotice]=useState('')
  const [withdrawn,setWithdrawn]=useState(false),[revoked,setRevoked]=useState(false)
  // SHORT-LIVED same-tab recovery only. Never shared across waves or devices.
  const [singleResume,setSingleResume]=useState<SingleResume|null>(()=>readSingleResume(publicId))
  const taskState=useRef<Task|null>(null)
  taskState.current=task
  const base='/r/'+publicId
  // Only the already-authorized local browser tab may recover unfinished answers.
  useEffect(()=>{
    if(!task||task.status!=='STARTED'||!attemptId)return
    const timeout=window.setTimeout(()=>{
      saveLocalSurveyDraft(publicId,attemptId,task.definitionDigest,answers,itemTimings)
    },450)
    return ()=>window.clearTimeout(timeout)
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
        const current=answers[targetUnit.instrumentKey]||{}
        const visible=visibleFormKeys(targetUnit.pages?.flatMap(p=>p.questions)||[],current)
        const pages=targetUnit.pages?.filter(p=>p.questions.some(q=>visible.has(q.itemKey)))||[]
        const index=pages.findIndex(p=>p.questions.some(q=>q.itemKey===itemKey))
        if(index>=0)setFormPages(prev=>({...prev,[targetUnit.instrumentKey]:index}))
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
    setProofReceived(true);setNotice('此研究编号与私密恢复凭证只显示在当前设备页面，请分别妥善保存。')
  })
  const chooseWave=(wave:Wave)=>{setSelectedWave(wave);setAgreed(false);setTask(null);setGeneral(null);setWithdrawn(false);setRevoked(false)}
  const loadTask=async(id:string,code:string,secret:string)=>{
    const data=await publicApi<Task>(base+'/attempts/'+id+'/task','POST',{
      ...(code?{researchCode:code}:{}),accessCredential:secret,
    })
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
    if(data.status==='STARTED'&&data.checkpointPolicy?.enabled){
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
    timingTrackers.current={}
    setAttemptId(id);setSubmissionId(crypto.randomUUID())
    setTask(data);setFormPages({});setFlowStep(0);setToolStep(0);setScreenedOut(false)
    setCheckpointRevision(restoredRevision);setCheckpointOverwritePending(overwritePending)
    setAnswers(restoredAnswers);setItemTimings(restoredTimings)
    if(data.status==='COMPLETED'){
      const result=await publicApi<General>(base+'/attempts/'+id+'/general','POST',{
        ...(code?{researchCode:code}:{}),accessCredential:secret,
      })
      setGeneral(result)
    }
  }
  const resumeSingle=()=>{if(!singleResume)return;void run(async()=>{
    setAccessCredential(singleResume.accessCredential)
    await loadTask(singleResume.attemptId,'',singleResume.accessCredential)
    setNotice('正在恢复本设备尚在有效期内的单次匿名研究作答。')
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
    u.kind==='SCALE'&&u.presentationMode==='ONE_BY_ONE')
  const activeTool=timedSequence?task!.units[Math.min(toolStep,task!.units.length-1)]:undefined
  const flowUnit=flowBlock?.kind==='INSTRUMENT'
    ?task?.units.find(u=>u.instrumentKey===flowBlock.instrumentKey):activeTool
  const finalFlowStep=currentFlow
    ?flowStep>=currentFlow.blocks.length-1
    :!timedSequence||toolStep>=task!.units.length-1
  const canAdvanceFlow=():boolean=>{
    if(!flowUnit)return true
    const existing=answers[flowUnit.instrumentKey]||{}
    if(flowUnit.kind==='FORM'){
      const visible=visibleFormKeys(flowUnit.pages?.flatMap(page=>page.questions)??[],existing)
      const pages=flowUnit.pages?.filter(page=>page.questions.some(q=>visible.has(q.itemKey)))??[]
      if((formPages[flowUnit.instrumentKey]??0)<pages.length-1)return false
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
    return (flowUnit.questions??[]).every(q=>{
      const answer=existing[q.questionKey]
      return typeof answer==='string'&&answer.length>0||
        Array.isArray(answer)&&answer.length>0
    })
  }
  const advanceFlow=()=>{
    if(!canAdvanceFlow()){setError('请完成当前工具的必答内容和全部页，再进入下一步骤');return}
    setError('')
    if(currentFlow)setFlowStep(i=>Math.min(i+1,currentFlow.blocks.length-1))
    else if(timedSequence)setToolStep(i=>Math.min(i+1,task!.units.length-1))
  }
  const updateAnswer=(unit:Unit,key:string,value:Answer)=>setAnswers(previous=>{
    const next={...(previous[unit.instrumentKey]||{}),[key]:value}
    const question=unit.kind==='FORM'?unit.pages?.flatMap(page=>page.questions)
      .find(q=>q.itemKey===key&&q.otherOptionKey):undefined
    if(question&&!hasSelectedOther(question,value))delete next[question.itemKey+':other']
    return {...previous,[unit.instrumentKey]:next}
  })
  const recordTiming=(instrumentKey:string,next:import('./survey-scale-timing').SurveyScaleTimings)=>
    setItemTimings(prev=>({...prev,[instrumentKey]:next}))
  const timingFor=(unit:Unit)=>{
    const current=timingTrackers.current[unit.instrumentKey]
    if(current)return current
    const tracker=new SurveyScaleTimingTracker(itemTimings[unit.instrumentKey]??{},
      answers[unit.instrumentKey]??{})
    timingTrackers.current[unit.instrumentKey]=tracker
    return tracker
  }
  const renderSurveyTask=(unit:Unit)=>{
    if(unit.kind==='SCALE'&&unit.presentationMode==='ONE_BY_ONE')
      return <SurveyTimedScale key={unit.instrumentKey}
        unit={{instrumentKey:unit.instrumentKey,title:unit.title,
          items:(unit.items??[]).map(q=>({itemKey:q.itemKey,prompt:q.prompt,required:q.required})),
          responseOptions:unit.responseOptions??[]}}
        answer={answers[unit.instrumentKey]||{}}
        tracker={timingFor(unit)}
        onAnswer={(key,value)=>updateAnswer(unit,key,value)}
        onTiming={next=>recordTiming(unit.instrumentKey,next)}/>
    return <TaskForm key={unit.instrumentKey} unit={unit}
      pageIndex={formPages[unit.instrumentKey]??0}
      onPageChange={next=>setFormPages(current=>({...current,[unit.instrumentKey]:next}))}
      proof={{publicId,attemptId,accessCredential,
        ...(info?.project.collectionMode==='LINKED_WAVES'?{researchCode}:{}),
      }}
      answer={answers[unit.instrumentKey]||{}}
      onChange={(key,value)=>updateAnswer(unit,key,value)}/>
  }
  const submit=(e:FormEvent)=>{e.preventDefault();if(!task||!attemptId)return;
    if((currentFlow||timedSequence)&&!finalFlowStep){
      setError('请按顺序完成当前研究步骤');return
    }
    if((currentFlow||timedSequence)&&!canAdvanceFlow()){
      setError('请完成当前工具后再提交');return
    }
    void run(async()=>{
    // Match the frozen conditional form. An earlier selection change must
    // clear fields that are now hidden; the server repeats this validation.
    const eligible=task.flow?new Set(currentFlow?.visibleUnitKeys??[]):null
    const payload=Object.fromEntries(task.units.filter(unit=>
      eligible===null||eligible.has(unit.instrumentKey)).map(unit=>{
      const original=answers[unit.instrumentKey]||{}
      return [unit.instrumentKey,unit.kind==='FORM'
        ?sanitizeFormAnswers(unit.pages?.flatMap(p=>p.questions)||[],original)
        :original]
    }))
    const timedUnits=task.units.filter(unit=>
      unit.kind==='SCALE'&&unit.presentationMode==='ONE_BY_ONE'&&
      (eligible===null||eligible.has(unit.instrumentKey)))
    const sealedTimings=Object.fromEntries(timedUnits.map(unit=>[
      unit.instrumentKey,sealSurveyScaleTimings(
        (unit.items??[]).map(item=>item.itemKey),payload[unit.instrumentKey]??{},
        timingTrackers.current[unit.instrumentKey]?.snapshot()??
          itemTimings[unit.instrumentKey]??{},
      ),
    ]))
    const screened=currentFlow?.termination==='SCREEN_OUT'
    const final=await publicApi<{status:string}>(
      base+'/attempts/'+attemptId+(screened?'/screen-out':'/final'),'POST',{
      ...(info?.project.collectionMode==='LINKED_WAVES'?{researchCode:researchCode.trim().toUpperCase()}:{}),
      accessCredential:accessCredential.trim(),submissionId,answers:payload,
      ...(timedUnits.length?{itemTimings:sealedTimings}:{}),
      ...(currentFlow?{presentation:{shownBlocks:currentFlow.shownBlocks}}:{}),
    })
    if(screened){
      if(final.status!=='SCREENED_OUT')throw new Error('资格筛除未确认')
      clearLocalSurveyDraft(publicId,attemptId);setCheckpointRevision(0)
      try{sessionStorage.removeItem(singleStorageKey(publicId))}catch{/* private session unavailable */}
      setSingleResume(null);setTask(null);setScreenedOut(true)
      setNotice('本轮研究筛选已结束。未生成正式 FINAL，未将筛选答案保存为正式测量记录。')
      return
    }
    if(final.status!=='COMPLETED')throw new Error('作答尚未完成提交')
    // FINAL is authoritative even if the subsequent General request fails.
    // Never keep a local draft after the server accepted completion.
    clearLocalSurveyDraft(publicId,attemptId);setCheckpointRevision(0)
    const generalResult=await publicApi<General>(base+'/attempts/'+attemptId+'/general','POST',{
      ...(info?.project.collectionMode==='LINKED_WAVES'?{researchCode:researchCode.trim().toUpperCase()}:{}),
      accessCredential:accessCredential.trim(),
    })
    setGeneral(generalResult)
    setTask(null)
    setNotice('提交成功。系统不会提供未经验证的诊断或常模等级。')
  })}
  const saveCheckpoint=()=>{if(!task?.checkpointPolicy?.enabled||!attemptId)return
    if(checkpointOverwritePending&&!window.confirm(
      '确认用当前本地答案替换另一设备保存的服务器 Checkpoint？此操作不能恢复被覆盖的未提交草稿。',
    ))return
    void run(async()=>{
      // Only the current route is eligible for a voluntary server checkpoint.
      const enabled=task.flow?new Set(currentFlow?.visibleUnitKeys??[]):null
      const partial=Object.fromEntries(task.units.filter(unit=>
        enabled===null||enabled.has(unit.instrumentKey)).map(unit=>{
        const answer=answers[unit.instrumentKey]||{}
        return [unit.instrumentKey,unit.kind==='FORM'
          ?sanitizeFormAnswers(unit.pages?.flatMap(p=>p.questions)??[],answer):answer]
      }))
      const timedUnits=task.units.filter(unit=>
        unit.kind==='SCALE'&&unit.presentationMode==='ONE_BY_ONE'&&
        (enabled===null||enabled.has(unit.instrumentKey)))
      const partialTimings=Object.fromEntries(timedUnits.map(unit=>[
        unit.instrumentKey,sealSurveyScaleTimings((unit.items??[]).map(q=>q.itemKey),
          partial[unit.instrumentKey]??{},
          timingTrackers.current[unit.instrumentKey]?.snapshot()??
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
      setRevoked(true);setHome(null);setTask(null);setGeneral(null)
      setSelectedWave(null);setAgreed(false);setProofReceived(false)
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
      setWithdrawn(true);setGeneral(null);setTask(null);setHome(null)
      setSingleResume(null)
      try{sessionStorage.removeItem(singleStorageKey(publicId))}catch{/* storage unavailable */}
      setResearchCode('');setAccessCredential('')
      setNotice('已记录撤回请求。相关回答将从后续统计和新导出排除；物理删除与历史留存按研究说明处理。')
    })
  }

  const returnHome=()=>void run(async()=>{
    const data=await publicApi<{waves:Wave[]}>(base+'/enter','POST',{
      researchCode:researchCode.trim().toUpperCase(),accessCredential:accessCredential.trim(),
    })
    setHome(data.waves);setSelectedWave(null);setGeneral(null);setTask(null)
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
      {info.project.collectionMode==='LINKED_WAVES'&&!home&&!task&&!general&&!revoked&&<section className="bg-white rounded-xl border p-5">
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
        <p className="text-sm">研究编号可供本项目数据匹配；**私密恢复凭证不可交给研究者或其他人**。页面关闭后不再显示原始密钥。</p>
        <p className="mt-3">研究编号</p><code className="block bg-slate-100 p-3 break-all">{researchCode}</code>
        <p className="mt-3">私密恢复凭证</p><code className="block bg-slate-100 p-3 break-all">{accessCredential}</code>
        <button className="btn-secondary mt-3" type="button" onClick={()=>setProofReceived(false)}>
          我已分别保存这两个凭证</button>
      </section>}
      {info.project.collectionMode==='SINGLE_UNLINKED'&&singleResume&&!task&&!general&&
        <section className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold">恢复本次单次匿名作答</h3>
          <p className="text-sm my-2">仅此浏览器标签可尝试恢复短期作答；不建立跨波次身份。公共设备请在完成后关闭标签。</p>
          <button className="btn-secondary" type="button" disabled={busy} onClick={resumeSingle}>
            恢复本次作答／查看已完成回执</button>
        </section>}
      {home&&!task&&!general&&info.project.collectionMode==='LINKED_WAVES'&&
        <button type="button" className="btn-secondary" disabled={busy} onClick={revokeAccess}>
          停止后续研究参与并撤销未来访问权限（已收集数据不自动删除）
        </button>}
      {!task&&!general&&!revoked&&<section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-lg">研究波次</h3>
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
            className="btn-secondary" disabled={busy||!agreed||!entryToken}
            onClick={()=>join(selectedWave)}>首次参加 · 领取随机研究编号</button>}
          <button className="btn-primary" disabled={busy||!agreed||
            (info.project.collectionMode==='LINKED_WAVES'?(!researchCode||!accessCredential):!entryToken)}
            onClick={start}>{selectedWave.attempt?.status==='COMPLETED'?'查看完成情况':'开始或恢复本轮作答'}</button>
        </div>}
      </section>}
      {task&&!general&&<form className="space-y-5" onSubmit={submit}>
        <div className="bg-white border rounded-xl p-4"><h3 className="font-semibold">本轮研究作答</h3>
          <p className="text-sm text-slate-500">请按实际情况回答。研究内部计分不作为个人诊断反馈。</p>
          <p className="text-xs text-slate-500 mt-2">未提交答案仅在当前浏览器标签页暂存，至多两小时；
            关闭标签、使用其他设备或清理浏览器数据后无法恢复。公共电脑建议完成后立即退出。</p></div>
        {task.checkpointPolicy?.enabled&&<section className="bg-white border rounded-xl p-4 space-y-2">
          <p className="text-sm">此研究启用了可选服务器加密暂存：您可主动保存尚未完成的内容。
            每次最多 64KB，保存期 {task.checkpointPolicy.ttlHours} 小时；不计入研究 FINAL。</p>
          <button type="button" className="btn-secondary" disabled={busy} onClick={saveCheckpoint}>
            保存加密临时进度（第 {checkpointRevision+1} 版）</button>
          <p className="text-xs text-slate-500">研究者不会通过此按钮获得正式作答，取消、撤回或最终提交后将按策略清理。
            仅拥有本研究合法私密凭证的当前参与者可以恢复。</p>
        </section>}
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
          {!finalFlowStep&&<button type="button" className="btn-secondary" disabled={busy}
            onClick={advanceFlow}>确认当前步骤，继续研究</button>}
        </>:timedSequence&&flowUnit?<section className="space-y-3">
          <p className="text-xs text-slate-600" role="status">研究工具 {toolStep+1} / {task.units.length}</p>
          {renderSurveyTask(flowUnit)}
          <nav aria-label="研究工具导航" className="flex flex-wrap gap-3">
            <button type="button" className="btn-secondary" disabled={toolStep===0}
              onClick={()=>{setError('');setToolStep(i=>Math.max(0,i-1))}}>上一工具</button>
            {!finalFlowStep&&<button type="button" className="btn-secondary"
              onClick={advanceFlow}>确认当前工具，继续</button>}
          </nav>
        </section>:task.units.map(renderSurveyTask)}
        {finalFlowStep&&<button className="btn-primary" disabled={busy||(!task.flow&&!task.units.every(unit=>{
          if(unit.kind!=='FORM')return true
          const vis=visibleFormKeys(unit.pages?.flatMap(p=>p.questions)||[],
            answers[unit.instrumentKey]||{})
          const pages=(unit.pages||[]).filter(p=>p.questions.some(q=>vis.has(q.itemKey)))
          return (formPages[unit.instrumentKey]??0)>=pages.length-1
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
      {general&&<section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="text-xl font-semibold">本轮回答已完成</h2>
        <p className="whitespace-pre-wrap">{general.text}</p>
        <p className="text-sm text-slate-600">{general.disclaimer}</p>
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
