import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  captureFrameTimingOnset,
  resolveEventResponseTimestamp,
  type CognitiveTimingOnset,
} from '../../core/response-timing'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { createTaskTimingDiagnostics } from '../../core/task-timing-diagnostics'
import type { ReactionConfig, ReactionTrialPayload } from '../../types'
import { deterministicForeperiod } from './prng'

const PRACTICE_TRIALS = 3

type Phase = 'instruction' | 'practice' | 'formal'
type Sub = 'ready' | 'gray' | 'green' | 'feedback'

const stimulusClass = (isGo: boolean) =>
  isGo
    ? 'bg-green-500 hover:bg-green-600 ring-4 ring-green-200'
    : 'bg-gray-300'

export const ReactionFrameTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete }) => {
  const config = taskContext.config as unknown as ReactionConfig
  const total = config?.totalTrials ?? 20
  const foreperiodMin = config?.foreperiodMinMs ?? 700
  const foreperiodMax = config?.foreperiodMaxMs ?? 1500
  const timeoutMs = config?.timeoutMs ?? 2000
  const readyDurationMs = config?.readyDurationMs ?? 1000
  const [timingDiagnostics] = useState(createTaskTimingDiagnostics)

  const [phase, setPhase] = useState<Phase>('instruction')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceSub, setPracticeSub] = useState<Sub>('ready')
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [practicePremature, setPracticePremature] = useState(false)
  const [practiceOnset, setPracticeOnset] = useState<number | null>(null)

  const [sub, setSub] = useState<Sub>('ready')
  const [foreperiodMs, setForeperiodMs] = useState(0)
  const [stimulusOnsetPerfMs, setStimulusOnsetPerfMs] = useState<number | null>(null)
  const stimulusOnsetRef = useRef<CognitiveTimingOnset | null>(null)
  const [prematureCount, setPrematureCount] = useState(0)
  const [interrupted, setInterrupted] = useState(false)
  const interruptedRef = useRef(false)
  const [round, setRound] = useState(0)
  const respondingRef = useRef(false)

  const markInterrupted = useCallback(() => {
    interruptedRef.current = true
    setInterrupted(true)
  }, [])

  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total) return
    const fp = deterministicForeperiod(taskContext.randomSeed, trialIndex, foreperiodMin, foreperiodMax)
    setForeperiodMs(fp)
    setSub('ready')
    setStimulusOnsetPerfMs(null)
    stimulusOnsetRef.current = null
    setPrematureCount(0)
    setInterrupted(false)
    interruptedRef.current = false
    setRound(0)
  }, [phase, trialIndex, taskContext.randomSeed, foreperiodMin, foreperiodMax, total])

  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total || sub !== 'ready') return
    const timer = window.setTimeout(() => setSub('gray'), readyDurationMs)
    return () => window.clearTimeout(timer)
  }, [phase, sub, readyDurationMs, round, trialIndex, total])

  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total || sub !== 'gray') return
    let animationFrameId: number | null = null
    const timer = window.setTimeout(() => {
      const eligiblePerfMs = performance.now()
      const present = (framePerfMs: number) => {
        const captured = captureFrameTimingOnset(framePerfMs)
        if (captured.ok) {
          stimulusOnsetRef.current = captured.onset
          setStimulusOnsetPerfMs(captured.onset.perfMs)
        } else {
          markInterrupted()
          const fallbackPerfMs = performance.now()
          stimulusOnsetRef.current = {
            perfMs: fallbackPerfMs,
            timeOriginEpochMs: performance.timeOrigin,
          }
          setStimulusOnsetPerfMs(fallbackPerfMs)
        }
        setSub('green')
      }

      if (typeof window.requestAnimationFrame !== 'function') {
        markInterrupted()
        present(performance.now())
        return
      }
      animationFrameId = window.requestAnimationFrame((framePerfMs) => {
        timingDiagnostics.frameCallback({ eligiblePerfMs, framePerfMs, trialIndex })
        present(framePerfMs)
      })
    }, foreperiodMs)

    return () => {
      window.clearTimeout(timer)
      if (animationFrameId != null && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(animationFrameId)
      }
    }
  }, [phase, sub, foreperiodMs, round, trialIndex, total, markInterrupted, timingDiagnostics])

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
    [foreperiodMs, prematureCount, onTrialComplete, trialIndex, total],
  )

  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total || sub !== 'green' || stimulusOnsetPerfMs == null) return
    const elapsedMs = Math.max(0, performance.now() - stimulusOnsetPerfMs)
    const remainingMs = Math.max(0, timeoutMs - elapsedMs)
    const timer = window.setTimeout(() => {
      setSub('feedback')
      void submit(null, 'pointer')
    }, remainingMs)
    return () => window.clearTimeout(timer)
  }, [phase, sub, stimulusOnsetPerfMs, timeoutMs, trialIndex, total, submit])

  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total) return
    const onVisibilityChange = () => {
      if (!document.hidden) return
      timingDiagnostics.visibilityLost(performance.now(), trialIndex)
      markInterrupted()
    }
    const onBlur = () => {
      timingDiagnostics.focusLost(performance.now(), trialIndex)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onBlur)
    }
  }, [phase, trialIndex, total, markInterrupted, timingDiagnostics])

  const handleFormalInput = useCallback((
    inputMode: ReactionTrialPayload['inputMode'],
    eventTimeStamp: number,
  ) => {
    if (phase !== 'formal' || trialIndex >= total) return
    if (sub === 'ready' || sub === 'gray') {
      setPrematureCount((count) => count + 1)
      setStimulusOnsetPerfMs(null)
      stimulusOnsetRef.current = null
      setSub('ready')
      setRound((value) => value + 1)
      return
    }
    if (sub !== 'green' || stimulusOnsetRef.current == null) return

    const resolved = resolveEventResponseTimestamp(eventTimeStamp, stimulusOnsetRef.current)
    const responsePerfMs = resolved.ok ? resolved.responsePerfMs : resolved.fallbackPerfMs
    if (!resolved.ok) {
      timingDiagnostics.responseFailure({ result: resolved, eventTimeStamp, trialIndex })
      markInterrupted()
    }
    if (responsePerfMs == null) return

    const rtMs = Math.round(Math.max(0, responsePerfMs - stimulusOnsetRef.current.perfMs))
    setSub('feedback')
    void submit(rtMs, inputMode)
  }, [phase, trialIndex, total, sub, timingDiagnostics, markInterrupted, submit])

  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      handleFormalInput('keyboard', event.timeStamp)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase, trialIndex, total, handleFormalInput])

  useEffect(() => {
    if (phase !== 'practice' || practiceSub !== 'ready') return
    const timer = window.setTimeout(() => {
      setPracticeSub('green')
      setPracticeOnset(performance.now())
    }, readyDurationMs)
    return () => window.clearTimeout(timer)
  }, [phase, practiceSub, readyDurationMs])

  useEffect(() => {
    if (phase !== 'practice' || practiceSub !== 'green' || practiceOnset == null) return
    const timer = window.setTimeout(() => {
      setPracticePremature(false)
      finishPractice(null)
    }, timeoutMs)
    return () => window.clearTimeout(timer)
  }, [phase, practiceSub, practiceOnset, timeoutMs])

  const finishPractice = useCallback((rtMs: number | null) => {
    setPracticePremature(false)
    if (rtMs == null) setPracticeFeedback('超时了，绿色出现后再点击。')
    else if (rtMs < 150) setPracticeFeedback('太快了！等绿色圆点出现再点击。')
    else setPracticeFeedback('很好！保持专注，等绿色出现再点击。')
    setPracticeSub('feedback')
  }, [])

  const handlePracticeInput = useCallback(() => {
    if (phase !== 'practice') return
    if (practiceSub === 'ready') {
      setPracticePremature(true)
      setPracticeFeedback('太快了，等绿色出现再点击。')
      setPracticeSub('feedback')
      return
    }
    if (practiceSub === 'green' && practiceOnset != null) {
      finishPractice(performance.now() - practiceOnset)
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
    setPracticeIndex((index) => index + 1)
    setPracticeSub('ready')
    setPracticeOnset(null)
    setPracticePremature(false)
    setPracticeFeedback(null)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const inputMode: ReactionTrialPayload['inputMode'] = event.pointerType === 'touch' ? 'touch' : 'pointer'
    handleFormalInput(inputMode, event.timeStamp)
  }

  const handlePointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary) return
    timingDiagnostics.pointerCancelled(performance.now(), trialIndex)
    markInterrupted()
  }

  if (phase === 'instruction') {
    return (
      <div className="card p-8 max-w-2xl text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">反应速度</h1>
        <p className="text-gray-600 mb-3">
          屏幕上会出现灰色圆点，短暂间隔后变成<span className="text-green-600 font-semibold">绿色</span>。
          看到绿色后，尽快点击屏幕或按任意键。
        </p>
        <p className="text-gray-500 text-sm mb-2">本任务测量：反应速度、反应稳定性、漏答与过早响应。</p>
        <p className="text-gray-400 text-xs mb-6">结果反映本次任务表现，不代表诊断或正式能力评估。</p>
        <button onClick={() => setPhase('practice')} className="btn-primary">开始练习</button>
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
    return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700">正式试次已完成，请提交测评结果。</p></div>
  }

  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="text-sm text-gray-500 mb-4">试次 {trialIndex + 1} / {total}</div>
      <button
        onPointerDown={handlePointerDown}
        onPointerCancel={handlePointerCancel}
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
