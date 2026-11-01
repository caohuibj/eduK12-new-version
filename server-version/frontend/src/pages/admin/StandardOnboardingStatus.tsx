import {useCallback,useEffect,useRef,useState} from 'react'
import {RefreshCw} from 'lucide-react'
import {standardRequest,type StandardOnboardingEntry,type StandardOnboardingStatusPage,type StandardOnboardingTarget} from '../../api/surveyStandard'

const reviewLabels:Record<string,string>={APPROVED:'已批准',COMPLETED:'已完成',PENDING:'待审核',RETURNED:'已退回',NOT_ESTABLISHED:'尚未建立',LOCALIZATION_MISSING:'缺少本地化清单'}
const maturityLabels:Record<string,string>={PILOT:'试用',RESEARCH_READY:'研究就绪',RESEARCH_GRADE:'研究级'}
const entryLabels:Record<string,string>={APPROVED:'准入已批准',RETURNED:'已退回，禁止新增使用',PENDING:'待决定'}
const gapLabels:Record<string,string>={
 EXECUTABLE_NOT_REGISTERED:'尚未登记完整可执行内容。请补齐真实题本、选项及计分资料后，通过已有导入流程保存草稿。',
 RIGHTS_FOR_DIGITAL_REPUBLICATION_UNKNOWN:'数字呈现或公开再分发的授权范围尚未明确，请核对现有许可资料。',
 EXACT_CHINESE_ITEMS_NOT_LICENSED_FOR_PUBLIC_SOURCE:'精确中文题文的公开源码许可尚未确认，请补充经许可的版本。',
 SCORING_MISSING_RULE_NOT_VERIFIED:'计分或缺失作答规则尚未核实，不能按猜测补成可执行量表。',
 EXISTING_PUBLIC_REDISTRIBUTION_HOLD:'原许可记录保留公开再分发 HOLD；请核对确切授权依据，不能视为已经获准公开。',
 VERSIONED_SCORER_NOT_REGISTERED:'所需版本的专用计分器尚未安装登记，单独导入 JSON 不能补齐。',
}

export default function StandardOnboardingStatus({onOpenWorkspace}:{onOpenWorkspace?:(target:StandardOnboardingTarget,workspace:'import'|'drafts')=>void}={}){
 const [rows,setRows]=useState<StandardOnboardingEntry[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[keyword,setKeyword]=useState('')
 const requestVersion=useRef(0),appliedQuery=useRef('')
 const [cursors,setCursors]=useState<Array<string|null>>([null]),[pageIndex,setPageIndex]=useState(0),[nextCursor,setNextCursor]=useState<string|null>(null)
 const invalidate=useCallback(()=>{requestVersion.current++},[])
 const refresh=useCallback(async(cursor:string|null=null,query='')=>{
  const version=++requestVersion.current
  // A failed or pending refresh must not leave old approval states on screen.
  setLoading(true);setError('');setRows([]);setNextCursor(null)
  try{
   const params=new URLSearchParams({limit:'25',...(query?{query}:{}),...(cursor?{cursor}:{})})
   const result=await standardRequest<StandardOnboardingStatusPage>('/onboarding-status?'+params.toString())
   if(version===requestVersion.current){setRows(result.list);setNextCursor(result.hasMore?result.nextCursor:null)}
  }catch(e){if(version===requestVersion.current)setError(e instanceof Error?e.message:'接入状态读取失败')}
  finally{if(version===requestVersion.current)setLoading(false)}
 },[])
 useEffect(()=>{void refresh();return invalidate},[refresh,invalidate])
 const search=()=>{appliedQuery.current=keyword.trim();setCursors([null]);setPageIndex(0);void refresh(null,appliedQuery.current)}
 const next=()=>{if(!nextCursor)return;setCursors([...cursors.slice(0,pageIndex+1),nextCursor]);setPageIndex(pageIndex+1);void refresh(nextCursor,appliedQuery.current)}
 const previous=()=>{if(!pageIndex)return;setPageIndex(pageIndex-1);void refresh(cursors[pageIndex-1],appliedQuery.current)}
 return <section className="sys-panel" aria-labelledby="standard-onboarding-heading">
  <div className="sys-section-heading"><div><h2 id="standard-onboarding-heading">标准量表接入状态</h2><p>每个精确版本单独核对。已导入、已发布和入口允许使用是不同状态，不代表已上线或已有用户使用权。</p></div><button type="button" disabled={loading} onClick={()=>void refresh(cursors[pageIndex],appliedQuery.current)}><RefreshCw size={16} aria-hidden="true"/>刷新接入状态</button></div>
  <form onSubmit={event=>{event.preventDefault();search()}}><label className="system-field">检索接入版本<input type="search" value={keyword} maxLength={100} onChange={e=>setKeyword(e.target.value)} placeholder="名称、工具标识或版本"/></label><button type="submit" disabled={loading}>检索</button></form>
  {loading&&<p role="status">正在读取接入状态…</p>}
  {error&&<p role="alert" className="sys-message sys-error">{error}。请重新读取；当前未展示旧状态。</p>}
  {!loading&&!error&&<>
   <p role="status">第 {pageIndex+1} 页 · 本页 {rows.length} 个精确版本。</p>
   <div className="sys-records">{rows.map(row=><article className="sys-standard-history" key={row.instrumentKey+'@'+row.instrumentVersion} aria-label={row.name+' · '+row.instrumentVersion}>
    <h3>{row.name} · {row.instrumentVersion}</h3><p>{row.instrumentKey}</p><p className="sys-badge">{row.stage}</p>
    <dl className="sys-facts">
     <div><dt>内容导入</dt><dd>{row.states.imported?'已导入可执行内容':'仅目录资料，尚无可执行内容'}</dd></div>
     <div><dt>译文治理审核</dt><dd>{reviewLabels[row.states.localizationReview]??row.states.localizationReview}</dd></div>
     <div><dt>专家审校</dt><dd>{reviewLabels[row.states.expertReview]??row.states.expertReview}</dd></div>
     <div><dt>科学资格</dt><dd>{row.states.scientificQualified?'当前声明已满足':'当前声明未满足'} · {row.states.scientificMaturity?(maturityLabels[row.states.scientificMaturity]??row.states.scientificMaturity):'尚未声明成熟度'}</dd></div>
     <div><dt>部署策略</dt><dd>{row.states.deployed?'已配置有效部署':'尚无有效部署'}</dd></div>
     <div><dt>内容发布</dt><dd>{row.states.published?'已发布':'未发布'}</dd></div>
     <div><dt>目录可见性</dt><dd>{row.states.visible?'可见':'隐藏或未安装'}</dd></div>
     <div><dt>Training 量表入口策略</dt><dd>{row.states.trainingEntryPaused?'已暂停新增使用':entryLabels[row.states.trainingEntry]??'未识别的决定，请核对'}</dd></div>
     <div><dt>Survey 量表入口策略</dt><dd>{row.states.surveyEntryPaused?'已暂停新增使用':entryLabels[row.states.surveyEntry]??'未识别的决定，请核对'}</dd></div>
    </dl>
    <p>以上为该量表版本的状态；内容、参数与报告的批准组合仍须单独审核和试运行，入口使用权仍须另行分配。</p>
    {row.blockers.length>0?<div className="sys-message"><h4>待处理事项</h4><ul>{row.blockers.map(code=>{
     const action=row.nextActions.find(item=>item.code===code)
     return <li key={code}>{action?<><strong>{action.stage}</strong> · 责任角色：{action.owner}<p>{action.next}</p></>:<p>{/[\u3400-\u9fff]/.test(code)?code:gapLabels[code]??'该项缺口尚无中文说明，请核对来源资料及下方标识。'}</p>}<details className="sys-technical"><summary>阻断标识</summary><code>{code}</code></details></li>
    })}</ul></div>:<p>当前未列出内容阻断；这不代替组合批准、试运行及入口授权。</p>}
    {onOpenWorkspace&&<div className="system-actions"><p>目录记录不会自动生成可编辑草稿。按待办补齐内容后导入，或查找之前保存的草稿继续处理。</p>
     <button type="button" onClick={()=>onOpenWorkspace({instrumentKey:row.instrumentKey,instrumentVersion:row.instrumentVersion,name:row.name},'import')}>补齐内容并导入</button>
     <button type="button" onClick={()=>onOpenWorkspace({instrumentKey:row.instrumentKey,instrumentVersion:row.instrumentVersion,name:row.name},'drafts')}>查找已有草稿</button>
    </div>}
   </article>)}</div>
   {!rows.length&&<p>{appliedQuery.current?'没有符合检索条件的精确版本。':pageIndex?'本页没有接入记录，请返回上一页或刷新。':'尚无标准量表接入记录。'}</p>}
   <nav aria-label="接入状态分页"><button type="button" disabled={!pageIndex||loading} onClick={previous}>上一页</button><button type="button" disabled={!nextCursor||loading} onClick={next}>下一页</button></nav>
  </>}
 </section>
}
