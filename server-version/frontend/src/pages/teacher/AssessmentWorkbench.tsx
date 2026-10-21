import './assessment-workbench.css'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import { apiErrorMessage } from '../../utils/apiErrorMessage'
import { isTrainingHost } from '../../training/context'
import { resolveTrainingCoursePrefill } from '../../training/resolveCoursePrefill'
import { ArrowLeft, ArrowUpRight, BookOpen, ChevronDown, ClipboardList, Info, Layers3, RefreshCw } from 'lucide-react'

interface Overview {
 course: { id: string; title: string }; page: number; total: number; pageSize: number; countMeaning: string
 list: Array<{ id: string; name: string; status: string; productKind: string; attempts: Record<string, number> }>
 quality: Array<{ id: string; participant: string; title: string; status: string; qualityState: string; finishedAt: string | null; reportHref: string | null }>
 qualityHasMore: boolean
}
const labels: Record<string,string> = { PUBLISHED:'已发布', DRAFT:'草稿', ARCHIVED:'已归档', IN_PROGRESS:'进行中', COMPLETED:'已交卷', SATISFIED:'任务达成', NOT_SATISFIED:'任务未达成', ABANDONED:'已放弃', INVALID:'无效', interpretable:'可解释', limited:'质量受限', invalid:'需核对施测', pending:'尚未完成', unavailable:'质量记录待核对' }
type CourseOption = { id: string; title: string }

function TrainingResultsView({ courses, course, page, data, loading, error, onCourse, onRefresh, onPage }: {
 courses: CourseOption[]; course: string; page: number; data: Overview | null; loading: boolean; error: string
 onCourse: (id: string) => void; onRefresh: () => void; onPage: (page: number) => void
}) {
 const location = useLocation()
 const returnQuery = new URLSearchParams(location.search)
 returnQuery.set('courseId', course)
 const resultsReturnTo = location.pathname + '?' + returnQuery.toString()
 const courseTitle = data?.course.title || courses.find(row => row.id === course)?.title || '选择要查看的课程'
 const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
 return <ProductPage width="management" className="training-results-workbench">
  <div className="twb-eyebrow"><span>课程教学</span><span aria-hidden="true">/</span>测评结果</div>
  <PageHeader title="培训结果" description="按课程查看组合测评的作答进度与报告。量表、表单、情境和认知内容统一从对应测评进入。"
   actions={<Link className="twb-back" to={course ? `/courses/${encodeURIComponent(course)}/detail` : '/dashboard'}><ArrowLeft size={15} aria-hidden="true"/>返回课程</Link>}/>

  <section className="twb-course-panel" aria-label="选择课程">
   <div className="twb-course-icon"><BookOpen size={22} aria-hidden="true"/></div>
   <div className="twb-course-field"><label htmlFor="twb-course">当前课程</label><div className="twb-select-wrap">
    <select id="twb-course" value={course} onChange={event => onCourse(event.target.value)}><option value="">请选择课程</option>{courses.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select>
    <ChevronDown size={17} aria-hidden="true"/>
   </div></div>
   <ProductButton className="twb-refresh" disabled={loading || !course} onClick={onRefresh}><RefreshCw size={15} aria-hidden="true"/>刷新课程概览</ProductButton>
  </section>

  {error && <ProductStatus kind="error" title="概览读取失败">{error}</ProductStatus>}
  {!course && !error && <section className="twb-empty twb-introduction" aria-label="开始查看培训结果">
   <div className="twb-empty-icon"><ClipboardList size={28} aria-hidden="true"/></div><h2>从一门课程开始</h2><p>选择课程后，在这里查看每项组合测评的作答情况。</p>
   <ol><li><span>01</span>选择课程</li><li><span>02</span>查看测评进度</li><li><span>03</span>打开作答与报告</li></ol>
  </section>}
  {loading && <div role="status" aria-label="正在读取课程结果" className="twb-loading"><div/><div/><div/><p>正在读取课程测评结果…</p></div>}
  {data && !loading && <>
   <section className="twb-overview" aria-label="课程测评概览"><div><span className="twb-section-label">当前课程概览</span><h2>{courseTitle}</h2><p>先了解投放与作答情况，再进入具体测评查看报告。</p></div>
    <dl><div><dt>课程测评总数</dt><dd>{data.total}</dd></div><div><dt>本页展示</dt><dd>{data.list.length}</dd></div><div><dt>本页已发布</dt><dd>{data.list.filter(row => row.status === 'PUBLISHED').length}</dd></div></dl>
   </section>
   <section className="twb-assessments" aria-label="组合测评完成情况">
    <div className="twb-section-heading"><div><span className="twb-section-label">ASSESSMENTS</span><h2>课程测评</h2></div><span className="twb-count">共 {data.total} 项</span></div>
    {data.countMeaning && <p className="twb-count-note"><Info size={15} aria-hidden="true"/><span>{data.countMeaning}</span></p>}
    <div className="twb-card-grid">{data.list.map(row => <article key={row.id} className="twb-assessment-card">
     <header><span className="twb-card-icon"><Layers3 size={19} aria-hidden="true"/></span><span className={`twb-status twb-status--${row.status.toLowerCase()}`}>{labels[row.status] || row.status}</span></header>
     <h3>{row.name}</h3><p className="twb-report-kind">组合测评 · {row.productKind === 'ASSESSMENT_BUNDLE' ? '整体报告' : '单项报告合集'}</p>
     <dl className="twb-attempts">{['IN_PROGRESS','COMPLETED','SATISFIED','NOT_SATISFIED','ABANDONED'].map(status => <div key={status} className={status === 'COMPLETED' ? 'twb-attempts-submitted' : undefined}><dt>{labels[status]}</dt><dd>{row.attempts[status] || 0}</dd></div>)}</dl>
     <footer><span>统计单位：作答次数</span>{row.productKind === 'QUESTIONNAIRE' ? <Link to={`/composite-assessments/${encodeURIComponent(row.id)}/results?courseId=${encodeURIComponent(course)}&returnTo=${encodeURIComponent(resultsReturnTo)}`}>查看作答与获授权报告<ArrowUpRight size={16} aria-hidden="true"/></Link> : <span>此类历史测评未记录课程来源，请从测评管理查看完整结果（非课程范围）。</span>}</footer>
    </article>)}</div>
    {!data.list.length && <div className="twb-empty"><div className="twb-empty-icon"><Layers3 size={27} aria-hidden="true"/></div><h3>当前课程暂无组合测评投放。</h3><p>课程发布组合测评后，作答进度和报告入口会显示在这里。</p></div>}
   </section>
   {(data.total > 0 || page > 1) && <nav className="twb-pagination" aria-label="课程测评分页"><span>第 {page} / {pageCount} 页</span><div><ProductButton disabled={page === 1} onClick={() => onPage(page - 1)}>上一页</ProductButton><ProductButton disabled={page * data.pageSize >= data.total} onClick={() => onPage(page + 1)}>下一页</ProductButton></div></nav>}
  </>}
  <p className="twb-permission-note"><Info size={14} aria-hidden="true"/><span>报告按当前账号的权限开放。作答次数不等同于参与人数，具体统计口径以各测评说明为准。</span></p>
 </ProductPage>
}
export default function AssessmentWorkbench() { const { user } = useAuth(); return <Workbench key={user?.id} /> }
function Workbench() {
 const training = isTrainingHost()
 const { user } = useAuth()
 const [query] = useSearchParams(), { organizations, active, activeLoading, selectOrganization } = useOrganization()
 const [courses,setCourses]=useState<Array<{id:string;title:string}>>([]), [course,setCourse]=useState(query.get('courseId')||''), [page,setPage]=useState(1)
 const [data,setData]=useState<Overview|null>(null), [loading,setLoading]=useState(false), [error,setError]=useState(''), [retry,setRetry]=useState(0), epoch=useRef(0)
 useEffect(()=>{ let live=true; void api.get<{courses:Array<{id:string;title:string}>}>('/questionnaire-products/resources').then(async r=>{
  if(r.code!==0)throw r
  const rows = r.data.courses
  const extra = await resolveTrainingCoursePrefill({ courseId: query.get('courseId'), userId: user?.id, knownIds: rows.map(row=>row.id) })
  if(live)setCourses(extra ? [...rows, { id: extra.id, title: extra.title }] : rows)
 }).catch(e=>{if(live)setError(apiErrorMessage(e))});return()=>{live=false} },[query,user?.id])
 useEffect(()=>{ const current=++epoch.current;setData(null);setError('');if(!course){setLoading(false);return}setLoading(true)
  void api.get<Overview>(`/questionnaire-products/workspace/courses/${encodeURIComponent(course)}?page=${page}`).then(r=>{if(r.code!==0)throw r;if(current===epoch.current)setData(r.data)}).catch(e=>{if(current===epoch.current)setError(apiErrorMessage(e))}).finally(()=>{if(current===epoch.current)setLoading(false)})
  return()=>{epoch.current++}
 },[course,page,retry])
 useEffect(()=>{const refresh=()=>{setData(null);setRetry(x=>x+1)};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh)},[])
 if(training)return <TrainingResultsView courses={courses} course={course} page={page} data={data} loading={loading} error={error}
  onCourse={id=>{setCourse(id);setPage(1)}} onRefresh={()=>setRetry(x=>x+1)} onPage={setPage}/>
 return <ProductPage width="management" className={training ? 'training-results' : undefined}><PageHeader title={training ? '培训结果' : '测评结果工作台'} description={training
  ? '查看当前课程的组合测评和认知任务完成情况。普通量表与课程问卷请从课程测评清单进入各自获授权的管理页。'
  : '先核对课程完成情况与数据质量，再进入获授权的群体或纵向报告。'}/>
  {!training && <nav className="my-4 flex flex-wrap gap-4"><Link to="/assessment-templates">模板库</Link><Link to="/assessment-management">合成对象与操作记录</Link><Link to="/questionnaires">组合测评</Link></nav>}
  <div className={training ? "training-results-toolbar" : undefined}>
  <label className="my-4 block min-w-0">课程<select className="input my-2 block w-full min-w-0 max-w-full" value={course} onChange={e=>{setCourse(e.target.value);setPage(1)}}><option value="">请选择课程</option>{courses.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
  <ProductButton disabled={loading} onClick={()=>setRetry(x=>x+1)}>刷新课程概览</ProductButton>
  </div>
  {error&&<ProductStatus kind="error" title="概览读取失败">{error}</ProductStatus>}
  {loading&&<div role="status" aria-label="正在读取课程结果" className="my-4 grid animate-pulse gap-4 sm:grid-cols-3">{[0,1,2].map(x=><div key={x} className="h-24 rounded bg-slate-100"/>)}</div>}
  {data&&<><div className="training-results-sections"><section aria-label="组合测评完成情况"><h2 className="mt-6 text-xl font-semibold">{data.course.title} · 投放完成情况</h2><p className="my-2 text-sm">{data.countMeaning}</p>
   <div className="grid gap-4 md:grid-cols-2">{data.list.map(row=><article key={row.id} className="rounded-xl border bg-white p-4"><h3 className="font-semibold">{row.name}</h3><p>{labels[row.status]||row.status} · {row.productKind==='ASSESSMENT_BUNDLE'?'整体报告':'单项报告合集'}</p><dl className="my-3 grid grid-cols-3 gap-2">{['IN_PROGRESS','COMPLETED','SATISFIED','NOT_SATISFIED','ABANDONED'].map(s=><div key={s}><dt>{labels[s]}</dt><dd className="text-xl">{row.attempts[s]||0}</dd></div>)}</dl><Link to={`/composite-assessments/${row.id}/results`}>查看作答与获授权报告</Link></article>)}</div>
   {!data.list.length&&<p className="my-4">{training ? '当前课程暂无组合测评投放。' : '该课程暂无组合测评投放，可从模板库创建。'}</p>}
   </section><section aria-label="认知任务完成与质量"><h2 className="mt-8 text-xl font-semibold">认知任务完成与质量</h2><p className="my-2 text-sm">按作答时间排列；质量状态来自冻结结果，用于施测复核。</p>
   <div className="space-y-3">{data.quality.map(row=><article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-4"><div><h3>{row.participant} · {row.title}</h3><p>{labels[row.status]||row.status} · {labels[row.qualityState]||'待核对'} · {row.finishedAt?new Date(row.finishedAt).toLocaleString('zh-CN'):'尚未完成'}</p></div>{row.status==='COMPLETED'&&row.reportHref&&<Link to={row.reportHref}>按权限查看单项结果</Link>}</article>)}</div>
   {!data.quality.length&&<p>当前页暂无认知作答记录。</p>}
   </section></div>
   <div className="my-4 flex gap-3"><ProductButton disabled={page===1} onClick={()=>setPage(x=>x-1)}>上一页</ProductButton><span>第 {page} 页</span><ProductButton disabled={page*data.pageSize>=data.total&&!data.qualityHasMore} onClick={()=>setPage(x=>x+1)}>下一页</ProductButton></div>
  </>}
  {!training ? <section className="my-8 space-y-4 rounded-xl border bg-white p-4"><h2 className="text-xl font-semibold">群体概览与纵向变化</h2><p>以下入口使用所选组织的报告范围；课程完成情况与组织人群分别核对。报告会显示人群、版本、时间点及允许的比较方式。</p>
   <label className="block min-w-0">报告所属组织<select className="input my-2 block w-full min-w-0 max-w-full" disabled={activeLoading} value={active?.organization.id||''} onChange={e=>void selectOrganization(e.target.value)}><option value="">请选择组织</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
   {active&&!activeLoading&&<div className="flex flex-wrap gap-4">{active.allowedActions.includes('REPORTING')&&<Link to={`/organizations/${active.organization.id}/reporting`}>单次群体、群体趋势与个人纵向报告</Link>}{active.allowedActions.includes('PARENT_REPORT_PUBLICATION')&&<Link to={`/organizations/${active.organization.id}/parent-reports`}>家长报告批量准备与逐份授权</Link>}</div>}
   <p className="text-sm text-slate-600">参考范围与差值由已审批报告方案决定。隐私保护、质量受限或不可比时保留明确说明，不按样本数量自动启用参考值。</p>
  </section> : <p className="my-8 text-sm text-slate-600">培训课程的群体与纵向报告需要经过课程来源适配和相应隐私审核，目前尚未作为培训版功能开放。</p>}
 </ProductPage>
}
