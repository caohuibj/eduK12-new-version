import { trainingCourseContext } from '../../training/courseNavigation'
import { assessmentContextHref } from '../../training/assessmentContextHref'
import TrainingCatalogTags from '../../training/TrainingCatalogTags'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, ClipboardList, Copy, Download, FileArchive, FileSpreadsheet, Plus, ShieldCheck, X } from 'lucide-react'
import { ProductPage, PageHeader, ProductButton } from '../../components/product-ui'
import ModalSurface from '../../components/shared-ui/ModalSurface'
import { sessionFetch } from '../../api/client'
import { compositeApi } from '../../modules/composite/api'
import { assertExportDownload, clearExportIntentKey, ExportJobFailedError, requestExportIntent, triggerExportDownload, waitForExportArtifacts } from '../../utils/exportJobs'
import './training-questionnaire-list.css'

type Row = { id: string; name: string; kind: string; status: string; editHref: string; created?: string; tags?: string[] }
type Props = { data: { list: Row[]; total: number }; page: number; loading: boolean; error: string; actorId: string
 onPage: (page: number) => void; onCopy: (id: string) => Promise<void>; onTemplate: (row: Row) => void; savingTemplate: boolean; templatePanel: ReactNode; onReload: () => void; pagination?:ReactNode;filtered?:boolean; status?:string; onStatus?:(status:string)=>void; copying?:string }
const statusLabel: Record<string,string> = { DRAFT:'草稿', PUBLISHED:'已发布', ARCHIVED:'已停用', DEPRECATED:'已停用' }
const kindLabel = (kind: string) => kind === 'LEGACY' ? '历史问卷' : kind === 'LEGACY_COMPOSITE' ? '历史组合测评' : '组合测评'

export function AssessmentDataExport({ row, actorId, onClose, course }: { row: Row; actorId: string; onClose: () => void; course?: { id: string; title: string } }) {
 const [format, setFormat] = useState<'csv'|'zip'>('csv')
 const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('')
 const pending = useRef(false), alive = useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const close = () => { if (!pending.current) onClose() }
 async function run() {
  if (pending.current) return
  pending.current=true;setBusy(true);setError('');setNotice('正在提交导出…')
  const scope=`training-list:${actorId}:${row.id}:summary:${format}:anonymized${course ? ':'+course.id : ''}`
  try {
   const response=await requestExportIntent(scope,key=>compositeApi.exportData(row.id,{detail:'summary',format,anonymize:true,...(course ? {courseId:course.id} : {})},key))
   if (!alive.current) return
   if(response.code!==0||!response.data?.artifacts)throw Error(response.message||'导出失败')
   setNotice('导出已受理，正在生成文件，请稍候。')
   const [artifact]=await waitForExportArtifacts(response.data.artifacts)
   if (!alive.current) return
   const download=await sessionFetch(artifact.downloadUrl,{signal:AbortSignal.timeout(60000)})
   assertExportDownload(download)
   const blob=await download.blob()
   if (!alive.current) return
   triggerExportDownload(blob,artifact.fileName);clearExportIntentKey(scope)
   setNotice('已请求下载，请查看浏览器下载列表。')
  } catch(cause) {
   if (!alive.current) return
   if(cause instanceof ExportJobFailedError)clearExportIntentKey(scope)
   setNotice('');setError(cause instanceof Error ? cause.message : '导出失败，请重试。')
  } finally { pending.current=false;if(alive.current)setBusy(false) }
 }
 return <ModalSurface open onClose={close} className="tql-modal-surface"><section className="tql-export-dialog" role="dialog" aria-modal="true" aria-labelledby="tql-export-title" aria-describedby="tql-export-description" tabIndex={-1} aria-busy={busy}>
  <header><span className="tql-export-icon"><Download size={22} aria-hidden="true"/></span><div><small>数据与分析</small><h2 id="tql-export-title">导出脱敏摘要</h2></div><button type="button" disabled={busy} onClick={close} aria-label="关闭数据导出"><X size={20}/></button></header>
  <p className="tql-export-name">{row.name}</p><p id="tql-export-description">{course ? `仅导出「${course.title}」中明确绑定本课程的已完成作答摘要，不合并其他课程或无法确定课程的历史记录。` : '导出此测评的已完成作答摘要，按系统现有授权提供可用字段。'}</p>
  <fieldset disabled={busy}><legend>选择文件格式</legend><div className="tql-format-options">{([
   ['csv','CSV 数据表','便于用 Excel、R 等工具读取',FileSpreadsheet],['zip','ZIP 数据与字典','包含数据表和字段说明，适合留存与分析',FileArchive],
  ] as const).map(([value,label,hint,Icon])=><label key={value} className={format===value?'is-selected':''}><input type="radio" name="tql-format" value={value} checked={format===value} onChange={()=>setFormat(value)}/><Icon size={22} aria-hidden="true"/><strong>{label}</strong><small>{hint}</small></label>)}</div></fieldset>
  <div className="tql-privacy"><ShieldCheck size={18} aria-hidden="true"/><div><strong>始终启用脱敏</strong><p>隐藏系统姓名，保留参与者编号和获授权的数据字段。背景题中自行填写的信息仍需留意，分享文件前请检查。</p></div></div>
  <details className="tql-export-help"><summary>摘要包含什么？还有哪些格式？</summary><p>摘要包含获授权的测评结果；高级表单摘要不含自由文本和“其他”说明。原始回答、认知逐试次和计时仍受各自权限控制。</p><p>本入口提供 CSV 和 ZIP。完整明细和独立报告 JSON 请到测评配置中查看；高级表单暂不支持 SPSS SAV。历史问卷的 CSV / SAV 使用原有导出入口。</p><Link to={row.editHref} onClick={event=>{if(pending.current)event.preventDefault()}} aria-disabled={busy || undefined}>前往测评配置 <ArrowRight size={13} aria-hidden="true"/></Link></details>
  {notice && <p role="status" className="tql-export-notice">{notice}</p>}{error && <p role="alert" className="tql-export-error">{error}</p>}
  <footer><button type="button" disabled={busy} onClick={close}>关闭</button><button type="button" className="tql-primary" disabled={busy} onClick={()=>void run()}><Download size={16} aria-hidden="true"/>{busy?'正在生成…':`导出 ${format.toUpperCase()}`}</button></footer>
 </section></ModalSurface>
}

export function TrainingQuestionnaireList({data,page,loading,error,actorId,onPage,onCopy,onTemplate,savingTemplate,templatePanel,onReload,pagination,filtered=false,status='',onStatus,copying=''}:Props) {
 const location=useLocation()
 const context=trainingCourseContext(location.pathname,location.search)
 const contextualHref=(path:string)=>assessmentContextHref(path,location.pathname,location.search)
 const [exportRow,setExportRow]=useState<Row|null>(null)
 return <ProductPage width="management" className="hui-questionnaire-products training-form-management tql-page">
  <PageHeader title={context?'复用测评':'全部测评'} description={context?'选择已有内容，复制为新草稿后编辑并发布到课程。':'查找、编制和复用你的测评。'} actions={<Link className="tql-secondary" to={contextualHref("/questionnaire-products/new")}><Plus size={17} aria-hidden="true"/>发布测评</Link>}/>
  <div className="tql-list-toolbar"><div className="tql-status-filter" role="group" aria-label="测评状态">{([['','全部'],['DRAFT','草稿'],['PUBLISHED','已发布']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={status===value} onClick={()=>onStatus?.(value)}>{label}</button>)}</div><span>{loading?'正在加载…':`共 ${data.total} 份`}</span></div>
  {templatePanel}
  {error && <div role="alert" className="tql-error">{error}<ProductButton onClick={onReload}>重新加载列表</ProductButton></div>}
  <section className="tql-records" aria-label="测评列表">
   {loading?<p role="status" className="tql-empty">正在加载组合测评…</p>:data.list.length?data.list.map(row=>{
    const hasResults=row.status!=='DRAFT', composite=row.kind==='COLLECTION'||row.kind==='LEGACY_COMPOSITE'
    return <article className={`tql-card${context?' tql-card--reuse':''}`} key={row.kind+row.id}>
     <div className="tql-card-main"><span className="tql-card-icon"><ClipboardList size={22} aria-hidden="true"/></span><div><div className="tql-card-title"><h3><Link to={contextualHref(row.editHref)}>{row.name}</Link></h3><span className={`tql-status is-${row.status.toLowerCase()}`}>{statusLabel[row.status]||row.status}</span></div><p>{kindLabel(row.kind)}{!context&&<> <span>·</span> 单项报告合集</>}</p></div></div>
     <div className="tql-card-actions">{context&&<button type="button" className="tql-primary" disabled={Boolean(copying)} onClick={()=>void onCopy(row.id)}><Copy size={15} aria-hidden="true"/>{copying===row.id?'正在复制…':'使用此测评'}</button>}<Link className={!context&&hasResults&&composite?'tql-primary':'tql-secondary'} to={contextualHref(!context&&hasResults&&composite?`/composite-assessments/${encodeURIComponent(row.id)}/results`:row.editHref)}>{context?'查看内容':hasResults&&composite?'作答与结果':row.status==='DRAFT'?'继续编制':'查看与编制'}<ArrowRight size={14} aria-hidden="true"/></Link>
      {!context&&(composite?<button type="button" className="tql-secondary" disabled={!hasResults} title={!hasResults?'发布并收集作答后即可导出数据':undefined} onClick={()=>setExportRow(row)}><Download size={15} aria-hidden="true"/>导出数据</button>:<Link className="tql-secondary" to="/questionnaires/legacy"><Download size={15} aria-hidden="true"/>历史问卷导出</Link>)}
     </div>
     {!context&&<><TrainingCatalogTags key={JSON.stringify(row.tags)} id={row.id} kind={row.kind} tags={row.tags} onSaved={onReload}/>
     <footer><span>{row.status==='DRAFT'?'草稿尚未收集作答':composite?'结果与导出按当前权限开放':'使用原有问卷流程管理与导出'}</span><details className="tql-more"><summary>更多操作</summary><div>{hasResults&&<Link to={contextualHref(row.editHref)}>配置与链接</Link>}{row.kind==='COLLECTION'&&row.status==='DRAFT'&&<Link to={contextualHref(row.editHref)+'#questionnaire-publish'}>前往发布</Link>}<ProductButton disabled={Boolean(copying)} onClick={()=>void onCopy(row.id)}><Copy size={13} aria-hidden="true"/>{copying===row.id?'正在复制…':'复制为新草稿'}</ProductButton><ProductButton disabled={savingTemplate} onClick={()=>onTemplate(row)}>保存为组合模板</ProductButton></div></details></footer></>}
    </article>
   }):error?<p className="tql-empty">列表暂不可用，请重新加载。</p>:<div className="tql-empty"><ClipboardList size={32} aria-hidden="true"/><h3>{filtered?'没有符合条件的测评':'从第一份测评开始'}</h3><p>{filtered?'请调整状态、标题、标签或时间范围。':'创建草稿，添加量表、表单、情境或认知内容。'}</p><Link className="tql-primary" to={contextualHref("/questionnaire-products/new")}>发布测评<ArrowRight size={14} aria-hidden="true"/></Link></div>}
  </section>
  {pagination || <nav className="tql-pagination" aria-label="组合测评分页"><button type="button" disabled={loading||page===1} onClick={()=>onPage(page-1)}>上一页</button><span>第 {page} 页，共 {data.total} 份</span><button type="button" disabled={loading||page*25>=data.total} onClick={()=>onPage(page+1)}>下一页</button></nav>}
  <details className="tql-history"><summary>更多工具与数据导出说明</summary><p>在每份测评中选择“导出数据”，可下载脱敏摘要 CSV 或包含字段字典的 ZIP。系统姓名会隐藏；参与者编号及获授权的背景题可能保留，分享前请检查。</p><div><Link to="/assessment-templates">测评模板</Link><Link to="/assessment-workbench">作答概览</Link><Link to="/assessment-management">归档与操作记录</Link><Link to="/questionnaires/legacy">原有问卷管理与导出</Link><Link to="/composite-assessments">历史综合测评管理</Link><Link to="/bundle-products">固定测评包：管理员审批版本与整体报告</Link></div></details>
  {exportRow&&<AssessmentDataExport key={JSON.stringify([actorId,exportRow.id])} row={{...exportRow,editHref:contextualHref(exportRow.editHref)}} actorId={actorId} onClose={()=>setExportRow(null)}/>}
 </ProductPage>
}
