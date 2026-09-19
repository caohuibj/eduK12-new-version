import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { runApi, type AssignedRunTask } from '../../api/runs'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'

export default function OrganizationTasksPage() {
  const [tasks, setTasks] = useState<AssignedRunTask[]>([])
  const [truncated, setTruncated] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [consent, setConsent] = useState<Record<string, boolean>>({})
  const [launch, setLaunch] = useState<{ executionId: string; attemptId: string } | null>(null)
  const load = useCallback(async () => {
    try { const result = await runApi.assignedTasks(); setTasks(result.list); setTruncated(result.truncated) }
    catch (err) { setTasks([]); setLaunch(null); setError(err instanceof Error ? err.message : '任务读取失败') }
  }, [])
  useEffect(() => { void load() }, [load])
  const start = async (task: AssignedRunTask) => {
    if (busy) return
    setBusy(task.executionId)
    setError(null)
    setLaunch(null)
    setNotice(null)
    try {
      if (task.consentRequired && task.status === 'ASSIGNED' && !task.claimState) {
        if (!consent[task.executionId]) throw new Error('请先阅读并确认本次测评同意事项')
        await runApi.acceptConsent(task)
      }
      const result = await runApi.start(task)
      if (result.state === 'IN_PROGRESS') setNotice('开始结果待确认。请刷新或恢复同一任务，不要创建新任务。')
      else if (result.runtimeBindingKind === 'COMPOSITE') setLaunch({ executionId: task.executionId, attemptId: result.runtimeBindingRef })
      else setNotice('任务已建立，当前运行类型尚无可用页面，请联系管理员。')
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : '结果尚未确认，请恢复同一任务'); await load() }
    finally { setBusy(null) }
  }
  return <ProductPage>
    <PageHeader title="组织测评任务" description="仅显示分配给当前账户的任务。开始与恢复均由服务器重新验证，家长任务不授予组织管理权限。" actions={<ProductButton disabled={busy !== null} onClick={() => void load()}>刷新任务</ProductButton>} />
    {error && <ProductStatus kind="error" title="任务操作未完成">{error}</ProductStatus>}
    {notice && <ProductStatus kind="pending" title="任务等待确认">{notice}</ProductStatus>}
    <div className="grid gap-4">{tasks.map(task => {
      const terminal = ['COMPLETED', 'CANCELLED', 'REVOKED', 'EXPIRED'].includes(task.status)
      return <article key={task.executionId} className="space-y-3 rounded-xl border bg-white p-4">
        <h2 className="font-semibold">{task.runName}</h2>
        <p>{task.resourceFamily} · {task.resourceKey}@{task.resourceVersion}</p>
        <p>任务状态：{task.status} · 开始认领：{task.claimState ?? '尚未认领'}</p>
        {task.claimState === 'UNKNOWN' && <p role="status">开始结果未知。恢复将查询同一次运行，不会分配第二个任务。</p>}
        {task.consentRequired && task.status === 'ASSIGNED' && !task.claimState && <label className="flex gap-2"><input type="checkbox" checked={consent[task.executionId] ?? false} onChange={event => setConsent(current => ({ ...current, [task.executionId]: event.target.checked }))} />我已阅读并同意：{task.consentPurpose}；报告可见范围：{task.consentVisibility}。</label>}
        {!terminal && <ProductButton disabled={busy !== null} onClick={() => void start(task)}>{task.claimState || task.status === 'STARTED' ? '恢复同一任务' : '开始任务'}</ProductButton>}
        {launch?.executionId === task.executionId && <Link to={`/relational/attempts/${encodeURIComponent(launch.attemptId)}?returnTo=%2Forganization-tasks`}>进入测评</Link>}
      </article>
    })}</div>
    {tasks.length === 0 && <p>当前没有分配给此账户的任务。</p>}
    {truncated && <p>显示最近 100 条任务。</p>}
  </ProductPage>
}
