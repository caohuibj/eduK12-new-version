import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCognitiveSession } from '../core/useCognitiveSession'
import { resolveRunner } from '../registry'
import type { FakeConfig } from '../types'

/**
 * CognitiveRunner（Stage B v1.1 §17/§20/§21）。
 * 按状态机渲染；RECOVERY_REQUIRED 明确提示、绝不静默重跑/猜测进度。
 */

const CognitiveRunner: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const controller = useCognitiveSession(sessionId ?? '')
  const { state } = controller

  const config = (state.session?.config ?? {}) as unknown as FakeConfig
  const total = config?.trialCount ?? 0
  const isLastTrial = state.status === 'RUNNING' && total > 0 && state.trialIndex >= total

  if (state.status === 'COMPLETED') {
    // 完成态：结果页只读展示，不重新评分
    if (sessionId) navigate(`/student/cognitive/sessions/${sessionId}/result`, { replace: true })
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
    return (
      <div className="card p-8 text-center">
        <p className="text-xl font-semibold text-amber-600 mb-2">无法恢复测评进度</p>
        <p className="text-gray-600 mb-2">
          检测到未完成的测评，但无法确认已提交进度。请勿刷新或重复提交。
        </p>
        <p className="text-gray-500 mb-6">请联系老师处理</p>
        <button onClick={() => navigate('/student/cognitive')} className="btn-secondary">
          返回列表
        </button>
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
    return (
      <div className="max-w-2xl mx-auto">
        <Runner
          taskContext={state.taskContext}
          trialIndex={state.trialIndex}
          onTrialComplete={controller.appendTrial}
        />
        {state.error && (
          <p className="text-sm text-red-500 text-center mt-3">{state.error.message}</p>
        )}
        {isLastTrial && state.status !== 'SUBMITTING_TRIAL' && (
          <div className="text-center mt-6">
            <button onClick={controller.complete} className="btn-primary">
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
