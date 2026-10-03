import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { runApi, type AssessmentRunListItem, type AssessmentRunStatus } from '../../api/runs'
import { useOrganization } from '../../contexts/OrganizationContext'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'

const STATUS_LABELS: Record<AssessmentRunStatus, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  CLOSED: '已关闭',
  CANCELLED: '已取消',
}

const formatTime = (value: string | null) => value ? new Date(value).toLocaleString() : '—'
const errorText = (value: unknown, fallback: string) => value instanceof Error && value.message ? value.message : fallback

export default function OrganizationRunListPage() {
  const { organizationId = '' } = useParams<{ organizationId: string }>()
  const navigate = useNavigate()
  const { active, activeLoading, activeError, selectOrganization } = useOrganization()
  const context = active?.organization.id === organizationId ? active : null
  const canGovern = context?.allowedActions.some(action => action === 'ASSESSMENT_DELIVERY' || action === 'RUNS') === true
  const [runs, setRuns] = useState<AssessmentRunListItem[]>([])
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState<AssessmentRunStatus | ''>('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [deadline, setDeadline] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId || context || activeLoading) return
    void selectOrganization(organizationId)
  }, [organizationId, context, activeLoading, selectOrganization])

  const loadRuns = useCallback(async () => {
    if (!organizationId || !canGovern) return
    setLoading(true)
    setLoadError(null)
    try {
      const page = await runApi.list(organizationId, {
        page: 1,
        pageSize: 100,
        ...(statusFilter ? { status: statusFilter } : {}),
      })
      setRuns(page.list)
      setTotal(page.total)
    } catch (err) {
      setLoadError(errorText(err, '无法加载 Run 列表'))
    } finally {
      setLoading(false)
    }
  }, [organizationId, canGovern, statusFilter])

  useEffect(() => { void loadRuns() }, [loadRuns])

  const createRun = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const run = await runApi.create(organizationId, {
        name: name.trim(),
        intakeDeadline: deadline ? new Date(deadline).toISOString() : null,
      })
      navigate(`/organizations/${encodeURIComponent(organizationId)}/runs/${encodeURIComponent(run.id)}`)
    } catch (err) {
      setCreateError(errorText(err, '无法创建测评批次'))
    } finally {
      setCreating(false)
    }
  }

  if (activeLoading && !context) return <ProductPage width="management" className="hui-organization-page"><ProductStatus kind="pending" title="正在验证组织上下文">服务器正在重新确认当前 Organization authority。</ProductStatus></ProductPage>
  if (!context) return <ProductPage width="management" className="hui-organization-page"><ProductStatus kind="error" title="无法进入 Run 管理" actions={<Link to="/">返回首页</Link>}>{activeError || '当前账户没有此组织的有效访问上下文。'}</ProductStatus></ProductPage>
  if (!canGovern) return <ProductPage width="management" className="hui-organization-page"><ProductStatus kind="warning" title="无 Run 治理权限" actions={<Link to={`/organizations/${encodeURIComponent(organizationId)}`}>返回组织空间</Link>}>Run 创建、编辑和管理入口只在服务器投影 `canGovern=true` 时开放；发布动作仍会在服务端执行更细的 publisher boundary 检查。</ProductStatus></ProductPage>

  return (
    <ProductPage width="management" className="hui-organization-page">
      <PageHeader
        title="测评批次"
        description={`${context.organization.name} · ${total} 个测评批次。状态、冻结事实和执行进度均来自服务器。`}
        actions={<Link to={`/organizations/${encodeURIComponent(organizationId)}`}>组织治理</Link>}
      />
      {loadError && <ProductStatus kind="error" title="测评批次加载失败">{loadError}</ProductStatus>}
      {createError && <ProductStatus kind="error" title="测评批次创建失败" announce="assertive">{createError}</ProductStatus>}

      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-[2fr_1fr_auto]" onSubmit={createRun}>
        <label className="grid gap-1 text-sm font-medium text-slate-700">批次名称<input className="min-h-11 rounded-lg border border-slate-300 px-3" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：2026 秋季学生支持 Pilot" /></label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">参与截止时间（可选）<input type="datetime-local" className="min-h-11 rounded-lg border border-slate-300 px-3" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
        <ProductButton type="submit" variant="primary" disabled={creating || !name.trim()}>{creating ? '正在创建…' : '创建草稿'}</ProductButton>
      </form>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <label className="grid gap-1 text-sm font-medium text-slate-700">状态筛选<select className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AssessmentRunStatus | '')}><option value="">全部</option>{Object.entries(STATUS_LABELS).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>
        <ProductButton disabled={loading} onClick={() => void loadRuns()}>{loading ? '正在刷新…' : '刷新列表'}</ProductButton>
      </div>

      <div className="mt-4 staff-table-container">
        <table className="staff-table">
          <thead><tr><th>测评批次</th><th>状态</th><th>测评项目</th><th>执行记录</th><th>参与截止</th><th>创建时间</th></tr></thead>
          <tbody>{runs.map(run => <tr key={run.id}>
            <td><Link className="staff-record-title" to={`/organizations/${encodeURIComponent(organizationId)}/runs/${encodeURIComponent(run.id)}`}>{run.name}</Link><div className="staff-muted">版本 {run.version}</div></td>
            <td><span className={`staff-badge ${run.status === 'PUBLISHED' ? 'staff-badge--success' : run.status === 'CANCELLED' ? 'staff-badge--danger' : ''}`}>{STATUS_LABELS[run.status]}</span></td>
            <td>{run.trackCount}</td><td>{run.executionCount}</td><td>{formatTime(run.intakeDeadline)}</td><td>{formatTime(run.createdAt)}</td>
          </tr>)}</tbody>
        </table>
        {!loading && runs.length === 0 && <div className="p-4"><ProductStatus kind="info" title="暂无匹配的测评批次">可以先创建草稿批次，再添加测评项目并在发布前检查范围与策略。</ProductStatus></div>}
      </div>
    </ProductPage>
  )
}
