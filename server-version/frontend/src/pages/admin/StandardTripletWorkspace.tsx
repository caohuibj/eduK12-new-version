import StandardOnboardingStatus from './StandardOnboardingStatus'
import {EntryAdmissionChoices,type EntryAdmissionProduct} from '../../components/scale-governance/EntryAdmissionChoices'
import GovernedToolsWorkspace from './GovernedToolsWorkspace'
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react'
import {BookOpen,ChevronDown,RefreshCw,ShieldCheck,FlaskConical,Archive} from 'lucide-react'
import ToolManagementDesign from './ToolManagementDesign'
import AdminStepUp from '../../admin/AdminStepUp'
import {standardRequest as api,type Axis,type Selection,type StandardItem,type StandardDetail,type StandardPreview,type StandardState} from '../../api/surveyStandard'
import {catalogQuery,EMPTY_CATALOG_FACETS,EMPTY_CATALOG_FILTERS,type CatalogDiscoveryPage,type CatalogFilters,type CatalogTagFacets} from '../../api/catalogDiscovery'
import CatalogDiscoveryFilters from '../../components/scale-governance/CatalogDiscoveryFilters'
import CatalogClassificationTags from '../../components/scale-governance/CatalogClassificationTags'
import LibraryPreflightPanel from '../../components/scale-governance/LibraryPreflightPanel'
const labels:Record<Axis,string>={CONTENT:'量表内容',PARAMETERS:'参数',REPORT:'文字报告'}
const states:Record<string,string>={APPROVED:'已批准 · 待试运行',TRIAL_RUNNING:'自动试运行中',TRIAL_FAILED:'试运行未通过',ONLINE:'已上线',WITHDRAWN:'已停止新增使用'}
const axes=['CONTENT','PARAMETERS','REPORT'] as const
export default function StandardTripletWorkspace({authored}:{authored:ReactNode}){
 const [view,setView]=useState<'standard'|'authored'|'management'|'governed'|'onboarding'>('standard'),[page,setPage]=useState(1),[more,setMore]=useState(false)
 const [rows,setRows]=useState<StandardItem[]>([]),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [filters,setFilters]=useState<CatalogFilters>(EMPTY_CATALOG_FILTERS),[appliedFilters,setAppliedFilters]=useState<CatalogFilters>(EMPTY_CATALOG_FILTERS),[tagFacets,setTagFacets]=useState<CatalogTagFacets>(EMPTY_CATALOG_FACETS)
 const [entryProducts,setEntryProducts]=useState<Record<string,EntryAdmissionProduct[]>>({})
 const requestVersion=useRef(0)
 const invalidateCatalog=useCallback(()=>{requestVersion.current++},[])
 const [detail,setDetail]=useState<Record<string,StandardDetail>>({}),[selection,setSelection]=useState<Record<string,Selection>>({}),[preview,setPreview]=useState<Record<string,StandardPreview>>({}),[reason,setReason]=useState('')
 const refresh=useCallback(async()=>{
  const version=++requestVersion.current;setLoading(true);setError('')
  try{const r=await api<CatalogDiscoveryPage<StandardItem>>('/catalog?'+catalogQuery(page,appliedFilters));if(version!==requestVersion.current)return;setRows(r.list);setMore(r.hasMore);setTagFacets(r.tagFacets??EMPTY_CATALOG_FACETS)}
  catch(e){if(version===requestVersion.current){setRows([]);setMore(false);setError(e instanceof Error?e.message:'读取失败')}}
  finally{if(version===requestVersion.current)setLoading(false)}
 },[page,appliedFilters])
 useEffect(()=>{void refresh();return invalidateCatalog},[refresh,invalidateCatalog])
 const applyFilters=(next:CatalogFilters)=>{invalidateCatalog();setAppliedFilters({...next,keyword:next.keyword.trim()});setPage(1)}
 const key=(r:StandardItem)=>r.toolKey+'@'+r.instrumentVersion
 const inspect=async(r:StandardItem)=>{try{const d=await api<StandardDetail>('/candidate/'+encodeURIComponent(r.toolKey)+'/'+encodeURIComponent(r.instrumentVersion));setDetail(old=>({...old,[key(r)]:d}));setSelection(old=>({...old,[key(r)]:old[key(r)]??d.selection}))}catch(e){setError(e instanceof Error?e.message:'版本读取失败')}}
 const run=async(work:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await work()}catch(e){setError((e instanceof Error?e.message:'操作失败')+'。不会自动重复批准；请读取当前审批记录核对结果。')}finally{setBusy(false)}}
 const check=(r:StandardItem)=>run(async()=>{const p=await api<StandardPreview>('/preview',selection[key(r)]);setPreview(old=>({...old,[key(r)]:p}))})
 const approve=(r:StandardItem)=>run(async()=>{
  const p=preview[key(r)],s=selection[key(r)],products=[...(entryProducts[key(r)]??[])].sort();if(!p||p.blockers.length||!reason.trim()||!products.length)return
  if(!window.confirm(`批准“${r.title}”的这份内容、参数、报告组合？随后自动试运行评分、报告与数据库记录，通过后仅允许所选入口 ${products.join('、')} 新增使用；不会分配用户使用权。`))return
  const storageKey='survey-triplet-approval:'+p.combinationHash
  const pending=sessionStorage.getItem(storageKey)
  let requestId:string
  if(pending){
   let saved:{requestId?:unknown;products?:unknown}
   try{saved=JSON.parse(pending)}catch{throw new Error('存在待核对的批准请求，请先读取审批记录确认入口范围')}
   if(!saved||typeof saved.requestId!=='string'||JSON.stringify(saved.products)!==JSON.stringify(products))throw new Error('同一组合仍有待核对的批准请求，不能更换入口范围；请先核对原请求结果')
   requestId=saved.requestId
  }else{requestId=crypto.randomUUID();sessionStorage.setItem(storageKey,JSON.stringify({requestId,products}))}
  const result=await api<StandardState>('/approve',{...s,requestId,expectedCombinationHash:p.combinationHash,reason:reason.trim(),allowedProducts:products})
  sessionStorage.removeItem(storageKey)
  setNotice(states[result.state]+'；未创建研究者授权。');await refresh();await inspect(r)
 })
 const transition=(r:StandardItem,state:StandardState,action:'retry'|'withdraw')=>run(async()=>{
  if(!window.confirm(action==='retry'?'重新试运行同一份已批准版本？通过后上线，不产生研究者授权。':'停止这份精确组合的分配、准入和后续采集／提交？已保存数据保留。'))return
  const result=await api<StandardState>('/'+state.id+'/'+action,{expectedVersion:state.version,...(action==='withdraw'?{reason:reason.trim()}:{})})
  setNotice(action==='retry'?(states[result.state]??'试运行完成'):'已停止新增使用，历史数据保留。');await refresh();await inspect(r)
 })
 return <div className="system-page system-standard-workspace">
 <header className="sys-heading"><div><p className="system-eyebrow">版本审核 · 自动试运行</p><h1>工具库治理</h1><p>核对内容及可选参数、报告。系统管理员批准后自动试运行，通过才上线。</p></div>{view==='standard'&&<button disabled={loading||busy} onClick={()=>void refresh()}><RefreshCw size={16}/>刷新</button>}</header>
 <nav className="sys-view-tabs" aria-label="工具类型"><button aria-pressed={view==='standard'} onClick={()=>setView('standard')}><BookOpen size={16}/>标准量表</button><button aria-pressed={view==='onboarding'} onClick={()=>setView('onboarding')}><ShieldCheck size={16}/>接入状态</button><button aria-pressed={view==='authored'} onClick={()=>setView('authored')}><Archive size={16}/>自编工具入库</button><button aria-pressed={view==='governed'} onClick={()=>setView('governed')}><BookOpen size={16}/>其他工具与组合</button><button aria-pressed={view==='management'} onClick={()=>setView('management')}><ShieldCheck size={16}/>权限与授权</button></nav>
 {view==='onboarding'?<StandardOnboardingStatus/>:view==='governed'?<GovernedToolsWorkspace/>:view==='management'?<ToolManagementDesign/>:view==='authored'?authored:<>{error&&<p role="alert" className="sys-message sys-error">{error}</p>}{notice&&<p role="status" className="sys-message">{notice}</p>}{busy&&<p role="status" className="sys-message">正在核对版本或执行隔离试运行，请保留当前页面。评分、报告、数据库提交及回读全部成功后才会上线。</p>}
 <div className="sys-workspace"><div className="sys-content"><section className="sys-panel"><div className="sys-section-heading"><div><h2>标准量表</h2><p>每份版本独立保留；未审核工具不会因本次改造自动上线。</p></div><span className="sys-badge">第 {page} 页</span></div><CatalogDiscoveryFilters filters={filters} facets={tagFacets} onChange={setFilters} onApply={applyFilters} disabled={busy}/>
 {loading&&<p role="status">正在读取版本状态…</p>}
 <div className="sys-records" aria-busy={loading}>{rows.map(r=>{
  const k=key(r),d=detail[k],s=selection[k],p=preview[k],current=r.releases.find(x=>x.combinationHash===r.combinationHash),online=r.releases.some(x=>x.state==='ONLINE')
  return <article className="sys-record" key={k}><details onToggle={e=>{if(e.currentTarget.open&&!detail[k])void inspect(r)}}><summary><span className="sys-record-avatar"><BookOpen size={20}/></span><span className="sys-record-heading"><strong>{r.title}</strong><small>{r.versions.map(v=>labels[v.axis]+' '+v.version).join(' · ')||'当前只有目录资料'}</small><CatalogClassificationTags tags={r.classificationTags}/></span><span className="sys-record-state"><span className="sys-badge" data-status={current?.state??'PENDING'}>{current?states[current.state]:online?'已有其他上线组合':'待审核'}</span><ChevronDown size={17}/></span></summary><div className="sys-record-body">
 <LibraryPreflightPanel instrumentKey={r.toolKey} instrumentVersion={r.instrumentVersion}/>
 {r.blockers.length>0&&<div className="sys-message sys-error"><strong>当前版本需补齐</strong><ul>{r.blockers.map((b,i)=><li key={i}>{b}</li>)}</ul></div>}
 {!d?<p>展开后读取版本和 Reference…</p>:<><div className="sys-triplet-versions">{axes.map(axis=><label key={axis}>{labels[axis]}版本<select disabled={busy} value={s?.[axis]??''} onChange={e=>{setSelection(old=>({...old,[k]:{...old[k],[axis]:e.target.value}}));setPreview(old=>{const next={...old};delete next[k];return next})}}>{d.available.filter(v=>v.axis===axis).map(v=><option key={v.hash} value={v.hash}>{v.payload===null?(axis==='PARAMETERS'?'未配置（无阈值/常模）':'不反馈（无报告）'):v.version} · {v.hash.slice(0,8)}</option>)}</select></label>)}</div>
 <EntryAdmissionChoices label="此批准组合的允许入口" value={entryProducts[k]??[]} disabled={busy} onChange={next=>setEntryProducts(old=>({...old,[k]:next}))}/><div className="system-actions"><button disabled={busy||d.available.length<3} onClick={()=>void check(r)}>核对三份版本</button><button disabled={busy||!p||p.blockers.length>0||!reason.trim()||!entryProducts[k]?.length||r.releases.some(x=>x.combinationHash===p.combinationHash)} onClick={()=>void approve(r)}>批准并试运行，通过后上线</button></div>
 {p&&<div className="sys-message"><strong>{p.blockers.length?'版本对应关系存在问题':'三份版本对应关系已核对'}</strong>{p.blockers.length?<ul>{p.blockers.map((b,i)=><li key={i}>{b}</li>)}</ul>:<p>批准后仍须自动试运行通过；尚未上线，也未授权任何研究者。</p>}<details className="sys-technical"><summary>查看所选内容、参数和报告</summary>{axes.map(a=><details key={a}><summary>{labels[a]} · {p.parts[a].version}</summary><pre>{JSON.stringify(p.parts[a].payload,null,2)}</pre></details>)}</details></div>}
 <details className="sys-technical"><summary>工具 Reference：作者、文献、标签及完整附加信息</summary><p>保留原始资料，不作为额外上线门槛。阈值与常模在参数版本中。</p><pre>{JSON.stringify(d.reference,null,2)}</pre></details>
 <details className="sys-technical"><summary>申请、批准及试运行记录（{d.history.length}）</summary>{!d.history.length?<p>尚无本流程的审批记录。</p>:d.history.map(h=><section key={h.id} className="sys-standard-history"><h3>{states[h.state]}</h3><p>批准人：{h.approvedBy} · {new Date(h.approvedAt).toLocaleString()}</p><p>内容 {h.versions.CONTENT.version} / 参数 {h.versions.PARAMETERS.version} / 报告 {h.versions.REPORT.version}</p>{h.blockers.map((b,i)=><p role="status" key={i}>{b}</p>)}<div className="system-actions">{(h.state==='TRIAL_FAILED'||h.state==='APPROVED'||h.state==='TRIAL_RUNNING')&&<button disabled={busy} onClick={()=>void transition(r,h,'retry')}>重试同一批准版本</button>}{h.state==='ONLINE'&&<button disabled={busy||!reason.trim()} onClick={()=>void transition(r,h,'withdraw')}>停止新增使用</button>}</div><details><summary>完整审批 Reference</summary><pre>{JSON.stringify(h.reference,null,2)}</pre></details></section>)}{d.trials.map(t=><details key={t.runId+':'+t.caseIndex}><summary>试运行 {t.caseIndex+1} · 数据库记录已提交</summary><p>记录摘要：{t.recordHash}</p><pre>{JSON.stringify({scores:t.scores,report:t.report},null,2)}</pre></details>)}</details>
 </>}
 </div></details></article>
 })}</div>{!loading&&!error&&!rows.length&&<p>没有符合当前筛选条件的量表。</p>}<nav className="system-pagination" aria-label="标准量表分页"><span>第 {page} 页</span><div><button disabled={page===1||busy||loading} onClick={()=>setPage(p=>p-1)}>上一页</button><button disabled={!more||busy||loading} onClick={()=>setPage(p=>p+1)}>下一页</button></div></nav></section></div>
 <aside className="sys-rail"><details className="sys-panel sys-verification"><summary><ShieldCheck size={17}/>操作验证</summary><AdminStepUp/></details><details className="sys-panel sys-reason"><summary>审批或停用说明</summary><label className="system-field">本次操作原因<textarea rows={4} value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)}/></label></details><section className="sys-panel sys-process"><h2><FlaskConical size={18}/>上线流程</h2><ol><li><strong>版本审核</strong><p>内容必需；参数和报告可明确留空，分别表示无阈值/常模与不反馈。</p></li><li><strong>系统管理员批准</strong><p>记录批准人与原因，冻结工具 Reference。</p></li><li><strong>自动试运行</strong><p>合成作答验证评分、已配置的报告，以及数据库提交和回读；明确留空项不适用。</p></li><li><strong>通过后上线</strong><p>只准入本次明确选择的 Training／Survey 入口；用户使用权仍由对应入口管理员另行分配。</p></li></ol></section><details className="sys-panel sys-guide"><summary>数据与版本保留</summary><p>试运行记录独立存放，不进入研究答卷和统计。更新版本生成新组合，旧答卷与历史报告保留原组合。</p><p>作者、文献、标签、加入申请及批准记录属于工具 Reference，始终保留。</p></details></aside></div></>}
 </div>
}
