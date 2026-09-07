import React, { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { cognitiveApi, publicCognitiveApi } from '../api'
import { readCognitiveRecoveryCredential } from '../core/recovery-credential'
import { useCognitiveSession } from '../core/useCognitiveSession'
import { useAdministrationProvenance } from '../core/useAdministrationProvenance'
import { resolveRunner } from '../registry'

const safeInternalReturnTo = (value: string | null, fallback: string) => {
  if (!value) return fallback
  try {
    const decoded = decodeURIComponent(value)
    return decoded.startsWith('/') && !decoded.startsWith('//') ? decoded : fallback
  } catch {
    return fallback
  }
}

/**
 * CognitiveRunner（Stage B v1.1 §17/§20/§21）。
 * 按状态机渲染；RECOVERY_REQUIRED 明确提示、绝不静默重跑/猜测进度。
 */
const CognitiveRunner: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isPublic = searchParams.get('public') === '1'
  const recoveryToken = sessionId && isPublic ? readCognitiveRecoveryCredential(sessionId) : ''
  const sessionApi = useMemo(
    () => (isPublic ? publicCognitiveApi(recoveryToken) : cognitiveApi),
    [isPublic, recoveryToken]
  )
  const controller = useCognitiveSession(sessionId ?? '', sessionApi)
  const { state } = controller
  const administrationProvenance = useAdministrationProvenance(state.session, state.status)
  const completeWithProvenance = () => controller.complete(administrationProvenance.snapshot() ?? undefined)
  const [restarting, setRestarting] = useState(false)
  const [restartError, setRestartError] = useState<string | null>(null)

  // 试次总数：Fake 用 trialCount，Reaction 用 totalTrials（Milestone E §28）。
  // Memory（自适应）不依赖固定总数，完成信号由其自身推进逻辑在 Session 3 处理。
  const config = (state.session?.config ?? {}) as Record<string, unknown>
  const total = (config?.trialCount ?? config?.totalTrials ?? 0) as number

  const handleRestart = async () => {
    setRestarting(true)
    setRestartError(null)
    try {
      const next = await controller.restart()
      if (!next) throw new Error('重启响应缺少新测评记录')
      const query = new URLSearchParams()
      if (isPublic) query.set('public', '1')
      const returnTo = searchParams.get('returnTo')
      if (returnTo) query.set('returnTo', returnTo)
      const suffix = query.toString() ? `?${query.toString()}` : ''
      navigate(`${isPublic ? '/public' : '/student'}/cognitive/sessions/${next.sessionId}${suffix}`, { replace: true })
    } catch (error) {
      setRestartError((error as { message?: string })?.message || '重启失败，请稍后重试')
    } finally {
      setRestarting(false)
    }
  }

  if (state.status === 'COMPLETED') {
    // 完成态：结果页只读展示，不重新评分
    if (sessionId) {
      const returnTo = searchParams.get('returnTo')
      const target = safeInternalReturnTo(
        returnTo,
        isPublic
          ? `/public/cognitive/sessions/${sessionId}/result?public=1`
          : `/student/cognitive/sessions/${sessionId}/result`,
      )
      navigate(target, { replace: true })
    }
    return null
  }

  if (state.status === 'LOADING' || state.status === 'COMPLETING') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <span className="ml-3 text-gray-500">加载中...</span>
      </div>
    )
  }

  if (state.status === 'LEGACY_READ_ONLY') {
    return (
      <div className="card p-8 max-w-2xl text-center">
        <p className="text-xl font-semibold text-amber-700 mb-2">这是旧版进行中的认知测评</p>
        <p className="text-gray-600 mb-3">历史内容仍可读取，但旧版逐试次写入已停用。重启会保留历史记录，并创建新的整份提交测评。</p>
        <p className="text-sm text-gray-500 mb-6">当前尝试 #{state.session?.attemptNo ?? '—'}</p>
        {(restartError || state.error) && <p role="alert" className="text-red-500 text-sm mb-4">{restartError || state.error?.message}</p>}
        <button onClick={() => void handleRestart()} disabled={restarting} className="btn-primary">
          {restarting ? '重启中...' : '重启并继续作答'}
        </button>
      </div>
    )
  }

  if (state.status === 'READY') {
    return (
      <div className="card p-8 max-w-2xl text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">准备开始</h1>
        <p className="text-gray-600 mb-2">
          本次测评共 {total || '若干'} 个试次，请按提示完成。
        </p>
        <p className="text-sm text-gray-400 mb-6">
          尝试 #{state.session?.attemptNo}（{state.session?.testType} / {state.session?.engineVersion}）
        </p>
        {isPublic && recoveryToken && (
          <p className="text-left text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3 mb-6">
            匿名编号：{state.session?.anonymousCode || '匿名参与者'}；恢复凭证：<code className="break-all">{recoveryToken}</code>。请保存它，之后可在其他设备继续作答。
          </p>
        )}
        <button onClick={controller.start} className="btn-primary">
          开始测评
        </button>
      </div>
    )
  }

  if (state.status === 'UNSUPPORTED') {
    return (
      <div className="card p-8 text-center">
        <p className="text-xl font-semibold text-gray-700 mb-2">该测评类型或版本暂不支持</p>
        <p className="text-gray-500 mb-6">请联系老师处理</p>
        <button onClick={() => navigate('/student/cognitive')} className="btn-secondary">
          返回列表
        </button>
      </div>
    )
  }

  if (state.status === 'RECOVERY_REQUIRED') {
    const returnTo = safeInternalReturnTo(searchParams.get('returnTo'), '/student/cognitive')
    const hasParentReturn = Boolean(searchParams.get('returnTo'))
    return (
      <div className="card p-8 text-center">
        <p className="text-xl font-semibold text-amber-600 mb-2">无法恢复测评进度</p>
        <p className="text-gray-600 mb-2">
          检测到未完成的测评，但无法确认已提交进度，请勿刷新或重复提交。本地草稿仍会保留。
        </p>
        <p className="text-gray-500 mb-6">{hasParentReturn ? '请返回上层综合测评并从那里重启。' : '可以创建新的整份提交测评。'}</p>
        {(restartError || state.error) && <p role="alert" className="text-red-500 text-sm mb-4">{restartError || state.error?.message}</p>}
        <div className="flex justify-center gap-3">
          <button onClick={() => navigate(returnTo)} className="btn-secondary">
            {hasParentReturn ? '返回上层测评' : '返回列表'}
          </button>
          {!hasParentReturn && <button onClick={() => void handleRestart()} disabled={restarting} className="btn-primary">
            {restarting ? '重启中...' : '重启并继续作答'}
          </button>}
        </div>
      </div>
    )
  }

  if (state.status === 'ERROR') {
    return (
      <div className="card p-8 text-center">
        <p className="text-xl font-semibold text-red-500 mb-2">加载失败</p>
        <p className="text-gray-500 mb-6">{state.error?.message || '请稍后重试'}</p>
        <button onClick={controller.reload} className="btn-secondary">
          重试
        </button>
      </div>
    )
  }

  // RUNNING / SUBMITTING_TRIAL
  if (state.session && state.taskContext) {
    const entry = resolveRunner(state.session.testType, state.session.engineVersion)
    if (!entry) {
      return (
        <div className="card p-8 text-center">
          <p className="text-gray-600">该测评类型或版本暂不支持</p>
        </div>
      )
    }
    const Runner = entry.RunnerComponent
    const taskCompletes = entry.completionMode === 'task'
    const isLastTrial = state.status === 'RUNNING' && total > 0 && state.trialIndex >= total && !taskCompletes
    return (
      <div className="max-w-2xl mx-auto" data-cognitive-task-root="true">
        {isPublic && recoveryToken && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3 mb-4">
            匿名编号：{state.session?.anonymousCode || '匿名参与者'}；恢复凭证：<code className="break-all">{recoveryToken}</code>。请保存它，之后可在其他设备继续作答。
          </p>
        )}
        <Runner
          taskContext={state.taskContext}
          trialIndex={state.trialIndex}
          onTrialComplete={controller.appendTrial}
          onTaskComplete={taskCompletes ? completeWithProvenance : undefined}
        />
        {state.error && (
          <p className="text-sm text-red-500 text-center mt-3">{state.error.message}</p>
        )}
        {isLastTrial && state.status !== 'SUBMITTING_TRIAL' && (
          <div className="text-center mt-6">
            <button onClick={() => void completeWithProvenance()} className="btn-primary">
              完成测评
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="card p-8 text-center">
      <p className="text-gray-500">加载中...</p>
    </div>
  )
}

export default CognitiveRunner
