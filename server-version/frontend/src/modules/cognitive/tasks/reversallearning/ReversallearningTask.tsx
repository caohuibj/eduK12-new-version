import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { reversallearningSequence, type ReversallearningTrialSpec } from '../shared/prng'

type Phase = 'instruction' | 'practice' | 'practice-feedback' | 'practice-result' | 'formal'
type Choice = 'left' | 'right'

const PRACTICE = reversallearningSequence('reversallearning-practice-v1.0.0', 4, 2, 2, 0.8)

const responseLabel = (choice: Choice) => choice === 'left' ? '左侧符号' : '右侧符号'

const feedbackFor = (spec: ReversallearningTrialSpec, choice: Choice, rewardProbability: number): string => {
  const correct = choice === spec.correctResponse
  const rewarded = correct && spec.rewardRoll < rewardProbability
  return rewarded ? '获得反馈' : correct ? '本次未获得反馈' : '未获得反馈'
}

export const ReversallearningTask: React.FC<CognitiveTaskProps> = ({
  taskContext,
  trialIndex,
  onTrialComplete,
  onTaskComplete,
}) => {
  const config = taskContext.config as {
    totalTrials?: number
    acquisitionTrials?: number
    reversalTrials?: number
    rewardProbability?: number
    trialTimeoutMs?: number
  }
  const totalTrials = config.totalTrials ?? 120
  const acquisitionTrials = config.acquisitionTrials ?? Math.floor(totalTrials / 2)
  const reversalTrials = config.reversalTrials ?? totalTrials - acquisitionTrials
  const rewardProbability = config.rewardProbability ?? 0.8
  const trialTimeoutMs = config.trialTimeoutMs ?? 3000
  const sequence = useMemo(
    () => reversallearningSequence(taskContext.randomSeed, totalTrials, acquisitionTrials, reversalTrials, rewardProbability),
    [taskContext.randomSeed, totalTrials, acquisitionTrials, reversalTrials, rewardProbability],
  )
  const [phase, setPhase] = useState<Phase>('instruction')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [interrupted, setInterrupted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [completionPending, setCompletionPending] = useState(false)
  const startedAtRef = useRef(0)
  const respondedRef = useRef(false)
  const completionRequestedRef = useRef(false)
  const formalSpec = sequence[trialIndex]
  const practiceSpec = PRACTICE[practiceIndex]
  const spec = phase === 'practice' ? practiceSpec : formalSpec

  useEffect(() => {
    if (phase !== 'formal') return
    startedAtRef.current = performance.now()
    respondedRef.current = false
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

  const submitFormal = useCallback(async (choice: Choice | null, rtMs: number | null, timedOut = false) => {
    if (phase !== 'formal' || respondedRef.current || submitting || completionRequestedRef.current) return
    respondedRef.current = true
    setSubmitting(true)
    try {
      const accepted = await onTrialComplete({ choice, rtMs, interrupted: interrupted || timedOut })
      if (accepted === false) {
        respondedRef.current = false
        setSubmitting(false)
        setFeedback('提交未成功，请重新选择；请勿重复点击。')
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
      respondedRef.current = false
      setSubmitting(false)
      setFeedback('网络暂时不可用，请重试本题。')
    }
  }, [interrupted, onTaskComplete, onTrialComplete, phase, sequence.length, submitting, trialIndex])

  useEffect(() => {
    if (phase !== 'formal') return
    const timer = window.setTimeout(() => {
      void submitFormal(null, null, true)
    }, trialTimeoutMs)
    return () => window.clearTimeout(timer)
  }, [phase, submitFormal, trialIndex, trialTimeoutMs])

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

  const handlePracticeChoice = (choice: Choice) => {
    const isCorrect = choice === practiceSpec.correctResponse
    setPracticeCorrect((value) => value + (isCorrect ? 1 : 0))
    setFeedback(isCorrect ? feedbackFor(practiceSpec, choice, rewardProbability) : '未获得反馈')
    setPhase('practice-feedback')
  }

  const handleFormalChoice = (choice: Choice) => {
    if (!formalSpec || submitting || respondedRef.current) return
    const rtMs = Math.max(0, Math.round(performance.now() - startedAtRef.current))
    setFeedback(feedbackFor(formalSpec, choice, rewardProbability))
    void submitFormal(choice, rtMs)
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
      <CognitiveTaskIntro title="概率反馈与规则反转" description={<p>每个试次请选择左侧或右侧符号，并根据反馈逐渐发现当前规则。规则会在中途反转。</p>} hint={<><p>练习至少完成 3 / 4；练习不计入正式结果。结果不用于人格或风险判断。</p></>} onAction={startPractice} />
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

  const segmentLabel = spec?.segment === 'reversal' ? '反转阶段' : '习得阶段'
  return (
    <div className="card p-8 text-center">
      <p className="mb-4 text-sm text-gray-500">
        {phase === 'practice' ? `练习 ${practiceIndex + 1} / ${PRACTICE.length}` : `正式试次 ${trialIndex + 1} / ${sequence.length} · ${segmentLabel}`}
      </p>
      <p className="mb-5 text-gray-600">请选择一个符号</p>
      <div className="mx-auto grid max-w-md grid-cols-2 gap-4">
        {(['left', 'right'] as const).map((choice) => {
          const symbol = choice === 'left' ? spec?.leftSymbol : spec?.rightSymbol
          return (
            <button
              key={choice}
              type="button"
              disabled={phase === 'formal' ? submitting || respondedRef.current : false}
              onClick={() => phase === 'practice' ? handlePracticeChoice(choice) : handleFormalChoice(choice)}
              className="rounded-2xl border-2 border-sky-200 bg-white px-8 py-8 text-5xl text-sky-700 shadow-sm hover:bg-sky-50 focus:outline-hidden focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
              aria-label={responseLabel(choice)}
            >
              {symbol === 'A' ? '○' : '△'}
            </button>
          )
        })}
      </div>
      {feedback && <p className="mt-5 text-sm text-amber-700">{feedback}</p>}
      {phase === 'formal' && interrupted && <p className="mt-3 text-xs text-amber-700">检测到页面切换，中断状态会随正式试次提交。</p>}
      {phase === 'formal' && completionPending && onTaskComplete && <button type="button" onClick={retryCompletion} className="btn-secondary mt-5">重试完成测评</button>}
    </div>
  )
}
