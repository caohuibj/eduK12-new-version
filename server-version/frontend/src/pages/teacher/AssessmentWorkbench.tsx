import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import { apiErrorMessage } from '../../utils/apiErrorMessage'
import { isTrainingHost } from '../../training/context'
import { resolveTrainingCoursePrefill } from '../../training/resolveCoursePrefill'

interface Overview {
 course: { id: string; title: string }; page: number; total: number; pageSize: number; countMeaning: string
 list: Array<{ id: string; name: string; status: string; productKind: string; attempts: Record<string, number> }>
 quality: Array<{ id: string; participant: string; title: string; status: string; qualityState: string; finishedAt: string | null; reportHref: string | null }>
 qualityHasMore: boolean
}
const labels: Record<string,string> = { PUBLISHED:'已发布', DRAFT:'草稿', ARCHIVED:'已归档', IN_PROGRESS:'进行中', COMPLETED:'已完成', ABANDONED:'已放弃', INVALID:'无效', interpretable:'可解释', limited:'质量受限', invalid:'需核对施测', pending:'尚未完成', unavailable:'质量记录待核对' }
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
 return <ProductPage width="management"><PageHeader title={training ? '培训结果' : '测评结果工作台'} description={training
  ? '查看当前课程的组合测评和认知任务完成情况。普通量表与课程问卷请从课程测评清单进入各自获授权的管理页。'
  : '先核对课程完成情况与数据质量，再进入获授权的群体或纵向报告。'}/>
  {!training && <nav className="my-4 flex flex-wrap gap-4"><Link to="/assessment-templates">模板库</Link><Link to="/assessment-management">合成对象与操作记录</Link><Link to="/questionnaires">组合测评</Link></nav>}
  <label className="my-4 block min-w-0">课程<select className="input my-2 block w-full min-w-0 max-w-full" value={course} onChange={e=>{setCourse(e.target.value);setPage(1)}}><option value="">请选择课程</option>{courses.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
  <ProductButton disabled={loading} onClick={()=>setRetry(x=>x+1)}>刷新课程概览</ProductButton>
  {error&&<ProductStatus kind="error" title="概览读取失败">{error}</ProductStatus>}
  {loading&&<div role="status" aria-label="正在读取课程结果" className="my-4 grid animate-pulse gap-4 sm:grid-cols-3">{[0,1,2].map(x=><div key={x} className="h-24 rounded bg-slate-100"/>)}</div>}
  {data&&<><h2 className="mt-6 text-xl font-semibold">{data.course.title} · 投放完成情况</h2><p className="my-2 text-sm">{data.countMeaning}</p>
   <div className="grid gap-4 md:grid-cols-2">{data.list.map(row=><article key={row.id} className="rounded-xl border bg-white p-4"><h3 className="font-semibold">{row.name}</h3><p>{labels[row.status]||row.status} · {row.productKind==='ASSESSMENT_BUNDLE'?'整体报告':'单项报告合集'}</p><dl className="my-3 grid grid-cols-3 gap-2">{['IN_PROGRESS','COMPLETED','ABANDONED'].map(s=><div key={s}><dt>{labels[s]}</dt><dd className="text-xl">{row.attempts[s]||0}</dd></div>)}</dl><Link to={`/composite-assessments/${row.id}/results`}>查看作答与获授权报告</Link></article>)}</div>
   {!data.list.length&&<p className="my-4">该课程暂无组合测评投放，可从模板库创建。</p>}
   <h2 className="mt-8 text-xl font-semibold">认知任务完成与质量</h2><p className="my-2 text-sm">按作答时间排列；质量状态来自冻结结果，用于施测复核。</p>
   <div className="space-y-3">{data.quality.map(row=><article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-4"><div><h3>{row.participant} · {row.title}</h3><p>{labels[row.status]||row.status} · {labels[row.qualityState]||'待核对'} · {row.finishedAt?new Date(row.finishedAt).toLocaleString('zh-CN'):'尚未完成'}</p></div>{row.status==='COMPLETED'&&row.reportHref&&<Link to={row.reportHref}>按权限查看单项结果</Link>}</article>)}</div>
   {!data.quality.length&&<p>当前页暂无认知作答记录。</p>}
   <div className="my-4 flex gap-3"><ProductButton disabled={page===1} onClick={()=>setPage(x=>x-1)}>上一页</ProductButton><span>第 {page} 页</span><ProductButton disabled={page*data.pageSize>=data.total&&!data.qualityHasMore} onClick={()=>setPage(x=>x+1)}>下一页</ProductButton></div>
  </>}
  {!training ? <section className="my-8 space-y-4 rounded-xl border bg-white p-4"><h2 className="text-xl font-semibold">群体概览与纵向变化</h2><p>以下入口使用所选组织的报告范围；课程完成情况与组织人群分别核对。报告会显示人群、版本、时间点及允许的比较方式。</p>
   <label className="block min-w-0">报告所属组织<select className="input my-2 block w-full min-w-0 max-w-full" disabled={activeLoading} value={active?.organization.id||''} onChange={e=>void selectOrganization(e.target.value)}><option value="">请选择组织</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
   {active&&!activeLoading&&<div className="flex flex-wrap gap-4">{active.allowedActions.includes('REPORTING')&&<Link to={`/organizations/${active.organization.id}/reporting`}>单次群体、群体趋势与个人纵向报告</Link>}{active.allowedActions.includes('PARENT_REPORT_PUBLICATION')&&<Link to={`/organizations/${active.organization.id}/parent-reports`}>家长报告批量准备与逐份授权</Link>}</div>}
   <p className="text-sm text-slate-600">参考范围与差值由已审批报告方案决定。隐私保护、质量受限或不可比时保留明确说明，不按样本数量自动启用参考值。</p>
  </section> : <p className="my-8 text-sm text-slate-600">培训课程的群体与纵向报告需要经过课程来源适配和相应隐私审核，目前尚未作为培训版功能开放。</p>}
 </ProductPage>
}
