import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { ReactionConfig, ReactionTrialPayload } from '../../types'
import { deterministicForeperiod } from './prng'

/**
 * Reaction Task Runner（Milestone E Session 2 / §24–§37）。
 *
 * 内部相位机（用户确认 R2：practice 属于 Task，不进入通用 Runner 状态机）：
 *   instruction → practice(3, 客户端, 不持久化) → formal(trialIndex 由 Runner 驱动)
 *
 * 行为约束：
 *  - 仅 formal 试次调用 onTrialComplete（写入 CognitiveTrial）；practice 不入库、不评分（§21）。
 *  - RT 用 performance.now() 计时（§30），禁止 Date.now()/React state clock/setInterval 累积。
 *  - foreperiod 由 randomSeed 确定性派生（§29），同一 Session 可复现。
 *  - green 前响应 = premature（prematureCount+1，不推进 trialIndex，重入 ready 等待，§31）；
 *    timeout = rtMs null（记 miss）。
 *  - document.hidden → interrupted=true（§22）；响应提交期间重复输入忽略（respondingRef）。
 *  - 不提交 valid/score/payloadHash/加密内容，后端权威评分。
 *
 * 已知限制（Internal Pilot）：在首个 formal 试次提交前刷新页面，Runner 因无本地账本会进入
 * RECOVERY_REQUIRED（框架既有语义）。后续如需可在进入 formal 时写入账本检查点。
 */

const PRACTICE_TRIALS = 3

type Phase = 'instruction' | 'practice' | 'formal'
type Sub = 'ready' | 'gray' | 'green' | 'feedback'

const stimulusClass = (isGo: boolean) =>
  isGo
    ? 'bg-green-500 hover:bg-green-600 ring-4 ring-green-200'
    : 'bg-gray-300'

export const ReactionTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete }) => {
  const config = taskContext.config as unknown as ReactionConfig
  const total = config?.totalTrials ?? 20
  const foreperiodMin = config?.foreperiodMinMs ?? 700
  const foreperiodMax = config?.foreperiodMaxMs ?? 1500
  const timeoutMs = config?.timeoutMs ?? 2000
  const readyDurationMs = config?.readyDurationMs ?? 1000

  const [phase, setPhase] = useState<Phase>('instruction')

  // —— practice 状态 ——
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceSub, setPracticeSub] = useState<Sub>('ready')
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [practicePremature, setPracticePremature] = useState(false)
  const [practiceOnset, setPracticeOnset] = useState<number | null>(null)

  // —— formal 状态 ——
  const [sub, setSub] = useState<Sub>('ready')
  const [foreperiodMs, setForeperiodMs] = useState(0)
  const [stimulusOnset, setStimulusOnset] = useState<number | null>(null)
  const [prematureCount, setPrematureCount] = useState(0)
  const [interrupted, setInterrupted] = useState(false)
  const interruptedRef = useRef(false)
  /** premature 后重入 ready 用的 nonce，强制 ready→green 计时重新开始（§31）。 */
  const [round, setRound] = useState(0)
  const respondingRef = useRef(false)

  // 进入每个正式试次：派生确定性 foreperiod，重置子相位
  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total) return
    const fp = deterministicForeperiod(taskContext.randomSeed, trialIndex, foreperiodMin, foreperiodMax)
    setForeperiodMs(fp)
    setSub('ready')
    setStimulusOnset(null)
    setPrematureCount(0)
    setInterrupted(false)
    interruptedRef.current = false
    setRound(0)
  }, [phase, trialIndex, taskContext.randomSeed, foreperiodMin, foreperiodMax])

  // formal ready → gray
  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total || sub !== 'ready') return
    const t = window.setTimeout(() => {
      setSub('gray')
    }, readyDurationMs)
    return () => window.clearTimeout(t)
  }, [phase, sub, readyDurationMs, round])

  // formal gray → green：真正的刺激前间隔使用 seeded foreperiod。
  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total || sub !== 'gray') return
    const t = window.setTimeout(() => {
      setSub('green')
      setStimulusOnset(performance.now())
    }, foreperiodMs)
    return () => window.clearTimeout(t)
  }, [phase, sub, foreperiodMs, round])

  // formal green → timeout（无响应按 miss 提交）
  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total || sub !== 'green' || stimulusOnset == null) return
    const t = window.setTimeout(() => {
      setSub('feedback')
      void submit(null, 'pointer')
    }, timeoutMs)
    return () => window.clearTimeout(t)
  }, [phase, sub, stimulusOnset, timeoutMs, trialIndex, total])

  // visibility 中断检测
  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total) return
    const onVis = () => {
      if (document.hidden) {
        interruptedRef.current = true
        setInterrupted(true)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [phase])

  const submit = useCallback(
    async (rtMs: number | null, inputMode: ReactionTrialPayload['inputMode']) => {
      if (respondingRef.current || trialIndex >= total) return
      respondingRef.current = true
      const payload: ReactionTrialPayload = {
        foreperiodMs,
        rtMs,
        prematureCount,
        interrupted: interruptedRef.current,
        inputMode,
      }
      try {
        await onTrialComplete(payload)
      } finally {
        respondingRef.current = false
      }
    },
    [foreperiodMs, prematureCount, onTrialComplete, trialIndex, total]
  )

  const handleFormalInput = useCallback(
    (inputMode: ReactionTrialPayload['inputMode']) => {
      if (phase !== 'formal' || trialIndex >= total) return
      if (sub === 'ready' || sub === 'gray') {
        // 过早响应：prematureCount+1，不推进 trialIndex，重入 ready（§31）
        setPrematureCount((c) => c + 1)
        setStimulusOnset(null)
        setSub('ready')
        setRound((r) => r + 1)
        return
      }
      if (sub === 'green' && stimulusOnset != null) {
        const rt = Math.round(performance.now() - stimulusOnset)
        setSub('feedback')
        void submit(rt, inputMode)
      }
    },
    [phase, sub, stimulusOnset, submit, trialIndex, total]
  )

  // formal 全程监听键盘（ready 阶段按键 = premature，green 阶段按键 = 响应）
  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total) return
    const onKey = () => handleFormalInput('keyboard')
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, trialIndex, total, handleFormalInput])

  // —— practice ——
  useEffect(() => {
    if (phase !== 'practice' || practiceSub !== 'ready') return
    const t = window.setTimeout(() => {
      setPracticeSub('green')
      setPracticeOnset(performance.now())
    }, readyDurationMs)
    return () => window.clearTimeout(t)
  }, [phase, practiceSub, readyDurationMs])

  useEffect(() => {
    if (phase !== 'practice' || practiceSub !== 'green' || practiceOnset == null) return
    const t = window.setTimeout(() => {
      setPracticePremature(false)
      finishPractice(null) // 超时
    }, timeoutMs)
    return () => window.clearTimeout(t)
  }, [phase, practiceSub, practiceOnset, timeoutMs])

  const finishPractice = useCallback((rtMs: number | null) => {
    setPracticePremature(false)
    if (rtMs == null) {
      setPracticeFeedback('超时了，绿色出现后再点击。')
    } else if (rtMs < 150) {
      setPracticeFeedback('太快了！等绿色圆点出现再点击。')
    } else {
      setPracticeFeedback('很好！保持专注，等绿色出现再点击。')
    }
    setPracticeSub('feedback')
  }, [])

  const handlePracticeInput = useCallback(() => {
    if (phase !== 'practice') return
    if (practiceSub === 'ready') {
      // 过早响应：练习不推进，提示后重试本试次
      setPracticePremature(true)
      setPracticeFeedback('太快了，等绿色出现再点击。')
      setPracticeSub('feedback')
      return
    }
    if (practiceSub === 'green' && practiceOnset != null) {
      const rt = performance.now() - practiceOnset
      finishPractice(rt)
    }
  }, [phase, practiceSub, practiceOnset, finishPractice])

  const retryPractice = () => {
    setPracticePremature(false)
    setPracticeSub('ready')
    setPracticeOnset(null)
    setPracticeFeedback(null)
  }

  const advancePractice = () => {
    if (practiceIndex + 1 >= PRACTICE_TRIALS) {
      setPhase('formal')
      setPracticeIndex(0)
      setPracticePremature(false)
      setPracticeFeedback(null)
      return
    }
    setPracticeIndex((i) => i + 1)
    setPracticeSub('ready')
    setPracticeOnset(null)
    setPracticePremature(false)
    setPracticeFeedback(null)
  }

  // —— 渲染 ——
  if (phase === 'instruction') {
    return (
      <div className="card p-8 max-w-2xl text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">反应速度</h1>
        <p className="text-gray-600 mb-3">
          屏幕上会出现灰色圆点，短暂间隔后变成<span className="text-green-600 font-semibold">绿色</span>。
          看到绿色后，尽快点击屏幕或按任意键。
        </p>
        <p className="text-gray-500 text-sm mb-2">
          本任务测量：反应速度、反应稳定性、漏答与过早响应。
        </p>
        <p className="text-gray-400 text-xs mb-6">
          结果反映本次任务表现，不代表诊断或正式能力评估。
        </p>
        <button onClick={() => setPhase('practice')} className="btn-primary">
          开始练习
        </button>
      </div>
    )
  }

  if (phase === 'practice') {
    return (
      <div className="card p-8 max-w-2xl text-center">
        <div className="text-sm text-gray-500 mb-4">练习 {practiceIndex + 1} / {PRACTICE_TRIALS}</div>
        {practiceSub !== 'feedback' ? (
          <button
            onClick={handlePracticeInput}
            className={`w-40 h-40 rounded-full mx-auto flex items-center justify-center transition-colors ${stimulusClass(practiceSub === 'green')}`}
            aria-label={`practice trial ${practiceIndex}`}
          >
            <span className={`text-2xl font-bold ${practiceSub === 'green' ? 'text-white' : 'text-gray-600'}`}>
              {practiceSub === 'green' ? '点击！' : '等待…'}
            </span>
          </button>
        ) : (
          <div>
            <p className="text-gray-700 mb-6">{practiceFeedback}</p>
            <button onClick={practicePremature ? retryPractice : advancePractice} className="btn-primary">
              {practicePremature ? '重试' : practiceIndex + 1 >= PRACTICE_TRIALS ? '开始正式测评' : '下一个'}
            </button>
          </div>
        )}
      </div>
    )
  }

  if (trialIndex >= total) {
    return (
      <div className="card p-8 max-w-2xl text-center">
        <p className="text-gray-700">正式试次已完成，请提交测评结果。</p>
      </div>
    )
  }

  // formal
  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="text-sm text-gray-500 mb-4">
        试次 {trialIndex + 1} / {total}
      </div>
      <button
        onClick={() => handleFormalInput('pointer')}
        className={`w-48 h-48 rounded-full mx-auto flex items-center justify-center transition-colors ${stimulusClass(sub === 'green')}`}
        aria-label={`trial ${trialIndex}`}
      >
        <span className={`text-2xl font-bold ${sub === 'green' ? 'text-white' : 'text-gray-600'}`}>
          {sub === 'green' ? '点击！' : sub === 'gray' ? '等待…' : '准备…'}
        </span>
      </button>
      <p className="text-xs text-gray-400 mt-6">
        看到绿色后尽快点击或按任意键{interrupted ? '（检测到页面切走，本次记为中断）' : ''}
      </p>
    </div>
  )
}
