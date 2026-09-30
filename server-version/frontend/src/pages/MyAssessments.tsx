import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import apiClient from '../api/client'
import { runApi, type AssignedRunTask } from '../api/runs'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../components/product-ui'

export interface InboxTask {
  taskId: string; sourceId: string; sourceType: string; title: string; state: string; deadline: string | null
  launchTarget: string | null; reportTarget: string | null; resultAvailability: string
  subject?: { role: string; displayName?: string }; consentState: string; runTask?: AssignedRunTask
}
export interface AssessmentInbox { list: InboxTask[]; pendingCount: number; truncated: boolean }
const stateLabels: Record<string, string> = { OPEN: '待完成', ASSIGNED: '待完成', PENDING: '待完成', STARTED: '进行中', IN_PROGRESS: '进行中', COMPLETED: '已完成', EXPIRED: '已过期', REVOKED: '已撤回', CANCELLED: '已取消', UPCOMING: '尚未开始', UNAVAILABLE: '暂不可用' }

interface CatalogCard { title: string; launchTarget: string; journey: { resource: { family: string; key: string; version: string }; initiationModes: string[] } }

export default function MyAssessments() {
  const navigate = useNavigate()
  const [catalog, setCatalog] = useState<CatalogCard[]>([])
  const [catalogError, setCatalogError] = useState(false)
  const [inbox, setInbox] = useState<AssessmentInbox | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [consent, setConsent] = useState<Record<string, boolean>>({})
  const load = useCallback(async () => {
    const response = await apiClient.get<AssessmentInbox>('/my-assessments')
    if (response.code !== 0 || !response.data) throw new Error(response.message || '任务加载失败')
    setInbox(response.data)
  }, [])
  useEffect(() => { void load().catch(err => { setInbox(null); setError(String(err.message || err)) }) }, [load])
  useEffect(() => { void apiClient.get<{ list: CatalogCard[] }>('/my-assessments/catalog').then(response => {
    if (response.code !== 0 || !response.data) throw new Error('catalog unavailable')
    setCatalog(response.data.list.filter(entry => entry.journey?.resource))
  }).catch(() => setCatalogError(true)) }, [])
  const start = async (task: InboxTask) => {
    if (busy || !task.runTask) return
    setBusy(task.taskId); setError(null)
    try {
      const run = task.runTask
      if (run.consentRequired && run.status === 'ASSIGNED' && !run.claimState) {
        if (!consent[task.taskId]) throw new Error('请先阅读并同意本次测评说明')
        await runApi.acceptConsent(run)
      }
      const result = await runApi.start(run)
      if (result.state === 'IN_PROGRESS') throw new Error('正在准备测评，请稍后重试。')
      if (result.runtimeBindingKind === 'COMPOSITE') navigate(`/relational/attempts/${encodeURIComponent(result.runtimeBindingRef)}?returnTo=%2Forganization-tasks`)
      else throw new Error('测评入口暂不可用，请联系投放者。')
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : '暂时无法开始测评') }
    finally { setBusy(null) }
  }
  const groups = new Map<string, InboxTask[]>()
  for (const task of inbox?.list ?? []) { const key = `${task.sourceType}:${task.sourceId}`; groups.set(key, [...(groups.get(key) ?? []), task]) }
  return <ProductPage>
    <PageHeader title="我的测评" description={`待完成测评：${inbox?.pendingCount ?? '…'}。开始、继续作答和查看自己的报告。`} actions={<ProductButton disabled={busy !== null} onClick={() => { setError(null); void load().catch(err => setError(String(err.message || err))) }}>刷新任务</ProductButton>} />
    {error && <ProductStatus kind="error" title="操作未完成">{error}</ProductStatus>}
    {!inbox && !error && <p role="status">正在加载测评…</p>}
    <p className="mb-4"><Link to="/scale-library">选择适合自己的测评</Link></p>
    <div className="grid min-w-0 gap-4">{[...groups.entries()].map(([key, tasks]) => <section key={key} className="min-w-0 space-y-3 rounded-xl border bg-white p-4">
      <h2 className="break-words font-semibold">{tasks[0].title}</h2>
      {tasks.length > 1 && <p>已完成 {tasks.filter(t => t.state === 'COMPLETED').length} / {tasks.length}</p>}
      {tasks.map((task, index) => <article key={task.taskId} className="min-w-0 space-y-3 border-t pt-3">
        {task.subject?.displayName && <p>测评对象：{task.subject.displayName}</p>}
        <p>{tasks.length > 1 ? `${index + 1} / ${tasks.length} · ` : ''}{stateLabels[task.state] ?? '请刷新状态'}</p>
        {task.deadline && <p>截止：{new Date(task.deadline).toLocaleString()}</p>}
        {task.runTask?.consentRequired && task.state === 'ASSIGNED' && !task.runTask.claimState && <label className="flex items-start gap-2 break-words"><input type="checkbox" checked={consent[task.taskId] ?? false} onChange={event => setConsent(current => ({ ...current, [task.taskId]: event.target.checked }))} /><span>我已阅读并同意：{task.runTask.consentPurpose}；结果可见范围：{task.runTask.consentVisibility}</span></label>}
        <div className="flex flex-wrap gap-3">
          {task.runTask && !['COMPLETED', 'EXPIRED', 'REVOKED', 'CANCELLED'].includes(task.state) && <ProductButton disabled={busy !== null} onClick={() => void start(task)}>{task.state === 'STARTED' || task.runTask.claimState ? '继续作答' : '开始测评'}</ProductButton>}
          {task.launchTarget && <Link to={task.launchTarget}>{task.state === 'IN_PROGRESS' ? '继续作答' : '进入测评'}</Link>}
          {task.reportTarget && <Link to={task.reportTarget}>我的报告</Link>}
        </div>
        {task.state === 'COMPLETED' && task.resultAvailability === 'COMPLETION_ONLY' && <p>感谢你的填写。本次回答记录了你的个人体验，不用于向你展示被评价者的个人得分或排名。</p>}
      </article>)}
    </section>)}</div>
    {inbox?.list.length === 0 && <p>暂无分配给你的测评。</p>}
    <section className="mt-6 space-y-3"><h2 className="font-semibold">可参与的测评</h2>{catalogError && <p>内容目录暂不可用，已分配任务仍可从上方进入。</p>}<div className="grid min-w-0 gap-3 sm:grid-cols-2">{catalog.map(entry => <article className="min-w-0 break-words rounded-xl border bg-white p-4" key={entry.journey.resource.family + ':' + entry.journey.resource.key + ':' + entry.journey.resource.version}><h3>{entry.title}</h3><Link to={entry.launchTarget}>{entry.journey.initiationModes.includes('RESPONDENT_SELF_START') ? '开始前确认适用条件' : '进入已授权测评'}</Link></article>)}</div></section>
    {inbox?.truncated && <p role="status">当前显示最近的任务，较早任务仍可从原入口访问。</p>}
  </ProductPage>
}
