import {useEffect,useState} from 'react'
type Api=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
type Formal={id:string;kind:'FACT'|'FORMAL_FEEDBACK';content:string}
type Consensus={id:string;organizationId:string;eventId:string;title:string;
  content:string;status:'DRAFT'|'SUBMITTED';revision:number;digest:string;
  sourceRecordIds:string[];independentEvaluatorCount:number;
  approvalCount:number;submittedAt:string|null}
export function HuiteacherConsensusManager({organizationId,eventId,api}:{
  organizationId:string;eventId:string;api:Api
}){
  const base='/organizations/'+organizationId+'/evaluation-events/'+eventId
  const [notes,setNotes]=useState<Formal[]>([])
  const [entries,setEntries]=useState<Array<Pick<Consensus,'id'|'title'|'status'|'revision'>>>([])
  const [chosen,setChosen]=useState<string[]>([])
  const [title,setTitle]=useState(''),[body,setBody]=useState('')
  const [current,setCurrent]=useState<Consensus|null>(null)
  const [draftTitle,setDraftTitle]=useState(''),[draftBody,setDraftBody]=useState('')
  const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const refresh=async()=>{
    const [e,c]=await Promise.all([
      api<{list:Formal[]}>(base+'/formal-notes'),
      api<{list:typeof entries}>(base+'/consensuses')])
    setNotes(e.list);setEntries(c.list)
  }
  useEffect(()=>{
    let live=true
    void Promise.all([
      api<{list:Formal[]}>(base+'/formal-notes'),
      api<{list:typeof entries}>(base+'/consensuses'),
    ]).then(([e,c])=>{if(live){setNotes(e.list);setEntries(c.list)}})
      .catch(e=>{if(live)setNotice(e instanceof Error?e.message:'协商记录读取失败')})
    return()=>{live=false}
  },[base,api])
  const run=(job:()=>Promise<void>)=>{
    setBusy(true);setNotice('')
    void job().catch(e=>setNotice(e instanceof Error?e.message:'协商操作失败'))
      .finally(()=>setBusy(false))
  }
  const show=(row:Consensus)=>{
    setCurrent(row);setDraftTitle(row.title);setDraftBody(row.content);setDirty(false)
  }
  const create=()=>run(async()=>{
    const selected=notes.filter(n=>n.kind==='FORMAL_FEEDBACK'&&chosen.includes(n.id))
    if(selected.length<2)throw Error('至少选择两份独立评价者正式反馈')
    const row=await api<Consensus>(base+'/consensuses','POST',{
      title:title.trim(),content:body.trim(),sourceRecordIds:selected.map(x=>x.id),
    })
    show(row);setChosen([]);setTitle('');setBody('');await refresh()
    setNotice('人工共识草稿已建立；等待独立评价者确认。')
  })
  const open=(id:string)=>run(async()=>{
    if(dirty&&!window.confirm('放弃未保存的修改吗？'))return
    show(await api<Consensus>('/consensuses/'+id))
  })
  const save=()=>run(async()=>{
    if(!current||current.status!=='DRAFT')return
    show(await api<Consensus>('/consensuses/'+current.id,'PUT',{
      title:draftTitle.trim(),content:draftBody.trim(),expectedRevision:current.revision,
    }))
    await refresh();setNotice('已修订草稿；先前版本的确认不再有效。')
  })
  const publish=()=>run(async()=>{
    if(!current||current.status!=='DRAFT'||dirty||current.approvalCount<2)return
    if(!window.confirm('确认冻结人工共识？原始评价将继续独立保留。'))return
    await api('/consensuses/'+current.id+'/submit','POST',{expectedRevision:current.revision})
    show(await api<Consensus>('/consensuses/'+current.id))
    await refresh();setNotice('人工共识已正式冻结并留存审计。')
  })
  return <section className="ht-field-consensus" aria-label="人工协商共识">
    <h4>独立评价与人工协商</h4>
    <p className="ht-muted">至少两位独立评价者的正式反馈作为不可修改的来源；
      共识必须经评价者分别确认同一版本，不能将分数平均当作共识。</p>
    {notice&&<p role="status" className="ht-notice">{notice}</p>}
    <button type="button" disabled={busy} onClick={()=>run(refresh)}>刷新证据和确认进度</button>
    <div className="ht-event-list">{notes.filter(x=>x.kind==='FORMAL_FEEDBACK').map(n=>
      <label className="ht-consensus-citation" key={n.id}>
        <input type="checkbox" checked={chosen.includes(n.id)}
          onChange={e=>setChosen(old=>e.target.checked?[...old,n.id]:old.filter(x=>x!==n.id))}/>
        <span>正式反馈 #{n.id.slice(0,8)}<span className="ht-field-content">{n.content}</span></span>
      </label>)}</div>
    <label className="ht-field"><span>共识标题</span><input maxLength={200} value={title}
      onChange={e=>setTitle(e.target.value)}/></label>
    <label className="ht-field"><span>协商结论、分歧和依据</span><textarea rows={5}
      maxLength={12000} value={body} onChange={e=>setBody(e.target.value)}/></label>
    <button disabled={busy||chosen.length<2||title.trim().length<2||!body.trim()}
      onClick={create}>创建共识草稿</button>
    <div className="ht-inline">{entries.map(e=><button disabled={busy} key={e.id}
      onClick={()=>open(e.id)}>{e.title} · {e.status==='SUBMITTED'?'已冻结':'待确认'}</button>)}</div>
    {current&&<div className="ht-event">
      <p>版本 {current.revision} · 原始独立评价者 {current.independentEvaluatorCount} 位 ·
        已确认 {current.approvalCount} 位</p>
      {current.status==='DRAFT'?<>
        <label className="ht-field"><span>标题</span><input maxLength={200}
          value={draftTitle} onChange={e=>{setDraftTitle(e.target.value);setDirty(true)}}/></label>
        <label className="ht-field"><span>草稿正文</span><textarea rows={5}
          value={draftBody} onChange={e=>{setDraftBody(e.target.value);setDirty(true)}}/></label>
        <button disabled={busy||!dirty||!draftBody.trim()} onClick={save}>保存修订</button>
        <button disabled={busy||dirty||current.approvalCount<2}
          onClick={publish}>两人签署后正式发布</button>
      </>:<p className="ht-field-content">{current.content}</p>}
    </div>}
  </section>
}
export function HuiteacherConsensusReviews({api}:{api:Api}){
  const [reviews,setReviews]=useState<Consensus[]>([])
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState('')
  const refresh=async()=>setReviews((await api<{list:Consensus[]}>('/my-consensus-reviews')).list)
  useEffect(()=>{
    let live=true
    void api<{list:Consensus[]}>('/my-consensus-reviews')
      .then(r=>{if(live)setReviews(r.list)})
      .catch(e=>{if(live)setNotice(e instanceof Error?e.message:'共识待办读取失败')})
    return()=>{live=false}
  },[api])
  const approve=(r:Consensus)=>{
    if(!window.confirm('确认本人已阅读并认可本次精确版本的人工共识吗？'))return
    setBusy(true);setNotice('')
    void api('/consensuses/'+r.id+'/approve','POST',{
      expectedRevision:r.revision,expectedDigest:r.digest,
    }).then(refresh).then(()=>setNotice('本人对该版本的确认已保存。'))
      .catch(e=>setNotice(e instanceof Error?e.message:'独立签署失败'))
      .finally(()=>setBusy(false))
  }
  return <section className="ht-panel" aria-label="协商共识独立签署">
    <h2>专家／同行共识确认</h2>
    <p className="ht-muted">仅能确认明确引用了本人正式反馈的活动；个人观察原稿不被替换。</p>
    {notice&&<p role="status" className="ht-notice">{notice}</p>}
    <button disabled={busy} onClick={()=>{setBusy(true);void refresh()
      .catch(e=>setNotice(e instanceof Error?e.message:'刷新失败'))
      .finally(()=>setBusy(false))}}>刷新待办</button>
    {reviews.map(r=><article className="ht-event" key={r.id}>
      <h3>{r.title}</h3><p className="ht-field-content">{r.content}</p>
      <p className="ht-muted">版本 {r.revision} · 评价者确认数 {r.approvalCount} · {r.status}</p>
      {r.status==='DRAFT'&&<button disabled={busy} onClick={()=>approve(r)}>
        我确认此版本的人工共识</button>}
    </article>)}
  </section>
}
