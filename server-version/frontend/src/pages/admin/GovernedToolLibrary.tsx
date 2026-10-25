import {useCallback,useEffect,useRef,useState} from 'react'
import {Link} from 'react-router-dom'
import {ChevronDown} from 'lucide-react'
import {governedRequest,toolFamilyLabels,toolStateLabels,type GovernedItem,type ToolFamily} from '../../api/surveyGovernance'
import {catalogQuery,EMPTY_CATALOG_FILTERS,EMPTY_CATALOG_FACETS,type CatalogDiscoveryPage,type CatalogFilters,type CatalogTagFacets} from '../../api/catalogDiscovery'
import CatalogDiscoveryFilters from '../../components/scale-governance/CatalogDiscoveryFilters'
import CatalogClassificationTags from '../../components/scale-governance/CatalogClassificationTags'
import {surveyManagementRequest} from '../../api/surveyManagement'
import {useAuth} from '../../contexts/AuthContext'
import {ExactToolVersions,PackageComponentVersions} from '../../survey/ExactToolVersions'

export default function GovernedToolLibrary(){
 const system=useAuth().user?.platformRole==='SYSTEM_ADMIN'
 const [family,setFamily]=useState<ToolFamily>('COGNITIVE'),[list,setList]=useState<GovernedItem[]>([]),[page,setPage]=useState(1),[more,setMore]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[reason,setReason]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [filters,setFilters]=useState<CatalogFilters>(EMPTY_CATALOG_FILTERS),[applied,setApplied]=useState<CatalogFilters>(EMPTY_CATALOG_FILTERS),[facets,setFacets]=useState<CatalogTagFacets>(EMPTY_CATALOG_FACETS)
 const epoch=useRef(0),writing=useRef(false)
 const load=useCallback(async()=>{
  const current=++epoch.current;setLoading(true);setError('');setList([]);setMore(false)
  try{const result=await governedRequest<CatalogDiscoveryPage<GovernedItem>>('survey-tool-use','/catalog?family='+family+'&'+catalogQuery(page,applied));if(current!==epoch.current)return;setList(result.list);setMore(result.hasMore);setFacets(result.tagFacets??EMPTY_CATALOG_FACETS)}
  catch(e){if(current===epoch.current)setError('目录读取失败：'+(e instanceof Error?e.message:'请重试'))}
  finally{if(current===epoch.current)setLoading(false)}
 },[family,page,applied])
 const invalidate=useCallback(()=>{epoch.current++},[])
 useEffect(()=>{void load();return invalidate},[load,invalidate])
 const apply=(next:CatalogFilters)=>{epoch.current++;setApplied({...next,keyword:next.keyword.trim()});setPage(1)}
 const change=async(row:GovernedItem,decision:'APPROVED'|'RETURNED',paused:boolean)=>{
  if(writing.current||!row.policy||!reason.trim())return
  writing.current=true;setBusy(true);setError('');setNotice('')
  try{await surveyManagementRequest('survey-library','/policies',{...row.policyIdentity,expectedVersion:row.policy.version,decision,paused,reason});setNotice('仅更新 Survey 使用范围，未分配任何研究者授权。');await load()}
  catch(e){setError(e instanceof Error?e.message:'操作未取得成功确认，请刷新核对当前状态')}
  finally{writing.current=false;setBusy(false)}
 }
 return <section className="survey-governed-library">
  <label className="sra-field">工具类型<select value={family} disabled={busy} onChange={e=>{epoch.current++;setFamily(e.target.value as ToolFamily);setPage(1);setFilters({...EMPTY_CATALOG_FILTERS});setApplied({...EMPTY_CATALOG_FILTERS});setFacets(EMPTY_CATALOG_FACETS);setNotice('')}}>{(['COGNITIVE','SJT','FORM','COMBINATION','BUNDLE','SCALE'] as const).map(f=><option key={f} value={f}>{toolFamilyLabels[f]}</option>)}</select></label>
  <CatalogDiscoveryFilters label="认知及其他工具目录检索" filters={filters} facets={facets} onChange={setFilters} onApply={apply} disabled={busy}/>
  <button type="button" disabled={busy||loading} onClick={()=>void load()}>刷新目录（只读）</button>
  <label className="sra-field">本次范围审批或暂停原因<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000}/></label>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{loading&&<p role="status">正在检索工具目录…</p>}
  <div className="slg-catalog-grid" aria-busy={loading}>{list.map(row=><article className="slg-catalog-card" key={row.id}>
   <h2>{row.title}</h2><p>{toolStateLabels[row.state]} · {row.toolVersion}</p><CatalogClassificationTags tags={row.classificationTags}/>
   {row.family==='COGNITIVE'&&<p>适用人群与语言：以该精确任务的正式声明为准；缺少声明时不从能力标签推定。</p>}
   <div className="survey-tool-summary"><span>内容：{row.states?.content.ready?'就绪':'受阻'}</span><span>授权：{row.states?.assignment.ready?'可分配':'受阻'}</span><span>投放：{row.states?.assignment.ready?'投放前核对':'受阻'}</span></div>
   <details className="slg-action-disclosure"><summary>状态、详情与操作<ChevronDown size={17}/></summary><div className="slg-disclosure-content">
    <ExactToolVersions versions={row.versions} hash={row.hash} kind={row.family}/>{row.components.length>0&&<PackageComponentVersions components={row.components}/>}
    {Object.entries(row.states??{}).map(([key,state])=><section key={key}><strong>{key==='content'?'内容就绪':key==='assignment'?'可授权':'可投放'}</strong><ul>{state.reasons.map((s,i)=><li key={i}>{s}</li>)}</ul></section>)}
    <div className="sra-actions"><button disabled={busy||loading||!reason.trim()||row.state!=='ONLINE'} onClick={()=>void change(row,'APPROVED',row.policy?.paused??false)}>批准 Survey 使用范围</button><button disabled={busy||loading||!reason.trim()||row.state!=='ONLINE'} onClick={()=>void change(row,'RETURNED',row.policy?.paused??false)}>退回 Survey 审批</button><button disabled={busy||loading||!reason.trim()||row.state!=='ONLINE'} onClick={()=>void change(row,row.policy?.decision==='APPROVED'?'APPROVED':'RETURNED',!row.policy?.paused)}>{row.policy?.paused?'恢复 Survey 新使用':'暂停 Survey 新使用'}</button></div>
    <p>此处只决定本入口范围；具体用户授权在研究者管理中分配。</p><p>{system?<>由独立 Survey 入口管理员分配人员及工具使用权。<Link to="/admin/permissions">管理入口管理员任命</Link></>:<Link to="/admin/survey-researchers">前往研究者与工具授权</Link>}</p>
   </div></details>
  </article>)}</div>
  {!loading&&!list.length&&!error&&<p>当前筛选没有匹配工具。可以调整筛选；未批准或未试运行的原来源不会自动开放。</p>}
  <nav className="sra-pagination"><button disabled={busy||loading||page<=1} onClick={()=>setPage(p=>p-1)}>上一页</button><span>第 {page} 页</span><button disabled={busy||loading||!more} onClick={()=>setPage(p=>p+1)}>下一页</button></nav>
 </section>
}
