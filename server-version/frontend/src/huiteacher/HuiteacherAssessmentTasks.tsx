import {SchoolTaskHelp as AssessmentHelp} from '../school/SchoolTaskHelp'
import {lazy,Suspense,useCallback,useState} from 'react'
import {HuiteacherMyFormTasks} from './HuiteacherMyFormTasks'
import {HuiteacherMyPrivateFormTasks} from './HuiteacherMyPrivateFormTasks'
import {HuiteacherMyScaleTasks} from './HuiteacherMyScaleTasks'
import type {TeacherAssessmentRuntimeProps} from './HuiteacherMyAssessmentTasks'
import type {AssessmentListState} from './assessmentTaskPresentation'

type Props={api:Parameters<typeof HuiteacherMyScaleTasks>[0]['api'];actorKey:string;
 assessmentRuntime?:Pick<TeacherAssessmentRuntimeProps,'onCompleted'|'renderFeedback'>}
const initial:AssessmentListState={pending:true,error:false,count:0}
const HuiteacherMyAssessmentTasks=lazy(()=>import('./HuiteacherMyAssessmentTasks').then(module=>({default:module.HuiteacherMyAssessmentTasks})))
// Keep the existing authorized runners mounted; only their task presentation is combined.
export function HuiteacherAssessmentTasks({api,actorKey,assessmentRuntime}:Props){
  const [lists,setLists]=useState({forms:initial,privateForms:initial,scales:initial})
  const forms=useCallback((value:AssessmentListState)=>setLists(old=>({...old,forms:value})),[])
  const privateForms=useCallback((value:AssessmentListState)=>setLists(old=>({...old,privateForms:value})),[])
  const scales=useCallback((value:AssessmentListState)=>setLists(old=>({...old,scales:value})),[])
  const [runtimeList,setRuntimeList]=useState(initial)
  const runtime=useCallback((value:AssessmentListState)=>setRuntimeList(value),[])
  const states=[...Object.values(lists),...(assessmentRuntime?[runtimeList]:[])]
  const pending=states.some(state=>state.pending)
  const error=states.some(state=>state.error)
  const count=states.reduce((sum,state)=>sum+state.count,0)
  return <div className="ht-panel ht-assessment-inbox">
    <header className="ht-section-heading">
      <h2 id="ht-assessment-inbox-title" className="ht-assessment-section-title">参与测评{!pending&&count>0&&<span className="ht-tag">{count} 项</span>}</h2>
      <AssessmentHelp label="参与测评说明" buttonText=""><p>学校或项目分配给你的测评，统一在这里查看与完成。</p><p>根据任务状态开始或继续作答；已完成任务的反馈仅在获得相应授权后显示。</p></AssessmentHelp>
    </header>
    {pending&&<p role="status">正在读取测评任务，请稍候…</p>}
    {!pending&&!error&&!count&&<p className="ht-empty">暂无分配给你的测评任务。</p>}
    <div className="ht-assessment-items">
      <HuiteacherMyFormTasks api={api} unified onListStateChange={forms}/>
      <HuiteacherMyPrivateFormTasks api={api} actorKey={actorKey} unified onListStateChange={privateForms}/>
      <HuiteacherMyScaleTasks api={api} unified onListStateChange={scales}/>
      {assessmentRuntime&&<Suspense fallback={<p role="status">正在读取测评任务…</p>}>
        <HuiteacherMyAssessmentTasks api={api} actorKey={actorKey} unified onListStateChange={runtime} {...assessmentRuntime}/>
      </Suspense>}
    </div>
  </div>
}
