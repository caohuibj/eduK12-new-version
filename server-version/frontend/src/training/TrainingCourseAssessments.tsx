import TrainingCatalogTags from './TrainingCatalogTags'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, ClipboardList, Download, Plus, RefreshCw } from 'lucide-react'
import { internalReturnTo } from '../components/app-shell/access'
import { compositeApi } from '../modules/composite/api'
import type { CompositeTeacherAttemptsResponse } from '../modules/composite/types'
import { AssessmentDataExport } from '../pages/questionnaire/TrainingQuestionnaireList'
import './training-course-assessments.css'

export type CourseAssessment = {
 id:string;key:string;kind:string;typeLabel:string;name:string;description:string|null;status:string
 unitCount:number|null;unitLabel:string|null;manageHref:string|null;tags?:string[]
}
function CourseProgress({id,courseId}:{id:string;courseId:string}) {
 const location=useLocation()
 const [data,setData]=useState<CompositeTeacherAttemptsResponse|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{let active=true;setData(null);setError('')
  void compositeApi.attempts(id,{courseId,page:1,pageSize:1}).then(response=>{
   if(response.code!==0||response.data?.courseScope?.id!==courseId)throw Error(response.message||'课程数据范围无法确认')
   if(active)setData(response.data)
  }).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'读取失败')})
  return()=>{active=false}
 },[id,courseId,revision])
 return <section className="tca-progress" aria-label="本课程作答进度">{error?<p role="alert">{error}<button type="button" onClick={()=>setRevision(value=>value+1)}>重试</button></p>:!data?<p role="status">正在读取本课程作答进度…</p>:<><dl>{([
  ['已开始',data.attemptCounts.started],['进行中',data.attemptCounts.inProgress],['已交卷',data.attemptCounts.completed],['任务达成',data.attemptCounts.satisfied??data.attemptCounts.completed],
 ] as const).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>按作答次数统计，仅包含明确绑定本课程的记录。</p><Link to={`/composite-assessments/${encodeURIComponent(id)}/results?courseId=${encodeURIComponent(courseId)}&returnTo=${encodeURIComponent(location.pathname+location.search)}`}>打开本课程作答名单与报告<ArrowRight size={14} aria-hidden="true"/></Link></>}</section>
}
export default function TrainingCourseAssessments({course,actorId,rows,loading,error,onRetry,filtered=false}:{
 course:{id:string;title:string};actorId:string;rows:CourseAssessment[];loading:boolean;error:string|null;onRetry:()=>void;filtered?:boolean
}) {
 const location=useLocation()
 const [progress,setProgress]=useState<string|null>(null),[exportRow,setExportRow]=useState<CourseAssessment|null>(null)
 const encoded=encodeURIComponent(course.id),published=rows.filter(row=>row.status==='PUBLISHED').length,drafts=rows.filter(row=>row.status==='DRAFT').length
 return <section className="training-detail-content tql-page tca-workspace" aria-label="课程测评管理">
  <header className="tca-heading"><div><small>当前课程 · 测评工作台</small><h2>测评与作答</h2><p>在本课程完成编制、分享、查看结果和脱敏导出。</p></div><button type="button" onClick={onRetry} disabled={loading} aria-label="刷新课程测评"><RefreshCw size={15} aria-hidden="true"/></button></header>
  <div className="training-section-action tca-actions"><Link to={'/questionnaire-products/new?courseId='+encoded+'&returnTo='+encodeURIComponent(location.pathname+location.search)} className="tql-primary"><Plus size={15} aria-hidden="true"/>布置组合测评</Link><Link to="/questionnaires" className="tql-secondary">从已有测评复用<ArrowRight size={14} aria-hidden="true"/></Link></div>
  <p className="tca-intro">组合测评可按需加入量表、表单、情境判断和认知任务。跨课程查找与未绑定课程的草稿保留在“全部测评”。</p>
  <div className="tca-summary"><span>本页已发布 <strong>{loading||error?'—':published}</strong></span><span>本页草稿 <strong>{loading||error?'—':drafts}</strong></span></div>
  {error?<div className="training-message training-message--compact" role="alert"><p>当前课程测评清单暂时无法读取：{error}</p><button type="button" onClick={onRetry}>重新加载测评</button></div>:loading?<p role="status">正在读取本课程测评与草稿…</p>:rows.length===0?<div className="tca-empty"><ClipboardList size={30} aria-hidden="true"/><h3>{filtered?'没有符合条件的测评':'从本课程的第一份测评开始'}</h3><p>{filtered?'请调整标题、标签或时间范围后重新查询。':'创建时会自动选择当前课程；也可以从已有测评复制复用。'}</p></div>:<div className="tca-list">{rows.map(task=>{
   const href=internalReturnTo(task.manageHref),draft=task.status==='DRAFT',composite=task.kind==='QUESTIONNAIRE'
   const status=draft?'草稿':task.status==='PUBLISHED'?'已发布':'已停用'
   return <article key={task.key} className="tca-card"><header><span className="tca-icon"><ClipboardList size={21} aria-hidden="true"/></span><div><div className="tca-title"><h3>{task.name}</h3><span className={draft?'is-draft':''}>{status}</span></div><p>{task.typeLabel}{task.unitCount!==null?` · ${task.unitCount} ${task.unitLabel||'测评单元'}`:''}</p></div></header>
    {task.description&&<p className="tca-description">{task.description}</p>}
    <div className="tca-card-actions">{href?<><Link to={href+'?courseId='+encoded+'&returnTo='+encodeURIComponent(location.pathname+location.search)} className="tql-primary">{draft?'继续编制':task.kind==='QUESTIONNAIRE'?'配置与匿名链接':'管理测评'}<ArrowRight size={14} aria-hidden="true"/></Link>{composite&&!draft&&<><button type="button" className="tql-secondary" aria-expanded={progress===task.key} onClick={()=>setProgress(value=>value===task.key?null:task.key)}>作答与结果</button>{task.kind!=='ASSESSMENT_BUNDLE'&&<button type="button" className="tql-secondary" onClick={()=>setExportRow(task)}><Download size={15} aria-hidden="true"/>导出本课程数据</button>}</>}</>:<span className="training-task-disabled">由资源创建者管理</span>}</div>
    {href&&task.kind!=='ASSESSMENT_BUNDLE'&&<TrainingCatalogTags key={JSON.stringify(task.tags)} id={task.id} kind={task.kind} tags={task.tags} onSaved={onRetry}/>}
    {href&&!draft&&['LEGACY_COMPOSITE','ASSESSMENT_BUNDLE'].includes(task.kind)&&<p className="tca-note">此类测评未记录每次作答的课程来源，无法提供本课程结果或导出。请从管理测评查看完整结果（非课程范围）。</p>}
    {draft&&<p className="tca-note">草稿尚未发布，可继续编制；发布后在这里查看作答和导出。</p>}
    {progress===task.key&&composite&&href&&<CourseProgress id={task.id} courseId={course.id}/>}
   </article>
  })}</div>}
  <p className="tca-boundary">课程结果与导出仅包含明确绑定本课程的作答。匿名链接可在测评配置中管理；完整测评库与历史复用仍从“全部测评”进入。</p>
  {exportRow&&exportRow.manageHref&&<AssessmentDataExport key={JSON.stringify([actorId,course.id,exportRow.id])} row={{...exportRow,editHref:exportRow.manageHref}} course={course} actorId={actorId} onClose={()=>setExportRow(null)}/>}
 </section>
}
