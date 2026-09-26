import { limitationLabel, comparabilityLabel, resourceLabel } from './reportingLabels'
import { useEffect, useRef, useState } from 'react'
import { reportingApi, type ReportingArtifactProjection, type ReportingSourceSummary, type PublishedReportingSpecSummary } from '../../api/reporting'
import { deliveryApi } from '../../api/delivery'
import { ProductButton } from '../../components/product-ui'

export function IndividualLongitudinalBuilder({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [subjects, setSubjects] = useState<Array<{userId: string; name: string}>>([])
  const [subjectPage, setSubjectPage] = useState<number | null>(null)
  const [subject, setSubject] = useState('')
  const [sources, setSources] = useState<ReportingSourceSummary[]>([])
  const [sourcePage, setSourcePage] = useState<number | null>(null)
  const [specs, setSpecs] = useState<PublishedReportingSpecSummary[]>([])
  const [specId, setSpecId] = useState('')
  const [resource, setResource] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [artifact, setArtifact] = useState<ReportingArtifactProjection | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const epoch = useRef(0)
  useEffect(() => () => { epoch.current++ }, [])
  const key = (s: ReportingSourceSummary) => `${s.runId}/${s.trackId}`
  const reset = () => { epoch.current++; setArtifact(null); setSources([]); setSourcePage(null); setSelected([]); setResource(''); setError('') }
  async function act(work: (current: () => boolean) => Promise<void>) {
    const request = ++epoch.current
    setBusy(true); setError(''); setArtifact(null)
    const current = () => epoch.current === request
    try { await work(current) } catch (e) { if (current()) { setArtifact(null); setError(e instanceof Error ? e.message : '操作失败，请重新确认权限') } }
    finally { if (current()) setBusy(false) }
  }
  const findSubjects = (page = 1) => act(async current => {
    const [result, available] = await Promise.all([reportingApi.individualSubjects(organizationId, search, page), reportingApi.listSpecs(organizationId, 'INDIVIDUAL_LONGITUDINAL')])
    if (!current()) return
    setSubjects(old => page === 1 ? result.list : [...old, ...result.list]); setSubjectPage(result.nextPage); setSpecs(available.list)
  })
  const findSources = (userId: string, page = 1) => act(async current => {
    const result = await reportingApi.individualSources(organizationId, userId, page)
    if (!current()) return
    setSources(old => page === 1 ? result.list : [...old, ...result.list]); setSourcePage(result.nextPage)
  })
  const generate = () => act(async current => {
    const result = await reportingApi.analyzeIndividual(organizationId, {subjectUserId:subject,specId,sources:sources.filter(s=>selected.includes(key(s))).map(s=>({runId:s.runId,trackId:s.trackId}))})
    if (current()) setArtifact(result)
  })
  const exportReport = async () => {
    if (!artifact) return
    const saved = artifact
    await act(async current => {
      const ticket = await deliveryApi.createArtifactExport(organizationId, 'MEMBER', saved.artifactId)
      const result = await deliveryApi.downloadExport(organizationId,ticket.exportId)
      if (!current()) return
      const url = URL.createObjectURL(result.blob), a = document.createElement('a')
      a.href=url; a.download=result.filename; a.click(); URL.revokeObjectURL(url); setArtifact(saved)
    })
  }
  const projection = artifact?.projection.kind === 'INDIVIDUAL_LONGITUDINAL' ? artifact.projection : null
  return <section className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-4" aria-label="个人纵向报告">
    <h2 className="text-xl font-semibold">个人纵向报告</h2>
    <p>选择学生及至少两次已完成的测量。仅有可比性证据时展示变化量；缺失或质量不足的数据会明确标注。</p>
    <ProductButton disabled={busy} onClick={() => { reset(); setSubject(''); setOpen(!open); if (!open) void findSubjects() }}>{open ? '收起个人报告' : '选择学生生成个人报告'}</ProductButton>
    {open && <>
      <label className="grid gap-1">查找学生<input disabled={busy} value={search} onChange={e=>setSearch(e.target.value)} /></label>
      <ProductButton disabled={busy} onClick={()=>{reset();setSubject('');void findSubjects()}}>查找</ProductButton>
      <label className="grid gap-1">选择学生<select aria-label="选择学生" disabled={busy} value={subject} onChange={e=>{reset();setSubject(e.target.value);if(e.target.value) void findSources(e.target.value)}}><option value="">请选择</option>{subjects.map(s=><option key={s.userId} value={s.userId}>{s.name}</option>)}</select></label>
      {subjectPage && <ProductButton disabled={busy} onClick={()=>void findSubjects(subjectPage)}>更多学生</ProductButton>}
      <label className="grid gap-1">个人测量项目<select aria-label="个人测量项目" disabled={busy} value={resource} onChange={e=>{setResource(e.target.value);setSelected([]);setArtifact(null)}}><option value="">请选择</option>{[...new Set(sources.map(s=>`${s.resource.family}/${s.resource.key}`))].map(k=><option key={k} value={k}>{resourceLabel(sources,k)}</option>)}</select></label>
      <fieldset disabled={busy}><legend>个人测量时间</legend>{sources.filter(s=>`${s.resource.family}/${s.resource.key}`===resource).map(s=><label key={key(s)} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={selected.includes(key(s))} onChange={e=>{setArtifact(null);setSelected(old=>e.target.checked?[...old,key(s)]:old.filter(k=>k!==key(s)))}} />{s.runName} · {s.publishedAt ? new Date(s.publishedAt).toLocaleDateString() : '日期未知'} · {s.resource.version}</label>)}</fieldset>
      {sourcePage && <ProductButton disabled={busy} onClick={()=>void findSources(subject,sourcePage)}>更早的个人测量</ProductButton>}
      <label className="grid gap-1">个人报告方案<select aria-label="个人报告方案" disabled={busy} value={specId} onChange={e=>{setSpecId(e.target.value);setArtifact(null)}}><option value="">请选择</option>{specs.map(s=><option key={s.specId} value={s.specId}>{s.specKey} v{s.version}</option>)}</select></label>
      {specs.length===0 && <p>尚无已发布的个人纵向报告方案，请由平台管理员审核并发布。</p>}
      <ProductButton disabled={busy || !subject || !specId || selected.length<2} onClick={()=>void generate()}>生成个人纵向报告</ProductButton>
    </>}
    {error && <p role="alert">{error}</p>}
    {projection && <div className="space-y-4" aria-label="个人报告结果">
      {projection.waves.map(w=><article className="rounded border p-3" key={w.waveId}><h3>第 {w.ordinal} 次 · {w.waveKey.split(' / ')[0]}</h3><dl>{Object.entries(w.metrics).map(([id,m])=><div key={id}><dt>{id}</dt><dd>{m.state==='present'?m.value:(m.reason==='NOT_COMPLETED'?'本次未完成':'指标缺失或质量不足')}</dd></div>)}</dl><p>证据等级：{w.evidence.level}</p><p>{w.evidence.limitations.map(limitationLabel).join(' · ')}</p></article>)}
      {projection.comparisons.map((c,i)=><div key={`${c.fromWaveId}/${c.toWaveId}`}><h3>第 {i+1} 次 → 第 {i+2} 次</h3>{Object.entries(c.metrics).map(([id,m])=><p key={id}>{id}：{comparabilityLabel(m.comparability.level)} · {m.delta===undefined?'未计算变化量':`变化量 ${m.delta}`} {m.comparability.limitations.map(limitationLabel).join(' · ')}</p>)}</div>)}
      <p>用于描述测量变化，不用于诊断或推断因果。</p>
      <ProductButton disabled={busy} onClick={()=>void exportReport()}>导出个人报告</ProductButton>
    </div>}
  </section>
}
