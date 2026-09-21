import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  deliveryApi,
  type OrganizationSafetyCaseProjection,
  type OrganizationSafetyCaseSummary,
  type ReportingExportTicket,
} from '../../api/delivery'
import { useOrganization } from '../../contexts/OrganizationContext'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'

const errorText = (value: unknown, fallback: string) => value instanceof Error && value.message ? value.message : fallback
const formatTime = (value?: string | null) => value ? new Date(value).toLocaleString() : '—'

export default function OrganizationDeliveryPage() {
  const { organizationId = '' } = useParams<{ organizationId: string }>()
  const { active, activeLoading, activeError, selectOrganization } = useOrganization()
  const context = active?.organization.id === organizationId ? active : null
  const organizationScopeRef = useRef(organizationId)
  const [cases, setCases] = useState<OrganizationSafetyCaseSummary[]>([])
  const [casesTruncated, setCasesTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedCaseId, setSelectedCaseId] = useState('')
  const [safetyProjection, setSafetyProjection] = useState<OrganizationSafetyCaseProjection | null>(null)
  const [artifactId, setArtifactId] = useState('')
  const [artifactExportKind, setArtifactExportKind] = useState<'AGGREGATE' | 'MEMBER'>('AGGREGATE')
  const [tickets, setTickets] = useState<Array<ReportingExportTicket & { label: string }>>([])

  useEffect(() => {
    organizationScopeRef.current = organizationId
    setCases([])
    setCasesTruncated(false)
    setLoading(false)
    setLoadError(null)
    setBusy(false)
    setActionError(null)
    setNotice(null)
    setSelectedCaseId('')
    setSafetyProjection(null)
    setArtifactId('')
    setArtifactExportKind('AGGREGATE')
    setTickets([])
  }, [organizationId])

  useEffect(() => {
    if (!organizationId || context || activeLoading) return
    void selectOrganization(organizationId)
  }, [organizationId, context, activeLoading, selectOrganization])

  useEffect(() => {
    if (!organizationId || !context) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setSafetyProjection(null)

    void deliveryApi.listSafetyCases(organizationId)
      .then((result) => {
        if (cancelled || organizationScopeRef.current !== organizationId) return
        setCases(result.list)
        setCasesTruncated(result.truncated)
        setSelectedCaseId((current) => result.list.some((item) => item.caseId === current)
          ? current
          : result.list[0]?.caseId || '')
      })
      .catch((error) => {
        if (cancelled || organizationScopeRef.current !== organizationId) return
        setLoadError(errorText(error, '当前账户没有可见 Safety case，或 Safety workspace 不可用'))
        setCases([])
        setCasesTruncated(false)
        setSelectedCaseId('')
        setSafetyProjection(null)
      })
      .finally(() => {
        if (!cancelled && organizationScopeRef.current === organizationId) setLoading(false)
      })

    return () => { cancelled = true }
  }, [organizationId, context])

  const selectedCase = useMemo(() => cases.find((item) => item.caseId === selectedCaseId) ?? null, [cases, selectedCaseId])

  const act = useCallback(async (
    successMessage: string,
    operation: (scopeOrganizationId: string) => Promise<void>,
  ) => {
    if (busy) return
    const scopeOrganizationId = organizationId
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      await operation(scopeOrganizationId)
      if (organizationScopeRef.current === scopeOrganizationId) setNotice(successMessage)
    } catch (error) {
      if (organizationScopeRef.current === scopeOrganizationId) {
        setSafetyProjection(null)
        setActionError(errorText(error, 'Delivery 操作失败'))
      }
    } finally {
      if (organizationScopeRef.current === scopeOrganizationId) setBusy(false)
    }
  }, [busy, organizationId])

  const readSafety = () => act('Safety case 已按当前责任/权限重新读取。', async (scopeOrganizationId) => {
    const caseId = selectedCaseId
    setSafetyProjection(null)
    if (!caseId) throw new Error('请选择 Safety case')
    const projection = await deliveryApi.readSafetyCase(scopeOrganizationId, caseId)
    if (organizationScopeRef.current !== scopeOrganizationId) return
    setSafetyProjection(projection)
  })

  const createArtifactExport = () => act(`${artifactExportKind} export ticket 已创建。`, async (scopeOrganizationId) => {
    const normalizedArtifactId = artifactId.trim()
    const exportKind = artifactExportKind
    if (!normalizedArtifactId) throw new Error('请输入 artifact ID')
    const ticket = await deliveryApi.createArtifactExport(scopeOrganizationId, exportKind, normalizedArtifactId)
    if (organizationScopeRef.current !== scopeOrganizationId) return
    setTickets((current) => [{ ...ticket, label: `${exportKind} · ${normalizedArtifactId}` }, ...current])
  })

  const createSafetyExport = () => act('SAFETY export ticket 已创建。', async (scopeOrganizationId) => {
    const caseId = selectedCaseId
    if (!caseId) throw new Error('请选择 Safety case')
    const ticket = await deliveryApi.createSafetyExport(scopeOrganizationId, caseId)
    if (organizationScopeRef.current !== scopeOrganizationId) return
    setTickets((current) => [{ ...ticket, label: `SAFETY · ${caseId}` }, ...current])
  })

  const download = (ticket: ReportingExportTicket & { label: string }) => act('CSV 已由服务器重新授权并交付。', async (scopeOrganizationId) => {
    const result = await deliveryApi.downloadExport(scopeOrganizationId, ticket.exportId)
    if (organizationScopeRef.current !== scopeOrganizationId) return
    const url = URL.createObjectURL(result.blob)
    try {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } finally {
      URL.revokeObjectURL(url)
    }
  })

  if (activeLoading && !context) return <ProductPage><ProductStatus kind="pending" title="正在验证组织上下文">服务器正在重新确认当前 Organization authority。</ProductStatus></ProductPage>
  if (!context) return <ProductPage><ProductStatus kind="error" title="无法进入 Delivery" actions={<Link to="/">返回首页</Link>}>{activeError || '当前账户没有此组织的有效访问上下文。'}</ProductStatus></ProductPage>

  return (
    <ProductPage>
      <PageHeader
        title="Safety & CSV Delivery"
        description="Safety audience、export capability、底层报告访问、ticket 有效期与下载权限都由服务器实时判断；浏览器不重建 CSV，也不扩大 Safety audience。"
        actions={<div className="flex flex-wrap gap-3"><Link to={`/organizations/${encodeURIComponent(organizationId)}`}>组织空间</Link><Link to={`/organizations/${encodeURIComponent(organizationId)}/reporting`}>Reporting</Link></div>}
      />
      {loadError && <ProductStatus kind="warning" title="Safety inbox 不可用">{loadError}</ProductStatus>}
      {actionError && <ProductStatus kind="error" title="Delivery 操作失败" announce="assertive">{actionError}</ProductStatus>}
      {notice && <ProductStatus kind="success" title="Delivery 已更新" announce="polite">{notice}</ProductStatus>}

      <section className="mt-6 space-y-4" aria-labelledby="safety-inbox-heading">
        <div><h2 id="safety-inbox-heading" className="text-xl font-semibold">Safety inbox</h2><p className="mt-1 text-sm text-slate-600">列表已由服务器过滤，只返回 case ID、服务器选择的 projection kind 与必要时限字段；不返回 subject/trigger/owner identity。</p></div>
        {loading && cases.length === 0 ? <ProductStatus kind="pending" title="正在读取 Safety inbox">正在按当前责任范围筛选。</ProductStatus> : (
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              {cases.length === 0 ? <p className="text-sm text-slate-600">当前没有可见 Safety case。</p> : <div className="grid gap-2">{cases.map((item) => <label key={item.caseId} className="grid cursor-pointer gap-1 rounded-lg border border-slate-200 p-3"><span className="flex items-center gap-2"><input type="radio" name="safety-case" checked={selectedCaseId === item.caseId} disabled={busy} onChange={() => { setSelectedCaseId(item.caseId); setSafetyProjection(null) }} /><strong>{item.caseId}</strong><span className="text-xs font-semibold text-slate-500">{item.projection}</span></span><span className="text-sm text-slate-600">status {item.status} · created {formatTime(item.createdAt)}{item.ackDueAt ? ` · ack due ${formatTime(item.ackDueAt)}` : ''}{item.disposeDueAt ? ` · dispose due ${formatTime(item.disposeDueAt)}` : ''}</span></label>)}</div>}
              {casesTruncated && <p className="mt-3 text-sm text-amber-700">Safety inbox 达到服务器上限；需要更多记录时应增加后端分页，而不是客户端扩展查询范围。</p>}
            </div>
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <strong>当前 case</strong>
              <p className="break-all text-sm text-slate-600">{selectedCase?.caseId || '未选择'}</p>
              <ProductButton disabled={busy || !selectedCaseId} onClick={() => void readSafety()}>读取 exact projection</ProductButton>
              <ProductButton disabled={busy || !selectedCaseId} onClick={() => void createSafetyExport()}>创建 SAFETY CSV ticket</ProductButton>
            </div>
          </div>
        )}
        {safetyProjection && <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Exact Safety projection</h3><span className="text-sm font-semibold">{safetyProjection.projection}</span></div><pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(safetyProjection.data, null, 2)}</pre></div>}
      </section>

      <section className="mt-8 space-y-4" aria-labelledby="artifact-export-heading">
        <div><h2 id="artifact-export-heading" className="text-xl font-semibold">Reporting CSV export</h2><p className="mt-1 text-sm text-slate-600">AGGREGATE/MEMBER 都引用 immutable artifact ID。服务器会先重新读取底层 projection，再检查当前 export capability；MEMBER 不会因为拥有 aggregate artifact 就自动获准。</p></div>
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_2fr_auto]">
          <label className="grid gap-1 text-sm font-medium">Export kind<select className="min-h-11 rounded-lg border border-slate-300 px-3" value={artifactExportKind} disabled={busy} onChange={(event) => setArtifactExportKind(event.target.value as typeof artifactExportKind)}><option>AGGREGATE</option><option>MEMBER</option></select></label>
          <label className="grid gap-1 text-sm font-medium">Artifact ID<input className="min-h-11 rounded-lg border border-slate-300 px-3" value={artifactId} disabled={busy} onChange={(event) => setArtifactId(event.target.value)} placeholder="artifact UUID" /></label>
          <div className="flex items-end"><ProductButton variant="primary" disabled={busy || !artifactId.trim()} onClick={() => void createArtifactExport()}>创建 CSV ticket</ProductButton></div>
        </div>
      </section>

      <section className="mt-8 space-y-4" aria-labelledby="tickets-heading">
        <div><h2 id="tickets-heading" className="text-xl font-semibold">当前会话创建的 export tickets</h2><p className="mt-1 text-sm text-slate-600">Ticket 默认 15 分钟有效并绑定当前 viewer；下载时服务器再次检查底层 read authority 与 capability。</p></div>
        {tickets.length === 0 ? <ProductStatus kind="info" title="尚无 ticket">创建 export 后会显示在这里。</ProductStatus> : <div className="grid gap-3">{tickets.map((ticket) => <article key={ticket.exportId} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><strong>{ticket.label}</strong><p className="mt-1 break-all text-sm text-slate-600">ticket {ticket.exportId} · expires {formatTime(ticket.expiresAt)}</p></div><ProductButton disabled={busy} onClick={() => void download(ticket)}>下载服务器 CSV</ProductButton></article>)}</div>}
      </section>
    </ProductPage>
  )
}
