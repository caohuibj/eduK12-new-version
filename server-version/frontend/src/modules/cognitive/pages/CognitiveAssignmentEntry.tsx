import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play, RotateCcw } from 'lucide-react'
import { cognitiveApi } from '../api'
import { resolveCognitiveEntryAction } from '../entry-action'
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
        const code = (response as unknown as { statusCode?: number }).statusCode
        setError(code === 409 ? '已达到最大测评次数' : (response.message || '无法开始或继续测评'))
        return
      }
      const session: CognitiveSession = response.data
      writeAssignmentSessionId(assignmentId, session.sessionId)
      writeSessionLedger(session.sessionId, { status: session.status, trialIndex: -1 })
      navigate(`/student/cognitive/sessions/${session.sessionId}`)
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      setError(
        status === 409
          ? '已达到最大测评次数'
          : (err as { message?: string }).message || '无法开始或继续测评'
      )
    } finally {
      setSubmitting(false)
    }
  }, [assignmentId, navigate, submitting])

  const handleResume = useCallback(() => {
    if (ledgerSessionId) navigate(`/student/cognitive/sessions/${ledgerSessionId}`)
  }, [ledgerSessionId, navigate])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-action"></div>
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

  const entryAction = resolveCognitiveEntryAction(ledgerSessionId, ledgerStatus)

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
          {assignment.usedAttempts !== undefined && <p>已使用 {assignment.usedAttempts} 次 · 剩余 {assignment.remainingAttempts} 次。独立入口与组合测评共用次数，继续原作答不额外计次。</p>}
          <p>预计用时以本任务指导语为准，请在可连续完成的环境中开始。</p>
          {assignment.config && (
            <p>
              测评类型：{assignment.config.testType} / 引擎 {assignment.config.engineVersion}
            </p>
          )}
        </div>

        {entryAction.kind === 'reconcile' ? (
          <p className="mb-4 text-sm text-slate-600">
            进入时会先核对服务器上的进行中尝试；如已存在则继续原尝试，否则才创建新尝试。
          </p>
        ) : null}

        <div className="flex space-x-3">
          {assignment.continueHref ? <button className="btn-primary" onClick={() => navigate(assignment.continueHref!)}>继续已有作答</button> : entryAction.kind === 'result' ? (
            <button onClick={() => ledgerSessionId && navigate(`/student/cognitive/sessions/${ledgerSessionId}/result`)} className="btn-primary">
              {entryAction.label}
            </button>
          ) : (
            <button
              onClick={entryAction.kind === 'continue' ? handleResume : handleStart}
              disabled={submitting || (assignment.remainingAttempts === 0 && entryAction.kind !== 'continue')}
              className="btn-primary"
            >
              {entryAction.kind === 'continue' ? (
                <>
                  <RotateCcw className="w-4 h-4 mr-1 inline" /> {entryAction.label}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-1 inline" /> {submitting ? '正在核对...' : entryAction.label}
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
