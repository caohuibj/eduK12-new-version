import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { reportingContentApi, type DescriptiveKind, type ManagedReportingSpec, type RegisteredResource } from '../../api/reportingContent'
import { ProductButton } from '../../components/product-ui'
import {RefreshCw,FileCheck,LibraryBig,Plus,ChevronDown,ShieldCheck} from 'lucide-react'
import { apiErrorMessage } from '../../utils/apiErrorMessage'
import { useAuth } from '../../contexts/AuthContext'

const statusLabel: Record<string, string> = { DRAFT: '草稿', REVIEWED: '已审核', PUBLISHED: '已发布', RETIRED: '已停用' }
export const kindLabel: Record<string, string> = { INDIVIDUAL_LONGITUDINAL: '个人纵向变化', REPEATED_COHORT: '多时间点群体描述', MATCHED_LONGITUDINAL: '同主体群体纵向变化' }
export default function ReportingContent() {
  const { user } = useAuth()
  const [resources, setResources] = useState<RegisteredResource[]>([])
  const [specs, setSpecs] = useState<ManagedReportingSpec[]>([])
  const [scales, setScales] = useState<Array<{ id: string; name: string; status: string; instrumentClass: string }>>([])
  const [scaleId, setScaleId] = useState(''), [resourceId, setResourceId] = useState('')
  const [specKey, setSpecKey] = useState(''), [version, setVersion] = useState(1)
  const [mode, setMode] = useState<'INDIVIDUAL' | 'GROUP' | 'TEACHER_INDIVIDUAL' | 'TEACHER_GROUP'>('INDIVIDUAL')
  const [kind, setKind] = useState<DescriptiveKind>('INDIVIDUAL_LONGITUDINAL'), [minimumN, setMinimumN] = useState(3)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [nextPage, setNextPage] = useState<number | null>(null), [resourceNextPage, setResourceNextPage] = useState<number | null>(null)
  const [view,setView]=useState<'resources'|'specs'>('resources')
  const epoch = useRef(0)
  useEffect(() => () => { epoch.current++ }, [])
  async function load() {
    const request = ++epoch.current
    setBusy(true); setError('')
    try {
      const [r, s, scale] = await Promise.all([reportingContentApi.resources(), reportingContentApi.specs(), apiClient.get<{ list: typeof scales }>('/organizations/measurement-resources/candidates')])
      if (request !== epoch.current) return
      if (scale.code !== 0 || !scale.data) throw new Error(scale.message || '量表列表加载失败')
      setResources(r.list); setSpecs(s.list); setNextPage(s.nextPage); setResourceNextPage(r.nextPage)
      setScales(scale.data.list.filter(item => item.status === 'PUBLISHED' && item.instrumentClass === 'CUSTOM_DESCRIPTIVE'))
    } catch (e) { if (request === epoch.current) { setResources([]); setSpecs([]); setScales([]); setError(apiErrorMessage(e)) } }
    finally { if (request === epoch.current) setBusy(false) }
  }
  useEffect(() => { void load() }, [])
  async function act(work: () => Promise<unknown>, message: string, refresh = true) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await work(); if (refresh) await load(); setNotice(message) } catch (e) { setError(apiErrorMessage(e)) } finally { setBusy(false) }
  }
  const resource = resources.find(r => r.id === resourceId && r.status === 'PUBLISHED')
  const transitions = (id: string, status: string, isResource: boolean, creatorId?: string) => {
    const action = status === 'DRAFT' ? 'review' : status === 'REVIEWED' ? 'publish' : status === 'PUBLISHED' ? 'retire' : null
    return action && <ProductButton disabled={busy || (action === 'review' && creatorId === user?.id)} onClick={() => {
      if (action === 'retire' && !window.confirm('停用后不能用于新投放（方案停用后也不能生成新报告），已有作答保留，历史报告仍受现行权限控制。确认停用？')) return
      void act(() => isResource ? reportingContentApi.transitionResource(id, action) : reportingContentApi.transitionSpec(id, action), action === 'review' ? '已审核，请复核适用范围后发布。' : action === 'publish' ? '已发布。请前往组织批次或报告分析页面刷新选择列表。' : '已停用，历史数据保留。')
    }}>{action === 'review' ? '审核' : action === 'publish' ? '发布' : '停用'}</ProductButton>
  }
  return <div className="system-page system-reporting">
    <header className="sys-heading"><div><p className="system-eyebrow">测量资源 · 报告方案</p><h1>报告内容</h1><p>管理资源与纵向报告方案，从草稿、独立审核到正式发布。</p></div><button disabled={busy} onClick={()=>void load()}><RefreshCw size={16} aria-hidden="true"/>刷新准备状态</button></header>
    {error&&<p className="sys-message sys-error" role="alert">{error}</p>}{notice&&<p className="sys-message" role="status">{notice}</p>}
    <nav className="sys-view-tabs" aria-label="报告内容视图"><button aria-pressed={view==='resources'} onClick={()=>setView('resources')}><LibraryBig size={17} aria-hidden="true"/>测量资源<span className="sys-count">{resources.length}</span></button><button aria-pressed={view==='specs'} onClick={()=>setView('specs')}><FileCheck size={17} aria-hidden="true"/>报告方案<span className="sys-count">{specs.length}</span></button></nav>
    <div className="sys-workspace"><div className="sys-content">
    <section className="sys-panel" hidden={view!=='resources'} aria-label="测量资源目录"><div className="sys-section-heading"><div><h2>测量资源</h2><p>已发布且允许再分发的原创自评计分量表。</p></div><span className="sys-badge">本页已加载 {resources.length} 项</span></div>
    {!resources.length&&<div className="sys-empty"><LibraryBig size={30} aria-hidden="true"/><h3>{busy?'正在读取资源…':'尚无测量资源'}</h3><p>展开“注册测量资源”，选择已发布的原创量表创建草稿。</p></div>}
    <div className="sys-records">{resources.map(r=><article className="sys-record" key={r.id}><details><summary><span className="sys-record-avatar"><LibraryBig size={20} aria-hidden="true"/></span><span className="sys-record-heading"><strong>{r.entry.title}</strong><small>{r.entry.applicability.analysisMode==='INDIVIDUAL_ONLY'?'个人反馈':`群体汇总 · 至少${r.entry.applicability.minimumRespondents??3}人`}</small></span><span className="sys-record-state"><span className="sys-badge" data-status={r.status}>{statusLabel[r.status]}</span><ChevronDown size={17} aria-hidden="true"/></span></summary><div className="sys-record-body"><p>{r.entry.description}</p><dl className="sys-facts"><div><dt>可披露指标</dt><dd>{r.entry.resultDisclosure.audiences.SUBJECT.metricKeys.join('、')}</dd></div><div><dt>适用范围</dt><dd>组织内{r.entry.applicability.subjectRoles?.includes('TEACHER')?'教师':'学生'}自评 · {r.entry.applicability.analysisMode==='INDIVIDUAL_ONLY'?'个人反馈':`群体汇总（至少${r.entry.applicability.minimumRespondents??3}人）；本人反馈沿原批准上限`}</dd></div><div><dt>科学证据上限</dt><dd>描述性试用</dd></div></dl><div className="system-actions">{transitions(r.id,r.status,true,r.created_by_user_id)}</div><details className="sys-technical"><summary>版本与技术标识</summary><p>{r.resource_key} / {r.resource_version}</p></details></div></details></article>)}</div>
    {resourceNextPage&&<ProductButton disabled={busy} onClick={()=>void act(async()=>{const request=epoch.current;const page=await reportingContentApi.resources(resourceNextPage);if(request!==epoch.current)return;setResources(old=>[...new Map([...old,...page.list].map(row=>[row.id,row])).values()]);setResourceNextPage(page.nextPage)},'已加载更多资源。',false)}>更多资源</ProductButton>}
    </section>
    <section className="sys-panel" hidden={view!=='specs'} aria-label="报告方案目录"><div className="sys-section-heading"><div><h2>纵向报告方案</h2><p>基于已发布资源，固定指标、比较方式与质量条件。</p></div><span className="sys-badge">已加载 {specs.length} 项</span></div>
    {!specs.length&&<div className="sys-empty"><FileCheck size={30} aria-hidden="true"/><h3>{busy?'正在读取方案…':'尚无报告方案'}</h3><p>选择已发布资源，编制并提交独立审核。</p></div>}
    <div className="sys-records">{specs.map(s=><article className="sys-record" key={s.id}><details><summary><span className="sys-record-avatar"><FileCheck size={20} aria-hidden="true"/></span><span className="sys-record-heading"><strong>{s.specKey}</strong><small>v{s.version} · {kindLabel[s.definition.analysisKind]||'受管理的报告方案'}</small></span><span className="sys-record-state"><span className="sys-badge" data-status={s.status}>{statusLabel[s.status]}</span><ChevronDown size={17} aria-hidden="true"/></span></summary><div className="sys-record-body"><dl className="sys-facts"><div><dt>指标</dt><dd>{s.definition.metricRules.map(m=>m.metricId).join('、')}</dd></div><div><dt>质量条件</dt><dd>可解释结果</dd></div><div><dt>证据上限</dt><dd>{s.definition.reportEvidenceCeiling==='PILOT'?'描述性试用':s.definition.reportEvidenceCeiling}</dd></div></dl>{transitions(s.id,s.status,false,s.createdByUserId)}<details className="sys-technical"><summary>冻结方案与技术标识</summary><pre>{JSON.stringify(s.definition,null,2)}</pre><p>{s.specHash}</p></details></div></details></article>)}</div>
    {nextPage&&<ProductButton disabled={busy} onClick={()=>void act(async()=>{const page=await reportingContentApi.specs(nextPage);setSpecs(old=>[...old,...page.list]);setNextPage(page.nextPage)},'已加载更多方案。',false)}>更多方案</ProductButton>}
    </section></div>
    <aside className="sys-rail" aria-label="内容编制与流程">
    <details className="sys-panel sys-compose" hidden={view!=='resources'}><summary><Plus size={17} aria-hidden="true"/>注册测量资源</summary><div className="sys-form"><p className="sys-muted">固定学生自评、描述性解释和相同计分定义；第三方标准量表保持原审核边界。</p><label>原创量表<select aria-label="原创量表" disabled={busy} value={scaleId} onChange={e=>setScaleId(e.target.value)}><option value="">请选择</option>{scales.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{!scales.length&&<p className="sys-hint">尚无可注册的原创量表。<Link to="/scales/new">创建量表</Link>并通过发布检查后返回。列表最多显示最近100份。</p>}<label>资源用途<select aria-label="资源用途" disabled={busy} value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="INDIVIDUAL">个人自评与纵向报告</option><option value="GROUP">学生群体汇总（至少3人）</option><option value="TEACHER_INDIVIDUAL">教师本人描述性自评</option><option value="TEACHER_GROUP">教师群体汇总并保留原本人摘要（新版本）</option></select></label><ProductButton disabled={busy||!scaleId} onClick={()=>void act(()=>reportingContentApi.register(scaleId,mode),'资源草稿已注册；请交由另一位平台管理员核对指标与适用范围，再独立审核和发布。')}>注册资源草稿</ProductButton></div></details>
    <details className="sys-panel sys-compose" hidden={view!=='specs'}><summary><Plus size={17} aria-hidden="true"/>创建纵向报告方案</summary><div className="sys-form"><label>已发布测量资源<select aria-label="已发布测量资源" disabled={busy} value={resourceId} onChange={e=>setResourceId(e.target.value)}><option value="">请选择</option>{resources.filter(r=>r.status==='PUBLISHED'&&(kind==='INDIVIDUAL_LONGITUDINAL')===(r.entry.applicability.analysisMode==='INDIVIDUAL_ONLY')).map(r=><option key={r.id} value={r.id}>{r.entry.title}</option>)}</select></label><label>方案名称<input disabled={busy} value={specKey} onChange={e=>setSpecKey(e.target.value)} maxLength={160}/></label><label>方案版本<input type="number" min="1" disabled={busy} value={version} onChange={e=>setVersion(Number(e.target.value))}/></label><label>报告类型<select aria-label="报告类型" disabled={busy} value={kind} onChange={e=>{setKind(e.target.value as DescriptiveKind);setResourceId('')}}>{Object.entries(kindLabel).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label>{kind!=='INDIVIDUAL_LONGITUDINAL'&&<label>群体及指标最少人数<input type="number" min="3" max="1000" disabled={busy} value={minimumN} onChange={e=>setMinimumN(Number(e.target.value))}/></label>}<p className="sys-hint">仅比较相同计分定义，排除缺失值、拒绝重复观察；群体方案至少3人。变化量不用于诊断、因果推断或效度证明。</p>{resource&&<p className="sys-hint">将纳入：{resource.entry.resultDisclosure.audiences.SUBJECT.metricKeys.join('、')}。个人报告仍需教师班级范围、咨询关系或专业报告授权。</p>}<ProductButton disabled={busy||!resource||!specKey.trim()||!Number.isInteger(version)||version<1||!Number.isInteger(minimumN)||minimumN<3} onClick={()=>void act(()=>reportingContentApi.createSpec({resourceId,specKey:specKey.trim(),version,analysisKind:kind,minimumN}),'方案草稿已创建，请交由另一位平台管理员独立审核后发布。')}>创建方案草稿</ProductButton></div></details>
    <section className="sys-panel sys-process"><h2><ShieldCheck size={18} aria-hidden="true"/>发布流程</h2><ol><li><strong>注册与编制</strong><p>由已发布的原创量表准备资源与方案。</p></li><li><strong>独立审核</strong><p>注册者、量表作者与方案创建者不能自审。</p></li><li><strong>发布后使用</strong><p>发布资格与实际投放、个人报告权限分别核对。</p></li></ol></section>
    <details className="sys-panel sys-guide"><summary>投放与权限说明</summary><p>注册不增加组织成员、教师材料授权或个人报告权限。仅当前获授权且有组织投放权限的成员可投放；家长披露仍走原同意与逐份报告授权流程。</p><p>组织批次中选择已发布资源，为同一主体完成至少两次独立测量，再选择对应方案分析。原课程问卷不会自动变成组织测量。</p><Link to="/organizations">进入组织工作区</Link></details>
    </aside></div>
  </div>
}
