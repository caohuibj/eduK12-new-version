import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { EMOTIONS, emotionRecognitionSequence, type EmotionCategory, type EmotionStimulus } from '../shared/pr13Stimuli'
import { emotionAssetFor } from './emotionAssets'

type Phase = 'instruction' | 'practice' | 'practice-feedback' | 'practice-result' | 'formal'

const EMOTION_LABELS: Record<EmotionCategory, string> = {
  happy: '快乐',
  sad: '悲伤',
  angry: '愤怒',
  fear: '害怕',
  disgust: '厌恶',
  surprise: '惊讶',
}
const PRACTICE = emotionRecognitionSequence('emotionrecognition-practice-v1.0.0', 6, 1)

export const EmotionrecognitionTask: React.FC<CognitiveTaskProps> = ({
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
  }
  const totalTrials = config.totalTrials ?? 60
  const identitySetCount = totalTrials === 24 ? 4 : totalTrials === 60 ? 10 : 20
  const sequence = useMemo(() => emotionRecognitionSequence(taskContext.randomSeed, totalTrials, identitySetCount), [identitySetCount, taskContext.randomSeed, totalTrials])
  const formalSpec: EmotionStimulus | undefined = sequence[trialIndex]
  const stimulusMs = config.stimulusMs ?? 3000
  const trialTimeoutMs = config.trialTimeoutMs ?? 5000
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

  const submitFormal = useCallback(async (responseEmotion: EmotionCategory | null, timedOut = false) => {
    if (!formalSpec || phase !== 'formal' || submittedRef.current || submitting) return
    submittedRef.current = true
    setSubmitting(true)
    const rtMs = responseEmotion === null ? null : Math.max(0, Math.round(performance.now() - startedAtRef.current))
    try {
      const accepted = await onTrialComplete({
        stimulusId: formalSpec.stimulusId,
        stimulusVersion: formalSpec.stimulusVersion,
        responseEmotion,
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

  const handlePracticeResponse = (response: EmotionCategory) => {
    const correct = response === practiceSpec.emotion
    setPracticeCorrect((value) => value + (correct ? 1 : 0))
    setFeedback(correct ? '分类正确。' : '这次分类不正确，请继续练习。')
    setPhase('practice-feedback')
  }

  const handleResponse = (response: EmotionCategory) => {
    if (phase === 'practice') handlePracticeResponse(response)
    else void submitFormal(response)
  }

  useEffect(() => {
    if (phase !== 'formal' && phase !== 'practice') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (phase === 'formal' && !responseEnabled) return
      const index = Number(event.key) - 1
      if (index >= 0 && index < EMOTIONS.length) {
        event.preventDefault()
        handleResponse(EMOTIONS[index])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase, responseEnabled, submitting, formalSpec, practiceIndex])

  const startPractice = () => {
    formalStartedRef.current = false
    setPracticeIndex(0)
    setPracticeCorrect(0)
    setFeedback('')
    setStimulusVisible(true)
    setPhase('practice')
  }

  const nextPractice = () => {
    if (practiceIndex + 1 >= PRACTICE.length) setPhase('practice-result')
    else {
      setPracticeIndex((value) => value + 1)
      setFeedback('')
      setStimulusVisible(true)
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
      <CognitiveTaskIntro title="六类情绪面孔分类" description={<p>请根据当前合成面孔选择最符合的情绪类别。可以点击按钮，也可以按 1–6 使用键盘操作。</p>} hint={<><p>使用内部版本化的合成面孔刺激；结果只描述本次分类响应，不推断情绪能力、共情、人格或文化能力。</p></>} onAction={startPractice} />
    )
  }

  if (phase === 'practice-result') {
    const passed = practiceCorrect >= 4
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
  const asset = spec ? emotionAssetFor(spec.stimulusId) : emotionAssetFor('emotion-identity-01-happy')
  return (
    <div className="card p-8 text-center">
      <p className="mb-4 text-sm text-gray-500">{phase === 'practice' ? `练习 ${practiceIndex + 1} / ${PRACTICE.length}` : `正式试次 ${trialIndex + 1} / ${sequence.length}`}</p>
      <div
        role="img"
        aria-label={asset.label}
        className="mx-auto mb-6 h-64 w-52 rounded-xl border border-gray-200 bg-gray-100 bg-no-repeat shadow-inner"
        style={{ backgroundImage: asset.backgroundImage, backgroundSize: '600% 400%', backgroundPosition: asset.backgroundPosition }}
      >
        {!stimulusVisible && <span className="sr-only">刺激已结束，请选择你的响应</span>}
      </div>
      <div className="mx-auto grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-3">
        {EMOTIONS.map((emotion, index) => (
          <button key={emotion} type="button" onClick={() => handleResponse(emotion)} disabled={phase === 'formal' && (submitting || submittedRef.current || !responseEnabled)} className="rounded-xl border-2 border-sky-200 bg-white px-4 py-4 text-base text-sky-800 hover:bg-sky-50 disabled:opacity-50" aria-label={`选择${EMOTION_LABELS[emotion]}`}>
            {EMOTION_LABELS[emotion]}<span className="ml-1 text-xs text-gray-400">{index + 1}</span>
          </button>
        ))}
      </div>
      {phase === 'formal' && interrupted && <p className="mt-4 text-xs text-amber-700">检测到页面切换，中断状态会随正式试次提交。</p>}
      {feedback && <p className="mt-4 text-sm text-amber-700">{feedback}</p>}
      {phase === 'formal' && completionPending && onTaskComplete && <button type="button" onClick={() => void onTaskComplete()} className="btn-secondary mt-4">重试完成测评</button>}
    </div>
  )
}
