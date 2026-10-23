import { useEffect, useState } from 'react'
import { SourceProvenance, type CatalogApi, type CatalogGrant, type CatalogSourceRef } from '../../survey/ResearchCatalog'
import type { Kind } from '../../survey/builder.types'
type Source={ref:CatalogSourceRef;title:string;available:boolean;unsupportedReason?:string;definitionDigest?:string}
type SourcePage={list:Source[];page:number;hasMore:boolean;terminalReason:'PAGE_LIMIT_REACHED'|'END_OF_CATALOG'|null}
const emptySourcePage:SourcePage={list:[],page:1,hasMore:false,terminalReason:null}
export function SurveyCatalogGrants({api,password,researchers,ensureVerification}:{api:CatalogApi;password:string;researchers:{id:string;username:string;status:string}[];ensureVerification?:(context:string)=>boolean}){
  const [researcherId,setResearcherId]=useState(''),[kind,setKind]=useState<Kind>('SCALE')
  const [sourcePage,setSourcePage]=useState<SourcePage>(emptySourcePage),[grants,setGrants]=useState<CatalogGrant[]>([]),[grantPage,setGrantPage]=useState(1)
  const {list:sources,page,hasMore,terminalReason}=sourcePage
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [queried,setQueried]=useState(false)
  const selectedResearcher=researchers.find(r=>r.id===researcherId)
  const canGrant=!!selectedResearcher&&['ACTIVE','PENDING_MFA'].includes(selectedResearcher.status)
  const objectName=selectedResearcher?.username||'未选择研究者'
  useEffect(()=>{if(researcherId&&!researchers.some(r=>r.id===researcherId)){setResearcherId('');setGrants([])}},[researchers,researcherId])
  const run=async(task:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await task()}catch(e){setError(e instanceof Error?e.message:'操作失败')}finally{setBusy(false)}}
  const loadSources=async(next=1)=>{
    const data=await api<SourcePage>('/source-catalog?kind='+kind+'&page='+next)
    setSourcePage(data)
    setQueried(true)
  }
  const loadGrants=async(id=researcherId,next=1)=>{const data=await api<{list:CatalogGrant[]}>('/researchers/'+encodeURIComponent(id)+'/tool-grants?page='+next);setGrants(data.list);setGrantPage(next)}
  const canWrite=(context:string)=>ensureVerification?ensureVerification(context):Boolean(password)
  const grant=async(source:Source)=>{
    await api('/researchers/'+encodeURIComponent(researcherId)+'/tool-grants','POST',{currentPassword:password,source:source.ref})
    setNotice('已向 '+objectName+' 授权 '+source.title+' · 版本 '+source.ref.sourceVersion+'；研究者可在自己的项目中导入。')
    try{await loadGrants()}catch{setError('版本授权已完成，但授权列表刷新失败。请仅重选该研究者刷新列表，不要重复授权。')}
  }
  return <section className="survey-admin-panel" aria-label="研究工具版本授权">
    <h2 className="text-xl font-semibold">研究工具版本授权</h2>
    <p className="text-sm">从原来源目录选择明确版本。原来源的学校、组织、版权与发布边界保持不变，不授予研究原始答案访问权。</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {busy&&<p role="status">正在读取或更新工具授权，请稍候…</p>}
    <fieldset disabled={busy} className="space-y-3">
      <label className="block">授权给研究者<select className="input block w-full" value={researcherId} onChange={e=>{const id=e.target.value;setResearcherId(id);setGrants([]);setGrantPage(1);setError('');setNotice('');if(id)void run(()=>loadGrants(id))}}>
        <option value="">从当前研究者列表选择</option>{researchers.filter(r=>r.status!=='REVOKED').map(r=><option value={r.id} key={r.id}>{r.username} · {r.status}</option>)}</select></label>
      <p className="text-xs">下拉列表对应本页研究者；可用下方研究者分页切换。</p>
      <p className="survey-admin-object">当前授权对象：<strong>{objectName}</strong></p>
      {selectedResearcher&&!canGrant&&<p className="text-sm">该研究者当前资格不可接收新授权；可查看或撤销已有授权，后台权限规则保持不变。</p>}
      <label className="block">来源类型<select className="input block" value={kind} onChange={e=>{setKind(e.target.value as Kind);setSourcePage(emptySourcePage);setQueried(false);setError('');setNotice('')}}>
        <option value="SCALE">Scale · 量表</option><option value="SJT">SJT · 情境判断</option><option value="COGNITIVE">Cognitive · 认知任务</option><option value="FORM">Form · 本管理员已发布的普通表单</option></select></label>
      {kind==='FORM'&&<p className="text-sm">仅显示本管理员创建并已发布问卷中的普通表单区段；不包含身份背景字段或其他机构内容。版本以内容摘要冻结。</p>}
      <button type="button" className="btn-secondary" disabled={busy} onClick={()=>void run(()=>loadSources())}>查询可授权版本</button>
      {!queried&&!busy&&!error&&<p className="survey-admin-empty">选择来源类型后查询版本；不会自动加载全部目录。</p>}
      {sources.map((source,index)=><article key={JSON.stringify(source.ref)+index} className="survey-admin-card">
        <h3 className="font-semibold">{source.title}</h3><p className="survey-admin-object">{source.ref.kind} · <strong>版本 {source.ref.sourceVersion}</strong> · 授权给 {objectName}</p>
        <details><summary>查看来源编号与内容摘要</summary><p className="break-all">来源编号：{source.ref.sourceId}</p>{source.definitionDigest&&<p className="break-all">内容摘要：{source.definitionDigest}</p>}</details>
        {!source.available&&<p className="text-sm">不可授权：{source.unsupportedReason||'当前来源未提供可安全冻结的版本'}</p>}
        <button type="button" className="btn-primary" disabled={busy||(!ensureVerification&&!password)||!canGrant||!source.available} onClick={()=>{if(canWrite('授权 '+source.title+' · 版本 '+source.ref.sourceVersion+' 给 '+objectName))void run(()=>grant(source))}}>授权此版本：{source.title} · {source.ref.sourceVersion} → {objectName}</button>
      </article>)}
      <div className="flex gap-3 items-center text-sm"><button type="button" className="btn-secondary" disabled={busy||page<=1} onClick={()=>void run(()=>loadSources(page-1))}>来源上一页</button><span>来源第 {page} 页</span><button type="button" className="btn-secondary" disabled={busy||!hasMore} onClick={()=>void run(()=>loadSources(page+1))}>来源下一页</button></div>
      {terminalReason==='PAGE_LIMIT_REACHED'&&<p role="status" className="text-sm">已到达来源目录浏览上限：每类最多显示前 1000 个版本，仍有更多版本未显示。</p>}
      {terminalReason==='END_OF_CATALOG'&&<p role="status" className="text-sm">{sources.length?'已到达来源目录末页。':'当前页没有可授权版本。'}</p>}
      {researcherId&&<div className="space-y-3"><h3 className="font-semibold">{objectName} 的工具授权</h3>{!busy&&!error&&!grants.length&&<p>当前页暂无版本授权。</p>}{grants.map(item=><article key={item.id} className="survey-admin-card">
        <h4>{item.title}</h4><p className="survey-admin-object">研究者：{objectName} · <strong>版本 {item.sourceRef.sourceVersion}</strong> · {item.status==='ACTIVE'?'已授权':item.status==='REVOKED'?'已撤销':'状态待核对'}</p>
        <details><summary>来源与冻结摘要</summary><SourceProvenance source={item.sourceRef} provenance={item.sourceProvenance}/></details>
        {item.status==='ACTIVE'&&<button type="button" className="btn-secondary" disabled={busy||(!ensureVerification&&!password)} onClick={()=>{
          if(!canWrite('撤销 '+objectName+' 的工具版本授权'))return
          if(window.confirm('撤销 '+objectName+' 的 '+item.title+' · 版本 '+item.sourceRef.sourceVersion+' 授权？将阻止新的导入及后续冻结发布；既有已发布和进行中的研究不受影响。'))void run(async()=>{
            await api('/tool-grants/'+encodeURIComponent(item.id)+'/revoke','POST',{currentPassword:password})
            setNotice(objectName+' 的 '+item.title+' · 版本 '+item.sourceRef.sourceVersion+' 授权已撤销。既有已发布研究不变。')
            try{await loadGrants()}catch{setError('撤销已完成，但列表刷新失败；请仅重选研究者刷新列表，不要重复撤销。')}})
          else{setError('');setNotice('已取消撤销 '+objectName+' 的 '+item.title+' · 版本 '+item.sourceRef.sourceVersion+' 授权，未提交变更。')}
        }} aria-label={'撤销版本授权：'+objectName+' · '+item.title+' · '+item.sourceRef.sourceVersion}>撤销版本授权</button>}
      </article>)}<div className="flex gap-3 items-center text-sm"><button type="button" className="btn-secondary" disabled={busy||grantPage<=1} onClick={()=>void run(()=>loadGrants(researcherId,grantPage-1))}>授权上一页</button><span>授权第 {grantPage} 页</span><button type="button" className="btn-secondary" disabled={busy||grants.length<25} onClick={()=>void run(()=>loadGrants(researcherId,grantPage+1))}>授权下一页</button></div></div>}
    </fieldset>
  </section>
}
