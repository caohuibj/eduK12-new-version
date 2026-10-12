import { useCallback,useEffect,useRef,useState } from 'react'
import { TaskForm } from '../survey/SurveyPublicApp'
import { sanitizeFormAnswers,visibleFormKeys } from '../survey/form-visibility'
import type { FormDraft } from '../survey/builder.types'
import type { ProfessionalAnswer } from '../survey/ProfessionalFormAnswer'

type Api=<T>(path:string,method?:string,payload?:unknown)=>Promise<T>
type Summary={
  executionId:string;runId:string;organizationId:string;eventId:string;
  eventTitle:string;formId:string;formTitle:string;
  teacherName?:string;deadline?:string|null;
  status:string;runtimeBindingKind:string|null;runtimeBindingRef:string|null
}
type Task={attemptId:string;formId:string;status:string;title:string;
  definitionDigest:string;reportMode:'COMPLETION_ONLY';pages:FormDraft['pages']}
type Start={
  state:'STARTED'|'IN_PROGRESS';runtimeBindingRef?:string;
  runtimeBindingKind?:string;replayed?:boolean
}
const storageKey=(id:string)=>'huiteacher:form:v1:'+id
const readDraft=(task:Task):Record<string,ProfessionalAnswer>=>{
  try{
    const raw=sessionStorage.getItem(storageKey(task.attemptId))
    if(!raw||raw.length>262144)return {}
    const saved=JSON.parse(raw) as {
      definitionDigest:string;savedAt:number;answers:Record<string,ProfessionalAnswer>
    }
    if(saved.definitionDigest===task.definitionDigest
      &&Date.now()-saved.savedAt<7200000&&saved.savedAt<=Date.now()
      &&saved.answers&&typeof saved.answers==='object'&&!Array.isArray(saved.answers))
      return saved.answers
  }catch{/* private or corrupted tab draft */}
  return {}
}
const storeDraft=(task:Task,answers:Record<string,ProfessionalAnswer>)=>{
  try{
    const raw=JSON.stringify({definitionDigest:task.definitionDigest,
      savedAt:Date.now(),answers})
    if(raw.length<=262144)sessionStorage.setItem(storageKey(task.attemptId),raw)
  }catch{/* unsupported private browsing */}
}
const clearDraft=(task:Task)=>{
  try{sessionStorage.removeItem(storageKey(task.attemptId))}catch{/* private mode */}
}
export function HuiteacherMyFormTasks({api,student=false}: {api:Api;student?:boolean}){
  const taskEndpoint=student?'/my-student-evaluations':'/my-form-tasks'
  const [tasks,setTasks]=useState<Summary[]>([])
  const [active,setActive]=useState<Task|null>(null)
  const [answers,setAnswers]=useState<Record<string,ProfessionalAnswer>>({})
  const [page,setPage]=useState(0)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const pendingSubmission=useRef<string>('')
  const refresh=useCallback(async()=>{
    const result=await api<{list:Summary[]}>(taskEndpoint)
    setTasks(result.list)
  },[api,taskEndpoint])
  useEffect(()=>{
    let live=true
    void api<{list:Summary[]}>(taskEndpoint).then(x=>{
      if(live)setTasks(x.list)
    }).catch(e=>{if(live)setNotice(e instanceof Error?e.message:'待办评价读取失败')})
    return ()=>{live=false}
  },[api,taskEndpoint])
  useEffect(()=>{
    if(active&&active.status==='STARTED')storeDraft(active,answers)
  },[active,answers])
  const perform=(job:()=>Promise<void>)=>{
    setBusy(true);setNotice('')
    void job().catch(e=>setNotice(e instanceof Error?e.message:'操作未完成'))
      .finally(()=>setBusy(false))
  }
  const open=async(item:Summary)=>{
    perform(async()=>{
      let attemptId=item.runtimeBindingRef
      if(!attemptId){
        const started=await api<Start>(
          '/run-executions/'+item.executionId+'/start','POST',{})
        if(started.state==='IN_PROGRESS'){
          setNotice('任务开始处理中，请稍候刷新并继续，不要重复提交。')
          return
        }
        if(started.runtimeBindingKind!=='HUITEACHER_FORM_V2'||!started.runtimeBindingRef)
          throw new Error('Form 任务没有合法的受控运行记录')
        attemptId=started.runtimeBindingRef
      }
      const task=await api<Task>('/form-attempts/'+attemptId+'/task')
      setActive(task);setPage(0);setAnswers(readDraft(task))
      pendingSubmission.current=''
      await refresh()
    })
  }
  const updateAnswer=(name:string,value:ProfessionalAnswer)=>{
    setAnswers(previous=>{
      const next={...previous,[name]:value}
      const q=active?.pages.flatMap(p=>p.questions).find(q=>q.itemKey===name)
      if(q?.otherOptionKey){
        const selected=value===q.otherOptionKey
          ||(Array.isArray(value)&&value.includes(q.otherOptionKey))
        if(!selected)delete next[q.itemKey+':other']
      }
      return next
    })
  }
  // UI page indices are ORIGINAL Form page positions. Counting only visible
  // pages changes their indices and permits early FINAL when an earlier page
  // is hidden while a later, required page remains visible.
  const visible=active?visibleFormKeys(active.pages.flatMap(p=>p.questions),answers):new Set<string>()
  const lastVisiblePage=active?active.pages.reduce((latest,p,index)=>
    p.questions.some(q=>visible.has(q.itemKey))?index:latest,-1):-1
  const last=page>=Math.max(0,lastVisiblePage)
  const submit=()=>{
    if(!active||!last)return
    const source=active
    perform(async()=>{
      if(!window.confirm('确认正式提交吗？提交后无法修改本次评价。'))return
      const cleaned=sanitizeFormAnswers(source.pages.flatMap(p=>p.questions),answers)
      if(!pendingSubmission.current){
        const key='huiteacher:submission:'+source.attemptId
        try{
          pendingSubmission.current=sessionStorage.getItem(key)||crypto.randomUUID()
          sessionStorage.setItem(key,pendingSubmission.current)
        }catch{pendingSubmission.current=crypto.randomUUID()}
      }
      await api('/form-attempts/'+source.attemptId+'/final','POST',{
        submissionId:pendingSubmission.current,answers:cleaned,
      })
      clearDraft(source)
      try{sessionStorage.removeItem('huiteacher:submission:'+source.attemptId)}catch{/* private mode */}
      setActive({...source,status:'COMPLETED'});setAnswers({})
      await refresh()
      setNotice('评价已完成正式 FINAL；教师只能在满足隐私条件后查看群体反馈。')
    })
  }
  return <section className="ht-panel" aria-label={student?'我的学生评教':'我的教师发展评价任务'}>
    <h2>{student?'我的学生评教':'我的评价任务'}</h2>
    <p>{student
      ?'使用原有教育账号参与已获授权的教师评教。身份用于确认资格，教师不能查看逐人作答；这属于身份受保护评价，不是绝对匿名。'
      :'使用统一教育账号完成本人获授权的评价；与 Huischool 心理数据及 Survey 研究作答隔离。'}</p>
    {notice&&<p role="status" className="ht-notice">{notice}</p>}
    {tasks.length===0?<p className="ht-empty">{student?'暂无已分配的学生评教任务。':'暂无已分配的教师发展评价任务。'}</p>:
      <div className="ht-event-list">{tasks.map(item=><article className="ht-event" key={item.executionId}>
        <strong>{item.formTitle}</strong> <span className="ht-tag">{item.status}</span>
        <p>{item.eventTitle}{student&&item.teacherName?' · '+item.teacherName:''}</p>
        {student&&item.deadline&&<p>截止：{new Date(item.deadline).toLocaleString('zh-CN')}</p>}
        <button disabled={busy||item.status==='COMPLETED'}
          onClick={()=>void open(item)}>
          {item.status==='ASSIGNED'?'开始评价':'继续评价'}
        </button>
      </article>)}</div>}
    {active&&<div className="ht-task">
      <h3>{active.title}</h3>
      {active.status==='COMPLETED'?<p role="status">本次评价已正式提交。</p>:
      <>
        <p>答案仅在本标签页短时暂存；按整份表单一次性提交。</p>
        <TaskForm purpose="HUITEACHER"
          unit={{kind:'FORM',instrumentKey:active.formId,title:active.title,pages:active.pages}}
          answer={answers} onChange={updateAnswer} pageIndex={page}
          onPageChange={setPage}/>
        <button className="ht-primary" disabled={busy||!last} onClick={submit}>
          正式提交评价
        </button>
      </>}
    </div>}
  </section>
}
