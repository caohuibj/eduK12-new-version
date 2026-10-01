import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { lexicalDecisionSequence, type LexicalStimulus } from '../shared/pr13Stimuli'

type Phase = 'instruction' | 'practice' | 'practice-feedback' | 'practice-result' | 'formal'
type Response = 'word' | 'nonword'

const PRACTICE = lexicalDecisionSequence('lexicaldecision-practice-v1.0.0', 4)

export const LexicaldecisionTask: React.FC<CognitiveTaskProps> = ({
  taskContext,
  trialIndex,
  onTrialComplete,
  onTaskComplete,
}) => {
  const config = taskContext.config as {
    totalTrials?: number
    stimulusMs?: number
    trialTimeoutMs?: number
    isiMs?: number
    validRtFloorMs?: number
  }
  const totalTrials = config.totalTrials ?? 100
  const sequence = useMemo(() => lexicalDecisionSequence(taskContext.randomSeed, totalTrials), [taskContext.randomSeed, totalTrials])
  const formalSpec: LexicalStimulus | undefined = sequence[trialIndex]
  const stimulusMs = config.stimulusMs ?? 1200
  const trialTimeoutMs = config.trialTimeoutMs ?? 3000
  const isiMs = config.isiMs ?? 300
  const [phase, setPhase] = useState<Phase>('instruction')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [interrupted, setInterrupted] = useState(false)
  const [stimulusVisible, setStimulusVisible] = useState(true)
  const [responseEnabled, setResponseEnabled] = useState(false)
  const [completionPending, setCompletionPending] = useState(false)
  const startedAtRef = useRef(0)
  const submittedRef = useRef(false)
  const formalStartedRef = useRef(false)
  const interruptedRef = useRef(false)
  const practiceSpec = PRACTICE[practiceIndex]

  useEffect(() => {
    if (phase !== 'formal' || !formalStartedRef.current || !formalSpec) return
    submittedRef.current = false
    setSubmitting(false)
    setFeedback('')
    setInterrupted(false)
    interruptedRef.current = false
    setCompletionPending(false)
    setStimulusVisible(true)
    if (trialIndex === 0) {
      setResponseEnabled(true)
      startedAtRef.current = performance.now()
      return
    }
    setResponseEnabled(false)
    const isiTimer = window.setTimeout(() => {
      setResponseEnabled(true)
      startedAtRef.current = performance.now()
    }, isiMs)
    return () => window.clearTimeout(isiTimer)
  }, [formalSpec, isiMs, phase, trialIndex])

  useEffect(() => {
    if (phase !== 'formal') return
    const hideTimer = window.setTimeout(() => setStimulusVisible(false), stimulusMs)
    const timeoutTimer = window.setTimeout(() => { void submitFormal(null, true) }, trialTimeoutMs)
    return () => {
      window.clearTimeout(hideTimer)
      window.clearTimeout(timeoutTimer)
    }
  }, [phase, stimulusMs, trialTimeoutMs, trialIndex])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => {
      if (document.hidden) {
        interruptedRef.current = true
        setInterrupted(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const submitFormal = useCallback(async (response: Response | null, timedOut = false) => {
    if (!formalSpec || phase !== 'formal' || submittedRef.current || submitting) return
    submittedRef.current = true
    setSubmitting(true)
    const rtMs = response === null ? null : Math.max(0, Math.round(performance.now() - startedAtRef.current))
    try {
      const accepted = await onTrialComplete({
        stimulusId: formalSpec.stimulusId,
        stimulusVersion: formalSpec.stimulusVersion,
        lexicality: formalSpec.lexicality,
        wordLength: formalSpec.wordLength,
        frequencyBand: formalSpec.frequencyBand,
        pseudowordGeneratorVersion: formalSpec.pseudowordGeneratorVersion,
        response,
        rtMs,
        interrupted: interruptedRef.current || timedOut,
      })
      if (accepted === false) {
        submittedRef.current = false
        setSubmitting(false)
        setFeedback('提交未成功，请重新选择；请勿连续点击。')
        return
      }
      if (trialIndex + 1 >= sequence.length) {
        setCompletionPending(true)
        await onTaskComplete?.()
      } else {
        interruptedRef.current = false
        setInterrupted(false)
      }
    } catch {
      submittedRef.current = false
      setSubmitting(false)
      setFeedback('网络暂时不可用，请重试本题。')
    }
  }, [formalSpec, onTaskComplete, onTrialComplete, phase, sequence.length, submitting, trialIndex])

  const handlePracticeResponse = (response: Response) => {
    const correct = (practiceSpec.lexicality === 'real' && response === 'word') || (practiceSpec.lexicality === 'pseudo' && response === 'nonword')
    setPracticeCorrect((value) => value + (correct ? 1 : 0))
    setFeedback(correct ? '回答正确。' : '这次回答不正确，请继续练习。')
    setPhase('practice-feedback')
  }

  const handleResponse = (response: Response) => {
    if (phase === 'practice') handlePracticeResponse(response)
    else void submitFormal(response)
  }

  useEffect(() => {
    if (phase !== 'formal' && phase !== 'practice') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (phase === 'formal' && !responseEnabled) return
      if (event.key === 'ArrowLeft' || event.key === '1' || event.key.toLowerCase() === 'w') {
        event.preventDefault()
        handleResponse('word')
      } else if (event.key === 'ArrowRight' || event.key === '2' || event.key.toLowerCase() === 'n') {
        event.preventDefault()
        handleResponse('nonword')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase, responseEnabled, submitting, formalSpec, trialIndex])

  const startPractice = () => {
    formalStartedRef.current = false
    setPracticeIndex(0)
    setPracticeCorrect(0)
    setFeedback('')
    setPhase('practice')
  }

  const nextPractice = () => {
    if (practiceIndex + 1 >= PRACTICE.length) setPhase('practice-result')
    else {
      setPracticeIndex((value) => value + 1)
      setFeedback('')
      setPhase('practice')
    }
  }

  const startFormal = () => {
    formalStartedRef.current = true
    setCompletionPending(false)
    setInterrupted(false)
    interruptedRef.current = false
    submittedRef.current = false
    setSubmitting(false)
    setFeedback('')
    setStimulusVisible(true)
    setResponseEnabled(true)
    startedAtRef.current = performance.now()
    setPhase('formal')
  }

  if (phase === 'instruction') {
    return (
      <CognitiveTaskIntro title="中文词汇判断" description={<p>判断屏幕上的字符串是不是中文真词。可以点击按钮，也可以按 1 / W 选择“真词”，按 2 / N 选择“伪词”。</p>} hint={<><p>先完成 4 道练习，至少答对 3 道再开始。练习不计入正式结果；正式作答时请兼顾准确和速度。</p></>} onAction={startPractice} />
    )
  }

  if (phase === 'practice-result') {
    const passed = practiceCorrect >= 3
    return (
      <div className="card p-8 text-center">
        <p className="mb-4 text-gray-700">练习正确 {practiceCorrect} / {PRACTICE.length}</p>
        <button type="button" onClick={passed ? startFormal : startPractice} className={passed ? 'btn-primary' : 'btn-secondary'}>{passed ? '开始正式测验' : '重新练习'}</button>
      </div>
    )
  }

  if (phase === 'practice-feedback') {
    return (
      <div className="card p-8 text-center">
        <p className="mb-5 text-gray-700">{feedback}</p>
        <button type="button" onClick={nextPractice} className="btn-primary">{practiceIndex + 1 >= PRACTICE.length ? '查看练习结果' : '下一题'}</button>
      </div>
    )
  }

  const spec = phase === 'practice' ? PRACTICE[practiceIndex] : formalSpec
  return (
    <div className="card p-8 text-center">
      <p className="mb-4 text-sm text-gray-500">{phase === 'practice' ? `练习 ${practiceIndex + 1} / ${PRACTICE.length}` : `正式试次 ${trialIndex + 1} / ${sequence.length}`}</p>
      <div className="mb-8 flex min-h-32 items-center justify-center rounded-xl bg-slate-50 text-5xl font-semibold tracking-widest text-slate-800" aria-label="当前词汇刺激">
        {stimulusVisible ? spec?.text : '···'}
      </div>
      <div className="mx-auto grid max-w-md grid-cols-2 gap-4">
        <button type="button" onClick={() => handleResponse('word')} disabled={phase === 'formal' && (submitting || submittedRef.current || !responseEnabled)} className="rounded-xl border-2 border-emerald-200 bg-emerald-50 px-6 py-5 text-lg font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">真词<br /><span className="text-xs font-normal">1 / W / ←</span></button>
        <button type="button" onClick={() => handleResponse('nonword')} disabled={phase === 'formal' && (submitting || submittedRef.current || !responseEnabled)} className="rounded-xl border-2 border-amber-200 bg-amber-50 px-6 py-5 text-lg font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50">伪词<br /><span className="text-xs font-normal">2 / N / →</span></button>
      </div>
      {phase === 'formal' && interrupted && <p className="mt-4 text-xs text-amber-700">检测到页面切换，中断状态会随正式试次提交。</p>}
      {feedback && <p className="mt-4 text-sm text-amber-700">{feedback}</p>}
      {phase === 'formal' && completionPending && onTaskComplete && <button type="button" onClick={() => void onTaskComplete()} className="btn-secondary mt-4">重试完成测评</button>}
    </div>
  )
}
