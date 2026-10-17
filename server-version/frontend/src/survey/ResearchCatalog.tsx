import { useEffect, useState } from 'react'
import type { Kind } from './builder.types'
export type CatalogSourceRef={kind:Kind;sourceId:string;sourceVersion:string|number;organizationId?:string}
export type CatalogProvenance={source:CatalogSourceRef;definitionDigest:string;adapterVersion:string;license?:unknown;[key:string]:unknown}
export type CatalogGrant={id:string;title:string;kind:Kind;status:string;sourceRef:CatalogSourceRef;sourceProvenance?:CatalogProvenance;createdAt?:string;revokedAt?:string|null}
export type CatalogApi=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
export function SourceProvenance({source,provenance}:{source?:CatalogSourceRef;provenance?:CatalogProvenance}){
  source=source||provenance?.source
  const values=[['内容摘要',provenance?.definitionDigest],['适配版本',provenance?.adapterVersion]].filter(([,value])=>typeof value==='string')
  return <div className="rounded-lg border bg-slate-50 p-3 text-sm space-y-2" aria-label="原版工具来源">
    <p className="font-semibold">已授权原版工具 · 只读版本快照</p>
    {source&&<p className="break-all">{source.kind} · {source.sourceId} · 版本 {source.sourceVersion}{source.organizationId?' · 组织 '+source.organizationId:''}</p>}
    <dl className="break-all">{values.map(([key,value])=><div key={key}><dt className="inline">{key}：</dt><dd className="inline">{String(value)}</dd></div>)}</dl>
    <p>保留原版内容、计分与来源。不得在此改编题目或评分；复制后仍为只读授权工具。授权不代表诊断资质或额外版权许可。</p>
  </div>
}
export function ResearchCatalog({projectId,api,busy,onImport}:{projectId:string;api:CatalogApi;busy:boolean;onImport:(grant:CatalogGrant)=>Promise<void>}){
  const [list,setList]=useState<CatalogGrant[]>([]),[page,setPage]=useState(1),[error,setError]=useState(''),[loading,setLoading]=useState(false)
  const load=async(next=1)=>{setLoading(true);setError('');try{
    const data=await api<{list:CatalogGrant[]}>('/projects/'+encodeURIComponent(projectId)+'/catalog?page='+next)
    setList(data.list);setPage(next)
  }catch(e){setError(e instanceof Error?e.message:'授权目录无法加载')}finally{setLoading(false)}}
  useEffect(()=>{setList([]);setPage(1);void load()},[projectId])
  return <section className="border rounded-xl p-4 space-y-3" aria-label="授权原版工具目录">
    <h3 className="font-semibold">导入已授权的原版工具</h3>
    <p className="text-sm text-slate-600">仅列出系统管理员授予您的明确版本；导入后不能编辑原版内容或计分。撤销授权后不能再次导入或冻结发布，既有已发布研究不受影响。</p>
    {error&&<p role="alert">{error}</p>}
    {!loading&&!error&&!list.length&&<p className="text-sm">暂无可导入的授权工具。请联系系统管理员确认具体工具与版本。</p>}
    {loading&&<p role="status">正在加载授权目录…</p>}
    {list.map(grant=><article key={grant.id} className="border rounded-lg p-3 space-y-2">
      <h4 className="font-medium">{grant.title}</h4><SourceProvenance source={grant.sourceRef} provenance={grant.sourceProvenance}/>
      <button type="button" className="btn-secondary" disabled={busy||loading} onClick={()=>void onImport(grant)}>导入此版本：{grant.title}</button>
    </article>)}
    <div className="flex gap-3 items-center text-sm"><button type="button" className="btn-secondary" disabled={busy||loading||page<=1} onClick={()=>void load(page-1)}>目录上一页</button>
      <span>目录第 {page} 页</span><button type="button" className="btn-secondary" disabled={busy||loading||list.length<25} onClick={()=>void load(page+1)}>目录下一页</button>
      <button type="button" className="btn-secondary" disabled={busy||loading} onClick={()=>void load(page)}>刷新授权目录</button></div>
  </section>
}
