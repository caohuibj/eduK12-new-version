import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { relationalApi, type RelationalTask } from '../../api/relational'

const statusLabel = (status: RelationalTask['status']) => ({
  OPEN: '待开始',
  STARTED: '进行中',
  COMPLETED: '已完成',
  REVOKED: '已撤销',
  EXPIRED: '已过期',
}[status])

type Props = {
  tasks: RelationalTask[]
  onRefresh: () => Promise<void> | void
}

export default function RelationalTaskList({ tasks, onRefresh }: Props) {
  const navigate = useNavigate()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const accept = async (assignmentId: string) => {
    try {
      setBusyId(assignmentId)
      setError(null)
      await relationalApi.acceptConsent(assignmentId)
      await onRefresh()
    } catch (err) {
      setError((err as { message?: string }).message || '同意授权失败')
    } finally {
      setBusyId(null)
    }
  }

  const start = async (assignmentId: string) => {
    try {
      setBusyId(assignmentId)
      setError(null)
      const result = await relationalApi.start(assignmentId)
      navigate(`/relational/attempts/${result.attempt.id}`)
    } catch (err) {
      setError((err as { message?: string }).message || '无法开始测评')
    } finally {
      setBusyId(null)
    }
  }

  const openReport = async (assignmentId: string) => {
    try {
      setBusyId(assignmentId)
      setError(null)
      const target = await relationalApi.reportTarget(assignmentId)
      navigate(`/relational/attempts/${target.attemptId}/report`)
    } catch (err) {
      setError((err as { message?: string }).message || '报告暂不可用')
    } finally {
      setBusyId(null)
    }
  }

  if (tasks.length === 0) {
    return <p className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">当前没有关系测评任务。</p>
  }

  return <div className="space-y-3" data-testid="relational-task-list">
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {tasks.map((task) => (
      <article key={task.assignmentId} className="rounded border border-gray-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-medium text-gray-900">{task.product?.title || task.resourceKey}</h3>
            <p className="mt-1 text-xs text-gray-500">
              {task.perspective === 'RELATIONAL_EXPERIENCE' ? '课堂/关系体验' : '观察报告'} · {statusLabel(task.status)}
            </p>
            {task.analysisMode === 'COHORT_AGGREGATE' && (
              <p className="mt-2 text-xs text-gray-600">仅进入群体汇总；至少 {task.minimumRespondents} 名有效作答后才可形成 subject-facing 结果。</p>
            )}
            {task.status === 'COMPLETED' && task.analysisMode === 'COHORT_AGGREGATE' && (
              <p className="mt-2 text-xs text-gray-600">你的作答已计入群体汇总；此类体验测评不提供个人结果页。</p>
            )}
          </div>
          <div className="flex gap-2">
            {task.consentRequired && task.status === 'OPEN' && (
              <button
                type="button"
                className="rounded border border-blue-500 px-3 py-2 text-sm text-blue-700 disabled:opacity-50"
                disabled={busyId === task.assignmentId}
                onClick={() => void accept(task.assignmentId)}
              >
                同意并继续
              </button>
            )}
            {!task.consentRequired && task.launchable && (
              <button
                type="button"
                className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={busyId === task.assignmentId}
                onClick={() => void start(task.assignmentId)}
              >
                {task.status === 'STARTED' ? '继续作答' : '开始作答'}
              </button>
            )}
            {task.status === 'COMPLETED' && task.analysisMode === 'INDIVIDUAL_ONLY' && (
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
                disabled={busyId === task.assignmentId}
                onClick={() => void openReport(task.assignmentId)}
              >
                查看结果
              </button>
            )}
          </div>
        </div>
      </article>
    ))}
  </div>
}
