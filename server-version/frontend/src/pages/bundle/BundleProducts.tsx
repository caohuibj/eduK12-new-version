import AssessmentToolPicker from '../../components/AssessmentToolPicker'
import { isTrainingHost } from '../../training/context'
import { trainingCourseContext } from '../../training/courseNavigation'
import { assessmentContextHref } from '../../training/assessmentContextHref'
import './authorized-questionnaires.css'
import { PublicDeliveryManager } from '../../components/PublicDeliveryManager'
import LocalDateTimeInput, { parseLocalDateTime } from '../../components/LocalDateTimeInput'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import MaterialGrantModal from '../../components/MaterialGrantModal'
import { ProductPage, PageHeader, ProductStatus } from '../../components/product-ui'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'
import { apiErrorMessage } from '../../utils/apiErrorMessage'
const statusLabel = (status: string) => ({ DRAFT: '草稿', PUBLISHED: '已发布', ARCHIVED: '已归档', IN_PROGRESS: '进行中', COMPLETED: '已完成', ABANDONED: '已放弃' }[status] || status)
async function request(path: string, body?: unknown): Promise<any> {
  const response = body === undefined ? await api.get<any>(path) : await api.post<any>(path, body)
  if (response.code !== 0) throw new Error(response.message || '操作失败')
  return response.data
}
export function BundleProducts() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const training = isTrainingHost()
  const authorizedOnly = training && searchParams.get('authorized') === '1'
  const context = training ? trainingCourseContext(location.pathname, location.search) : null
  const contextCourseId = context?.courseId
  const contextualHref = (path: string) => context ? assessmentContextHref(path, location.pathname, location.search) : path
  const [keyword, setKeyword] = useState('')
  const [catalogPage, setCatalogPage] = useState(1)
  const [catalog, setCatalog] = useState<any[]>([]), [rows, setRows] = useState<any[]>([])
  const [resources, setResources] = useState<any>({ scales: [], cognitive: [], courses: [] })
  const [selection, setSelection] = useState(''), [name, setName] = useState(''), [courseId, setCourse] = useState('')
  const [publicEnabled, setPublic] = useState(false), [expiresAt, setExpiry] = useState('')
  const [bindings, setBindings] = useState<Record<string,string>>({}), [grant, setGrant] = useState<any>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const setupRef = useRef<HTMLElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const requestIdentity = useRef({payload:'',id:''})
  const loadEpoch = useRef(0)
  const chosen = catalog.find(v => v.bundleKey + '@' + v.bundleVersion === selection)
  const load = useCallback(async () => {
    const epoch = ++loadEpoch.current
    setLoading(true); setError('')
    try {
      const [a,b,c] = await Promise.all([request('/bundle-products/catalog'), request('/bundle-products'), request('/questionnaire-products/resources')])
      if (epoch !== loadEpoch.current) return
      setCatalog(a); setRows(b); setResources(c)
      if (contextCourseId) {
        if (c.courses.some((course: {id:string}) => course.id === contextCourseId)) setCourse(contextCourseId)
        else { setCourse(''); setError('当前课程已不可用或无投放权限，请返回课程重新进入。') }
      }
    } catch (e) { if (epoch === loadEpoch.current) setError(apiErrorMessage(e, '无法读取固定包，请重新加载')) }
    finally { if (epoch === loadEpoch.current) setLoading(false) }
  }, [contextCourseId])
  const invalidateLoads = useCallback(() => { loadEpoch.current++ }, [])
  useEffect(() => { void load(); return invalidateLoads }, [load, invalidateLoads])
  useEffect(() => {
    if (!training || !selection) return
    setupRef.current?.scrollIntoView?.({ block: 'start' })
    nameRef.current?.focus({ preventScroll: true })
  }, [training, selection])
  async function create() {
    if (!chosen?.canInstantiate || busy || loading || (contextCourseId && courseId !== contextCourseId)) return
    setBusy(true); setError('')
    try {
      const expiry = expiresAt ? parseLocalDateTime(expiresAt) : null
      if (publicEnabled && !expiry) throw new Error('请填写有效截止时间，格式为年-月-日 时:分')
      const payload = { name: name || chosen.name,
        bundleKey: chosen.bundleKey, bundleVersion: chosen.bundleVersion, courseId: courseId || null, publicEnabled,
        expiresAt: expiry?.toISOString() ?? null,
        bindings: chosen.slots.filter((slot:any)=>slot.unitType!=='FORM').map((slot:any)=>({slotKey:slot.slotKey,
          ...(bindings[slot.slotKey]?{resourceId:bindings[slot.slotKey]}:{})})) }
      const fingerprint=JSON.stringify(payload)
      if(requestIdentity.current.payload!==fingerprint)requestIdentity.current={payload:fingerprint,id:crypto.randomUUID()}
      const result=await request('/bundle-products',{...payload,requestId:requestIdentity.current.id})
      navigate(contextualHref('/bundle-products/' + result.id))
    } catch(e) { setError(apiErrorMessage(e, '创建失败，请检查配置后重试')) } finally { setBusy(false) }
  }
  const visibleCatalog = catalog.filter(row => (!authorizedOnly || row.canInstantiate) && [row.name,row.description,row.bundleKey,row.bundleVersion].some(value => String(value ?? '').toLocaleLowerCase().includes(keyword.trim().toLocaleLowerCase())))
  const catalogPages = Math.max(1, Math.ceil(visibleCatalog.length / 12))
  const safePage = Math.min(catalogPage, catalogPages)
  return <ProductPage width="management" className={training ? 'authorized-questionnaire-page' : undefined}>
    <PageHeader title={authorizedOnly ? '使用授权问卷' : '固定测评包'} description={authorizedOnly ? '选择已获授权的组合问卷版本，为当前课程创建投放草稿。内容顺序与整体报告规则保持原版本。' : '使用管理员审批的固定版本，获得整体报告和单项依据。'} />
    <p><Link to={contextualHref('/questionnaires')}>{authorizedOnly ? '复用我已有的测评内容' : '自由组合内容并查看单项报告合集'}</Link></p>
    {user?.role === 'ADMIN' && <p className="mt-3"><Link to="/admin/bundle-authoring">制作固定包版本与独立审批</Link></p>}
    {error && <ProductStatus kind="error" title="操作未完成" announce="assertive" actions={<button className="btn-secondary" disabled={loading || busy} onClick={()=>void load()}>重新加载</button>}>{error}</ProductStatus>}
    {loading && <ProductStatus kind="pending" title="正在读取包目录与投放记录" announce="polite" />}
    <section className="space-y-3 my-4"><h2>{authorizedOnly ? '选择授权问卷' : '选择测评包'}</h2>
      {!loading && !error && !catalog.length && <ProductStatus kind="info" title="暂无可用固定包">管理员完成内容制作与独立审批后，获授权的包会出现在这里。<Link to="/questionnaires">也可以先创建组合测评。</Link></ProductStatus>}
      {training && <div className="authorized-questionnaire-search"><label htmlFor="authorized-questionnaire-search">检索问卷</label><input id="authorized-questionnaire-search" className="input" placeholder="搜索名称、编号或版本" value={keyword} onChange={event=>{setKeyword(event.target.value);setCatalogPage(1)}}/><span role="status">共 {visibleCatalog.length} 份</span></div>}
      {training && !loading && !error && !visibleCatalog.length && catalog.length > 0 && <p role="status">{keyword.trim() ? '没有找到匹配的授权问卷，请更换关键词。' : '当前没有可创建投放的授权版本，请联系管理员确认授权及版本状态。'}</p>}
      <div className={training ? 'authorized-questionnaire-grid' : undefined}>{(training ? visibleCatalog.slice((safePage-1)*12,safePage*12) : catalog).map(row=><article className="border rounded p-3" key={row.bundleKey+row.bundleVersion}>
        <h3>{row.name} · {row.bundleVersion}</h3><p>{row.description}</p>
        {!authorizedOnly && <p>{row.canInstantiate?'可以创建':'暂不可创建：尚未发布、未授权或新建入口未开放'}</p>}
        <button className="btn-secondary mt-2" disabled={!row.canInstantiate} onClick={()=>{setSelection(row.bundleKey+'@'+row.bundleVersion);setBindings({});setName(row.name)}}>{authorizedOnly ? '使用此问卷' : '选择此包'}</button>
        {user?.role==='ADMIN' && row.status==='PUBLISHED' && <button onClick={()=>setGrant(row)}>教师授权</button>}
      </article>)}</div>
      {training && catalogPages > 1 && <nav className="authorized-questionnaire-paging" aria-label="授权问卷分页"><button type="button" disabled={safePage<=1} onClick={()=>setCatalogPage(safePage-1)}>上一页</button><span>{safePage} / {catalogPages}</span><button type="button" disabled={safePage>=catalogPages} onClick={()=>setCatalogPage(safePage+1)}>下一页</button></nav>}
    </section>
    {chosen && <section ref={setupRef} className="space-y-3 border p-4 authorized-questionnaire-setup">
      <h2>{authorizedOnly ? '配置投放：' : '创建 '}{chosen.name}</h2>
      <label className="block space-y-1">名称<input ref={nameRef} className="input w-full" value={name} onChange={e=>setName(e.target.value)} /></label>
      <label className="block space-y-1">投放课程<select aria-label="投放课程" className="input w-full" disabled={Boolean(contextCourseId)} value={courseId} onChange={e=>setCourse(e.target.value)}><option value="">仅公开投放</option>
        {resources.courses.map((v:any)=><option key={v.id} value={v.id}>{v.title}</option>)}</select></label>
      <label className="block space-y-1"><input type="checkbox" checked={publicEnabled} onChange={e=>setPublic(e.target.checked)} />允许匿名参与</label>
      {publicEnabled && <label className="block space-y-1">截止时间<LocalDateTimeInput value={expiresAt} onChange={e=>setExpiry(e.target.value)} /><span className="block text-sm text-gray-600">按浏览器时区 {Intl.DateTimeFormat().resolvedOptions().timeZone} 输入，保存时转换为 UTC。</span></label>}
      {chosen.slots.filter((v:any)=>['SCALE','COGNITIVE'].includes(v.unitType)).map((slot:any)=><div className="block" key={slot.slotKey}>
        {slot.slotKey} · {slot.instrumentKey} {slot.instrumentVersion}
        {training ? <AssessmentToolPicker label={`${slot.slotKey} · ${slot.unitType==='SCALE'?'量表':'认知测验'}`} value={bindings[slot.slotKey] || ''} onChange={resourceId=>setBindings({...bindings,[slot.slotKey]:resourceId})} disabled={busy || loading} options={(slot.unitType==='SCALE'?resources.scales:resources.cognitive).filter((v:any)=>slot.unitType==='SCALE' ? v.code===slot.instrumentKey && v.version===slot.instrumentVersion : v.testType===slot.instrumentKey && v.configVersion===slot.instrumentVersion)} /> : <select aria-label={slot.slotKey} className="input w-full" value={bindings[slot.slotKey] || ''} onChange={e=>setBindings({...bindings,[slot.slotKey]:e.target.value})}>
          <option value="">选择精确匹配的测评</option>
          {(slot.unitType==='SCALE'?resources.scales:resources.cognitive).filter((v:any)=>slot.unitType==='SCALE'
            ? v.code===slot.instrumentKey && v.version===slot.instrumentVersion
            : v.testType===slot.instrumentKey && v.configVersion===slot.instrumentVersion)
            .map((v:any)=><option key={v.id} value={v.id}>{v.name}</option>)}
        </select>}
      </div>)}
      <p>测评顺序、背景信息和分析规则由包固定，不能单独修改。</p>
      <button className="btn-primary" disabled={!chosen.canInstantiate || busy || loading || Boolean(contextCourseId && courseId !== contextCourseId)} onClick={()=>void create()}>{busy?'正在创建…':'创建投放草稿'}</button>
    </section>}
    <section className="space-y-3 my-4"><h2>已创建的包</h2>{!loading && !error && !rows.length && <p className="text-gray-600">尚未创建投放。请选择获授权的包版本，再配置课程或公开参与。</p>}{rows.map(row=><p key={row.id}>
      <Link to={contextualHref('/bundle-products/'+row.id)}>{row.name}</Link> · {statusLabel(row.status)}</p>)}</section>
    {grant && <MaterialGrantModal resourceType="ASSESSMENT_BUNDLE" resourceId={grant.bundleKey+'@'+grant.bundleVersion} resourceName={grant.name} onClose={()=>setGrant(null)} />}
  </ProductPage>
}
export function BundleProductDetail() {
  const { id } = useParams(), [row, setRow] = useState<any>(null), [error, setError] = useState('')
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const feedback = useStaffFeedback()
  const load = useCallback(async()=>{
    setLoading(true); setError('')
    try { setRow(await request('/bundle-products/'+id)) }
    catch(e) { setError(apiErrorMessage(e, '无法读取固定包投放')) }
    finally { setLoading(false) }
  },[id])
  useEffect(()=>{setRow(null);void load()},[load])
  const mutate = async(action: 'publish' | 'archive')=> {
    if(busy || !row)return
    if(action==='archive' && !await feedback.confirm({title:'归档固定包投放？',body:'归档后停止新作答，已提交的冻结结果和报告会保留。',confirmLabel:'归档投放',danger:true}))return
    setBusy(true);setError('')
    try {setRow(await request('/bundle-products/'+id+'/'+action,{revision:row.revision}));feedback.success(action==='archive'?'已归档，停止新作答':'投放已发布')}
    catch(e){setError(apiErrorMessage(e, '操作失败，请重新加载最新状态后重试'))}
    finally {setBusy(false)}
  }
  return <ProductPage width="management"><PageHeader title={row?.name || '固定测评包'} description="整体报告 · 内容与分析规则由管理员审批版本固定" />
    {feedback.feedback}
    {error && <ProductStatus kind="error" title="操作未完成" announce="assertive" actions={<button className="btn-secondary" disabled={busy || loading} onClick={()=>void load()}>重新加载</button>}>{error}</ProductStatus>}
    {loading && <ProductStatus kind="pending" title="正在读取投放与作答记录" announce="polite" />}
    {row && <><p>{row.bundle.name} · {row.bundle.bundleVersion} · {statusLabel(row.status)}</p>
      <ul>{row.bundle.slots.map((v:any)=><li key={v.slotKey}>{v.slotKey} · {v.unitType} · {v.instrumentKey} {v.instrumentVersion}</li>)}</ul>
      <div className="flex flex-wrap gap-3 my-4">
      {row.status==='DRAFT' && <button className="btn-primary" disabled={busy || loading} onClick={()=>void mutate('publish')}>{busy?'正在提交…':'发布投放'}</button>}
      {row.status!=='ARCHIVED' && <button className="btn-secondary" disabled={busy || loading} onClick={()=>void mutate('archive')}>归档，停止新作答</button>}
      </div>
      {row.status==='PUBLISHED' && row.publicEnabled && id && <PublicDeliveryManager key={id} family="COMPOSITE" resourceId={id} maximumExpiry={row.expiresAt} />}

      <h2 className="mt-6">作答记录</h2>{!row.attempts.length && <p className="mt-2 text-gray-600">暂无作答。发布投放后，通过课程或有效公开链接邀请参与。</p>}{row.attempts.map((v:any)=><p key={v.id}>{statusLabel(v.status)} {v.completedAt?new Date(v.completedAt).toLocaleString('zh-CN'):''}
        {v.status==='COMPLETED' && <Link to={'/composite-assessments/'+id+'/attempts/'+v.id+'/report'}>查看报告</Link>}</p>)}
    </>}
  </ProductPage>
}
