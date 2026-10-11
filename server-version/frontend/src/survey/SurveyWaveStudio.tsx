import { useEffect,useState,type FormEvent } from 'react'

type ApiResult<T>={code:number|string;message:string;data:T|null}
type Instrument={id:string;title:string;kind:string;status:string}
type Project={id:string;status:'DRAFT'|'ACTIVE'|'PAUSED'|'CLOSED'|'ARCHIVED';revision:number}
type Wave={
  id:string;projectId:string;title:string;ordinal:number;status:'DRAFT'|'OPEN'|'PAUSED'|'CLOSED';
  revision:number;instrumentIds:string[];publicationId:string|null;
  consentText:string;generalText:string;consentVersion:number;
  opensAt:string|null;closesAt:string|null;finishUntil:string|null;
  quotaStarts:number|null;startsCount:number;allowNewParticipants:boolean
}
type Preflight={ok:boolean;publicationReady:boolean;reason:string;checks:{
  key:string;ok:boolean;issues:string[];digest?:string}[]}
const surveyApi=async<T>(path:string,method='GET',body?:unknown):Promise<T>=>{
  let token=''
  const cookies=document.cookie.split('; ')
  const csrfCookie=cookies.find(x=>x.startsWith('huisurvey_research_csrf='))
  if(csrfCookie)token=decodeURIComponent(csrfCookie.split('=').slice(1).join('='))
  if(method!=='GET'&&!token){
    const response=await fetch('/api/survey/auth/csrf',{credentials:'same-origin'})
    if(!response.ok)throw new Error('安全令牌不可用')
    const data=await response.json() as ApiResult<{csrfToken:string}>
    token=data.data?.csrfToken||''
  }
  const r=await fetch('/api/survey'+path,{
    method,credentials:'same-origin',headers:{
      'Content-Type':'application/json',...(method!=='GET'?{'X-CSRF-Token':token}:{}),
    },...(body===undefined?{}:{body:JSON.stringify(body)}),
  })
  const result=await r.json() as ApiResult<T>
  if(!r.ok||result.code!==0||result.data===null)
    throw new Error(result.message||'请求失败')
  return result.data
}
const message=(e:unknown)=>e instanceof Error?e.message:'研究波次操作失败'
const initial=()=>({
  title:'',consentText:'',generalText:'',instrumentIds:[] as string[],
  opensAt:'',closesAt:'',quotaStarts:'',allowNewParticipants:false,
})
type FormState=ReturnType<typeof initial>
const localTime=(raw:string|null)=>{
  if(!raw)return ''
  const date=new Date(raw)
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)
}
export function SurveyWaveStudio({projectId}:{projectId:string}){
  const path='/projects/'+projectId
  const [waves,setWaves]=useState<Wave[]>([]),[tools,setTools]=useState<Instrument[]>([])
  const [project,setProject]=useState<Project|null>(null)
  const [editing,setEditing]=useState<Wave|null>(null),[form,setForm]=useState<FormState>(initial)
  const [ready,setReady]=useState<Preflight|null>(null),[busy,setBusy]=useState(false)
  const [error,setError]=useState(''),[notice,setNotice]=useState('')
  const [shareLink,setShareLink]=useState('')
  const refresh=async()=>{
    const [waveList,instrumentList,projectDetails]=await Promise.all([
      surveyApi<{list:Wave[]}>(path+'/waves'),
      surveyApi<{list:Instrument[]}>(path+'/instruments'),
      surveyApi<Project>(path),
    ])
    setWaves(waveList.list);setTools(instrumentList.list);setProject(projectDetails)
  }
  useEffect(()=>{setEditing(null);setReady(null);setShareLink('');setForm(initial())
    void refresh().catch(e=>setError(message(e)))
  },[projectId])
  const act=async(action:()=>Promise<void>)=>{
    setError('');setNotice('');setBusy(true)
    try{await action()}catch(e){setError(message(e))}finally{setBusy(false)}
  }
  const select=(wave:Wave)=>void act(async()=>{
    const detail=await surveyApi<Wave>(path+'/waves/'+wave.id)
    setEditing(detail);setReady(null);setShareLink('')
    setForm({
      title:detail.title,consentText:detail.consentText,generalText:detail.generalText,
      instrumentIds:detail.instrumentIds,
      opensAt:localTime(detail.opensAt),closesAt:localTime(detail.closesAt),
      quotaStarts:detail.quotaStarts===null?'':String(detail.quotaStarts),
      allowNewParticipants:detail.allowNewParticipants,
    })
  })
  const payload=()=>{
    const start=form.opensAt?new Date(form.opensAt):null
    const stop=form.closesAt?new Date(form.closesAt):null
    return {
      title:form.title,consentText:form.consentText,generalText:form.generalText,
      instrumentIds:form.instrumentIds,
      opensAt:start?.toISOString()||null,
      closesAt:stop?.toISOString()||null,
      quotaStarts:form.quotaStarts?Number(form.quotaStarts):null,
      allowNewParticipants:form.allowNewParticipants,
    }
  }
  const save=(e:FormEvent)=>{e.preventDefault();void act(async()=>{
    const body=payload()
    const wave=editing
      ?await surveyApi<Wave>(path+'/waves/'+editing.id,'PATCH',{...body,revision:editing.revision})
      :await surveyApi<Wave>(path+'/waves','POST',{...body,requestId:crypto.randomUUID()})
    await refresh();setEditing(wave);setReady(null)
    setNotice('波次草稿已保存；冻结定义和正式开放需要分别确认')
  })}
  const preflight=()=>{if(!editing)return;void act(async()=>{
    const result=await surveyApi<Preflight>(path+'/waves/'+editing.id+'/preflight','POST',{})
    setReady(result)
    setNotice(result.ok?'研究内容预检通过；发布阶段仍须通过运行时和权限门禁':'当前波次尚不满足发布条件')
  })}
  const lifecycle=(operation:'prepare'|'open'|'pause'|'resume'|'close'|'hard-stop')=>{
    if(!editing)return
    const wave=editing
    if(['close','hard-stop'].includes(operation)&&
      !window.confirm(operation==='hard-stop'
        ?'确认紧急停止此波次？已经开始但尚未提交的作答也将禁止 FINAL。'
        :'确认关闭本波次？新的被试将无法开始。'))return
    void act(async()=>{
      const result=await surveyApi<{researchUrl?:string}>(path+'/waves/'+wave.id+'/'+operation,'POST',{
        revision:wave.revision,
      })
      if(result.researchUrl)setShareLink(result.researchUrl)
      const fresh=await surveyApi<Wave>(path+'/waves/'+wave.id)
      setEditing(fresh);await refresh();setReady(null)
      setNotice(operation==='prepare'?'已冻结此波次的研究定义，下一步可正式开放':
        operation==='open'?'已创建一次性招募链接，请通过受控渠道交付':
          '波次状态已更新')
    })
  }
  const transitionProject=(action:'pause'|'resume'|'close')=>{
    if(!project)return
    if(action==='close'&&!window.confirm(
      '确认永久结束本研究项目？将停止全部波次的新准入，已完成的 FINAL 仍按研究说明保留。'
    ))return
    void act(async()=>{
      await surveyApi(path+'/'+action,'POST',{revision:project.revision})
      await refresh()
      setNotice(action==='pause'?'整个研究项目已暂停新准入':
        action==='resume'?'研究项目已恢复':'研究项目已结束，历史已完成研究数据仍保留。')
    })
  }
  const toggle=(id:string,checked:boolean)=>setForm(old=>({
    ...old,instrumentIds:checked?[...old.instrumentIds,id]:old.instrumentIds.filter(k=>k!==id),
  }))
  return <section className="border rounded-xl bg-white p-4 sm:p-6 my-5 space-y-5" aria-label="研究波次">
    <header><h2 className="text-xl font-semibold">研究波次 · T1 / T2 / T3</h2>
      <p className="text-sm text-slate-600">一个项目可以设置多个采集时间点，同一研究编号会在本项目内跨波次关联。
        波次正式发布后不能修改其题目、评分和同意内容，只能建立下一份冻结版本。</p></header>
    {error&&<p role="alert" className="bg-red-50 border-l-4 border-red-600 p-3">{error}</p>}
    {notice&&<p role="status" className="bg-teal-50 border-l-4 border-teal-600 p-3">{notice}</p>}
    {project&&<div className="border rounded-lg bg-slate-50 p-3 space-y-3">
      <div className="flex justify-between gap-3 flex-wrap items-center">
        <p className="text-sm">整体研究状态：<strong>{project.status}</strong></p>
        <div className="flex flex-wrap gap-2">
          {project.status==='ACTIVE'&&<button type="button" className="btn-secondary"
            disabled={busy} onClick={()=>transitionProject('pause')}>暂停整个研究</button>}
          {project.status==='PAUSED'&&<button type="button" className="btn-secondary"
            disabled={busy} onClick={()=>transitionProject('resume')}>恢复整个研究</button>}
          {['ACTIVE','PAUSED'].includes(project.status)&&<button type="button" className="btn-secondary"
            disabled={busy} onClick={()=>transitionProject('close')}>结束整个研究</button>}
        </div>
      </div>
      <p className="text-xs text-slate-600">暂停停止新的研究参与者准入；已开始的合法答卷仍遵循有限的完成窗口。关闭研究不会物理删除既有数据。</p>
    </div>}
    <div className="grid md:grid-cols-[220px_minmax(0,1fr)] gap-5">
      <nav aria-label="研究波次列表" className="space-y-2">
        <button className="btn-secondary w-full" type="button" onClick={()=>{
          setEditing(null);setForm(initial());setReady(null);setShareLink('')
        }}>新建波次</button>
        {waves.map(w=><button type="button" key={w.id} disabled={busy}
          className={'block w-full rounded-lg border text-left p-3 '+(w.id===editing?.id?'bg-sky-50 border-sky-700':'bg-white')}
          onClick={()=>select(w)}><strong className="block text-sm">{'T'+w.ordinal+' · '+w.title}</strong>
          <span className="text-xs">{w.status} {w.publicationId?' · 已冻结':''}</span></button>)}
      </nav>
      <div className="space-y-4 min-w-0">
        {(!editing||editing.status==='DRAFT'&&!editing.publicationId)&&<form className="space-y-4" onSubmit={save}>
          <h3 className="font-semibold">{editing?'修改未发布波次':'创建波次草稿'}</h3>
          <label className="block text-sm">波次标题<input className="input block w-full" required
            value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
          <label className="block text-sm">参与说明与知情同意
            <textarea className="input block w-full" rows={6} required minLength={20}
              value={form.consentText} onChange={e=>setForm({...form,consentText:e.target.value})}/></label>
          <label className="block text-sm">通用完成反馈（不显示个人分数）
            <textarea className="input block w-full" rows={3} value={form.generalText}
              onChange={e=>setForm({...form,generalText:e.target.value})}/></label>
          <fieldset className="border p-3 rounded-lg"><legend className="font-semibold text-sm">本波次使用的研究工具</legend>
            {tools.filter(t=>t.status==='DRAFT').map(t=><label key={t.id} className="block text-sm my-2">
              <input type="checkbox" checked={form.instrumentIds.includes(t.id)}
                onChange={e=>toggle(t.id,e.target.checked)}/> {t.kind} · {t.title}</label>)}
            {!tools.filter(t=>t.status==='DRAFT').length&&<p className="text-xs">请先通过 Builder 创建研究工具。</p>}
          </fieldset>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">计划开放时间<input type="datetime-local" className="input block w-full"
              value={form.opensAt} onChange={e=>setForm({...form,opensAt:e.target.value})}/></label>
            <label className="block text-sm">结束新参与时间<input type="datetime-local" className="input block w-full"
              value={form.closesAt} onChange={e=>setForm({...form,closesAt:e.target.value})}/></label>
          </div>
          <label className="block text-sm">名额上限（留空为无限额，均受平台保护）
            <input type="number" min="1" step="1" className="input block w-full"
              value={form.quotaStarts} onChange={e=>setForm({...form,quotaStarts:e.target.value})}/></label>
          <label className="block text-sm"><input type="checkbox" checked={form.allowNewParticipants}
            onChange={e=>setForm({...form,allowNewParticipants:e.target.checked})}/>
            允许在本轮新领取研究编号并中途加入（T2+ 默认关闭）</label>
          <button type="submit" className="btn-primary" disabled={busy||!form.title||form.consentText.length<20}>
            {editing?'保存波次草稿':'创建波次'}</button>
        </form>}
        {editing&&<div className="rounded-lg border p-4 space-y-4">
          <h3 className="font-semibold">T{editing.ordinal} · {editing.title}</h3>
          <p className="text-sm">状态：{editing.status} · revision {editing.revision} · 已启动 {editing.startsCount}
            {editing.quotaStarts!==null?'/'+editing.quotaStarts:''}</p>
          <p className="text-sm">公开发布使用独立 Research Only 权限及不可变定义。此功能在最终 CI/上线批准前由后台开关关闭。</p>
          <div className="flex flex-wrap gap-2">
            {editing.status==='DRAFT'&&!editing.publicationId&&<>
              <button type="button" className="btn-secondary" disabled={busy} onClick={preflight}>检查知情同意与所有工具</button>
              <button type="button" className="btn-secondary" disabled={busy||!ready?.ok} onClick={()=>lifecycle('prepare')}>冻结研究定义</button>
            </>}
            {editing.status==='DRAFT'&&editing.publicationId&&
              <button type="button" className="btn-primary" disabled={busy} onClick={()=>lifecycle('open')}>正式开放本轮</button>}
            {editing.status==='OPEN'&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>lifecycle('pause')}>暂停新参与</button>}
            {editing.status==='PAUSED'&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>lifecycle('resume')}>恢复开放</button>}
            {['OPEN','PAUSED'].includes(editing.status)&&<>
              <button type="button" className="btn-secondary" disabled={busy} onClick={()=>lifecycle('close')}>结束招募</button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={()=>lifecycle('hard-stop')}>紧急终止</button>
            </>}
          </div>
          {ready&&<div className="rounded-lg border p-3 space-y-2">
            <p className="font-semibold text-sm">{ready.ok?'结构预检通过':'结构预检失败'}</p>
            {ready.checks.map(c=><div key={c.key} className="text-sm">
              <p>{c.key}：{c.ok?'通过':'需要修订'}</p>
              {c.issues.map((m,i)=><p role="alert" key={i} className="text-red-700">{m}</p>)}
            </div>)}
          </div>}
          {shareLink&&<div className="rounded-lg border p-3">
            <p>本次开放的一次性招募链接（只显示本次）：</p>
            <code className="block break-all text-sm my-3">{shareLink}</code>
            <button type="button" className="btn-secondary" onClick={()=>void navigator.clipboard.writeText(shareLink)}>
              复制研究链接</button>
            <p className="text-xs mt-2">链接中包含招募能力，勿上传到公开日志。被试的私密恢复凭证并不在此链接中。</p>
          </div>}
        </div>}
      </div>
    </div>
  </section>
}
