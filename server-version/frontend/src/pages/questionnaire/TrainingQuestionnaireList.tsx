import TrainingCatalogTags from '../../training/TrainingCatalogTags'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, BookOpen, ClipboardList, Copy, Download, FileArchive, FileSpreadsheet, Layers, Plus, ShieldCheck, X } from 'lucide-react'
import { ProductPage, PageHeader, ProductButton } from '../../components/product-ui'
import ModalSurface from '../../components/shared-ui/ModalSurface'
import { sessionFetch } from '../../api/client'
import { compositeApi } from '../../modules/composite/api'
import { assertExportDownload, clearExportIntentKey, ExportJobFailedError, requestExportIntent, triggerExportDownload, waitForExportArtifacts } from '../../utils/exportJobs'
import './training-questionnaire-list.css'

type Row = { id: string; name: string; kind: string; status: string; editHref: string; created?: string; tags?: string[] }
type Props = { data: { list: Row[]; total: number }; page: number; loading: boolean; error: string; actorId: string
 onPage: (page: number) => void; onCopy: (id: string) => Promise<void>; onTemplate: (row: Row) => void; savingTemplate: boolean; templatePanel: ReactNode; onReload: () => void; pagination?:ReactNode;filtered?:boolean }
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

export function TrainingQuestionnaireList({data,page,loading,error,actorId,onPage,onCopy,onTemplate,savingTemplate,templatePanel,onReload,pagination,filtered=false}:Props) {
 const location=useLocation()
 const contextualHref=(path:string)=>path+(path.includes('?')?'&':'?')+'returnTo='+encodeURIComponent(location.pathname+location.search)
 const [exportRow,setExportRow]=useState<Row|null>(null)
 const published=data.list.filter(row=>row.status==='PUBLISHED').length
 const drafts=data.list.filter(row=>row.status==='DRAFT').length
 return <ProductPage width="management" className="hui-questionnaire-products training-form-management tql-page">
  <div className="tql-eyebrow">课程测评 <span>/</span> 测评管理</div>
  <PageHeader title="全部测评" description="跨课程查找、复制和复用测评；本课程的日常管理请从课程详情进入。" actions={<Link className="tql-primary" to={contextualHref("/questionnaire-products/new")}><Plus size={17} aria-hidden="true"/>创建组合测评</Link>}/>
  <section className="tql-overview" aria-label="测评概览"><div><ClipboardList size={20} aria-hidden="true"/><strong>{loading?'—':data.total}</strong><span>{filtered?'筛选结果':'全部测评'}</span></div><div><span className="tql-dot"/><strong>{loading?'—':published}</strong><span>本页已发布</span></div><div><span className="tql-dot is-draft"/><strong>{loading?'—':drafts}</strong><span>本页草稿</span></div></section>
  <nav className="tql-shortcuts" aria-label="测评管理工具">{([
   ['/assessment-templates','从模板开始','复用内容，创建新草稿',Layers],['/assessment-workbench','作答概览','按课程了解测评进度',ClipboardList],['/assessment-management','筛选与归档','查找测评、查看操作记录',BookOpen],
  ] as const).map(([to,title,hint,Icon])=><Link key={to as string} to={to as string}><Icon size={20} aria-hidden="true"/><span><strong>{title as string}</strong><small>{hint as string}</small></span><ArrowRight size={15} aria-hidden="true"/></Link>)}</nav>
  <aside className="tql-export-guide"><ShieldCheck size={22} aria-hidden="true"/><div><h2>测评数据，从每一份测评导出</h2><p>在下方点击“导出数据”，选择 CSV 摘要或包含字段字典的 ZIP。先选测评，再选格式，更容易核对数据来源。</p><details><summary>格式和脱敏范围</summary><p>CSV：数据表；ZIP：数据表与字段字典。系统姓名会隐藏，编号及获授权的背景题仍可能保留；脱敏不等于完全匿名。高级表单暂不支持 SAV。独立报告另支持 JSON，历史问卷另有 CSV / SAV 入口。</p></details></div></aside>
  {templatePanel}
  {error && <div role="alert" className="tql-error">{error}<ProductButton onClick={onReload}>重新加载列表</ProductButton></div>}
  <section className="tql-records" aria-label="测评列表"><header><div><h2>全部测评与草稿</h2><p>未绑定课程的草稿、历史测评和可复用内容统一保留在这里。</p></div><span>{loading?'正在加载':`共 ${data.total} 份`}</span></header>
   {loading?<p role="status" className="tql-empty">正在加载组合测评…</p>:data.list.length?data.list.map(row=>{
    const hasResults=row.status!=='DRAFT', composite=row.kind==='COLLECTION'||row.kind==='LEGACY_COMPOSITE'
    return <article className="tql-card" key={row.kind+row.id}>
     <div className="tql-card-main"><span className="tql-card-icon"><ClipboardList size={22} aria-hidden="true"/></span><div><div className="tql-card-title"><h3><Link to={contextualHref(row.editHref)}>{row.name}</Link></h3><span className={`tql-status is-${row.status.toLowerCase()}`}>{statusLabel[row.status]||row.status}</span></div><p>{kindLabel(row.kind)} <span>·</span> 单项报告合集</p></div></div>
     <div className="tql-card-actions"><Link className={hasResults&&composite?'tql-primary':'tql-secondary'} to={contextualHref(hasResults&&composite?`/composite-assessments/${encodeURIComponent(row.id)}/results`:row.editHref)}>{hasResults&&composite?'作答与结果':row.status==='DRAFT'?'继续编制':'查看与编制'}<ArrowRight size={14} aria-hidden="true"/></Link>
      {composite?<button type="button" className="tql-secondary" disabled={!hasResults} title={!hasResults?'发布并收集作答后即可导出数据':undefined} onClick={()=>setExportRow(row)}><Download size={15} aria-hidden="true"/>导出数据</button>:<Link className="tql-secondary" to="/questionnaires/legacy"><Download size={15} aria-hidden="true"/>历史问卷导出</Link>}
     </div>
     <TrainingCatalogTags key={JSON.stringify(row.tags)} id={row.id} kind={row.kind} tags={row.tags} onSaved={onReload}/>
     <footer><span>{row.status==='DRAFT'?'草稿尚未收集作答':composite?'结果与导出按当前权限开放':'使用原有问卷流程管理与导出'}</span><details className="tql-more"><summary>更多操作</summary><div>{hasResults&&<Link to={contextualHref(row.editHref)}>配置与链接</Link>}{row.kind==='COLLECTION'&&row.status==='DRAFT'&&<Link to={contextualHref(row.editHref)+'#questionnaire-publish'}>前往发布</Link>}<ProductButton onClick={()=>void onCopy(row.id)}><Copy size={13} aria-hidden="true"/>复制为新草稿</ProductButton><ProductButton disabled={savingTemplate} onClick={()=>onTemplate(row)}>保存为组合模板</ProductButton></div></details></footer>
    </article>
   }):error?<p className="tql-empty">列表暂不可用，请重新加载。</p>:<div className="tql-empty"><ClipboardList size={32} aria-hidden="true"/><h3>{filtered?'没有符合条件的测评':'从第一份测评开始'}</h3><p>{filtered?'请调整标题、标签或时间范围后重新查询。':'创建草稿，添加量表、表单、情境或认知内容。'}</p><Link className="tql-primary" to={contextualHref("/questionnaire-products/new")}>创建组合测评<ArrowRight size={14} aria-hidden="true"/></Link></div>}
  </section>
  {pagination || <nav className="tql-pagination" aria-label="组合测评分页"><button type="button" disabled={loading||page===1} onClick={()=>onPage(page-1)}>上一页</button><span>第 {page} 页，共 {data.total} 份</span><button type="button" disabled={loading||page*25>=data.total} onClick={()=>onPage(page+1)}>下一页</button></nav>}
  <details className="tql-history"><summary>历史管理与其他测评产品</summary><div><Link to="/questionnaires/legacy">原有问卷管理与导出</Link><Link to="/composite-assessments">历史综合测评管理</Link><Link to="/bundle-products">固定测评包：管理员审批版本与整体报告</Link></div></details>
  {exportRow&&<AssessmentDataExport key={JSON.stringify([actorId,exportRow.id])} row={{...exportRow,editHref:contextualHref(exportRow.editHref)}} actorId={actorId} onClose={()=>setExportRow(null)}/>}
 </ProductPage>
}
