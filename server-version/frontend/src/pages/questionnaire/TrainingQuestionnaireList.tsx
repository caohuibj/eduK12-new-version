import { trainingCourseContext } from '../../training/courseNavigation'
import { assessmentContextHref } from '../../training/assessmentContextHref'
import TrainingCatalogTags from '../../training/TrainingCatalogTags'
import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, ClipboardList, Copy, Download, Plus } from 'lucide-react'
import { ProductPage, PageHeader, ProductButton } from '../../components/product-ui'
import './training-questionnaire-list.css'

import AssessmentDataExport from './DeferredAssessmentDataExport'

type Row = { id: string; name: string; kind: string; status: string; editHref: string; created?: string; tags?: string[] }
type Props = { data: { list: Row[]; total: number }; page: number; loading: boolean; error: string; actorId: string
 onPage: (page: number) => void; onCopy: (id: string) => Promise<void>; onTemplate: (row: Row) => void; savingTemplate: boolean; templatePanel: ReactNode; onReload: () => void; pagination?:ReactNode;filtered?:boolean; status?:string; onStatus?:(status:string)=>void; copying?:string }
const statusLabel: Record<string,string> = { DRAFT:'草稿', PUBLISHED:'已发布', ARCHIVED:'已停用', DEPRECATED:'已停用' }
const kindLabel = (kind: string) => kind === 'LEGACY' ? '历史问卷' : kind === 'LEGACY_COMPOSITE' ? '历史组合测评' : '组合测评'

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
