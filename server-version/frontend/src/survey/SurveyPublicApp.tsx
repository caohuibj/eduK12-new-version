import { useEffect, useMemo, useState, type FormEvent } from 'react'

type ApiResult<T>={code:number|string;message:string;data:T|null}
type Wave={id:string;title:string;ordinal:number;status:string;consentText:string;consentVersion:number;
  opensAt:string|null;closesAt:string|null;allowNewParticipants:boolean;attempt?:{id:string;status:string}|null}
type StudyInfo={project:{name:string;description:string;collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES';status:string};waves:Wave[]}
type Choice={optionKey:string;label:string}
type Question={itemKey:string;questionKey?:string;type:string;prompt:string;required:boolean;
  options:Choice[];rows?:{rowKey:string;label:string}[];allowRefusal?:boolean;displayIf?:{itemKey:string;operator:'EQUALS'|'INCLUDES';optionKey:string};
  min?:number;max?:number;maxLength?:number}
type Unit={kind:'FORM'|'SCALE'|'SJT';instrumentKey:string;title:string;
  stimulus?:string;scenarioTitle?:string;
  pages?:{pageKey:string;title:string;questions:Question[]}[];
  responseOptions?:Choice[];
  items?:Question[];
  questions?:{questionKey:string;prompt:string;options:Choice[]}[]}
type Task={attemptId:string;waveId:string;status:string;definitionDigest:string;units:Unit[];reportMode:'GENERAL_ONLY'}
type General={kind:'GENERAL_ONLY';text:string;disclaimer:string;completedAt:string}
type Answer=string|number|string[]|null
const safePattern=/^[a-f0-9-]{36}$/i
const parseError=(e:unknown)=>e instanceof Error?e.message:'研究访问失败，请重试'
const publicApi=async <T,>(path:string,method='GET',body?:unknown):Promise<T>=>{
  const result=await fetch('/api/public/survey'+path,{method,credentials:'omit',
    cache:'no-store',headers:{'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})})
  const envelope=await result.json() as ApiResult<T>
  if(!result.ok||envelope.code!==0||!envelope.data)throw new Error(envelope.message||'操作未完成')
  return envelope.data
}
function TaskForm({unit,answer,onChange}:{unit:Unit;answer:Record<string,Answer>;
  onChange:(name:string,value:Answer)=>void}){
  const visible=(q:Question)=>{
    if(!q.displayIf)return true
    const prior=answer[q.displayIf.itemKey]
    return q.displayIf.operator==='INCLUDES'
      ?Array.isArray(prior)&&prior.includes(q.displayIf.optionKey)
      :prior===q.displayIf.optionKey
  }
  const choice=(q:Question,options:Choice[],kind:'SINGLE'|'MULTIPLE'|'MATRIX'|'LIKERT')=>
    kind==='MULTIPLE'?options.map(o=>{
      const selected=Array.isArray(answer[q.itemKey])?answer[q.itemKey] as string[]:[]
      return <label className="block my-2 text-sm" key={o.optionKey}>
        <input type="checkbox" checked={selected.includes(o.optionKey)}
          onChange={e=>onChange(q.itemKey,e.target.checked?[...selected,o.optionKey]:
            selected.filter(s=>s!==o.optionKey))}/> {o.label}</label>
    }):options.map(o=><label className="block my-2 text-sm" key={o.optionKey}>
      <input type="radio" name={unit.instrumentKey+'-'+q.itemKey}
        checked={answer[q.itemKey]===o.optionKey}
        onChange={()=>onChange(q.itemKey,o.optionKey)}/> {o.label}</label>)
  const item=(q:Question)=>{
    if(!visible(q))return null
    return <fieldset className="border rounded-lg p-4 my-4 bg-white" key={q.itemKey}>
      <legend className="font-medium text-sm">{q.prompt}{q.required?' *':''}</legend>
      {['SINGLE','LIKERT','MULTIPLE'].includes(q.type)&&choice(q,q.options,q.type as 'SINGLE'|'LIKERT'|'MULTIPLE')}
      {q.type==='MATRIX'&&<div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr><th scope="col">项目</th>{q.options.map(o=><th scope="col" key={o.optionKey}>{o.label}</th>)}
          {q.allowRefusal&&<th scope="col">不愿回答</th>}</tr></thead>
        <tbody>{(q.rows||[]).map(row=><tr key={row.rowKey}><th scope="row">{row.label}</th>{q.options.map(o=><td className="text-center" key={o.optionKey}>
          <input type="radio" name={unit.instrumentKey+'-'+q.itemKey+'-'+row.rowKey}
            checked={answer[q.itemKey+':'+row.rowKey]===o.optionKey}
            onChange={()=>onChange(q.itemKey+':'+row.rowKey,o.optionKey)}/>
        </td>)}
        {q.allowRefusal&&<td className="text-center"><input type="radio"
          aria-label={'不愿回答：'+row.label}
          name={unit.instrumentKey+'-'+q.itemKey+'-'+row.rowKey}
          checked={answer[q.itemKey+':'+row.rowKey]==='REFUSED'}
          onChange={()=>onChange(q.itemKey+':'+row.rowKey,'REFUSED')}/></td>}</tr>)}</tbody></table></div>}
      {q.type==='NUMBER'&&<input className="input block w-full" type="number" min={q.min} max={q.max}
        aria-label={q.prompt} value={answer[q.itemKey]==='REFUSED'?'':answer[q.itemKey]??''}
        disabled={answer[q.itemKey]==='REFUSED'}
        onChange={e=>onChange(q.itemKey,e.target.value===''?null:Number(e.target.value))}/>}
      {q.allowRefusal&&q.type!=='MATRIX'&&<label className="block my-3 text-sm">
        <input type="checkbox" checked={answer[q.itemKey]==='REFUSED'}
          onChange={e=>onChange(q.itemKey,e.target.checked?'REFUSED':null)}/>
        我选择不回答这一题（REFUSED）
      </label>}
      {['SHORT_TEXT','LONG_TEXT'].includes(q.type)&&<textarea className="input block w-full" aria-label={q.prompt}
        rows={q.type==='SHORT_TEXT'?2:5} maxLength={q.maxLength??(q.type==='SHORT_TEXT'?300:10000)}
        value={answer[q.itemKey]==='REFUSED'?'':String(answer[q.itemKey]??'')}
        disabled={answer[q.itemKey]==='REFUSED'}
        onChange={e=>onChange(q.itemKey,e.target.value)}/>}
    </fieldset>
  }
  return <section className="border rounded-xl bg-slate-50 p-4 my-5">
    <h3 className="text-lg font-semibold">{unit.title}</h3>
    {unit.kind==='FORM'&&unit.pages?.map(page=><div key={page.pageKey}>
      <h4 className="mt-4 font-medium">{page.title}</h4>{page.questions.map(item)}</div>)}
    {unit.kind==='SCALE'&&unit.items?.map(q=>item({...q,type:'LIKERT',options:unit.responseOptions||[]}))}
    {unit.kind==='SJT'&&<><p className="mt-2 font-medium">{unit.scenarioTitle}</p>
      <p className="whitespace-pre-wrap mb-4 text-sm">{unit.stimulus}</p>
      {unit.questions?.map(q=>item({itemKey:q.questionKey,type:'SINGLE',
        prompt:q.prompt,options:q.options,required:true}))}</>}
  </section>
}
/** Research participants have NO platform account or Student/Teacher session.
 * This UI contains no researcher or management cookie-based fallbacks.
 */
export default function SurveyPublicApp(){
  const publicId=useMemo(()=>window.location.pathname.match(/^\/r\/([a-f0-9-]{36})$/i)?.[1]||'',[])
  const [entryToken]=useState(()=>new URLSearchParams(window.location.hash.replace(/^#/,'' )).get('entry')||'')
  const [info,setInfo]=useState<StudyInfo|null>(null),[loading,setLoading]=useState(true)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [researchCode,setResearchCode]=useState(''),[accessCredential,setAccessCredential]=useState('')
  const [proofReceived,setProofReceived]=useState(false),[home,setHome]=useState<Wave[]|null>(null)
  const [selectedWave,setSelectedWave]=useState<Wave|null>(null),[agreed,setAgreed]=useState(false)
  const [task,setTask]=useState<Task|null>(null),[answers,setAnswers]=useState<Record<string,Record<string,Answer>>>({})
  const [attemptId,setAttemptId]=useState(''),[submissionId,setSubmissionId]=useState('')
  const [general,setGeneral]=useState<General|null>(null),[notice,setNotice]=useState('')
  const [withdrawn,setWithdrawn]=useState(false)
  const base='/r/'+publicId
  useEffect(()=>{
    document.title='Huisurvey · 研究参与'
    // Recruitment capability stays in memory, not browser history/Referrer.
    window.history.replaceState(null,'',window.location.pathname)
    if(!safePattern.test(publicId)){setError('研究链接格式不正确');setLoading(false);return}
    void publicApi<StudyInfo>(base+'/info').then(setInfo)
      .catch(e=>setError(parseError(e))).finally(()=>setLoading(false))
  },[base,publicId])
  const run=async(task:()=>Promise<void>)=>{
    setError('');setNotice('');setBusy(true)
    try{await task()}catch(e){setError(parseError(e))}finally{setBusy(false)}
  }
  const recover=(e:FormEvent)=>{e.preventDefault();void run(async()=>{
    const data=await publicApi<{waves:Wave[]}>(base+'/enter','POST',{
      researchCode:researchCode.trim().toUpperCase(),accessCredential:accessCredential.trim(),
    })
    setResearchCode(x=>x.trim().toUpperCase());setAccessCredential(x=>x.trim())
    setHome(data.waves);setProofReceived(false)
  })}
  const join=(wave:Wave)=>void run(async()=>{
    const result=await publicApi<{researchCode:string;accessCredential:string}>(
      base+'/waves/'+wave.id+'/join','POST',{entryToken,consent:true,consentVersion:wave.consentVersion})
    setResearchCode(result.researchCode);setAccessCredential(result.accessCredential)
    setProofReceived(true);setNotice('此研究编号与私密恢复凭证只显示在当前设备页面，请分别妥善保存。')
  })
  const chooseWave=(wave:Wave)=>{setSelectedWave(wave);setAgreed(false);setTask(null);setGeneral(null);setWithdrawn(false)}
  const loadTask=async(id:string,code:string,secret:string)=>{
    const data=await publicApi<Task>(base+'/attempts/'+id+'/task','POST',{
      ...(code?{researchCode:code}:{}),accessCredential:secret,
    })
    setAttemptId(id)
    setSubmissionId(crypto.randomUUID())
    setTask(data)
    setAnswers({})
    if(data.status==='COMPLETED'){
      const result=await publicApi<General>(base+'/attempts/'+id+'/general','POST',{
        ...(code?{researchCode:code}:{}),accessCredential:secret,
      })
      setGeneral(result)
    }
  }
  const start=()=>{if(!selectedWave||!agreed)return;void run(async()=>{
    const wave=selectedWave
    if(info?.project.collectionMode==='LINKED_WAVES'&&wave.attempt){
      await loadTask(wave.attempt.id,researchCode.trim().toUpperCase(),accessCredential.trim())
      return
    }
    if(info?.project.collectionMode==='LINKED_WAVES'){
      if(!researchCode||!accessCredential)throw new Error('请先获取或输入研究编号及私密恢复凭证')
      const started=await publicApi<{attemptId:string}>(base+'/waves/'+wave.id+'/start','POST',{
        researchCode:researchCode.trim().toUpperCase(),accessCredential:accessCredential.trim(),
        consent:true,consentVersion:wave.consentVersion,
      })
      await loadTask(started.attemptId,researchCode.trim().toUpperCase(),accessCredential.trim())
    }else{
      const started=await publicApi<{attemptId:string;accessCredential:string}>(
        base+'/waves/'+wave.id+'/start-unlinked','POST',{
          entryToken,consent:true,consentVersion:wave.consentVersion,
        })
      setAccessCredential(started.accessCredential)
      setNotice('这是本次匿名回答的临时凭证。离开当前页面前请完成作答。')
      await loadTask(started.attemptId,'',started.accessCredential)
    }
  })}
  const submit=(e:FormEvent)=>{e.preventDefault();if(!task||!attemptId)return;void run(async()=>{
    // Match the frozen conditional form. An earlier selection change must
    // clear fields that are now hidden; the server repeats this validation.
    const payload=Object.fromEntries(task.units.map(unit=>{
      const original=answers[unit.instrumentKey]||{}
      const cleaned:Record<string,Answer>={...original}
      if(unit.kind==='FORM'){
        const checked:Record<string,Answer>={}
        for(const page of unit.pages||[])for(const q of page.questions){
          const prior=q.displayIf?checked[q.displayIf.itemKey]:null
          const shown=!q.displayIf||
            (q.displayIf.operator==='INCLUDES'
              ?Array.isArray(prior)&&prior.includes(q.displayIf.optionKey)
              :prior===q.displayIf.optionKey)
          if(!shown){
            delete cleaned[q.itemKey]
            for(const row of q.rows||[])delete cleaned[q.itemKey+':'+row.rowKey]
          }
          checked[q.itemKey]=shown?(cleaned[q.itemKey]??null):null
        }
      }
      return [unit.instrumentKey,cleaned]
    }))
    const final=await publicApi<{status:string}>(base+'/attempts/'+attemptId+'/final','POST',{
      ...(info?.project.collectionMode==='LINKED_WAVES'?{researchCode:researchCode.trim().toUpperCase()}:{}),
      accessCredential:accessCredential.trim(),submissionId,answers:payload,
    })
    if(final.status!=='COMPLETED')throw new Error('作答尚未完成提交')
    const generalResult=await publicApi<General>(base+'/attempts/'+attemptId+'/general','POST',{
      ...(info?.project.collectionMode==='LINKED_WAVES'?{researchCode:researchCode.trim().toUpperCase()}:{}),
      accessCredential:accessCredential.trim(),
    })
    setGeneral(generalResult)
    setTask(null)
    setNotice('提交成功。系统不会提供未经验证的诊断或常模等级。')
  })}
  const withdraw=()=>{if(!general)return
    if(!window.confirm(
      '确认申请撤回本研究可定位的数据吗？后续统计和新导出将排除这些记录；此前合法保存的研究资料仍须按研究说明处理，已下载的外部副本无法自动追回。'
    ))return
    void run(async()=>{
      if(info?.project.collectionMode==='LINKED_WAVES'){
        await publicApi(base+'/withdraw-linked','POST',{
          researchCode:researchCode.trim().toUpperCase(),
          accessCredential:accessCredential.trim(),
        })
      }else{
        await publicApi(base+'/attempts/'+attemptId+'/withdraw-data','POST',{
          accessCredential:accessCredential.trim(),
        })
      }
      setWithdrawn(true);setGeneral(null);setTask(null);setHome(null)
      setResearchCode('');setAccessCredential('')
      setNotice('已记录撤回请求。相关回答将从后续统计和新导出排除；物理删除与历史留存按研究说明处理。')
    })
  }

  const returnHome=()=>void run(async()=>{
    const data=await publicApi<{waves:Wave[]}>(base+'/enter','POST',{
      researchCode:researchCode.trim().toUpperCase(),accessCredential:accessCredential.trim(),
    })
    setHome(data.waves);setSelectedWave(null);setGeneral(null);setTask(null)
  })
  return <div className="min-h-screen bg-slate-50 text-slate-800">
    <header className="border-b bg-white"><div className="max-w-3xl mx-auto p-5">
      <h1 className="text-2xl font-semibold">Huisurvey</h1>
      <p className="text-sm text-slate-500">观风知微 · 研究参与</p></div></header>
    <main className="max-w-3xl mx-auto p-4 sm:p-7 space-y-5">
      {loading&&<p role="status">正在读取研究说明…</p>}
      {error&&<p role="alert" className="border-l-4 border-red-600 bg-red-50 p-3">{error}</p>}
      {notice&&<p role="status" className="border-l-4 border-teal-600 bg-teal-50 p-3">{notice}</p>}
      {withdrawn&&<p role="status" className="border-l-4 border-teal-600 p-4">
        您的研究数据撤回请求已被记录。后续统计和新导出将排除可定位回答。
      </p>}
      {info&&<><section className="bg-white rounded-xl border p-5">
        <h2 className="text-xl font-semibold">{info.project.name}</h2>
        <p className="my-3 whitespace-pre-wrap">{info.project.description}</p>
        <p className="text-sm">{info.project.collectionMode==='LINKED_WAVES'
          ?'多波次研究：同一研究编号的回答将在本研究内关联。无需登录或提供真实姓名。'
          :'独立匿名研究：本次作答不与其他波次关联，无需登录或提供真实姓名。'}</p>
      </section>
      {info.project.collectionMode==='LINKED_WAVES'&&!home&&!task&&!general&&<section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-lg">已有研究编号 · 继续参加后续波次</h3>
        <p className="text-sm my-2">公开研究编号不是登录密码，必须同时提供本人私密恢复凭证。</p>
        <form onSubmit={recover} className="grid gap-3">
          <label>研究编号<input className="input block w-full" value={researchCode}
            onChange={e=>setResearchCode(e.target.value)} autoComplete="off" placeholder="R-…"/></label>
          <label>私密恢复凭证<input className="input block w-full" type="password" autoComplete="off"
            value={accessCredential} onChange={e=>setAccessCredential(e.target.value)}/></label>
          <button className="btn-primary" disabled={busy||!researchCode||!accessCredential}>读取我的波次任务</button>
        </form>
      </section>}
      {info.project.collectionMode==='LINKED_WAVES'&&proofReceived&&<section className="bg-white rounded-xl border-2 border-teal-600 p-5">
        <h3 className="font-semibold text-lg">请保存研究身份</h3>
        <p className="text-sm">研究编号可供本项目数据匹配；**私密恢复凭证不可交给研究者或其他人**。页面关闭后不再显示原始密钥。</p>
        <p className="mt-3">研究编号</p><code className="block bg-slate-100 p-3 break-all">{researchCode}</code>
        <p className="mt-3">私密恢复凭证</p><code className="block bg-slate-100 p-3 break-all">{accessCredential}</code>
        <button className="btn-secondary mt-3" type="button" onClick={()=>setProofReceived(false)}>
          我已分别保存这两个凭证</button>
      </section>}
      {!task&&!general&&<section className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-lg">研究波次</h3>
        {(home||info.waves).map(wave=><div key={wave.id} className="border-b py-3 flex items-center justify-between gap-3">
          <div><strong>第 {wave.ordinal} 轮 · {wave.title}</strong>
            <p className="text-sm text-slate-500">{wave.status==='OPEN'?'开放采集中':wave.status==='CLOSED'?'已结束':'尚未开放'}
              {wave.attempt?' · '+(wave.attempt.status==='COMPLETED'?'已完成':'进行中'):''}</p>
          </div>
          <button className="btn-secondary" disabled={busy||(wave.status!=='OPEN'&&!wave.attempt)}
            onClick={()=>chooseWave(wave)}>{wave.attempt?.status==='COMPLETED'?'查看回执':'选择本轮'}</button>
        </div>)}
        {selectedWave&&<div className="bg-slate-50 border rounded-lg p-4 mt-4 space-y-3">
          <h4 className="font-semibold">本轮知情同意 · {selectedWave.title}</h4>
          <p className="whitespace-pre-wrap text-sm">{selectedWave.consentText}</p>
          {info.project.collectionMode==='LINKED_WAVES'&&<p className="text-sm text-sky-800">
            本研究以随机编号关联该研究内的多次回答；它是研究内假名化，不是完全不可关联的匿名。</p>}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={agreed}
            onChange={e=>setAgreed(e.target.checked)}/>
            我已阅读并同意本轮研究说明及相应的数据关联范围。</label>
          {info.project.collectionMode==='LINKED_WAVES'&&!researchCode&&<button
            className="btn-secondary" disabled={busy||!agreed||!entryToken}
            onClick={()=>join(selectedWave)}>首次参加 · 领取随机研究编号</button>}
          <button className="btn-primary" disabled={busy||!agreed||
            (info.project.collectionMode==='LINKED_WAVES'?(!researchCode||!accessCredential):!entryToken)}
            onClick={start}>{selectedWave.attempt?.status==='COMPLETED'?'查看完成情况':'开始或恢复本轮作答'}</button>
        </div>}
      </section>}
      {task&&!general&&<form className="space-y-5" onSubmit={submit}>
        <div className="bg-white border rounded-xl p-4"><h3 className="font-semibold">本轮研究作答</h3>
          <p className="text-sm text-slate-500">请按实际情况回答。研究内部计分不作为个人诊断反馈。</p></div>
        {task.units.map(unit=><TaskForm key={unit.instrumentKey} unit={unit}
          answer={answers[unit.instrumentKey]||{}} onChange={(key,value)=>setAnswers(previous=>({
            ...previous,[unit.instrumentKey]:{...(previous[unit.instrumentKey]||{}),[key]:value},
          }))}/>)}
        <button className="btn-primary" disabled={busy}>提交本轮正式回答</button>
      </form>}
      {general&&<section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="text-xl font-semibold">本轮回答已完成</h2>
        <p className="whitespace-pre-wrap">{general.text}</p>
        <p className="text-sm text-slate-600">{general.disclaimer}</p>
        <p className="text-xs">完成时间：{new Date(general.completedAt).toLocaleString('zh-CN')}</p>
        <div className="flex flex-wrap gap-3">
          {info.project.collectionMode==='LINKED_WAVES'&&<button className="btn-secondary"
            disabled={busy} onClick={returnHome}>返回我的研究波次</button>}
          <button className="btn-secondary" type="button" disabled={busy} onClick={withdraw}>
            申请撤回本研究数据（排除未来统计）</button>
        </div>
      </section>}
      </>}
    </main></div>
}
