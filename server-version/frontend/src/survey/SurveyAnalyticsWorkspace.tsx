import { useEffect,useState,type FormEvent } from 'react'

type ApiResult<T>={code:number|string;message:string;data:T|null}
type WaveSummary={id:string;ordinal:number;title:string;status:string;
  starts:number;finalCompleted:number;uniqueLinkedCodes:number|null;excluded:number}
type Overview={projectId:string;collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES';source:string;note:string;waves:WaveSummary[]}
type Matched={baselineN:number;followupN:number;matchedN:number;attritionN:number;lateJoinN:number;note:string}
type ExportFormat='RAW_WAVE'|'RAW_LONG'|'RAW_WIDE'|'SCORE_LONG'|'SCORE_WIDE'
type Ticket={id:string;status:'READY';format:ExportFormat;expiresAt:string;
  manifest:{rowCount:number;columnCount:number}}
type Artifact={id:string;format:ExportFormat;csv:string;codebook:unknown;manifest:unknown}
const kindOptions:Record<ExportFormat,string>={
  RAW_WAVE:'单波次逐题原始数据',
  RAW_LONG:'全部波次逐题 Long',
  RAW_WIDE:'同编号逐题 Wide',
  SCORE_LONG:'全部波次探索性得分 Long',
  SCORE_WIDE:'同编号探索性得分 Wide',
}
async function api<T>(endpoint:string,method='GET',body?:unknown):Promise<T>{
  const headers:Record<string,string>={'Content-Type':'application/json'}
  if(method!=='GET'){
    let csrf=document.cookie.split('; ').find(x=>x.startsWith('huisurvey_research_csrf='))
      ?.split('=').slice(1).join('=')||''
    if(!csrf){
      const r=await fetch('/api/survey/auth/csrf',{credentials:'same-origin'})
      if(!r.ok)throw new Error('未能获取安全校验')
      const data=await r.json() as ApiResult<{csrfToken:string}>
      csrf=data.data?.csrfToken||''
    }
    headers['X-CSRF-Token']=decodeURIComponent(csrf)
  }
  const response=await fetch('/api/survey'+endpoint,{
    method,credentials:'same-origin',headers,
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  })
  const result=await response.json() as ApiResult<T>
  if(!response.ok||result.code!==0||result.data===null)
    throw new Error(result.message||'操作失败')
  return result.data
}
const downloadBlob=(filename:string,value:string,mime:string)=>{
  const blob=new Blob([value],{type:mime})
  const url=URL.createObjectURL(blob)
  const anchor=document.createElement('a')
  anchor.href=url;anchor.download=filename
  document.body.append(anchor);anchor.click();anchor.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),3000)
}
export function SurveyAnalyticsWorkspace({projectId}:{projectId:string}){
  const [overview,setOverview]=useState<Overview|null>(null)
  const [baseline,setBaseline]=useState(''),[followup,setFollowup]=useState('')
  const [paired,setPaired]=useState<Matched|null>(null)
  const [format,setFormat]=useState<ExportFormat>('RAW_WAVE'),[waveId,setWaveId]=useState('')
  const [otp,setOtp]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const [error,setError]=useState(''),[ticket,setTicket]=useState<Ticket|null>(null)
  const base='/projects/'+projectId
  const reload=async()=>{
    const res=await api<Overview>(base+'/analytics/overview')
    setOverview(res)
    const ordered=res.waves
    if(ordered[0]){setWaveId(ordered[0].id);setBaseline(ordered[0].id)}
    if(ordered[1])setFollowup(ordered[1].id)
  }
  useEffect(()=>{
    setOverview(null);setError('');setTicket(null);setPaired(null)
    void reload().catch(e=>setError(e instanceof Error?e.message:'研究分析尚不可用'))
  },[projectId])
  const execute=async(fn:()=>Promise<void>)=>{
    setBusy(true);setError('');setMessage('')
    try{await fn()}catch(e){setError(e instanceof Error?e.message:'请求未完成')}finally{setBusy(false)}
  }
  const compare=()=>void execute(async()=>{
    setPaired(await api<Matched>(base+'/analytics/paired-counts','POST',{
      baselineWaveId:baseline,followupWaveId:followup,
    }))
  })
  const stepUp=(e:FormEvent)=>{e.preventDefault();void execute(async()=>{
    await api('/auth/mfa/step-up','POST',{code:otp.trim()})
    setOtp('');setMessage('已完成最新 TOTP 二次认证；敏感导出仅在接下来的五分钟内有效。')
  })}
  const createExport=()=>void execute(async()=>{
    const result=await api<Ticket>(base+'/exports','POST',{
      format,...(format==='RAW_WAVE'?{waveId}:{}),
    })
    setTicket(result)
    setMessage('加密数据已生成，可在十分钟有效期内按项目权限下载。')
  })
  const download=()=>{if(!ticket)return;void execute(async()=>{
    const artifact=await api<Artifact>(base+'/exports/'+ticket.id+'/download')
    const baseName='survey_'+projectId.slice(0,8)+'_'+artifact.format.toLowerCase()
    downloadBlob(baseName+'.csv','\uFEFF'+artifact.csv,'text/csv;charset=utf-8')
    downloadBlob(baseName+'_codebook.json',JSON.stringify(artifact.codebook,null,2),'application/json;charset=utf-8')
    downloadBlob(baseName+'_manifest.json',JSON.stringify(artifact.manifest,null,2),'application/json;charset=utf-8')
    setMessage('已生成 CSV、变量编码字典和来源 Manifest。请妥善保管研究编号与自由文本。')
  })}
  return <section className="border rounded-xl bg-white p-4 sm:p-6 my-5 space-y-4" aria-label="研究数据">
    <header><h2 className="text-xl font-semibold">研究数据 · Wave Analytics</h2>
      <p className="text-sm text-slate-600">完成与配对统计只来源于可核对的加密 Survey FINAL；研究编号数不等于经过实名验证的自然人数。</p></header>
    {error&&<p role="alert" className="border-l-4 border-red-600 bg-red-50 p-3">{error}</p>}
    {message&&<p role="status" className="border-l-4 border-teal-600 bg-teal-50 p-3">{message}</p>}
    <button className="btn-secondary" disabled={busy} onClick={()=>void execute(reload)}>刷新完成进度</button>
    {overview&&<><div className="overflow-x-auto"><table className="w-full text-sm border-collapse">
      <thead><tr className="bg-slate-100"><th className="p-2 text-left">波次</th><th className="p-2">状态</th>
        <th className="p-2">已启动</th><th className="p-2">完成 FINAL</th>
        <th className="p-2">研究编号数</th><th className="p-2">排除</th></tr></thead>
      <tbody>{overview.waves.map(w=><tr key={w.id} className="border-b">
        <th scope="row" className="p-2 text-left">T{w.ordinal} · {w.title}</th><td className="p-2 text-center">{w.status}</td>
        <td className="p-2 text-center">{w.starts}</td><td className="p-2 text-center">{w.finalCompleted}</td>
        <td className="p-2 text-center">{w.uniqueLinkedCodes??'不可关联'}</td>
        <td className="p-2 text-center">{w.excluded}</td></tr>)}</tbody></table></div>
      <p className="text-xs text-slate-600">{overview.note}</p>
      {overview.collectionMode==='LINKED_WAVES'&&overview.waves.length>=2&&<div className="border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">纵向匹配 · 有效完成记录</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">基线<select className="input block" value={baseline}
            onChange={e=>setBaseline(e.target.value)}>{overview.waves.map(w=>
              <option key={w.id} value={w.id}>T{w.ordinal} {w.title}</option>)}</select></label>
          <label className="text-sm">后测<select className="input block" value={followup}
            onChange={e=>setFollowup(e.target.value)}>{overview.waves.map(w=>
              <option key={w.id} value={w.id}>T{w.ordinal} {w.title}</option>)}</select></label>
          <button type="button" className="btn-secondary" disabled={busy||baseline===followup} onClick={compare}>计算匹配答卷数</button>
        </div>
        {paired&&<div className="text-sm grid sm:grid-cols-3 gap-3">
          <p>基线完成 <strong>{paired.baselineN}</strong></p><p>后测完成 <strong>{paired.followupN}</strong></p>
          <p>真正匹配 <strong>{paired.matchedN}</strong></p><p>失访 <strong>{paired.attritionN}</strong></p>
          <p>中途加入 <strong>{paired.lateJoinN}</strong></p>
          <p className="sm:col-span-3 text-xs">{paired.note} 量表配对得分只能在确定可比的工具版本下进一步计算。</p>
        </div>}
      </div>}
      <div className="border rounded-xl p-4 space-y-4">
        <h3 className="font-semibold">匿名科研数据导出</h3>
        <p className="text-sm">导出可能包含自由文本或研究编号，请确认研究用途与数据保存规定。当前交互式导出每次最多处理 250 份 FINAL，且生成文件总量不超过 2MB。大样本请分波次导出。</p>
        <form className="flex flex-wrap gap-3 items-end" onSubmit={stepUp}>
          <label className="text-sm">最新 TOTP 动态验证码
            <input className="input block" inputMode="numeric" type="password" autoComplete="off"
              value={otp} onChange={e=>setOtp(e.target.value)} placeholder="6 位验证码"/></label>
          <button className="btn-secondary" disabled={busy||otp.length<6}>完成五分钟内二次认证</button>
        </form>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">数据格式
            <select className="input block" value={format} onChange={e=>{setFormat(e.target.value as ExportFormat);setTicket(null)}}>
              {Object.entries(kindOptions).filter(([kind])=>
                overview.collectionMode==='LINKED_WAVES'||!kind.includes('WIDE'))
                .map(([kind,label])=><option key={kind} value={kind}>{label}</option>)}
            </select></label>
          {format==='RAW_WAVE'&&<label className="text-sm">波次
            <select className="input block" value={waveId} onChange={e=>setWaveId(e.target.value)}>
              {overview.waves.map(w=><option key={w.id} value={w.id}>T{w.ordinal} {w.title}</option>)}
            </select></label>}
          <button type="button" className="btn-primary" disabled={busy||format==='RAW_WAVE'&&!waveId}
            onClick={createExport}>创建受控导出</button>
        </div>
        {ticket&&<div className="border rounded-lg p-3 space-y-2">
          <p className="text-sm">导出 {ticket.format} · {ticket.manifest.rowCount} 行 ·
            {ticket.manifest.columnCount} 列</p>
          <p className="text-xs">到期：{new Date(ticket.expiresAt).toLocaleString('zh-CN')}</p>
          <button type="button" className="btn-secondary" disabled={busy} onClick={download}>
            下载 CSV、Codebook 与 Manifest</button>
        </div>}
      </div>
    </>}
  </section>
}
