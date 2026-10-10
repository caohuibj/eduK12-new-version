import { useCallback,useMemo,useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import FinalCompositeAssessment from '../components/FinalCompositeAssessment'
import SituationalRunner from '../modules/situational/pages/SituationalRunner'
import type { SituationalRunnerClient, SituationalFinalSubmitPayload } from '../modules/situational/api'
import type { SituationalAttemptResponse } from '../modules/situational/types'
import type { AssessmentVideoCapabilitySources } from '../modules/assessment-media/types'
import type { CompositeAttemptState,CompositeCurrentItem } from '../modules/composite/types'
import type { ApiResponse } from '../types'
import type { SchoolApi } from './SchoolRecovery'

export type CampusExecutionRef={
  organizationId:string;courseId:string;runId:string;executionId:string
  consentRequired?:boolean;consentPurpose?:string|null;consentVisibility?:string|null
}
export function SchoolCompositeRunner({api,execution,onExit,onFinished}:{
  api:SchoolApi;execution:CampusExecutionRef
  onExit:()=>void;onFinished:()=>void
}){
  const [state,setState]=useState<CompositeAttemptState|null>(null)
  const [child,setChild]=useState<CompositeCurrentItem|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [done,setDone]=useState(false)
  const [consentAccepted,setConsentAccepted]=useState(false)
  const prefix=`/organizations/${execution.organizationId}/activities/${execution.courseId}/runs/${execution.runId}/executions/${execution.executionId}`
  const wrapped=<T,>(data:T):ApiResponse<T>=>({code:0,message:'成功',data})
  const load=useCallback(async(id:string)=>{
    const result=await api<CompositeAttemptState>('/composite-attempts/'+encodeURIComponent(id))
    if(result.deliveryMode!=='FINAL_ONLY')throw new Error('不支持通过校园入口重启历史旧版测评')
    setState(result);if(result.status==='COMPLETED')setDone(true)
  },[api])
  const start=async()=>{
    setBusy(true);setError('')
    try{
      // Only the respondent may accept a frozen observer Run consent; a
      // student's/guardian's activity association never implies consent.
      if(execution.consentRequired&&!consentAccepted)
        throw new Error('请先阅读并明确同意本次观察测评使用范围')
      if(execution.consentRequired){
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
  const childFinished=async()=>{
    setChild(null)
    if(state)try{await load(state.id)}catch(e){setError(e instanceof Error?e.message:'测评进度刷新失败')}
  }
  return <section className="hs-panel hs-runner">
    <div className="hs-actions"><button disabled={busy} onClick={onExit}>保存并返回活动</button></div>
    <h2>校园正式测评</h2>
    <p>答案在官方评估引擎中结算，不会因为你完成测评就自动公开给家长或普通教师。</p>
    {error&&<p className="hs-alert" role="alert">{error}</p>}
    {done?<div role="status" className="hs-message">
      <h3>本次测评已完成</h3>
      <p>已收到正式完成确认。报告是否可查看由独立披露政策决定。</p>
      <button onClick={onFinished}>返回我的校园活动</button>
    </div>:
    child?.type==='SITUATIONAL'&&child.situationalAttemptId&&state&&situationalClient?
      <MemoryRouter initialEntries={['/relational/situational/attempts/'+child.situationalAttemptId]}>
        <SituationalRunner campus={{
          attemptId:child.situationalAttemptId,
          parentAttemptId:state.id,compositeItemId:child.id,
          client:situationalClient,onCompleted:()=>{void childFinished()},
        }}/>
      </MemoryRouter>:
    state?<FinalCompositeAssessment
      state={state}
      campusMode
      campusVideoLoader={videoLoader}
      submitFormSection={async(_id,sectionId,input)=>{
        return wrapped(await api(runApi('/form-sections/'+encodeURIComponent(sectionId)+'/submit'),
          'POST',input))
      }}
      submitScale={async(_id,itemId,input)=>{
        return wrapped(await api(runApi('/items/'+encodeURIComponent(itemId)+'/scale/submit'),
          'POST',input))
      }}
      onReload={()=>load(state.id)}
      onExit={onExit}
      onCompleted={()=>setDone(true)}
      onEnterCognitive={()=>setError('校园 Run 的认知适配器未正式启用，不能通过非正式入口作答。')}
      onEnterSituational={item=>{
        if(!item.situationalAttemptId){
          setError('嵌入情境测评缺少冻结实例，请联系学校')
          return
        }
        setChild(item)
      }}
    />:<div>
      {execution.consentRequired&&<div className="hs-panel">
        <h3>本次受控观察测评的知情同意</h3>
        <p>用途：{execution.consentPurpose||'学校正式授权的教育观察'}</p>
        <p>可见性政策：{execution.consentVisibility||'仅限经授权人员'}</p>
        <p>是否可披露任何个人心理报告仍由独立的报告政策决定，拒绝同意不会触发作答。</p>
        <label className="hs-consent"><input type="checkbox"
          checked={consentAccepted} onChange={e=>setConsentAccepted(e.target.checked)}/>
          <span>我已阅读本次测评的用途与可见性说明，自愿同意作答。</span>
        </label>
      </div>}
      <button className="hs-primary" disabled={busy||(!!execution.consentRequired&&!consentAccepted)}
        onClick={()=>void start()}>
        {busy?'正在核对正式测评…':'开始或继续正式测评'}
      </button>
    </div>}
  </section>
}
