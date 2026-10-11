import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ResearchFormEditor } from './ResearchFormEditor'
import { ResearchScaleEditor } from './ResearchScaleEditor'
import { ResearchSjtEditor } from './ResearchSjtEditor'
import { ResearchPreview } from './ResearchPreview'
import type { ResearchDraft, Kind, Definition, FormDraft, ScaleDraft, SjtDraft, Issue } from './builder.types'
import { researchKey } from './builder.types'

type Envelope<T>={code:number|string;message:string;data:T|null}
type Summary=Pick<ResearchDraft,'id'|'kind'|'title'|'instrumentKey'|'revision'|'status'|'updatedAt'>
type Preview={revision:number;ok:boolean;issues:Issue[];definitionDigest?:string;scoringDigest?:string;
  kind:Kind;score?:{scores?:{key:string;value:number|null;status:string}[];metrics?:{key:string;value:number|null}[]}|null}
type BulkBatch={batchId:string;format:'TEXT'|'CSV';content:string;pageKey?:string;dimensionKey?:string}
type BulkResult={revision:number;count:number;ok:boolean;digest:string;issues:{line:number;message:string}[];
  items:{type:string;prompt:string;options:string[]}[]}
const getCookie=(name:string)=>document.cookie.split('; ').find(v=>v.startsWith(encodeURIComponent(name)+'='))?.split('=').slice(1).join('=')||''
async function api<T>(path:string,method='GET',payload?:unknown):Promise<T>{
  const headers:Record<string,string>={'Content-Type':'application/json'}
  if(method!=='GET'){
    let csrf=getCookie('huisurvey_research_csrf')
    if(!csrf){
      const res=await fetch('/api/survey/auth/csrf',{credentials:'same-origin'})
      if(!res.ok)throw new Error('研究者安全令牌获取失败')
      const body=await res.json() as Envelope<{csrfToken:string}>
      csrf=body.data?.csrfToken||''
    }
    if(!csrf)throw new Error('无法建立安全会话，请重新登录')
    headers['X-CSRF-Token']=decodeURIComponent(csrf)
  }
  const response=await fetch('/api/survey'+path,{method,headers,credentials:'same-origin',
    ...(payload===undefined?{}:{body:JSON.stringify(payload)})})
  const data=await response.json() as Envelope<T|{issues:Issue[]}>
  if(!response.ok||data.code!==0){
    const more=data.data as {issues?:Issue[]}|null
    const issues=more?.issues?.map(x=>x.path+': '+x.message).join('；')
    throw new Error(issues||data.message||'操作失败')
  }
  return data.data as T
}
const displayKind:Record<Kind,string>={FORM:'Form · 表单',SCALE:'Scale · 量表',SJT:'SJT · 情境判断'}
export function SurveyBuilder({projectId}:{projectId:string}){
  const prefix='/projects/'+encodeURIComponent(projectId)+'/instruments'
  const [instruments,setInstruments]=useState<Summary[]>([])
  const [active,setActive]=useState<ResearchDraft|null>(null),[dirty,setDirty]=useState(false)
  const [newKind,setNewKind]=useState<Kind>('FORM'),[newTitle,setNewTitle]=useState('')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [preview,setPreview]=useState<Preview|null>(null),[showPreview,setShowPreview]=useState(false)
  const [bulkText,setBulkText]=useState(''),[bulkFormat,setBulkFormat]=useState<'TEXT'|'CSV'>('TEXT')
  const [bulk,setBulk]=useState<{batch:BulkBatch;result:BulkResult}|null>(null)
  const [undo,setUndo]=useState<{definition:Definition;title:string}|null>(null)
  const refreshList=useCallback(async()=>{
    const r=await api<{list:Summary[]}>(prefix)
    setInstruments(r.list)
  },[prefix])
  useEffect(()=>{setActive(null);setPreview(null);setError('');setBulk(null);void refreshList().catch(e=>{
    setError(e instanceof Error?e.message:'研究工具列表无法加载')})},[refreshList])
  const run=async(task:()=>Promise<void>)=>{
    setBusy(true);setError('');setNotice('')
    try{await task()}catch(e){setError(e instanceof Error?e.message:'操作失败')}
    finally{setBusy(false)}
  }
  const select=async(id:string)=>{
    await run(async()=>{
      if(dirty&&!window.confirm('当前草稿存在未保存内容。确定放弃并切换研究工具？'))return
      const r=await api<ResearchDraft>(prefix+'/'+id)
      setActive(r);setDirty(false);setBulk(null);setPreview(null);setShowPreview(false);setUndo(null)
    })
  }
  const create=(event:FormEvent)=>{event.preventDefault();void run(async()=>{
    const item=await api<ResearchDraft>(prefix,'POST',{
      requestId:crypto.randomUUID(),instrumentKey:researchKey('i'),kind:newKind,title:newTitle.trim(),
    })
    await refreshList();setActive(item);setDirty(false);setPreview(null);setBulk(null);setNewTitle('')
    setNotice('已创建研究专用草稿，尚未进入正式测评目录')
  })}
  const change=(definition:Definition)=>{
    setActive(old=>old?{...old,definition}:old)
    setDirty(true);setPreview(null);setBulk(null);setUndo(null)
  }
  const save=()=>{if(!active||!dirty)return;const snapshot=active;void run(async()=>{
    const updated=await api<ResearchDraft>(prefix+'/'+snapshot.id,'PATCH',{
      revision:snapshot.revision,title:snapshot.title,definition:snapshot.definition,
    })
    setActive(updated);setDirty(false);setPreview(null);setBulk(null);setUndo(null)
    await refreshList();setNotice('草稿已保存；发布冻结将在研究波次阶段执行')
  })}
  const validate=()=>{if(!active||dirty)return;void run(async()=>{
    const result=await api<Preview>(prefix+'/'+active.id+'/validate','POST',{})
    setPreview(result);setShowPreview(result.ok)
    setNotice(result.ok?'结构与研究性计分编译已通过；这是非正式试答预览':'请先修正提示的结构问题')
  })}
  const simulate=(answers:Record<string,string|number|string[]>)=>{if(!active||dirty)return;void run(async()=>{
    const r=await api<Preview>(prefix+'/'+active.id+'/preview','POST',{answers})
    setPreview(r);setNotice(r.ok?'已根据后台现有计分器模拟计算，不会生成正式答卷':'模拟未通过，请检查作答和规则')
  })}
  const duplicate=()=>{if(!active)return;void run(async()=>{
    const r=await api<ResearchDraft>(prefix+'/'+active.id+'/copy','POST',{
      requestId:crypto.randomUUID(),instrumentKey:researchKey('i'),title:active.title+'（副本）',
    })
    await refreshList();setActive(r);setDirty(false);setPreview(null);setBulk(null)
    setNotice('已复制为新的独立研究工具，不能仅凭同名假定纵向可比')
  })}
  const archive=()=>{if(!active)return;void run(async()=>{
    await api(prefix+'/'+active.id+'/archive','POST',{revision:active.revision})
    setActive(null);setDirty(false);setPreview(null);setBulk(null)
    await refreshList();setNotice('草稿已归档')
  })}
  const bulkPreview=()=>{if(!active||dirty)return;void run(async()=>{
    const batch:BulkBatch={batchId:crypto.randomUUID(),format:bulkFormat,content:bulkText}
    const result=await api<BulkResult>(prefix+'/'+active.id+'/bulk-import/preview','POST',batch)
    setBulk({batch,result})
    setNotice(result.ok?'请检查以下题目，确认后再提交（不会提前写入数据）':'输入含错误，未写入任何题目')
  })}
  const bulkApply=()=>{if(!active||!bulk||dirty||!bulk.result.ok)return;void run(async()=>{
    const before={definition:structuredClone(active.definition),title:active.title}
    const updated=await api<ResearchDraft>(prefix+'/'+active.id+'/bulk-import/apply','POST',{
      revision:active.revision,digest:bulk.result.digest,batch:bulk.batch,
    })
    setUndo(before);setActive(updated);setDirty(false);setBulk(null);setPreview(null)
    await refreshList();setNotice('整批题目已导入。若需撤销，可使用撤销本次导入。')
  })}
  const undoImport=()=>{if(!active||!undo)return;void run(async()=>{
    const updated=await api<ResearchDraft>(prefix+'/'+active.id,'PATCH',{
      revision:active.revision,title:undo.title,definition:undo.definition,
    })
    setUndo(null);setActive(updated);setPreview(null);setDirty(false)
    await refreshList();setNotice('已撤销上一批导入')
  })}
  return <section className="bg-white border rounded-xl p-4 sm:p-6 my-5 space-y-5" aria-label="Survey Research Builder">
    <header><h2 className="text-xl font-semibold">研究工具 · Builder</h2>
      <p className="text-sm text-slate-600">创建 Form、描述性 Scale 和自编 SJT。研究工具仅限本人项目；不进入正式科学量表目录。</p>
    </header>
    {error&&<p role="alert" className="border-l-4 border-red-600 bg-red-50 p-3">{error}</p>}
    {notice&&<p role="status" className="border-l-4 border-teal-600 bg-teal-50 p-3">{notice}</p>}
    <form className="flex flex-wrap gap-3 items-end border-b pb-4" onSubmit={create}>
      <label className="text-sm">工具类型
        <select className="input block" value={newKind} onChange={e=>setNewKind(e.target.value as Kind)}>
          {Object.entries(displayKind).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select></label>
      <label className="text-sm flex-1 min-w-44">名称
        <input className="input block w-full" required maxLength={200} value={newTitle}
          onChange={e=>setNewTitle(e.target.value)} placeholder="如：学习动机前测"/></label>
      <button disabled={busy||!newTitle.trim()} className="btn-primary">创建草稿</button>
    </form>
    <div className="grid md:grid-cols-[220px_minmax(0,1fr)] gap-5">
      <nav aria-label="当前项目研究工具" className="space-y-2">
        <h3 className="font-semibold text-sm">工具列表</h3>
        {!instruments.length&&<p className="text-xs text-slate-500">暂无工具草稿</p>}
        {instruments.map(item=><button type="button" key={item.id}
          className={'block w-full text-left rounded-lg border p-3 '+(active?.id===item.id?'border-sky-700 bg-sky-50':'bg-white')}
          onClick={()=>void select(item.id)} disabled={busy}>
          <strong className="block text-sm break-words">{item.title}</strong>
          <span className="text-xs text-slate-600">{item.kind} · v{item.revision} · {item.status==='DRAFT'?'草稿':'已归档'}</span>
        </button>)}
      </nav>
      <div className="min-w-0 space-y-4">
      {!active&&<div className="border border-dashed rounded-xl p-6 text-sm text-slate-600">选择左侧草稿，或创建新的研究工具。完整作答和报告将在 PR3 阶段开放。</div>}
      {active&&<><div className="rounded-xl bg-slate-50 border p-4 space-y-3">
        <p className="text-xs">{displayKind[active.kind]} · 工具标识 <code>{active.instrumentKey}</code> · 修订 {active.revision} {dirty?'· 未保存':''}</p>
        <label className="text-sm block">研究工具名称
          <input className="input block w-full" value={active.title} maxLength={200} onChange={e=>{
            setActive(d=>d?{...d,title:e.target.value}:d);setDirty(true);setPreview(null)
          }}/></label>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" type="button" disabled={busy||!dirty||active.status==='ARCHIVED'} onClick={save}>保存草稿</button>
          <button className="btn-secondary" type="button" disabled={busy||dirty} onClick={validate}>结构检查与编译预览</button>
          <button className="btn-secondary" type="button" disabled={busy||dirty} onClick={duplicate}>复制为新工具</button>
          <button className="btn-secondary" type="button" disabled={busy||dirty||active.status==='ARCHIVED'} onClick={archive}>归档</button>
          {undo&&<button className="btn-secondary" type="button" disabled={busy||dirty} onClick={undoImport}>撤销本次导入</button>}
        </div>
        {dirty&&<p className="text-xs text-amber-700">请先保存。若另一个标签已经更新，服务器将拒绝旧 revision 的覆盖，本地内容不会被自动清除。</p>}
      </div>
      {active.status==='DRAFT'&&<>
        {active.kind==='FORM'&&<ResearchFormEditor value={active.definition as FormDraft} onChange={change} projectId={projectId}/>}
        {active.kind==='SCALE'&&<ResearchScaleEditor value={active.definition as ScaleDraft} onChange={change}/>}
        {active.kind==='SJT'&&<ResearchSjtEditor value={active.definition as SjtDraft} onChange={change} projectId={projectId}/>}
      </>}
      {active.kind!=='SJT'&&active.status==='DRAFT'&&<div className="border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">批量录入</h3>
        <p className="text-xs text-slate-600">文本：每道题用空行分隔，第一行是题干，后续行是选项。CSV：type,prompt,required,options,rows,dimension,reverse；选项使用 || 分隔。量表需要先建立维度并使用共享选项。</p>
        <label className="text-sm">输入格式<select className="input block" value={bulkFormat} onChange={e=>{
          setBulkFormat(e.target.value as 'TEXT'|'CSV');setBulk(null)}}>
          <option value="TEXT">多行文本</option><option value="CSV">标准 CSV</option></select></label>
        <textarea className="input block w-full" rows={7} value={bulkText} onChange={e=>{setBulkText(e.target.value);setBulk(null)}}
          placeholder={bulkFormat==='TEXT'?'今天上课我能集中注意力\nA. 从不\nB. 有时\nC. 经常\n\n今天我愿意主动提问\nA. 从不\nB. 有时\nC. 经常':'type,prompt,required,options,dimension\nSINGLE,今天我愿意提问,true,从不||有时||经常,'}/>
        <button type="button" className="btn-secondary" disabled={busy||dirty||!bulkText.trim()} onClick={bulkPreview}>解析并预览（不保存）</button>
        {bulk&&<div className="border rounded-lg p-3 space-y-2">
          <p className="font-semibold text-sm">候选题数：{bulk.result.count}</p>
          {bulk.result.issues.map((issue,i)=><p key={i} role="alert" className="text-sm text-red-700">第 {issue.line} 行：{issue.message}</p>)}
          {bulk.result.items.slice(0,50).map((item,i)=><p key={i} className="text-sm">{i+1}. {item.prompt}（{item.type}，{item.options.length} 个选项）</p>)}
          {bulk.result.ok&&<button className="btn-primary" type="button" disabled={busy||dirty||active.revision!==bulk.result.revision}
            onClick={bulkApply}>确认导入全部题目</button>}
        </div>}
      </div>}
      {preview&&<div className="border rounded-xl p-4 space-y-2">
        <h3 className="font-semibold">{preview.ok?'编译校验通过':'编译与结构问题'}</h3>
        <p className="text-xs break-words">草稿修订：{preview.revision} · 内容摘要：{preview.definitionDigest||'未计算'}</p>
        {preview.issues.map((issue,i)=><p key={i} className="text-sm text-red-700">{issue.path}：{issue.message}</p>)}
        {preview.score&&<div className="text-sm">
          <p className="font-semibold">研究内部模拟计分（不对被试开放）</p>
          {(preview.score.scores||preview.score.metrics||[]).map((s,i)=><p key={i}>{s.key}：{s.value??'不可计算'}</p>)}
        </div>}
      </div>}
      {preview?.ok&&!dirty&&<div>
        <button type="button" className="btn-secondary" onClick={()=>setShowPreview(x=>!x)}>
          {showPreview?'收起模拟作答':'展开模拟作答'}</button>
        {showPreview&&<ResearchPreview draft={active} onSimulate={simulate}/>}
      </div>}
      </>}
      </div>
    </div>
  </section>
}
