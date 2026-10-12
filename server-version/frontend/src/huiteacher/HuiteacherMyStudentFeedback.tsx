import {useEffect,useState} from 'react'
import {HuiteacherStudentFeedbackView,type StudentFeedbackReport} from './HuiteacherStudentFeedbackView'
type Api=<T>(path:string,method?:string,data?:unknown)=>Promise<T>
type Source={
  organizationId:string;organizationName:string;eventId:string;
  eventTitle:string;teacherName:string;formTitle:string
}
export function HuiteacherMyStudentFeedback({api}:{api:Api}){
  const [sources,setSources]=useState<Source[]>([])
  const [report,setReport]=useState<StudentFeedbackReport|null>(null)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  useEffect(()=>{
    let current=true
    void api<{list:Source[]}>('/my-student-feedback').then(value=>{
      if(current)setSources(value.list)
    }).catch(e=>{if(current)setNotice(e instanceof Error?e.message:'学生反馈暂不可用')})
    return ()=>{current=false}
  },[api])
  const read=(source:Source)=>{
    setBusy(true);setNotice('');setReport(null)
    void api<StudentFeedbackReport>('/organizations/'+source.organizationId
      +'/evaluation-events/'+source.eventId+'/student-evaluation/report')
      .then(setReport).catch(e=>setNotice(e instanceof Error?e.message:'群体反馈未达到披露条件'))
      .finally(()=>setBusy(false))
  }
  return <section className="ht-panel" aria-label="被评价教师的学生群体反馈">
    <h2>我的学生群体反馈</h2>
    <p>仅展示本人被评价且已经关闭的合法活动。新版群体报告由有权学校管理员正式发布后可读；
      历史评教保持原有披露条件。不提供学生的原始答案、自由文本或个人作答时间。</p>
    {notice&&<p role="status" className="ht-notice">{notice}</p>}
    {sources.length===0?<p className="ht-empty">暂无已关闭、可以申请披露的学生评教活动。</p>:
      <div className="ht-event-list">{sources.map(source=><article className="ht-event"
        key={source.eventId}>
        <strong>{source.eventTitle}</strong>
        <p>{source.organizationName} · {source.formTitle}</p>
        <button disabled={busy} onClick={()=>read(source)}>查看受控群体反馈</button>
      </article>)}</div>}
    {report&&<HuiteacherStudentFeedbackView report={report}/>}
  </section>
}
