import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { reversallearningSequence, type ReversallearningTrialSpec } from '../shared/prng'

type Phase = 'instruction' | 'practice' | 'practice-feedback' | 'practice-result' | 'formal'
type Choice = 'left' | 'right'
type FormalPayload = { choice: Choice | null; rtMs: number | null; interrupted: boolean }

const PRACTICE = reversallearningSequence('reversallearning-practice-v1.0.0', 4, 2, 2, 0.8)

const responseLabel = (choice: Choice) => choice === 'left' ? '左侧符号' : '右侧符号'

const feedbackFor = (spec: ReversallearningTrialSpec, choice: Choice, rewardProbability: number, uniformNegative = false): string => {
  const correct = choice === spec.correctResponse
  const rewarded = correct && spec.rewardRoll < rewardProbability
  return rewarded ? '获得反馈' : uniformNegative ? '未获得反馈' : correct ? '本次未获得反馈' : '未获得反馈'
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
    practiceTrialCount?: number
    practiceAcquisitionOnly?: boolean
  }
  const revised = taskContext.engineVersion === '1.1.0'
  const practiceCount = revised ? (config.practiceTrialCount ?? 4) : 4
  const acquisitionOnlyPractice = revised && config.practiceAcquisitionOnly === true
  const practice = useMemo(() => revised ? reversallearningSequence('reversallearning-practice-v1.1.0', practiceCount, acquisitionOnlyPractice ? practiceCount : Math.ceil(practiceCount / 2), acquisitionOnlyPractice ? 0 : Math.floor(practiceCount / 2), config.rewardProbability ?? 0.8) : PRACTICE, [revised, practiceCount, acquisitionOnlyPractice, config.rewardProbability])
  const feedbackTimerRef = useRef<number | null>(null)
  useEffect(() => () => { if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current) }, [])
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
  const [saveFailed, setSaveFailed] = useState(false)
  const pendingPayloadRef = useRef<FormalPayload | null>(null)
  const savingRef = useRef(false)
  const interruptedRef = useRef(false)
  const [completionPending, setCompletionPending] = useState(false)
  const startedAtRef = useRef(0)
  const respondedRef = useRef(false)
  const completionRequestedRef = useRef(false)
  const formalSpec = sequence[trialIndex]
  const practiceSpec = practice[practiceIndex]
  const spec = phase === 'practice' ? practiceSpec : formalSpec

  useEffect(() => {
    if (phase !== 'formal') return
    startedAtRef.current = performance.now()
    respondedRef.current = false
    if (revised) { pendingPayloadRef.current = null; savingRef.current = false; interruptedRef.current = false; setSaveFailed(false) }
    setFeedback('')
    setSubmitting(false)
  }, [phase, trialIndex])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => {
      if (document.hidden) { interruptedRef.current = true; setInterrupted(true) }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const submitFormal = useCallback(async (choice: Choice | null, rtMs: number | null, timedOut = false, retry = false) => {
    if (phase !== 'formal' || submitting || completionRequestedRef.current) return
    if (revised ? savingRef.current || (pendingPayloadRef.current !== null && !retry) : respondedRef.current) return
    const firstSave = !revised || pendingPayloadRef.current === null
    if (revised && firstSave) pendingPayloadRef.current = { choice, rtMs, interrupted: interruptedRef.current || timedOut }
    const payload = revised ? pendingPayloadRef.current! : { choice, rtMs, interrupted: interrupted || timedOut }
    respondedRef.current = true
    if (revised) { savingRef.current = true; setSaveFailed(false) }
    setSubmitting(true)
    try {
      if (revised && firstSave) await new Promise<void>(resolve => { feedbackTimerRef.current = window.setTimeout(resolve, 500) })
      const accepted = await onTrialComplete({ ...payload })
      if (accepted === false) {
        if (revised) { setSaveFailed(true); setFeedback('保存尚未确认，请重试保存本次选择。答案和用时已固定。') }
        else { respondedRef.current = false; setFeedback('提交未成功，请重新选择；请勿重复点击。') }
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
      if (revised) {
        if (completionRequestedRef.current) setFeedback('答案已保存，请重试完成测评。')
        else { setSaveFailed(true); setFeedback('网络暂时不可用，请重试保存本次选择。答案和用时已固定。') }
      } else { respondedRef.current = false; setFeedback('网络暂时不可用，请重试本题。') }
      setSubmitting(false)
    } finally { if (revised) savingRef.current = false }
  }, [interrupted, onTaskComplete, onTrialComplete, phase, sequence.length, submitting, trialIndex, revised])

  useEffect(() => {
    if (phase !== 'formal' || (revised && pendingPayloadRef.current !== null)) return
    // C1.1 keeps one trial onset even when interruption/save state changes callbacks.
    const remainingMs = revised ? Math.max(0, startedAtRef.current + trialTimeoutMs - performance.now()) : trialTimeoutMs
    const timer = window.setTimeout(() => {
      if (revised && !respondedRef.current) setFeedback('超时未选择')
      void submitFormal(null, null, true)
    }, remainingMs)
    return () => window.clearTimeout(timer)
  }, [phase, submitFormal, trialIndex, trialTimeoutMs, revised])

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
    setFeedback(isCorrect ? feedbackFor(practiceSpec, choice, rewardProbability, revised) : '未获得反馈')
    setPhase('practice-feedback')
  }

  const handleFormalChoice = (choice: Choice) => {
    if (!formalSpec || submitting || respondedRef.current) return
    const elapsedMs = performance.now() - startedAtRef.current
    if (revised && elapsedMs >= trialTimeoutMs) { setFeedback('超时未选择'); void submitFormal(null, null, true); return }
    const rtMs = Math.max(0, Math.round(elapsedMs))
    setFeedback(feedbackFor(formalSpec, choice, rewardProbability, revised))
    void submitFormal(choice, rtMs)
  }

  const nextPractice = () => {
    if (practiceIndex + 1 >= practice.length) {
      setPhase('practice-result')
      return
    }
    setPracticeIndex((value) => value + 1)
    setFeedback('')
    setPhase('practice')
  }

  if (phase === 'instruction') {
    return (
      <CognitiveTaskIntro title="概率反馈与规则反转" description={<p>每题请选择左侧或右侧符号，根据多次反馈找出当前较有利的符号。较有利的符号也可能偶尔得到负反馈；规则会在中途反转。</p>} hint={<><p>{acquisitionOnlyPractice ? `先完成 ${practice.length} 题无反转练习，熟悉偶尔没有奖励的情况；练习不设正确率通过线。` : revised ? '4题练习中至少3次选到当时较有利的符号；' : '练习至少完成 3 / 4；'}练习不计入正式结果。结果不用于人格或风险判断。</p></>} onAction={startPractice} />
    )
  }

  if (phase === 'practice-result') {
    const passed = acquisitionOnlyPractice || practiceCorrect >= 3
    return (
      <div className="card p-8 text-center">
        <p className="mb-4 text-gray-700">{revised ? `练习已完成 ${practice.length} 题` : `练习完成 ${practiceCorrect} / ${practice.length}`}</p>
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
          {practiceIndex + 1 >= practice.length ? '查看练习结果' : '下一题'}
        </button>
      </div>
    )
  }

  const segmentLabel = spec?.segment === 'reversal' ? '反转阶段' : '习得阶段'
  return (
    <div className="card p-8 text-center">
      <p className="mb-4 text-sm text-gray-500">
        {phase === 'practice' ? `练习 ${practiceIndex + 1} / ${practice.length}` : `正式试次 ${trialIndex + 1} / ${sequence.length}${revised ? '' : ` · ${segmentLabel}`}`}
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
              {revised && phase === 'practice' ? (symbol === 'A' ? '◇' : '□') : (symbol === 'A' ? '○' : '△')}
            </button>
          )
        })}
      </div>
      {revised && saveFailed && <button type="button" disabled={submitting} onClick={() => void submitFormal(null, null, false, true)} className="btn-secondary mt-5">重试保存本次选择</button>}
      {feedback && <p className="mt-5 text-sm text-amber-700">{feedback}</p>}
      {phase === 'formal' && interrupted && <p className="mt-3 text-xs text-amber-700">检测到页面切换，中断状态会随正式试次提交。</p>}
      {phase === 'formal' && completionPending && onTaskComplete && <button type="button" onClick={retryCompletion} className="btn-secondary mt-5">重试完成测评</button>}
    </div>
  )
}
