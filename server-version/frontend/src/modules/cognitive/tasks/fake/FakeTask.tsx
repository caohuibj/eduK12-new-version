import React from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { FakeConfig } from '../../types'

/**
 * Fake Task Runner（B2 骨架；B4 补全真实三试次交互）。
 *
 * 契约（v1.1 §19/§22）：
 *  - config 来自 taskContext（frozen Session config）；
 *  - randomSeed 从 taskContext 读入/保留（contract 必须存在；Fake 可不实际随机化）；
 *  - 每笔 trial 单独调用 onTrialComplete，payload 只含 raw trial 字段；
 *  - 客户端不得持久化权威 score / 提交 score / payloadHash / 加密内容。
 */
export const FakeTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete }) => {
  const config = taskContext.config as unknown as FakeConfig
  const total = config?.trialCount ?? 0

  const handleClick = async () => {
    // Fake 语义：点击即作答。correct 由 rtMs 是否落在窗口内决定（由后续 B4 完善时序）。
    const rtMs = Math.floor(Math.random() * (config?.maxRtMs ?? 60000)) + 1
    await onTrialComplete({ correct: rtMs <= (config?.maxRtMs ?? 60000), rtMs })
  }

  return (
    <div className="card p-6 text-center">
      <div className="text-sm text-gray-500 mb-2">
        试次 {trialIndex + 1} / {total || '?'}
      </div>
      <div className="text-2xl font-bold text-gray-800 mb-6">Fake 认知测评</div>
      <button onClick={handleClick} className="btn-primary">
        作答（trial {trialIndex}）
      </button>
    </div>
  )
}
