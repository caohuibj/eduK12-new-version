import { useEffect, useState } from 'react'
import { SourceProvenance, type CatalogApi, type CatalogGrant, type CatalogSourceRef } from '../../survey/ResearchCatalog'
import type { Kind } from '../../survey/builder.types'
type Source={ref:CatalogSourceRef;title:string;available:boolean;unsupportedReason?:string;definitionDigest?:string}
export function SurveyCatalogGrants({api,password,researchers}:{api:CatalogApi;password:string;researchers:{id:string;username:string;status:string}[]}){
  const [researcherId,setResearcherId]=useState(''),[kind,setKind]=useState<Kind>('SCALE')
  const [sources,setSources]=useState<Source[]>([]),[grants,setGrants]=useState<CatalogGrant[]>([]),[page,setPage]=useState(1),[grantPage,setGrantPage]=useState(1)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  useEffect(()=>{if(researcherId&&!researchers.some(r=>r.id===researcherId)){setResearcherId('');setGrants([])}},[researchers,researcherId])
  const run=async(task:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await task()}catch(e){setError(e instanceof Error?e.message:'操作失败')}finally{setBusy(false)}}
  const loadSources=async(next=1)=>{
    const data=await api<{list:Source[]}>('/source-catalog?kind='+kind+'&page='+next)
    setSources(data.list);setPage(next)
  }
  const loadGrants=async(id=researcherId,next=1)=>{const data=await api<{list:CatalogGrant[]}>('/researchers/'+encodeURIComponent(id)+'/tool-grants?page='+next);setGrants(data.list);setGrantPage(next)}
  const grant=async(source:Source)=>{
    await api('/researchers/'+encodeURIComponent(researcherId)+'/tool-grants','POST',{currentPassword:password,source:source.ref})
    await loadGrants();setNotice('已授权该明确版本；研究者可在自己的项目中导入。')
  }
  return <section className="border rounded-xl p-4 space-y-4" aria-label="研究工具版本授权">
    <h2 className="text-xl font-semibold">研究工具版本授权</h2>
    <p className="text-sm">从原来源目录选择明确版本。原来源的学校、组织、版权与发布边界保持不变，不授予研究原始答案访问权。</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <fieldset disabled={busy} className="space-y-3">
      <label className="block">授权给研究者<select className="input block w-full" value={researcherId} onChange={e=>{const id=e.target.value;setResearcherId(id);setGrants([]);if(id)void run(()=>loadGrants(id))}}>
        <option value="">从当前研究者列表选择</option>{researchers.filter(r=>r.status!=='REVOKED').map(r=><option value={r.id} key={r.id}>{r.username} · {r.status}</option>)}</select></label>
      <p className="text-xs">下拉列表对应本页研究者；可用下方研究者分页切换。</p>
      <label className="block">来源类型<select className="input block" value={kind} onChange={e=>{setKind(e.target.value as Kind);setSources([]);setPage(1)}}>
        <option value="SCALE">Scale · 量表</option><option value="SJT">SJT · 情境判断</option><option value="COGNITIVE">Cognitive · 认知任务</option><option value="FORM">Form · 本管理员已发布的普通表单</option></select></label>
      {kind==='FORM'&&<p className="text-sm">仅显示本管理员创建并已发布问卷中的普通表单区段；不包含身份背景字段或其他机构内容。版本以内容摘要冻结。</p>}
      <button type="button" className="btn-secondary" disabled={busy} onClick={()=>void run(()=>loadSources())}>查询可授权版本</button>
      {sources.map((source,index)=><article key={JSON.stringify(source.ref)+index} className="border rounded-lg p-3 space-y-2">
        <h3 className="font-semibold">{source.title}</h3><p className="text-sm break-all">{source.ref.kind} · {source.ref.sourceId} · 版本 {source.ref.sourceVersion}</p>
        {source.definitionDigest&&<p className="text-xs break-all">内容摘要：{source.definitionDigest}</p>}
        {!source.available&&<p className="text-sm">不可授权：{source.unsupportedReason||'当前来源未提供可安全冻结的版本'}</p>}
        <button type="button" className="btn-primary" disabled={busy||!password||!researcherId||!source.available} onClick={()=>void run(()=>grant(source))}>授权此版本：{source.title}</button>
      </article>)}
      <div className="flex gap-3 items-center text-sm"><button type="button" className="btn-secondary" disabled={busy||page<=1} onClick={()=>void run(()=>loadSources(page-1))}>来源上一页</button><span>来源第 {page} 页</span><button type="button" className="btn-secondary" disabled={busy||sources.length<25} onClick={()=>void run(()=>loadSources(page+1))}>来源下一页</button></div>
      {researcherId&&<div className="space-y-3"><h3 className="font-semibold">该研究者的工具授权</h3>{!grants.length&&<p>暂无版本授权。</p>}{grants.map(item=><article key={item.id} className="border rounded-lg p-3 space-y-2">
        <h4>{item.title} · {item.status}</h4><SourceProvenance source={item.sourceRef} provenance={item.sourceProvenance}/>
        {item.status==='ACTIVE'&&<button type="button" className="btn-secondary" disabled={busy||!password} onClick={()=>{
          if(window.confirm('撤销此版本授权？将阻止新的导入及后续冻结发布；既有已发布和进行中的研究不受影响。'))void run(async()=>{
            await api('/tool-grants/'+encodeURIComponent(item.id)+'/revoke','POST',{currentPassword:password});await loadGrants();setNotice('授权已撤销。既有已发布研究不变。')})
        }}>撤销版本授权</button>}
      </article>)}<div className="flex gap-3 items-center text-sm"><button type="button" className="btn-secondary" disabled={busy||grantPage<=1} onClick={()=>void run(()=>loadGrants(researcherId,grantPage-1))}>授权上一页</button><span>授权第 {grantPage} 页</span><button type="button" className="btn-secondary" disabled={busy||grants.length<25} onClick={()=>void run(()=>loadGrants(researcherId,grantPage+1))}>授权下一页</button></div></div>}
    </fieldset>
  </section>
}
