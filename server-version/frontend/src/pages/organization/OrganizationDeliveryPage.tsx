import { formatLocalTimestamp } from '../../utils/dateTime'
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
const exportLabels = { AGGREGATE: '汇总报告', MEMBER: '成员报告', SAFETY: '安全事项' }
const projectionLabels = { FULL: '完整详情', ACTION: '处理事项', SUMMARY: '事项摘要' }
const formatTime = (value?: string | null) => value ? formatLocalTimestamp(value) : '—'

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
        setActionError(errorText(error, '导出操作失败'))
      }
    } finally {
      if (organizationScopeRef.current === scopeOrganizationId) setBusy(false)
    }
  }, [busy, organizationId])

  const readSafety = () => act('已按当前权限重新读取安全事项。', async (scopeOrganizationId) => {
    const caseId = selectedCaseId
    setSafetyProjection(null)
    if (!caseId) throw new Error('请选择安全事项')
    const projection = await deliveryApi.readSafetyCase(scopeOrganizationId, caseId)
    if (organizationScopeRef.current !== scopeOrganizationId) return
    setSafetyProjection(projection)
  })

  const createArtifactExport = () => act(`${exportLabels[artifactExportKind]}下载已准备。`, async (scopeOrganizationId) => {
    const normalizedArtifactId = artifactId.trim()
    const exportKind = artifactExportKind
    if (!normalizedArtifactId) throw new Error('请输入报告版本编号')
    const ticket = await deliveryApi.createArtifactExport(scopeOrganizationId, exportKind, normalizedArtifactId)
    if (organizationScopeRef.current !== scopeOrganizationId) return
    setTickets((current) => [{ ...ticket, label: `${exportLabels[exportKind]} · ${normalizedArtifactId}` }, ...current])
  })

  const createSafetyExport = () => act('安全事项下载已准备。', async (scopeOrganizationId) => {
    const caseId = selectedCaseId
    if (!caseId) throw new Error('请选择安全事项')
    const ticket = await deliveryApi.createSafetyExport(scopeOrganizationId, caseId)
    if (organizationScopeRef.current !== scopeOrganizationId) return
    setTickets((current) => [{ ...ticket, label: `安全事项 · ${caseId}` }, ...current])
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

  if (activeLoading && !context) return <ProductPage width="management" className="hui-organization-page"><ProductStatus kind="pending" title="正在验证组织上下文">正在确认当前账户的组织访问权限。</ProductStatus></ProductPage>
  if (!context) return <ProductPage width="management" className="hui-organization-page"><ProductStatus kind="error" title="无法进入安全事项与数据导出" actions={<Link to="/">返回首页</Link>}>{activeError || '当前账户没有此组织的有效访问上下文。'}</ProductStatus></ProductPage>

  return (
    <ProductPage width="management" className="hui-organization-page">
      <PageHeader
        title="安全事项与数据导出"
        description="您只能查看和导出当前获准访问的内容。准备文件与下载时都会重新确认权限，下载链接有时限。"
        actions={<div className="flex flex-wrap gap-3"><Link to={`/organizations/${encodeURIComponent(organizationId)}`}>组织空间</Link><Link to={`/organizations/${encodeURIComponent(organizationId)}/reporting`}>报告分析</Link></div>}
      />
      {loadError && <ProductStatus kind="warning" title="安全事项不可用">{loadError}</ProductStatus>}
      {actionError && <ProductStatus kind="error" title="操作失败" announce="assertive">{actionError}</ProductStatus>}
      {notice && <ProductStatus kind="success" title="操作完成" announce="polite">{notice}</ProductStatus>}

      <section className="mt-6 space-y-4" aria-labelledby="safety-inbox-heading">
        <div><h2 id="safety-inbox-heading" className="text-xl font-semibold">安全事项</h2><p className="mt-1 text-sm text-slate-600">列表按您当前的责任范围显示。详情与导出内容以您获准访问的范围为准。</p></div>
        {loading && cases.length === 0 ? <ProductStatus kind="pending" title="正在读取安全事项">正在按当前责任范围筛选。</ProductStatus> : (
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              {cases.length === 0 ? <p className="text-sm text-slate-600">当前没有可见安全事项。</p> : <div className="grid gap-2">{cases.map((item) => <label key={item.caseId} className="grid cursor-pointer gap-1 rounded-lg border border-slate-200 p-3"><span className="flex items-center gap-2"><input type="radio" name="safety-case" checked={selectedCaseId === item.caseId} disabled={busy} onChange={() => { setSelectedCaseId(item.caseId); setSafetyProjection(null) }} /><strong>{item.caseId}</strong><span className="text-xs font-semibold text-slate-500">{projectionLabels[item.projection]}</span></span><span className="text-sm text-slate-600">状态 {({ OPEN: '待处理', ACKNOWLEDGED: '已确认', DISPOSED: '已处理', CLOSED: '已关闭' } as Record<string, string>)[item.status] || item.status} · 创建时间 {formatTime(item.createdAt)}{item.ackDueAt ? ` · 确认截止 ${formatTime(item.ackDueAt)}` : ''}{item.disposeDueAt ? ` · 处理截止 ${formatTime(item.disposeDueAt)}` : ''}</span></label>)}</div>}
              {casesTruncated && <p className="mt-3 text-sm text-amber-700">已显示最近的安全事项，更多历史记录请联系组织负责人。</p>}
            </div>
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <strong>当前事项</strong>
              <p className="break-all text-sm text-slate-600">{selectedCase?.caseId || '未选择'}</p>
              <ProductButton disabled={busy || !selectedCaseId} onClick={() => void readSafety()}>查看安全事项详情</ProductButton>
              <ProductButton disabled={busy || !selectedCaseId} onClick={() => void createSafetyExport()}>准备安全事项 CSV</ProductButton>
            </div>
          </div>
        )}
        {safetyProjection && <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">安全事项详情</h3><span className="text-sm font-semibold">{projectionLabels[safetyProjection.projection]}</span></div><pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(safetyProjection.data, null, 2)}</pre></div>}
      </section>

      <section className="mt-8 space-y-4" aria-labelledby="artifact-export-heading">
        <div><h2 id="artifact-export-heading" className="text-xl font-semibold">报告 CSV 导出</h2><p className="mt-1 text-sm text-slate-600">选择报告类型并填写报告版本编号。汇总报告和成员报告分别检查权限，能够导出汇总报告并不代表能够导出成员报告。</p></div>
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_2fr_auto]">
          <label className="grid gap-1 text-sm font-medium">报告类型<select className="min-h-11 rounded-lg border border-slate-300 px-3" value={artifactExportKind} disabled={busy} onChange={(event) => setArtifactExportKind(event.target.value as typeof artifactExportKind)}><option value="AGGREGATE">汇总报告</option><option value="MEMBER">成员报告</option></select></label>
          <label className="grid gap-1 text-sm font-medium">报告版本编号<input className="min-h-11 rounded-lg border border-slate-300 px-3" value={artifactId} disabled={busy} onChange={(event) => setArtifactId(event.target.value)} placeholder="请输入报告版本编号" /></label>
          <div className="flex items-end"><ProductButton variant="primary" disabled={busy || !artifactId.trim()} onClick={() => void createArtifactExport()}>准备 CSV 导出</ProductButton></div>
        </div>
      </section>

      <section className="mt-8 space-y-4" aria-labelledby="tickets-heading">
        <div><h2 id="tickets-heading" className="text-xl font-semibold">当前会话准备的导出</h2><p className="mt-1 text-sm text-slate-600">下载链接默认 15 分钟有效，仅限当前账户使用。若权限发生变化，下载可能被拒绝，请重新准备文件。</p></div>
        {tickets.length === 0 ? <ProductStatus kind="info" title="尚无待下载文件">准备导出后会显示在这里。</ProductStatus> : <div className="grid gap-3">{tickets.map((ticket) => <article key={ticket.exportId} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><strong>{ticket.label}</strong><p className="mt-1 break-all text-sm text-slate-600">下载编号 {ticket.exportId} · 到期时间 {formatTime(ticket.expiresAt)}</p></div><ProductButton disabled={busy} onClick={() => void download(ticket)}>下载 CSV</ProductButton></article>)}</div>}
      </section>
    </ProductPage>
  )
}
