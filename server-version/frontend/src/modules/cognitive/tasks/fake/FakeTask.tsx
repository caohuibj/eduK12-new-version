import React, { useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { FakeConfig } from '../../types'

/**
 * Fake Task Runner（Stage B v1.1 §19）。
 *
 * 行为：
 *  - config 来自 taskContext（frozen Session config）；trialIndex 0..trialCount-1；
 *  - 每次 trial 单独 append（onTrialComplete），payload 只含 raw trial 字段 {correct, rtMs}；
 *  - rtMs 从"本试次渲染开始"计时（毫秒）；correct = rtMs <= config.maxRtMs；
 *  - randomSeed 从 taskContext 读入/保留（contract 存在；Fake 不实际随机化）；
 *  - 客户端不提交 score / payloadHash / 加密内容，不持久化权威 score。
 */

const formatMs = (ms: number) => `${ms} ms`

export const FakeTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete }) => {
  const config = taskContext.config as unknown as FakeConfig
  const total = config?.trialCount ?? 0
  const maxRtMs = config?.maxRtMs ?? 60000

  // 本试次渲染时间起点（rtMs 测量窗口）
  const [startTime] = useState(() => Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsed(Date.now() - startTime)
    }, 100)
    return () => window.clearInterval(timer)
  }, [startTime])

  const handleClick = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const rtMs = Date.now() - startTime
      const correct = rtMs <= maxRtMs
      // 只发 raw trial；由后端权威评分
      await onTrialComplete({ correct, rtMs })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card p-8 text-center">
      <div className="text-sm text-gray-500 mb-4">
        试次 {trialIndex + 1} / {total || '?'} · 请在窗口内响应
      </div>
      <div className="text-sm text-gray-400 mb-6">已用时 {formatMs(elapsed)}</div>

      <button
        onClick={handleClick}
        disabled={submitting}
        className="w-40 h-40 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center mx-auto"
        aria-label={`trial ${trialIndex}`}
      >
        <span className="text-white text-2xl font-bold">{submitting ? '...' : '点击'}</span>
      </button>

      <p className="text-xs text-gray-400 mt-6">
        响应窗口：{maxRtMs} ms（超时记为 miss）
      </p>
    </div>
  )
}
