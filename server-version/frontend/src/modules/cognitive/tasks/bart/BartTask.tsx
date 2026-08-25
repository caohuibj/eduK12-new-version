import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { bartSequence, type BartBalloonSpec } from '../shared/prng'

type Phase = 'instruction' | 'practice' | 'practice-feedback' | 'practice-result' | 'formal'
type BalloonPayload = {
  pumpCount: number
  completed: boolean
  cashedOut: boolean
  interrupted: boolean
}

const PRACTICE = bartSequence('bart-practice-v1.0.0', 4, 6)

export const BartTask: React.FC<CognitiveTaskProps> = ({
  taskContext,
  trialIndex,
  onTrialComplete,
  onTaskComplete,
}) => {
  const config = taskContext.config as {
    balloonCount?: number
    maxPumps?: number
    trialTimeoutMs?: number
    pumpAnimationMs?: number
  }
  const balloonCount = config.balloonCount ?? 30
  const maxPumps = config.maxPumps ?? 12
  const trialTimeoutMs = config.trialTimeoutMs ?? 15000
  const pumpAnimationMs = config.pumpAnimationMs ?? 200
  const sequence = useMemo(
    () => bartSequence(taskContext.randomSeed, balloonCount, maxPumps),
    [taskContext.randomSeed, balloonCount, maxPumps],
  )
  const [phase, setPhase] = useState<Phase>('instruction')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [pumpCount, setPumpCount] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [interrupted, setInterrupted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [completionPending, setCompletionPending] = useState(false)
  const startedAtRef = useRef(0)
  const pumpCountRef = useRef(0)
  const submittedRef = useRef(false)
  const completionRequestedRef = useRef(false)
  const formalSpec = sequence[trialIndex]
  const practiceSpec = PRACTICE[practiceIndex]
  const spec: BartBalloonSpec | undefined = phase === 'practice' ? practiceSpec : formalSpec

  useEffect(() => {
    if (phase !== 'formal') return
    setPumpCount(0)
    pumpCountRef.current = 0
    setFeedback('')
    setSubmitting(false)
    submittedRef.current = false
    startedAtRef.current = performance.now()
  }, [phase, trialIndex])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => {
      if (document.hidden) setInterrupted(true)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const submitFormal = useCallback(async (payload: BalloonPayload) => {
    if (phase !== 'formal' || submittedRef.current || submitting || completionRequestedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) {
        submittedRef.current = false
        setSubmitting(false)
        setFeedback('提交未成功，请继续本题；请勿重复点击。')
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
      submittedRef.current = false
      setSubmitting(false)
      setFeedback('网络暂时不可用，请重试本题。')
    }
  }, [onTaskComplete, onTrialComplete, phase, sequence.length, submitting, trialIndex])

  useEffect(() => {
    if (phase !== 'formal') return
    const elapsedMs = Math.max(0, performance.now() - startedAtRef.current)
    const remainingMs = Math.max(0, trialTimeoutMs - elapsedMs)
    const timer = window.setTimeout(() => {
      void submitFormal({ pumpCount: pumpCountRef.current, completed: false, cashedOut: false, interrupted: true })
    }, remainingMs)
    return () => window.clearTimeout(timer)
  }, [phase, submitFormal, trialIndex, trialTimeoutMs])

  const startPractice = () => {
    setPracticeIndex(0)
    setPracticeCorrect(0)
    setPumpCount(0)
    pumpCountRef.current = 0
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

  const finishPractice = (completed: boolean) => {
    setPracticeCorrect((value) => value + 1)
    setFeedback(completed ? '本题完成：已现金化。' : '本题完成：气球爆破。')
    setPhase('practice-feedback')
  }

  const nextPractice = () => {
    if (practiceIndex + 1 >= PRACTICE.length) {
      setPhase('practice-result')
      return
    }
    setPracticeIndex((value) => value + 1)
    setPumpCount(0)
    pumpCountRef.current = 0
    setFeedback('')
    setPhase('practice')
  }

  const pump = () => {
    if (!spec || submitting || submittedRef.current) return
    const next = Math.min(maxPumps, pumpCount + 1)
    pumpCountRef.current = next
    setPumpCount(next)
    if (next >= spec.explosionThreshold) {
      if (phase === 'practice') finishPractice(false)
      else {
        setFeedback('气球爆破；本次不产生真实奖励。')
        void submitFormal({ pumpCount: next, completed: true, cashedOut: false, interrupted })
      }
    }
  }

  const cashout = () => {
    if (!spec || submitting || submittedRef.current || phase !== 'formal' && phase !== 'practice') return
    if (phase === 'practice') finishPractice(true)
    else {
      setFeedback('已现金化；本任务使用虚拟计数。')
      void submitFormal({ pumpCount, completed: true, cashedOut: true, interrupted })
    }
  }

  if (phase === 'instruction') {
    return (
      <div className="card p-8 text-center">
        <h1 className="mb-4 text-2xl font-bold text-gray-800">气球泵压行为任务</h1>
        <p className="mb-3 text-gray-600">每次可以继续泵压，也可以现金化当前虚拟计数。爆破只表示本次气球达到内部阈值。</p>
        <p className="mb-6 text-xs text-gray-400">练习至少完成 3 / 4；不产生真实货币或奖励，也不输出风险高低判断。</p>
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

  const balloonSize = Math.min(100, 54 + pumpCount * 3)
  return (
    <div className="card p-8 text-center">
      <p className="mb-4 text-sm text-gray-500">
        {phase === 'practice' ? `练习 ${practiceIndex + 1} / ${PRACTICE.length}` : `正式气球 ${trialIndex + 1} / ${sequence.length}`}
        {' · '}当前泵压 {pumpCount}
      </p>
      <div
        className="mx-auto mb-6 flex h-56 w-44 items-center justify-center rounded-[50%] border-4 border-sky-300 bg-sky-100 text-3xl text-sky-700 shadow-inner transition-all"
        style={{ width: `${balloonSize * 1.6}px`, height: `${balloonSize * 2}px`, transitionDuration: `${pumpAnimationMs}ms` }}
        aria-label={`虚拟气球，已泵压 ${pumpCount} 次`}
      >
        {feedback.includes('爆破') ? '✦' : '●'}
      </div>
      <div className="flex justify-center gap-3">
        <button type="button" onClick={pump} disabled={submitting || submittedRef.current || feedback.includes('爆破')} className="btn-primary">继续泵压</button>
        <button type="button" onClick={cashout} disabled={submitting || submittedRef.current || feedback.includes('爆破')} className="btn-secondary">现金化</button>
      </div>
      {feedback && <p className="mt-4 text-sm text-amber-700">{feedback}</p>}
      {phase === 'formal' && interrupted && <p className="mt-3 text-xs text-amber-700">检测到页面切换，中断状态会随正式气球提交。</p>}
      {phase === 'formal' && completionPending && onTaskComplete && <button type="button" onClick={retryCompletion} className="btn-secondary mt-5">重试完成测评</button>}
    </div>
  )
}
