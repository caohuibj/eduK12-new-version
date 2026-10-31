import {useMemo,useRef,useState} from 'react'
import {HuiteacherMyFormTasks} from './HuiteacherMyFormTasks'
import {HuiteacherMyAssessmentTasks} from './HuiteacherMyAssessmentTasks'
import {createStudentAssessmentApi} from './assessmentRuntime.client'
import {createEducationAssessmentFeedback} from '../components/education-tools/educationAssessmentFeedbackAdapter'
import type {EducationReportApi} from '../components/education-tools/EducationScalePersonalReport'
import type {AssessmentListState} from './assessmentTaskPresentation'

const initial:AssessmentListState={pending:true,error:false,count:0}
type Props={api:EducationReportApi;actorKey:string}
export function HuiteacherStudentTasks(props:Props){
 const scope=useRef({...props,epoch:0})
 if(scope.current.api!==props.api||scope.current.actorKey!==props.actorKey)scope.current={...props,epoch:scope.current.epoch+1}
 return <StudentTasksSession key={scope.current.epoch} {...props}/>
}
function StudentTasksSession({api,actorKey}:Props){
 const [forms,setForms]=useState(initial),[questionnaires,setQuestionnaires]=useState(initial)
 const studentApi=useMemo(()=>createStudentAssessmentApi(api),[api])
 const feedback=useMemo(()=>createEducationAssessmentFeedback({api:studentApi,entry:'TEACHER'}),[studentApi])
 const pending=forms.pending||questionnaires.pending,count=forms.count+questionnaires.count
 return <section className="ht-panel" aria-label="我的学生评教任务"><h2>我的学生评教任务{!pending&&count>0?' · '+count+' 项':''}</h2>
  <p>按学校核验的任教关系评价教师。本人作答只作完成确认；教师与学校仅能读取符合人数及隐私规则的群体反馈。</p>
  {pending&&<p role="status">正在读取学生评教任务…</p>}
  {!pending&&!forms.error&&!questionnaires.error&&!count&&<p>暂无分配给你的学生评教任务。</p>}
  <HuiteacherMyFormTasks student unified api={api} onListStateChange={setForms}/>
  <HuiteacherMyAssessmentTasks student unified api={studentApi} actorKey={actorKey} onListStateChange={setQuestionnaires} renderFeedback={feedback}/>
 </section>
}
