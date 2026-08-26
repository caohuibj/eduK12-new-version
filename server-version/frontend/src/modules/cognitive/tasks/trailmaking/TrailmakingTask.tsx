import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { trailmakingSequence, type TrailmakingItemSpec } from '../shared/prng'

type Phase = 'instruction' | 'practice' | 'practice-feedback' | 'practice-result' | 'formal'
type PointerType = 'mouse' | 'touch' | 'pen' | 'keyboard' | 'unknown'
type DeviceClass = 'desktop' | 'tablet' | 'phone' | 'unknown'

const PRACTICE = trailmakingSequence('trailmaking-practice-v1.0.0', 'A', 4, 0)

const deviceClassOf = (): DeviceClass => {
  if (typeof window === 'undefined') return 'unknown'
  if (window.innerWidth < 600) return 'phone'
  if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) return 'tablet'
  return 'desktop'
}

const pointerTypeOf = (value: string): PointerType =>
  value === 'mouse' || value === 'touch' || value === 'pen' ? value : 'unknown'

const Board: React.FC<{
  items: TrailmakingItemSpec[]
  onAttempt?: (item: TrailmakingItemSpec, pointerType: PointerType) => void
  disabled?: boolean
}> = ({ items, onAttempt, disabled = false }) => (
  <div className="relative mx-auto h-[25rem] max-w-xl rounded-2xl border border-slate-200 bg-slate-50 p-3">
    {items.map((item) => (
      <button
        key={item.targetId}
        type="button"
        aria-label={`目标 ${item.label}`}
        disabled={disabled || !onAttempt}
        onPointerDown={(event) => onAttempt?.(item, pointerTypeOf(event.pointerType))}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onAttempt?.(item, 'keyboard')
          }
        }}
        className="absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-sky-300 bg-white text-base font-semibold text-sky-800 shadow-sm hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-default"
        style={{ left: `${8 + (item.x / 7) * 84}%`, top: `${8 + (item.y / 5) * 84}%` }}
      >
        {item.label}
      </button>
    ))}
  </div>
)

export const TrailmakingTask: React.FC<CognitiveTaskProps> = ({
  taskContext,
  trialIndex,
  onTrialComplete,
  onTaskComplete,
}) => {
  const config = taskContext.config as {
    form?: 'A' | 'AB'
    partAItemCount?: number
    partBItemCount?: number
    stepTimeoutMs?: number
  }
  const form = config.form ?? 'AB'
  const partAItemCount = config.partAItemCount ?? 12
  const partBItemCount = form === 'AB' ? (config.partBItemCount ?? 12) : 0
  const stepTimeoutMs = config.stepTimeoutMs ?? 15000
  const sequence = useMemo(
    () => trailmakingSequence(taskContext.randomSeed, form, partAItemCount, partBItemCount),
    [taskContext.randomSeed, form, partAItemCount, partBItemCount],
  )
  const [phase, setPhase] = useState<Phase>('instruction')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [interrupted, setInterrupted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [completionPending, setCompletionPending] = useState(false)
  const attemptsRef = useRef<Array<{ targetId: string; atMs: number; pointerType: PointerType }>>([])
  const startedAtRef = useRef(0)
  const completionRequestedRef = useRef(false)
  const currentFormalItem = sequence[trialIndex] ?? sequence[sequence.length - 1]
  const currentPracticeItem = PRACTICE[practiceIndex]
  const items = phase === 'practice' ? PRACTICE : sequence
  const deviceClass = useMemo(deviceClassOf, [])

  useEffect(() => {
    if (phase !== 'formal') return
    attemptsRef.current = []
    startedAtRef.current = performance.now()
    setFeedback('')
    setSubmitting(false)
  }, [phase, trialIndex])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => {
      if (document.hidden) setInterrupted(true)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const submitFormal = useCallback(async (attempts: typeof attemptsRef.current, timedOut = false) => {
    if (phase !== 'formal' || submitting || completionRequestedRef.current) return
    setSubmitting(true)
    try {
      const accepted = await onTrialComplete({
        attempts,
        deviceClass,
        interrupted: interrupted || timedOut,
      })
      if (accepted === false) {
        setFeedback('提交未成功，可以继续本题；请勿重复点击。')
        setSubmitting(false)
        return
      }
      if (trialIndex + 1 >= sequence.length) {
        completionRequestedRef.current = true
        setCompletionPending(true)
        await onTaskComplete?.()
      } else {
        setInterrupted(false)
      }
    } catch {
      setFeedback('网络暂时不可用，请重试本题。')
      setSubmitting(false)
    }
  }, [deviceClass, interrupted, onTaskComplete, onTrialComplete, phase, sequence.length, submitting, trialIndex])

  useEffect(() => {
    if (phase !== 'formal') return
    const timer = window.setTimeout(() => {
      void submitFormal(attemptsRef.current, true)
    }, stepTimeoutMs)
    return () => window.clearTimeout(timer)
  }, [phase, stepTimeoutMs, submitFormal, trialIndex])

  const handlePracticeAttempt = (item: TrailmakingItemSpec) => {
    if (item.targetId !== currentPracticeItem.targetId) {
      setFeedback('请按顺序寻找下一个目标。')
      return
    }
    setPracticeCorrect((value) => value + 1)
    setFeedback('本题完成')
    setPhase('practice-feedback')
  }

  const handleFormalAttempt = (item: TrailmakingItemSpec, pointerType: PointerType) => {
    if (submitting || !currentFormalItem) return
    const attempt = {
      targetId: item.targetId,
      atMs: Math.max(0, Math.round(performance.now() - startedAtRef.current)),
      pointerType,
    }
    const attempts = [...attemptsRef.current, attempt]
    attemptsRef.current = attempts
    if (item.targetId === currentFormalItem.targetId) void submitFormal(attempts)
    else setFeedback('目标顺序不正确，请继续寻找当前目标。')
  }

  const startPractice = () => {
    setPracticeIndex(0)
    setPracticeCorrect(0)
    setFeedback('')
    setPhase('practice')
  }

  const startFormal = () => {
    completionRequestedRef.current = false
    setCompletionPending(false)
    setInterrupted(false)
    setFeedback('')
    setPhase('formal')
  }

  const retryCompletion = () => {
    if (onTaskComplete) void onTaskComplete()
  }

  const nextPractice = () => {
    if (practiceIndex + 1 >= PRACTICE.length) {
      setPhase('practice-result')
      return
    }
    setPracticeIndex((value) => value + 1)
    setFeedback('')
    setPhase('practice')
  }

  if (phase === 'instruction') {
    return (
      <div className="card p-8 text-center">
        <h1 className="mb-4 text-2xl font-bold text-gray-800">Trail Making 视觉搜索与切换</h1>
        <p className="mb-3 text-gray-600">请按顺序点击或键盘选择目标。正式任务可能要求在数字和字母之间交替。</p>
        <p className="mb-6 text-xs text-gray-400">练习至少完成 3 / 4；练习不计入正式结果。动作速度、设备和指针方式可能影响完成时间。</p>
        <button type="button" onClick={startPractice} className="btn-primary">开始练习</button>
      </div>
    )
  }

  if (phase === 'practice-result') {
    const passed = practiceCorrect >= 3
    return (
      <div className="card p-8 text-center">
        <p className="mb-4 text-gray-700">练习完成 {practiceCorrect} / {PRACTICE.length}</p>
        <button type="button" onClick={passed ? startFormal : startPractice} className={passed ? 'btn-primary' : 'btn-secondary'}>
          {passed ? '开始正式测验' : '重新练习'}
        </button>
      </div>
    )
  }

  if (phase === 'practice-feedback') {
    return (
      <div className="card p-8 text-center">
        <p className="mb-5 text-gray-700">{feedback}</p>
        <button type="button" onClick={nextPractice} className="btn-primary">
          {practiceIndex + 1 >= PRACTICE.length ? '查看练习结果' : '下一题'}
        </button>
      </div>
    )
  }

  return (
    <div className="card p-5 text-center">
      <p className="mb-4 text-sm text-gray-500">
        {phase === 'practice' ? `练习 ${practiceIndex + 1} / ${PRACTICE.length}` : `正式步骤 ${trialIndex + 1} / ${sequence.length}`}
        {' · '}不保存练习数据
      </p>
      <Board items={items} onAttempt={phase === 'practice' ? (item) => handlePracticeAttempt(item) : handleFormalAttempt} disabled={submitting} />
      {feedback && <p className="mt-3 text-sm text-amber-700">{feedback}</p>}
      {phase === 'practice' && <button type="button" onClick={() => { setFeedback('本题未完成'); setPhase('practice-feedback') }} className="btn-secondary mt-5">本题无法完成</button>}
      {phase === 'formal' && interrupted && <p className="mt-3 text-xs text-amber-700">检测到页面切换，中断状态会随正式试次提交。</p>}
      {phase === 'formal' && completionPending && onTaskComplete && <button type="button" onClick={retryCompletion} className="btn-secondary mt-5">重试完成测评</button>}
    </div>
  )
}
