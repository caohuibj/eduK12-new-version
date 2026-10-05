import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { reportingContentApi, type DescriptiveKind, type ManagedReportingSpec, type RegisteredResource } from '../../api/reportingContent'
import { PageHeader, ProductButton, ProductPage } from '../../components/product-ui'
import { apiErrorMessage } from '../../utils/apiErrorMessage'

const statusLabel: Record<string, string> = { DRAFT: '草稿', REVIEWED: '已审核', PUBLISHED: '已发布', RETIRED: '已停用' }
export const kindLabel: Record<string, string> = { INDIVIDUAL_LONGITUDINAL: '个人纵向变化', REPEATED_COHORT: '多时间点群体描述', MATCHED_LONGITUDINAL: '同主体群体纵向变化' }
export default function ReportingContent() {
  const [resources, setResources] = useState<RegisteredResource[]>([])
  const [specs, setSpecs] = useState<ManagedReportingSpec[]>([])
  const [scales, setScales] = useState<Array<{ id: string; name: string; status: string; instrumentClass: string }>>([])
  const [scaleId, setScaleId] = useState(''), [resourceId, setResourceId] = useState('')
  const [specKey, setSpecKey] = useState(''), [version, setVersion] = useState(1)
  const [mode, setMode] = useState<'INDIVIDUAL' | 'GROUP'>('INDIVIDUAL')
  const [kind, setKind] = useState<DescriptiveKind>('INDIVIDUAL_LONGITUDINAL'), [minimumN, setMinimumN] = useState(3)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [nextPage, setNextPage] = useState<number | null>(null), [truncated, setTruncated] = useState(false)
  const epoch = useRef(0)
  useEffect(() => () => { epoch.current++ }, [])
  async function load() {
    const request = ++epoch.current
    setBusy(true); setError('')
    try {
      const [r, s, scale] = await Promise.all([reportingContentApi.resources(), reportingContentApi.specs(), apiClient.get<{ list: typeof scales }>('/scales?page=1&pageSize=100')])
      if (request !== epoch.current) return
      if (scale.code !== 0 || !scale.data) throw new Error(scale.message || '量表列表加载失败')
      setResources(r.list); setSpecs(s.list); setNextPage(s.nextPage); setTruncated(r.truncated)
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
  const transitions = (id: string, status: string, isResource: boolean) => {
    const action = status === 'DRAFT' ? 'review' : status === 'REVIEWED' ? 'publish' : status === 'PUBLISHED' ? 'retire' : null
    return action && <ProductButton disabled={busy} onClick={() => {
      if (action === 'retire' && !window.confirm('停用后不能用于新投放（方案停用后也不能生成新报告），已有作答保留，历史报告仍受现行权限控制。确认停用？')) return
      void act(() => isResource ? reportingContentApi.transitionResource(id, action) : reportingContentApi.transitionSpec(id, action), action === 'review' ? '已审核，请复核适用范围后发布。' : action === 'publish' ? '已发布。请前往组织批次或报告分析页面刷新选择列表。' : '已停用，历史数据保留。')
    }}>{action === 'review' ? '审核' : action === 'publish' ? '发布' : '停用'}</ProductButton>
  }
  return <ProductPage width="management" className="space-y-6">
    <PageHeader title="测量资源与报告方案" description="原创描述性量表需显式注册为组织测量资源，再审核和发布纵向报告方案。课程发布与组织资源发布各自独立。" />
    <p>注册不增加组织成员、教师材料授权或个人报告权限。仅当前获授权且有组织投放权限的成员可投放；家长披露仍走原有学生同意与逐份报告授权流程。</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <ProductButton disabled={busy} onClick={() => void load()}>刷新准备状态</ProductButton>
    <section className="space-y-4 rounded-xl border bg-white p-4"><h2 className="text-xl font-semibold">1. 注册测量资源</h2>
      <p>当前入口支持已发布、允许再分发的原创自评计分量表。资源固定学生自评、描述性解释和完全相同计分定义的比较；第三方标准量表保持原有审核边界。</p>
      <label className="grid gap-1">原创量表<select className="input" aria-label="原创量表" disabled={busy} value={scaleId} onChange={e => setScaleId(e.target.value)}><option value="">请选择</option>{scales.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      {!scales.length && <p>尚无可注册的原创量表。<Link to="/scales/new">创建量表</Link>，保存完整计分定义并通过发布检查后返回。已发布列表最多显示最近100份。</p>}
      <label className="grid gap-1">资源用途<select className="input" aria-label="资源用途" disabled={busy} value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="INDIVIDUAL">个人自评与纵向报告</option><option value="GROUP">群体汇总（至少3人）</option></select></label>
      <ProductButton disabled={busy || !scaleId} onClick={() => void act(() => reportingContentApi.register(scaleId, mode), '资源草稿已注册；请核对指标与适用范围，再审核和发布。')}>注册资源草稿</ProductButton>
      {resources.map(r => <article className="rounded-lg border p-3" key={r.id}><h3>{r.entry.title} · {statusLabel[r.status]}</h3><p>{r.entry.description}</p><p>指标：{r.entry.resultDisclosure.audiences.SUBJECT.metricKeys.join('、')}；适用：组织内学生自评，{r.entry.applicability.analysisMode === 'INDIVIDUAL_ONLY' ? '个人反馈' : '群体汇总（至少3人，隐藏个人分数）'}；证据：描述性试用。</p>{transitions(r.id, r.status, true)}<details><summary>版本与技术标识</summary><p className="break-all">{r.resource_key} / {r.resource_version}</p></details></article>)}
      {truncated && <p>仅显示最近100个资源，需整理目录后使用更早资源。</p>}
    </section>
    <section className="space-y-4 rounded-xl border bg-white p-4"><h2 className="text-xl font-semibold">2. 创建纵向报告方案</h2>
      <label className="grid gap-1">已发布测量资源<select className="input" aria-label="已发布测量资源" disabled={busy} value={resourceId} onChange={e => setResourceId(e.target.value)}><option value="">请选择</option>{resources.filter(r => r.status === 'PUBLISHED' && (kind === 'INDIVIDUAL_LONGITUDINAL') === (r.entry.applicability.analysisMode === 'INDIVIDUAL_ONLY')).map(r => <option key={r.id} value={r.id}>{r.entry.title}</option>)}</select></label>
      <label className="grid gap-1">方案名称<input className="input" disabled={busy} value={specKey} onChange={e => setSpecKey(e.target.value)} maxLength={160} /></label>
      <label className="grid gap-1">方案版本<input className="input" type="number" min="1" disabled={busy} value={version} onChange={e => setVersion(Number(e.target.value))} /></label>
      <label className="grid gap-1">报告类型<select className="input" aria-label="报告类型" disabled={busy} value={kind} onChange={e => { setKind(e.target.value as DescriptiveKind); setResourceId('') }}>{Object.entries(kindLabel).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>
      {kind !== 'INDIVIDUAL_LONGITUDINAL' && <label className="grid gap-1">群体及指标最少人数<input className="input" type="number" min="3" max="1000" disabled={busy} value={minimumN} onChange={e => setMinimumN(Number(e.target.value))} /></label>}
      <p>质量条件：只纳入可解释结果，缺失值排除，重复观察拒绝。仅比较所选资源的相同计分定义；变化量不用于诊断、因果推断或效度证明。群体方案遵守至少3人隐私门槛。</p>
      {resource && <p>将纳入：{resource.entry.resultDisclosure.audiences.SUBJECT.metricKeys.join('、')}。个人报告还需教师班级范围、咨询关系或专业报告授权；组织管理员角色不自动获得个人报告权限。</p>}
      <ProductButton disabled={busy || !resource || !specKey.trim() || !Number.isInteger(version) || version < 1 || !Number.isInteger(minimumN) || minimumN < 3} onClick={() => void act(() => reportingContentApi.createSpec({ resourceId, specKey: specKey.trim(), version, analysisKind: kind, minimumN }), '方案草稿已创建，请审核后发布。')}>创建方案草稿</ProductButton>
      {specs.map(s => <article key={s.id} className="rounded-lg border p-3"><h3>{s.specKey} v{s.version} · {statusLabel[s.status]}</h3><p>{kindLabel[s.definition.analysisKind] || '受管理的报告方案'}；指标：{s.definition.metricRules.map(m => m.metricId).join('、')}；质量：可解释结果；证据上限：{s.definition.reportEvidenceCeiling === 'PILOT' ? '描述性试用' : s.definition.reportEvidenceCeiling}</p>{transitions(s.id, s.status, false)}<details><summary>冻结方案与技术标识</summary><pre className="overflow-auto text-xs">{JSON.stringify(s.definition, null, 2)}</pre><p className="break-all">{s.specHash}</p></details></article>)}
      {nextPage && <ProductButton disabled={busy} onClick={() => void act(async () => { const page = await reportingContentApi.specs(nextPage); setSpecs(old => [...old, ...page.list]); setNextPage(page.nextPage) }, '已加载更多方案。', false)}>更多方案</ProductButton>}
    </section>
    <section className="space-y-3 rounded-xl border bg-white p-4"><h2 className="text-xl font-semibold">3. 投放与纵向分析</h2><p>进入组织工作区，在组织批次中选择已发布资源，给同一主体发布至少两次独立测量并实际完成作答。报告分析中选择对应测量和已发布方案；高级设置可将测量绑定到报告系列的时间点。原课程问卷不会自动变成组织测量。</p><Link to="/organizations">进入组织工作区</Link></section>
  </ProductPage>
}
