import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play, RotateCcw } from 'lucide-react'
import { cognitiveApi } from '../api'
import {
  readAssignmentSessionId,
  readSessionLedger,
  writeAssignmentSessionId,
  writeSessionLedger,
} from '../core/session-ledger'
import type { CognitiveAssignmentSummary, CognitiveSession } from '../types'

/**
 * Assignment Entry（Stage B v1.1 §17/§21）—— 开始/继续分流。
 *
 * 语义（后端 D6.1 保证）：
 *  - POST /cognitive/sessions {assignmentId}：存在同 assignment+participant 的 IN_PROGRESS 则返回原
 *    session（继续），否则新建 attempt。前端只负责入口分流 + 账本初始化（**先写账本再跳转**，
 *    避免首次开始即误报 RECOVERY_REQUIRED）。
 */

const CognitiveAssignmentEntry: React.FC = () => {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [assignment, setAssignment] = useState<CognitiveAssignmentSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [ledgerSessionId, setLedgerSessionId] = useState<string | null>(null)
  const [ledgerStatus, setLedgerStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!assignmentId) return
    let cancelled = false
    const fetchAssignment = async () => {
      try {
        const response = await cognitiveApi.getAssignment(assignmentId)
        if (!cancelled) {
          if (response.code === 0 && response.data) {
            setAssignment(response.data)
          } else {
            setError(response.message || '测评不存在或不可访问')
          }
        }
      } catch (err) {
        if (!cancelled) setError((err as { message?: string }).message || '测评不存在或不可访问')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchAssignment()

    // 本地账本分流依据
    const sid = readAssignmentSessionId(assignmentId)
    if (sid) {
      setLedgerSessionId(sid)
      setLedgerStatus(readSessionLedger(sid)?.status ?? null)
    }
    return () => {
      cancelled = true
    }
  }, [assignmentId])

  const handleStart = useCallback(async () => {
    if (!assignmentId || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await cognitiveApi.createSession(assignmentId)
      if (response.code !== 0 || !response.data) {
        // 409 = 已达最大测评次数
        const code = (response as unknown as { statusCode?: number }).statusCode
        setError(
          code === 409 ? '已达到最大测评次数' : (response.message || '无法开始测评')
        )
        return
      }
      const session: CognitiveSession = response.data
      // 先写账本再跳转（可证明进度 = 尚未提交任何 trial）
      writeAssignmentSessionId(assignmentId, session.sessionId)
      writeSessionLedger(session.sessionId, { status: session.status, trialIndex: -1 })
      navigate(`/student/cognitive/sessions/${session.sessionId}`)
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      setError(
        status === 409
          ? '已达到最大测评次数'
          : (err as { message?: string }).message || '无法开始测评'
      )
    } finally {
      setSubmitting(false)
    }
  }, [assignmentId, navigate, submitting])

  const handleResume = useCallback(() => {
    if (ledgerSessionId) {
      navigate(`/student/cognitive/sessions/${ledgerSessionId}`)
    }
  }, [ledgerSessionId, navigate])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error || !assignment) {
    return (
      <div className="card p-8 text-center">
        <p className="text-red-500 mb-4">{error || '测评不存在'}</p>
        <button onClick={() => navigate('/student/cognitive')} className="btn-secondary">
          返回列表
        </button>
      </div>
    )
  }

  const canResume = ledgerStatus === 'IN_PROGRESS' && ledgerSessionId
  const showResult = ledgerStatus === 'COMPLETED' && ledgerSessionId

  return (
    <div>
      <button
        onClick={() => navigate('/student/cognitive')}
        className="flex items-center text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> 返回列表
      </button>

      <div className="card p-8 max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">{assignment.title}</h1>
        {assignment.course && (
          <p className="text-sm text-gray-500 mb-4">{assignment.course.title}</p>
        )}
        {assignment.instruction && (
          <p className="text-gray-600 mb-6 whitespace-pre-wrap">{assignment.instruction}</p>
        )}

        <div className="text-sm text-gray-500 mb-6 space-y-1">
          {assignment.dueAt && (
            <p>截止时间：{new Date(assignment.dueAt).toLocaleString('zh-CN')}</p>
          )}
          <p>最多尝试：{assignment.maxAttempts} 次</p>
          {assignment.config && (
            <p>
              测评类型：{assignment.config.testType} / 引擎 {assignment.config.engineVersion}
            </p>
          )}
        </div>

        <div className="flex space-x-3">
          {showResult ? (
            <button onClick={() => ledgerSessionId && navigate(`/student/cognitive/sessions/${ledgerSessionId}/result`)} className="btn-primary">
              查看结果
            </button>
          ) : (
            <button onClick={canResume ? handleResume : handleStart} disabled={submitting} className="btn-primary">
              {canResume ? (
                <>
                  <RotateCcw className="w-4 h-4 mr-1 inline" /> 继续测评
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-1 inline" /> {submitting ? '请稍候...' : '开始测评'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default CognitiveAssignmentEntry
