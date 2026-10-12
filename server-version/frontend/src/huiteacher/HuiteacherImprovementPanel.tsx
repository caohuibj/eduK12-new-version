import {useEffect,useState} from 'react'
export type ImprovementApi=<T>(path:string,method?:string,payload?:unknown)=>Promise<T>
export type ImprovementTarget={id:string;name:string;kind:string;status:string}
type Action={
  id:string;targetId:string;sourceEventId:string|null;
  audience:'PRIVATE_PERSONAL'|'SCHOOL_SHARED';
  goal:string;plan:string;evidence:string|null;
  status:'PLANNED'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED';
  version:number;dueAt:string|null;completedAt:string|null;createdAt:string
}
type Audience=Action['audience']
export function HuiteacherImprovementPanel({api,organizationId,targetId,targetName,
  audience,sourceEventId}:{api:ImprovementApi;organizationId:string;
  targetId:string;targetName:string;audience:Audience;sourceEventId?:string|null}){
  const base='/organizations/'+organizationId+'/evaluation-targets/'+targetId+'/improvement-actions'
  const [actions,setActions]=useState<Action[]>([])
  const [goal,setGoal]=useState('')
  const [plan,setPlan]=useState('')
  const [dueAt,setDueAt]=useState('')
  const [evidence,setEvidence]=useState<Record<string,string>>({})
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [cursor,setCursor]=useState<string|null>(null)
  const isPrivate=audience==='PRIVATE_PERSONAL'
  useEffect(()=>{
    let current=true
    setActions([]);setCursor(null);setError('')
    void api<{list:Action[];nextCursor:string|null}>(base).then(value=>{
      if(current){setActions(value.list.filter(a=>a.audience===audience));setCursor(value.nextCursor)}
    }).catch(e=>{if(current)setError(e instanceof Error?e.message:'改进行动不可用')})
    return()=>{current=false}
  },[api,base,audience])
  const refresh=async()=>{
    const value=await api<{list:Action[];nextCursor:string|null}>(base)
    setActions(value.list.filter(a=>a.audience===audience))
    setCursor(value.nextCursor)
  }
  const go=(work:()=>Promise<void>)=>{
    setBusy(true);setError('')
    void work().catch(e=>setError(e instanceof Error?e.message:'操作失败')).finally(()=>setBusy(false))
  }
  const create=()=>go(async()=>{
    const deadline=dueAt?new Date(dueAt).toISOString():null
    await api(base+'/'+(isPrivate?'private':'school'),'POST',{
      goal:goal.trim(),plan:plan.trim(),
      ...(sourceEventId?{sourceEventId}:{}),
      dueAt:deadline,
    })
    setGoal('');setPlan('');setDueAt('')
    await refresh()
  })
  const move=(item:Action,action:'START'|'COMPLETE'|'CANCEL')=>go(async()=>{
    if(!window.confirm(action==='COMPLETE'?'确认此项改进行动已完成并冻结证据？':'确认更新本项行动状态？'))return
    await api(base+'/'+(isPrivate?'private':'school')+'/'+item.id+'/transition','POST',{
      expectedVersion:item.version,action,
      ...(action==='COMPLETE'?{evidence:(evidence[item.id]??'').trim()}:{}),
    })
    setEvidence(old=>({...old,[item.id]:''}))
    await refresh()
  })
  const next=()=>go(async()=>{
    if(!cursor)return
    const value=await api<{list:Action[];nextCursor:string|null}>(base+'?cursor='+encodeURIComponent(cursor))
    setActions(old=>[...old,...value.list.filter(a=>a.audience===audience)])
    setCursor(value.nextCursor)
  })
  return <section className="ht-growth" aria-label={isPrivate?'我的私人专业成长行动':'学校共享改进行动'}>
    <h3>{isPrivate?'私人专业成长行动':'学校共享改进行动'} · {targetName}</h3>
    <p className="ht-muted">{isPrivate
      ?'仅本人能查看私人目标与过程证据。学校管理员没有默认读取权限。'
      :'仅学校 Teacher 产品管理员可以创建、修订共享行动。需要近期 MFA 验证；此处不是学生成绩或心理报告。'}</p>
    {error&&<p role="status" className="ht-notice">{error}</p>}
    <div className="ht-growth-form">
      <label className="ht-field"><span>发展目标</span>
        <input value={goal} maxLength={400} onChange={e=>setGoal(e.target.value)}
          placeholder="明确希望改进的做法"/></label>
      <label className="ht-field"><span>行动计划</span>
        <textarea value={plan} maxLength={4000} rows={3}
          onChange={e=>setPlan(e.target.value)} placeholder="接下来具体准备怎么做"/></label>
      <label className="ht-field"><span>预计完成时间（可选）</span>
        <input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label>
      <button className="ht-primary" disabled={busy||goal.trim().length<2||plan.trim().length<5}
        onClick={create}>建立行动记录</button>
    </div>
    {actions.length===0?<p className="ht-empty">暂无此受众范围内的改进行动。</p>:
      <div className="ht-event-list">{actions.map(item=><article key={item.id} className="ht-event">
        <strong>{item.goal}</strong> <span className="ht-tag">{item.status}</span>
        <p className="ht-field-content">{item.plan}</p>
        {item.sourceEventId&&<p className="ht-muted">来自已结束评价事件：<code>{item.sourceEventId.slice(0,8)}…</code></p>}
        {item.dueAt&&<p>计划截止：{new Date(item.dueAt).toLocaleDateString('zh-CN')}</p>}
        {item.evidence&&<p className="ht-field-content"><strong>完成依据：</strong>{item.evidence}</p>}
        {item.status==='PLANNED'&&<div className="ht-inline">
          <button disabled={busy} onClick={()=>move(item,'START')}>开始行动</button>
          <button disabled={busy} onClick={()=>move(item,'CANCEL')}>取消</button>
        </div>}
        {item.status==='IN_PROGRESS'&&<>
          <label className="ht-field"><span>完成证据与反思（至少 10 字）</span>
            <textarea rows={3} maxLength={6000} value={evidence[item.id]??''}
              onChange={e=>setEvidence(old=>({...old,[item.id]:e.target.value}))}/></label>
          <div className="ht-inline">
            <button disabled={busy||(evidence[item.id]??'').trim().length<10}
              onClick={()=>move(item,'COMPLETE')}>完成并冻结证据</button>
            <button disabled={busy} onClick={()=>move(item,'CANCEL')}>取消</button>
          </div>
        </>}
      </article>)}</div>}
    {cursor&&<button disabled={busy} onClick={next}>查看更早的行动</button>}
  </section>
}
