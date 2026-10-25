import {useEffect,useState,useRef} from 'react'
import {governedResearcherRequest,type PackageGrant} from '../api/surveyGovernance'
import {ExactToolVersions,PackageComponentVersions} from './ExactToolVersions'
type Binding={draftId:string;slotKey:string;instrumentKey:string}
export function ResearchPackageCatalog({projectId,busy,onImported,onRefresh,onBeforeImport,onBusyChange}:{projectId:string;busy:boolean;onImported:(bindings:Binding[])=>Promise<void>;onRefresh?:(input:{retry:boolean})=>Promise<void>;onBeforeImport?:()=>boolean;onBusyChange?:(busy:boolean)=>void}){
 const [list,setList]=useState<PackageGrant[]>([]),[page,setPage]=useState(1),[more,setMore]=useState(false),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[refreshOnly,setRefreshOnly]=useState<string|null>(null),epoch=useRef(0),pending=useRef<{grantId:string;requestId:string;bindings?:Binding[];selectionApplied?:boolean;refreshAttempted?:boolean}|null>(null)
 useEffect(()=>{onBusyChange?.(loading);return()=>onBusyChange?.(false)},[loading,onBusyChange])
 useEffect(()=>{epoch.current++;setList([]);setPage(1);setMore(false);setQuery('');setSearch('');setLoading(false);setError('');setNotice('');setRefreshOnly(null);pending.current=null;return()=>{epoch.current++}},[projectId])
 const load=async(nextPage=1,nextSearch=search)=>{const current=++epoch.current;setLoading(true);setError('');try{const r=await governedResearcherRequest<{list:PackageGrant[];hasMore:boolean}>('/'+projectId+'/package-grants?'+new URLSearchParams({page:String(nextPage),q:nextSearch}));if(current===epoch.current){setList(r.list);setPage(nextPage);setSearch(nextSearch);setMore(r.hasMore)}}catch(e){if(current===epoch.current)setError(e instanceof Error?e.message:'读取失败')}finally{if(current===epoch.current)setLoading(false)}}
 const importPackage=async(g:PackageGrant)=>{
  const onlyRead=pending.current?.grantId===g.id&&pending.current.selectionApplied
  if(!onlyRead&&(!window.confirm('整包导入“'+g.title+'”？组件与报告均固定，不能拆出单个组件使用。')||onBeforeImport?.()===false))return
  setLoading(true);setError('');const current=epoch.current
  try{
   if(pending.current?.grantId!==g.id)pending.current={grantId:g.id,requestId:crypto.randomUUID()}
   const command=pending.current
   const r=command.bindings?{bindings:command.bindings}:await governedResearcherRequest<{bindings:Binding[]}>('/'+projectId+'/package-grants/'+g.id+'/import',{requestId:command.requestId})
   if(current!==epoch.current)return
   command.bindings=r.bindings
   setNotice('已整包导入 '+r.bindings.length+' 项固定组件；正在更新当前研究。')
   if(!command.selectionApplied){await onImported(r.bindings);if(current!==epoch.current)return;command.selectionApplied=true}
   const retry=Boolean(command.refreshAttempted);command.refreshAttempted=true
   await onRefresh?.({retry})
   if(current===epoch.current){pending.current=null;setRefreshOnly(null);setNotice('整包已加入本研究，组件顺序与版本固定；请核对当前问卷后冻结发布。')}
  }catch(e){if(current===epoch.current){setRefreshOnly(pending.current?.selectionApplied?g.id:null);setError((e instanceof Error?e.message:'导入失败')+(pending.current?.selectionApplied?'；导入与选择已完成，只需重新读取工具列表。':pending.current?.bindings?'；整包已保存，可重试选择交接。':'；可重试同一请求，或刷新工具列表核对。'))}}
  finally{if(current===epoch.current)setLoading(false)}
 }
 return <section className="border rounded-xl p-4 space-y-3" aria-label="授权组合目录"><h3 className="font-semibold">导入已授权组合</h3><p>由 Survey 管理员授权；单纯组合没有组合报告，组合包包含固定的组合报告设计。整包使用不要求组件独立授权，也不允许拆用。</p><p>列表为当前授权与版本摘要；导入和发布时仍核对全部组件的准入。</p>
 <label>搜索整包名称或版本标识<input value={query} maxLength={120} onChange={e=>setQuery(e.target.value)}/></label><button className="btn-secondary" disabled={busy||loading} onClick={()=>void load(1,query)}>查看我的整包授权</button>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{list.map(g=><article className="border rounded-lg p-3" key={g.id}><h4>{g.title}</h4><ExactToolVersions versions={g.versions} hash={g.hash} kind={g.family}/><p>{g.family==='BUNDLE'?'有组合报告':'单纯组合'}{g.expiresAt?' · 到期 '+new Date(g.expiresAt).toLocaleString():''}</p>{g.components&&<details><summary>固定组件明细</summary><PackageComponentVersions components={g.components}/></details>}{g.availability?.reasons.map(reason=><p key={reason}>{reason}</p>)}<button className="btn-secondary" disabled={busy||loading||g.availability?.ready===false} onClick={()=>void importPackage(g)}>{refreshOnly===g.id?'重新读取工具列表：':'整包导入：'}{g.title}</button></article>)}
 <nav aria-label="整包授权分页"><span>第 {page} 页</span><button disabled={busy||loading||page<=1} onClick={()=>void load(page-1)}>上一页整包授权</button><button disabled={busy||loading||!more} onClick={()=>void load(page+1)}>下一页整包授权</button></nav></section>
}
