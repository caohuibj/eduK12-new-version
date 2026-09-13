import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { gonogoSequence } from '../shared/prng'
import { PRACTICE_FEEDBACK_MS, PRACTICE_PASS_CORRECT, PRACTICE_TRIAL_COUNT } from '../shared/practice'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'

export const GonogoFrameTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete }) => {
  const config = taskContext.config as {
    totalTrials: number
    nogoRatio: number
    stimulusMs: number
    isiMs: number
    validRtFloorMs: number
  }
  const total = config.totalTrials ?? 120
  const isiMs = config.isiMs ?? 500
  const stimulusMs = config.stimulusMs ?? 800
  const sequence = useMemo(
    () => gonogoSequence(taskContext.randomSeed, total, config.nogoRatio ?? 0.25),
    [taskContext.randomSeed, total, config.nogoRatio],
  )
  const [phase, setPhase] = useState<Phase>('instruction')
  const [visible, setVisible] = useState(false)
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [practiceNonce, setPracticeNonce] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const onsetRef = useRef<number | null>(null)
  const respondedRef = useRef(false)
  const interruptedRef = useRef(false)
  const practiceCorrectRef = useRef(0)

  const startPractice = () => {
    setPracticeIndex(0)
    setPracticeCorrect(0)
    practiceCorrectRef.current = 0
    setFeedback(null)
    setVisible(false)
    respondedRef.current = false
    interruptedRef.current = false
    onsetRef.current = null
    setPracticeNonce((value) => value + 1)
    setPhase('practice')
  }

  const startFormal = () => {
    setFeedback(null)
    setVisible(false)
    respondedRef.current = false
    interruptedRef.current = false
    onsetRef.current = null
    setPhase('formal')
  }

  useEffect(() => {
    const onHidden = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  useEffect(() => {
    if (phase !== 'practice' && phase !== 'formal') return
    const trialType = phase === 'formal' ? sequence[trialIndex] : (practiceIndex % 2 === 0 ? 'go' : 'nogo')
    if (phase === 'formal' && (trialIndex >= total || !trialType)) return
    respondedRef.current = false
    interruptedRef.current = false
    onsetRef.current = null
    setVisible(false)
    setFeedback(null)

    let animationFrameId: number | null = null
    let hideTimerId: number | null = null

    const finishStimulus = async () => {
      setVisible(false)
      const responded = respondedRef.current
      const correct = trialType === 'go' ? responded : !responded
      if (phase === 'practice') {
        setFeedback(correct ? '正确' : '错误')
        if (correct) practiceCorrectRef.current += 1
        const nextIndex = practiceIndex + 1
        window.setTimeout(() => {
          if (nextIndex >= PRACTICE_TRIAL_COUNT) {
            setPracticeCorrect(practiceCorrectRef.current)
            setPhase('practice-result')
            return
          }
          setPracticeIndex(nextIndex)
        }, PRACTICE_FEEDBACK_MS)
        return
      }
      if (!responded) {
        await onTrialComplete({
          trialType,
          responded: false,
          rtMs: null,
          interrupted: interruptedRef.current,
        })
      }
    }

    const present = (onsetPerfMs: number) => {
      setVisible(true)
      onsetRef.current = onsetPerfMs
      hideTimerId = window.setTimeout(() => { void finishStimulus() }, stimulusMs)
    }

    const show = window.setTimeout(() => {
      if (typeof window.requestAnimationFrame !== 'function') {
        interruptedRef.current = true
        present(performance.now())
        return
      }
      animationFrameId = window.requestAnimationFrame((framePerfMs) => present(framePerfMs))
    }, isiMs)

    return () => {
      window.clearTimeout(show)
      if (hideTimerId != null) window.clearTimeout(hideTimerId)
      if (animationFrameId != null && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(animationFrameId)
      }
    }
  }, [phase, trialIndex, practiceIndex, practiceNonce, sequence, total, isiMs, stimulusMs, onTrialComplete])

  const trialType = phase === 'formal' ? sequence[trialIndex] : (practiceIndex % 2 === 0 ? 'go' : 'nogo')

  const respond = async () => {
    if (!visible || respondedRef.current || onsetRef.current == null) return
    respondedRef.current = true
    const rtMs = Math.round(performance.now() - onsetRef.current)
    if (phase !== 'formal') return
    await onTrialComplete({
      trialType,
      responded: true,
      rtMs,
      interrupted: interruptedRef.current,
    })
  }

  if (phase === 'instruction') {
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-3">Go/No-Go</h2>
        <p className="text-gray-600 mb-4">绿色出现时尽快按下；红色出现时不要按。</p>
        <p className="text-xs text-gray-400 mb-6">练习不计入正式成绩，未通过可以重练。</p>
        <button className="btn-primary" onClick={startPractice}>开始练习</button>
      </div>
    )
  }

  if (phase === 'practice-result') {
    const passed = practiceCorrect >= PRACTICE_PASS_CORRECT
    return (
      <div className="text-center p-8">
        <p className="mb-4">练习正确 {practiceCorrect} / {PRACTICE_TRIAL_COUNT}</p>
        {passed ? (
          <button className="btn-primary" onClick={startFormal}>开始正式测验</button>
        ) : (
          <button className="btn-secondary" onClick={startPractice}>重新练习</button>
        )}
      </div>
    )
  }

  return (
    <div className="text-center p-8">
      <p className="text-sm text-gray-500 mb-2">
        {phase === 'practice' ? `练习 ${practiceIndex + 1} / ${PRACTICE_TRIAL_COUNT}` : `试次 ${trialIndex + 1} / ${total}`}
      </p>
      {feedback && <p className="text-sm mb-3">{feedback}</p>}
      <button
        type="button"
        aria-label="respond"
        className={`mx-auto h-32 w-32 rounded-full ${visible ? (trialType === 'go' ? 'bg-green-500' : 'bg-red-500') : 'bg-gray-200'}`}
        onClick={() => { void respond() }}
      />
    </div>
  )
}
