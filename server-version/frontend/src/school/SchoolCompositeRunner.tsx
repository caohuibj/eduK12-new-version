import { useCallback,useEffect,useMemo,useRef,useState } from 'react'
import {ArrowLeft,CircleCheck} from 'lucide-react'
import {SchoolTaskHelp} from './SchoolTaskHelp'
import { MemoryRouter } from 'react-router-dom'
import FinalCompositeAssessment from '../components/FinalCompositeAssessment'
import { CognitiveRunner } from '../modules/cognitive/pages/CognitiveRunner'
import type { CognitiveSessionApi } from '../modules/cognitive/api'
import type { CognitiveSession } from '../modules/cognitive/types'
import SituationalRunner from '../modules/situational/pages/SituationalRunner'
import type { SituationalRunnerClient, SituationalFinalSubmitPayload } from '../modules/situational/api'
import type { SituationalAttemptResponse } from '../modules/situational/types'
import type { AssessmentVideoCapabilitySources } from '../modules/assessment-media/types'
import type { CompositeAttemptState,CompositeCurrentItem } from '../modules/composite/types'
import type { ApiResponse } from '../types'
import type { SchoolApi } from './SchoolRecovery'
import './school-assessment.css'

export type CampusExecutionRef={
  organizationId:string;courseId:string;runId:string;executionId:string
  resumeExisting?:boolean
  consentRequired?:boolean;consentPurpose?:string|null;consentVisibility?:string|null
}
export function SchoolCompositeRunner({api,execution,onExit,onFinished,title,observer=false,observerTaskTitle,observerRole='teacher'}:{
  api:SchoolApi;execution:CampusExecutionRef;title?:string;observer?:boolean;observerTaskTitle?:string;observerRole?:'teacher'|'parent'
  onExit:()=>void;onFinished:()=>void
}){
  const panelRef=useRef<HTMLElement>(null)
  useEffect(()=>{
    panelRef.current?.focus({preventScroll:true})
    panelRef.current?.scrollIntoView?.({block:'start'})
  },[execution.executionId])
  const [state,setState]=useState<CompositeAttemptState|null>(null)
  const [child,setChild]=useState<CompositeCurrentItem|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [done,setDone]=useState(false)
  const [consentAccepted,setConsentAccepted]=useState(false)
  // This hint only skips signing a new admission consent. Protected START replay
  // and attempt reads keep their existing identity/population checks; FINAL
  // independently revalidates the frozen accepted consent.
  const needsAdmissionConsent=!!execution.consentRequired&&!execution.resumeExisting
  const prefix=`/organizations/${execution.organizationId}/activities/${execution.courseId}/runs/${execution.runId}/executions/${execution.executionId}`
  const wrapped=<T,>(data:T):ApiResponse<T>=>({code:0,message:'成功',data})
  const load=useCallback(async(id:string)=>{
    const result=await api<CompositeAttemptState>('/composite-attempts/'+encodeURIComponent(id)+'?view=current-unit')
    if(result.deliveryMode!=='FINAL_ONLY')throw new Error('不支持通过校园入口重启历史旧版测评')
    setState(result);if(result.status==='COMPLETED')setDone(true)
  },[api])
  const start=async()=>{
    setBusy(true);setError('')
    try{
      // Only the respondent may accept a frozen observer Run consent; a
      // student's/guardian's activity association never implies consent.
      if(needsAdmissionConsent&&!consentAccepted)
        throw new Error('请先阅读并明确同意本次观察测评使用范围')
      if(needsAdmissionConsent){
        await api(prefix+'/consent/accept','POST',{})
      }
      const result=await api<{
        state:'STARTED'|'IN_PROGRESS';runtimeBindingKind?:string;runtimeBindingRef?:string
      }>(prefix+'/start','POST',{})
      if(result.state==='IN_PROGRESS'){
        setError('启动请求正在确认中，请重新核对；请勿重复开启另一份测评。')
        return
      }
      if(result.state!=='STARTED'||result.runtimeBindingKind!=='COMPOSITE'
        ||!result.runtimeBindingRef)throw new Error('正式测评尚未提供安全的 Composite 执行实例')
      await load(result.runtimeBindingRef)
    }catch(e){setError(e instanceof Error?e.message:'测评暂时不能开始')}
    finally{setBusy(false)}
  }
  const runApi=(s:string)=>'/composite-attempts/'+encodeURIComponent(state?.id||'')+s
  const videoLoader=useCallback(async(url:string)=>{
    if(!url.startsWith('/api/campus/'))throw new Error('不允许使用培训版测评媒体')
    return api<AssessmentVideoCapabilitySources>(url.slice('/api/campus'.length),'POST',{})
  },[api])
  const situationalClient=useMemo<SituationalRunnerClient|null>(()=>{
    if(!child?.situationalAttemptId||!state)return null
    const attemptId=state.id,itemId=child.id
    const prefix='/composite-attempts/'+encodeURIComponent(attemptId)+'/items/'
      +encodeURIComponent(itemId)+'/situational/'
    const startPath=(id:string)=>prefix+encodeURIComponent(id)
    const blob=async(path:string)=>{
      const resp=await fetch('/api/campus'+path,{credentials:'same-origin'})
      if(!resp.ok)throw new Error('校园测评视觉内容无法访问')
      return resp.blob()
    }
    const execute=async<T,>(path:string,method:'GET'|'POST'='GET',payload?:unknown):Promise<ApiResponse<T>>=>
      wrapped(await api<T>(path,method,payload))
    return {
      start:async()=>{throw new Error('嵌入测评实例必须由官方 Run 启动')},
      resume:(id:string)=>execute<SituationalAttemptResponse>(startPath(id)),
      result:(id:string)=>execute<SituationalAttemptResponse>(startPath(id)),
      submit:(id:string,payload:SituationalFinalSubmitPayload)=>
        execute<SituationalAttemptResponse>(startPath(id)+'/submit','POST',payload),
      loadAsset:(id:string,assetId:string)=>blob(startPath(id)+'/assets/'+encodeURIComponent(assetId)+'/content'),
      loadVideoSources:(id:string,sceneKey:string)=>
        execute<AssessmentVideoCapabilitySources>(
          startPath(id)+'/scenes/'+encodeURIComponent(sceneKey)+'/video-sources'),
    }
  },[api,child?.id,child?.situationalAttemptId,state?.id])
  // Only the existing frozen Composite child session is eligible. No
  // /api/cognitive training credential, standalone start or raw score endpoint.
  const cognitiveClient=useMemo<CognitiveSessionApi|null>(()=>{
    if(!state||!child?.cognitiveSession?.sessionId||child.type!=='COGNITIVE')return null
    const attemptId=state.id,itemId=child.id
    const location=(sessionId:string)=>'/composite-attempts/'+encodeURIComponent(attemptId)
      +'/items/'+encodeURIComponent(itemId)+'/cognitive/'+encodeURIComponent(sessionId)
    const loadBlob=async(path:string)=>{
      const response=await fetch('/api/campus'+path,{credentials:'same-origin'})
      if(!response.ok)throw new Error('校园认知测评素材不可访问')
      return response.blob()
    }
    return {
      getSession:async(sessionId)=>wrapped(await api<CognitiveSession>(location(sessionId))),
      submitFinal:async(sessionId,payload)=>wrapped(await api<{
        completed:boolean;feedbackDeferred:boolean;replayed:boolean
      }>(location(sessionId)+'/submit','POST',payload)),
      loadAsset:(sessionId,assetId)=>loadBlob(location(sessionId)+'/assets/'+encodeURIComponent(assetId)+'/content'),
      issueVideoCapabilities:async(sessionId,videoKey)=>wrapped(await api<AssessmentVideoCapabilitySources>(
        location(sessionId)+'/video-capabilities','POST',{videoKey})),
      appendTrial:async()=>{throw new Error('校园认知测评只支持一次性 FINAL 提交')},
      completeSession:async()=>{throw new Error('校园认知测评只支持一次性 FINAL 提交')},
    }
  },[api,child?.id,child?.type,child?.cognitiveSession?.sessionId,state?.id])
  const childFinished=async()=>{
    setChild(null)
    if(state)try{await load(state.id)}catch(e){setError(e instanceof Error?e.message:'测评进度刷新失败')}
  }
  const ordinaryAnswer=Boolean((title||observer)&&state&&!done&&!child&&['FORM_SECTION','SCALE'].includes(state.currentItem?.type??''))
  const compactNotes=ordinaryAnswer||Boolean(title&&child)
  const observerReady=observer&&!state&&!done
  const observerAnswer=observer&&ordinaryAnswer
  const observerComplete=observer&&done
  const consentPurpose=observer&&execution.consentPurpose?.startsWith('organization_run:FORM:')
    ?'填写本次学校安排的观察问卷。'
    :observer&&execution.consentPurpose?.startsWith('organization_run:SCALE:')
      ?'完成本次学校安排的观察量表。'
      :execution.consentPurpose||'学校正式授权的教育观察'
  const observerVisibility:Record<string,string>={
    PRIVATE_RESPONDENT:'本次同意不额外授权向其他人员共享结果。',
    ASSIGNING_TEACHER:'本次同意包含向任务布置方共享结果的授权。',
    SHARED_COURSE_LEAD:'本次同意包含向课程负责人共享结果的授权。',
  }
  const consentVisibility=observer&&execution.consentVisibility&&observerVisibility[execution.consentVisibility]
    ||execution.consentVisibility||'仅限经授权人员'

  return <section data-school-child={title?child?.type:undefined} className={"hs-panel hs-runner"+(observerReady?' hs-observer-runner--ready':'')+(observerComplete?' hs-observer-runner--done':'')+(title&&child?' hs-school-task-runner--child':'')+(ordinaryAnswer?' hs-school-task-runner--answer':'')+(observerAnswer?' hs-observer-runner--answer':'')+(title?" hs-school-task-runner"+(!state&&!done?" hs-school-task-runner--ready":""):"")} ref={panelRef} tabIndex={-1} aria-label="校园任务作答"
    onMouseOut={observerAnswer?event=>{const details=(event.target as Element).closest<HTMLDetailsElement>('details.assessment-instructions');if(details&&!details.contains(event.relatedTarget as Node|null))details.open=false}:undefined}
    onPointerDownCapture={observerAnswer?event=>{const details=panelRef.current?.querySelector<HTMLDetailsElement>('details.assessment-instructions');if(details&&!details.contains(event.target as Node))details.open=false}:undefined}
    onBlurCapture={observerAnswer?event=>{const details=(event.target as Element).closest<HTMLDetailsElement>('details.assessment-instructions');if(details&&!details.contains(event.relatedTarget as Node|null))details.open=false}:undefined}
    onKeyDown={observerAnswer?event=>{const details=panelRef.current?.querySelector<HTMLDetailsElement>('details.assessment-instructions');if(event.key==='Escape'&&details?.open){details.open=false;details.querySelector<HTMLElement>('summary')?.focus()}}:undefined}>
    {observerComplete?null:observerReady||observerAnswer?<>
      <div className={'hs-observer-ready-toolbar'+(observerAnswer?' hs-observer-answer-toolbar':'')}><button className="hs-runner-back" disabled={busy} onClick={onExit}><ArrowLeft size={17} aria-hidden="true"/>返回任务</button>
        {!observerAnswer&&<SchoolTaskHelp label="作答与隐私说明" buttonText="作答说明"><p><strong>离开与提交</strong><br/>返回不会提交当前作答。已成功提交的结果会保留；尚未提交的内容可能无法保留。</p><p><strong>结果可见性</strong><br/>完成测评不会自动向家长或普通教师开放学生个人心理报告。</p></SchoolTaskHelp>}
      </div>
      {observerReady&&<header className="hs-observer-ready-heading"><p>{observerRole==='parent'?'家长观察测评':'教师观察测评'}</p><h2>{observerTaskTitle||'校园正式测评'}</h2></header>}
    </>:<>
    <div className="hs-actions"><button className="hs-runner-back" disabled={busy} onClick={onExit}><ArrowLeft size={17} aria-hidden="true"/>返回活动</button></div>
    {!compactNotes&&<p className="hs-runner-note">返回不会提交当前作答。已成功提交的结果会保留；尚未提交的内容可能无法保留。</p>}
    {title?<h1 hidden={Boolean(state)&&!done}>{title}</h1>:<h2 hidden={Boolean(state)}>校园正式测评</h2>}
    {compactNotes?<details className="hs-school-runner-help"><summary>任务与隐私说明</summary><p>返回不会提交当前作答。已成功提交的结果会保留；尚未提交的内容可能无法保留。</p><p>答案在官方评估引擎中结算，不会因为你完成测评就自动公开给家长或普通教师。</p></details>:<p className="hs-runner-note">答案在官方评估引擎中结算，不会因为你完成测评就自动公开给家长或普通教师。</p>}
    </>}
    {error&&<p className="hs-alert" role="alert">{error}</p>}
    {done?<div role="status" className="hs-message">
      {observer?<><CircleCheck className="hs-observer-complete-icon" size={36} aria-hidden="true"/><h1>本次测评已完成</h1></>:<h3>本次测评已完成</h3>}
      <p>{observer?'作答已提交。报告会按学校的授权与隐私规则开放。':'已收到正式完成确认。报告是否可查看由独立披露政策决定。'}</p>
      <button onClick={onFinished}>{observer?'返回任务列表':'返回我的校园活动'}</button>
    </div>:
    child?.type==='COGNITIVE'&&child.cognitiveSession?.sessionId&&state&&cognitiveClient?
      <MemoryRouter key={child.cognitiveSession.sessionId}
        initialEntries={['/campus/cognitive/sessions/'+encodeURIComponent(child.cognitiveSession.sessionId)]}>
        <CognitiveRunner campus={{
          sessionId:child.cognitiveSession.sessionId,
          api:cognitiveClient,
          onCompleted:()=>{void childFinished()},
          onExit:()=>{setChild(null)},
        }}/>
      </MemoryRouter>:
    child?.type==='SITUATIONAL'&&child.situationalAttemptId&&state&&situationalClient?
      <MemoryRouter initialEntries={['/relational/situational/attempts/'+child.situationalAttemptId]}>
        <SituationalRunner campus={{
          attemptId:child.situationalAttemptId,
          parentAttemptId:state.id,compositeItemId:child.id,
          instructionsSummary:title?'作答说明':undefined,
          client:situationalClient,onCompleted:()=>{void childFinished()},
        }}/>
      </MemoryRouter>:
    state?<FinalCompositeAssessment
      state={state}
      campusMode
      instructionsSummary={ordinaryAnswer?'作答说明':undefined}
      instructionsAppendix={observerAnswer?<><p>返回任务不会提交当前作答。已提交的结果保留；尚未提交的内容可能无法保留。</p><p>完成测评不会自动向家长或普通教师开放学生个人心理报告。</p></>:undefined}
      campusVideoLoader={videoLoader}
      submitFormSection={async(_id,sectionId,input)=>{
        return wrapped(await api(runApi('/form-sections/'+encodeURIComponent(sectionId)+'/submit'),
          'POST',input))
      }}
      submitScale={async(_id,itemId,input)=>{
        return wrapped(await api(runApi('/items/'+encodeURIComponent(itemId)+'/scale/submit?response=receipt'),
          'POST',input))
      }}
      onReload={()=>load(state.id)}
      onExit={onExit}
      onCompleted={()=>setDone(true)}
      onEnterCognitive={item=>{
        if(!item.cognitiveSession?.sessionId){
          setError('认知子测评缺少经过冻结的会话，请联系学校')
          return
        }
        setChild(item)
      }}
      onEnterSituational={item=>{
        if(!item.situationalAttemptId){
          setError('嵌入情境测评缺少冻结实例，请联系学校')
          return
        }
        setChild(item)
      }}
    />:<div className="hs-school-task-launch">
      {observerReady&&<p className="hs-observer-ready-prompt">确认任务后，开始或继续本次测评。</p>}
      {needsAdmissionConsent&&<div className="hs-panel hs-runner-consent">
        <h3>{observer?'测评知情同意':'本次受控观察测评的知情同意'}</h3>
        <p>用途：{consentPurpose}</p>
        <p>{observer?'共享范围：':'可见性政策：'}{consentVisibility}</p>
        <p className="hs-consent-report-note">{observer?'完成作答不会自动开放学生个人心理报告；不同意则不会开始测评。':'是否可披露任何个人心理报告仍由独立的报告政策决定，拒绝同意不会触发作答。'}</p>
        <label className="hs-consent"><input type="checkbox"
          checked={consentAccepted} onChange={e=>setConsentAccepted(e.target.checked)}/>
          <span>我已阅读本次测评的用途与可见性说明，自愿同意作答。</span>
        </label>
      </div>}
      <button className="hs-primary" aria-label={observerReady&&!busy?'开始或继续正式测评':undefined} disabled={busy||(needsAdmissionConsent&&!consentAccepted)}
        onClick={()=>void start()}>
        {busy?'正在核对正式测评…':observerReady?'开始／继续测评':'开始或继续正式测评'}
      </button>
    </div>}
  </section>
}
