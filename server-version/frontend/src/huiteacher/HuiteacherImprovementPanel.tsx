import {useEffect,useState} from 'react'
export type ImprovementApi=<T>(path:string,method?:string,payload?:unknown)=>Promise<T>
export type ImprovementTarget={id:string;name:string;kind:string;status:string}
type Reassessment={eventId:string;feedback:string;recordedAt:string;
  comparisonPolicy:'NARRATIVE_ONLY_NO_CAUSAL_INFERENCE'}
type Candidate={id:string;title:string;kind:string;closedAt:string}
type Action={
  id:string;targetId:string;sourceEventId:string|null;
  audience:'PRIVATE_PERSONAL'|'SCHOOL_SHARED';
  goal:string;plan:string;evidence:string|null;
  status:'PLANNED'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED';
  version:number;dueAt:string|null;completedAt:string|null;createdAt:string;
  reassessment:Reassessment|null
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
  const [reviewing,setReviewing]=useState<string|null>(null)
  const [reviewOptions,setReviewOptions]=useState<Candidate[]>([])
  const [selectedReviewEvent,setSelectedReviewEvent]=useState('')
  const [reviewFeedback,setReviewFeedback]=useState('')
  const [reviewNotice,setReviewNotice]=useState('')
  const isPrivate=audience==='PRIVATE_PERSONAL'
  useEffect(()=>{
    let current=true
    setActions([]);setCursor(null);setError('');setReviewing(null);setReviewOptions([])
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
  const loadReviews=(item:Action)=>go(async()=>{
    setReviewing(item.id);setReviewOptions([]);setSelectedReviewEvent('')
    setReviewFeedback('');setReviewNotice('')
    const response=await api<{list:Candidate[];truncated:boolean;note:string}>(
      base+'/'+(isPrivate?'private':'school')+'/'+item.id+'/reassessment-candidates')
    setReviewOptions(response.list)
    setReviewNotice(response.list.length
      ?response.note
      :'尚无行动完成后具有正式证据并已关闭的同对象评价；请先开展一次新评价。')
  })
  const attachReview=(item:Action)=>go(async()=>{
    if(!selectedReviewEvent||reviewFeedback.trim().length<15)
      throw new Error('请选择合法后续评价并填写至少15字的发展性反馈')
    if(!window.confirm('确定关联本次正式后续评价？关联及反馈将不可修改，且不会生成未经验证的趋势分数。'))return
    await api(base+'/'+(isPrivate?'private':'school')+'/'+item.id+'/reassessment',
      'POST',{eventId:selectedReviewEvent,feedback:reviewFeedback.trim()})
    setReviewing(null);setReviewOptions([]);setReviewFeedback('');setReviewNotice('')
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
        {item.status==='COMPLETED'&&item.reassessment&&
          <section className="ht-growth-review" aria-label="已关联的阶段复评">
            <h4>行动后的正式复评 · 已冻结</h4>
            <p>关联事件：<code>{item.reassessment.eventId.slice(0,8)}…</code>
              {' · '}记录日期：{new Date(item.reassessment.recordedAt).toLocaleDateString('zh-CN')}</p>
            <p className="ht-field-content">{item.reassessment.feedback}</p>
            <p className="ht-muted">仅为受控的人工发展反馈，不代表经验证的量化进步或因果效果。</p>
          </section>}
        {item.status==='COMPLETED'&&!item.reassessment&&<>
          <button disabled={busy} type="button" onClick={()=>loadReviews(item)}>
            关联行动完成后的正式复评</button>
          {reviewing===item.id&&<div className="ht-growth-review">
            {reviewNotice&&<p role="status" className="ht-muted">{reviewNotice}</p>}
            {reviewOptions.length>0&&<>
              <label className="ht-field"><span>同一评价对象的后续正式评价</span>
                <select value={selectedReviewEvent} onChange={e=>setSelectedReviewEvent(e.target.value)}>
                  <option value="">请选择已结束且有提交依据的后续评价</option>
                  {reviewOptions.map(event=><option key={event.id} value={event.id}>
                    {event.title} · {new Date(event.closedAt).toLocaleDateString('zh-CN')}</option>)}
                </select></label>
              <label className="ht-field"><span>复评反馈与下一步建议（15–2500字）</span>
                <textarea rows={4} maxLength={2500} value={reviewFeedback}
                  onChange={e=>setReviewFeedback(e.target.value)}
                  placeholder="描述观察到的实践与变化证据、尚待改进处及其他可能解释；禁止记录学生个人信息"/></label>
              <button disabled={busy||!selectedReviewEvent||reviewFeedback.trim().length<15}
                type="button" onClick={()=>attachReview(item)}>完成受控复评关联</button>
            </>}
          </div>}
        </>}
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
