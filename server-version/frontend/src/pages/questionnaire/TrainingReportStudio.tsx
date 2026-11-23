import { useCallback, useState } from 'react'
import { sessionFetch } from '../../api/client'
import { SurveyReportStudio, type ReportLeaveRisk, type ReportTransport } from '../../survey/SurveyReportStudio'
import { usePageEditorGuard } from '../../components/shared-ui/usePageEditorGuard'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function ReportNavigationGuard({risk}:{risk:ReportLeaveRisk}){
  const guard=usePageEditorGuard(null,{dirty:risk.dirty,busy:risk.pending||risk.busy})
  return guard.confirmation
}
export type TrainingReportCourse={id:string;title:string}
/** Courses come only from the saved product's actual delivery associations. */
type Props={actorId:string;compositeId:string;courses:TrainingReportCourse[];disabled?:boolean;onLeaveRiskChange?:(risk:ReportLeaveRisk)=>void}
export function TrainingReportStudio(props:Props){
  return <TrainingReportWorkspace key={JSON.stringify([props.actorId,props.compositeId])} {...props}/>
}
function TrainingReportWorkspace({actorId,compositeId,courses,onLeaveRiskChange,disabled=false}:Props){
  const [courseId,setCourseId]=useState(courses[0]?.id??''),[grantId,setGrantId]=useState('')
  const [availableGrants,setAvailableGrants]=useState<Array<{grantId:string;expiresAt:string}>>([])
  const [grantsLoading,setGrantsLoading]=useState(false),[grantsError,setGrantsError]=useState('')
  const [scope,setScope]=useState<{actorId:string;compositeId:string;courseId:string;grantId:string}|null>(null)
  const [risk,setRisk]=useState<ReportLeaveRisk>({dirty:false,pending:false,busy:false})
  const riskChanged=useCallback((value:ReportLeaveRisk)=>{setRisk(value);onLeaveRiskChange?.(value)},[onLeaveRiskChange])
  const discoverGrants=useCallback(async()=>{
    if(!courses.some(course=>course.id===courseId))return
    setGrantsLoading(true);setGrantsError('')
    try{
      const response=await sessionFetch('/api/questionnaire-products/'+encodeURIComponent(compositeId)+'/content-reports/courses/'+encodeURIComponent(courseId)+'/grants',{method:'GET',headers:{'Content-Type':'application/json'}})
      const envelope=await response.json() as {code:number;message?:string;data?:Array<{grantId:string;expiresAt:string}>}
      if(!response.ok||envelope.code!==0)throw new Error(envelope.message||'无法读取可用报告授权')
      const list=Array.isArray(envelope.data)?envelope.data:[]
      setAvailableGrants(list)
      if(list.length===1)setGrantId(list[0].grantId)
    }catch(err){
      setGrantsError(err instanceof Error?err.message:'无法读取可用报告授权')
    }finally{setGrantsLoading(false)}
  },[compositeId,courseId,courses])
  const transport=useCallback<ReportTransport>(async<T,>(path:string,method='GET',body?:unknown):Promise<T>=>{
    if(!scope||scope.actorId!==actorId||scope.compositeId!==compositeId||!courses.some(course=>course.id===scope.courseId))throw new Error('当前账号或课程上下文已变化，请重新打开报告工作台')
    const response=await sessionFetch('/api'+path+(path.includes('?')?'&':'?')+'grantId='+encodeURIComponent(scope.grantId),{
      method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
    let envelope:{code:number;message?:string;data:T}
    try{envelope=await response.json()}catch{throw new Error('报告请求结果尚未确认，请重试原请求')}
    if(!response.ok||envelope.code!==0)throw new Error(envelope.message||'报告操作失败')
    return envelope.data
  },[scope,actorId,compositeId,courses])
  const locked=risk.dirty||risk.pending||risk.busy
  return <section id="tool-reports" className="my-5 rounded border p-4" aria-label="Training 私有报告工作台"><fieldset disabled={disabled}><legend className="sr-only">课程报告编辑</legend>
    {scope&&locked&&<ReportNavigationGuard risk={risk}/>}<h2 className="text-xl font-semibold">课程私有报告工作台</h2>
    <p>使用当前账号的报告内容授权。发布报告不会修改历史分数；报告面向教师或研究者。</p>
    <fieldset disabled={locked}><label>已保存的投放课程<select className="input" value={courseId} onChange={event=>setCourseId(event.target.value)}>{courses.map(course=><option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
      <label>报告内容授权 ID<input className="input" value={grantId} onChange={event=>setGrantId(event.target.value.trim())}/></label>
      <button type="button" className="btn-secondary" disabled={grantsLoading||!courses.some(course=>course.id===courseId)} onClick={()=>void discoverGrants()}>{grantsLoading?'正在查找授权…':'查找可用授权'}</button>
      <button type="button" className="btn-secondary" disabled={!uuid.test(grantId)||!courses.some(course=>course.id===courseId)} onClick={()=>setScope({actorId,compositeId,courseId,grantId})}>打开课程报告</button>
    </fieldset>
    {grantsError&&<p role="alert" className="text-sm text-red-700 mt-1">{grantsError}</p>}
    {availableGrants.length>0&&<div className="mt-2 flex flex-wrap gap-2 text-sm" aria-label="可用报告内容授权">
      {availableGrants.map(item=><button key={item.grantId} type="button" className="btn-secondary" disabled={locked} onClick={()=>setGrantId(item.grantId)}>选用授权 {item.grantId.slice(0,8)}…（有效期至 {new Date(item.expiresAt).toLocaleDateString('zh-CN')}）</button>)}
    </div>}
    {locked&&<p role="status">请先保存修改或核对未确认请求，再切换课程或授权。</p>}
    {scope&&scope.actorId===actorId&&scope.compositeId===compositeId&&courses.some(course=>course.id===scope.courseId)&&<p>当前报告范围：{courses.find(course=>course.id===scope.courseId)?.title} · 授权 {scope.grantId}</p>}
    {scope&&scope.actorId===actorId&&scope.compositeId===compositeId&&courses.some(course=>course.id===scope.courseId)&&<SurveyReportStudio key={JSON.stringify(scope)} projectId={scope.compositeId} transport={transport}
      basePath={'/questionnaire-products/'+encodeURIComponent(scope.compositeId)+'/content-reports/courses/'+encodeURIComponent(scope.courseId)}
      nativePublishing={false} audiences={['teacher','researcher']} onLeaveRiskChange={riskChanged}
      recoveryKey={'training-report-create:'+JSON.stringify(scope)}/>}
  </fieldset></section>
}
