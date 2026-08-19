import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { cognitiveApi } from '../api'
import type { CognitiveSession } from '../types'

/**
 * CognitiveResult（Stage B v1.1 §21.3）—— 只读展示服务器结果。
 * GET /cognitive/sessions/:id → COMPLETED + stored decrypted result；
 * 刷新走同一接口恢复，**不重新评分**、不显示 participantKey/payloadHash/密文。
 */

const CognitiveResult: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<CognitiveSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    const fetchResult = async () => {
      try {
        const response = await cognitiveApi.getSession(sessionId)
        if (!cancelled) {
          if (response.code === 0 && response.data) {
            setSession(response.data)
            if (response.data.status !== 'COMPLETED') {
              setError('该测评尚未完成')
            }
          } else {
            setError(response.message || '结果不存在或不可访问')
          }
        }
      } catch (err) {
        if (!cancelled) setError((err as { message?: string }).message || '结果不存在或不可访问')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchResult()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error || !session?.result) {
    return (
      <div className="card p-8 text-center">
        <p className="text-gray-600 mb-4">{error || '暂无结果'}</p>
        <button onClick={() => navigate('/student/cognitive')} className="btn-secondary">
          返回列表
        </button>
      </div>
    )
  }

  const { result } = session

  return (
    <div>
      <button
        onClick={() => navigate('/student/cognitive')}
        className="flex items-center text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> 返回列表
      </button>

      <div className="card p-8 max-w-2xl text-center">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 mb-2">测评完成</h1>
        <p className="text-sm text-gray-500 mb-6">
          尝试 #{session.attemptNo}（{session.testType} / {session.engineVersion}）
          {session.finishedAt ? ` · ${new Date(session.finishedAt).toLocaleString('zh-CN')}` : ''}
        </p>

        <div className="mb-8">
          <div className="text-5xl font-bold text-primary">
            {typeof result.score === 'number' ? Math.round(result.score * 100) / 100 : '-'}
          </div>
          <div className="text-sm text-gray-400 mt-1">得分</div>
        </div>

        {result.metrics && Object.keys(result.metrics).length > 0 && (
          <div className="text-left border-t pt-4">
            <p className="text-sm font-semibold text-gray-600 mb-2">指标</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(result.metrics).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-gray-500">{k}</span>
                  <span className="text-gray-800">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CognitiveResult
