import { useEffect,useState } from 'react'
import type { SchoolApi } from './SchoolRecovery'

type Disclosure={version:string;text:string;minimumCohort:number}
type StudentOpportunity={
  organizationId:string;courseId:string;title:string
  assented:boolean;guardianConsented:boolean
}
type GuardianRequest={
  organizationId:string;courseId:string;relationshipId:string
  title:string;consented:boolean
}
export function SchoolPeerConsent({api,role}:{
  api:SchoolApi;role:'STUDENT'|'PARENT'
}){
  const [studentItems,setStudentItems]=useState<StudentOpportunity[]>([])
  const [parentItems,setParentItems]=useState<GuardianRequest[]>([])
  const [policy,setPolicy]=useState<Disclosure|null>(null)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)
  const load=async()=>{
    if(role==='STUDENT'){
      const result=await api<{list:StudentOpportunity[];policy:Disclosure}>('/my/peer-opportunities')
      setStudentItems(result.list);setPolicy(result.policy)
    }else{
      const result=await api<{list:GuardianRequest[];policy:Disclosure}>('/guardian/peer-consent-requests')
      setParentItems(result.list);setPolicy(result.policy)
    }
  }
  useEffect(()=>{
    let live=true
    const route=role==='STUDENT'?'/my/peer-opportunities':'/guardian/peer-consent-requests'
    void api<{list:Array<StudentOpportunity & GuardianRequest>;policy:Disclosure}>(route)
      .then(result=>{
        if(!live)return
        if(role==='STUDENT')setStudentItems(result.list)
        else setParentItems(result.list)
        setPolicy(result.policy)
      }).catch(e=>{if(live)setError(e instanceof Error?e.message:'同伴互评信息暂不可用')})
    return()=>{live=false}
  },[api,role])
  async function act(task:()=>Promise<void>){
    setError('');setNotice('');setBusy(true)
    try{await task();await load()}catch(e){setError(e instanceof Error?e.message:'同伴互评状态未能更新')}
    finally{setBusy(false)}
  }
  const list=role==='STUDENT'?studentItems:parentItems
  if(!list.length&&!error)return null
  return <section className="hs-panel">
    <h2>自愿参加同伴互评</h2>
    <p>{policy?.text??'同伴互评仅用于安全的班级群体研究，不自动生成同学个人画像。'}
      最少 {policy?.minimumCohort??5} 名同时获得学生及监护人同意的学生才可抽样。</p>
    {error&&<p role="alert" className="hs-alert">{error}</p>}
    {notice&&<p role="status" className="hs-message">{notice}</p>}
    {role==='STUDENT'?studentItems.map(item=><article className="hs-task-card" key={item.courseId}>
      <h3>{item.title}</h3>
      <p>本人：{item.assented?'已同意':'尚未同意'}；
        监护人：{item.guardianConsented?'已同意':'尚未确认'}。</p>
      {!item.assented?<button disabled={busy} onClick={()=>void act(async()=>{
        if(!window.confirm('你确认自愿参加吗？作答不会自动向同学、普通教师或家长公开。'))return
        await api(`/organizations/${item.organizationId}/activities/${item.courseId}/peer-consent`,
          'POST',{action:'ASSENT'})
        setNotice('已登记本人同意，仍需监护人独立确认。')
      })}>本人同意参加</button>:
        <button disabled={busy} onClick={()=>void act(async()=>{
          await api(`/organizations/${item.organizationId}/activities/${item.courseId}/peer-consent`,
            'POST',{action:'WITHDRAW'})
          setNotice('已撤回参与许可，未开始的互评任务不再开放。')
        })}>撤回同意</button>}
    </article>):parentItems.map(item=><article className="hs-task-card"
      key={item.relationshipId+':'+item.courseId}>
      <h3>{item.title}</h3>
      <p>孩子已自愿提出参加申请，学校只按同班随机抽样。
        你的确认不能让你查看其他学生的互评回答或孩子的个人心理报告。</p>
      <button disabled={busy} onClick={()=>void act(async()=>{
        await api(`/organizations/${item.organizationId}/activities/${item.courseId}/guardian-peer-consent`,
          'POST',{relationshipId:item.relationshipId,
            action:item.consented?'WITHDRAW':'CONSENT'})
        setNotice(item.consented?'已撤回监护人同意。':'监护人同意已记录。')
      })}>{item.consented?'撤回监护人同意':'以监护人身份同意'}</button>
    </article>)}
  </section>
}
