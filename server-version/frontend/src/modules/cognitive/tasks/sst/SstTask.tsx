import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { sstSequence } from '../shared/prng'
import { PRACTICE_FEEDBACK_MS, PRACTICE_PASS_CORRECT, PRACTICE_TRIAL_COUNT } from '../shared/practice'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'

const PRACTICE: Array<{ trialType: 'go' | 'stop'; goStimulus: 'left' | 'right'; ssdMs: number | null }> = [
  { trialType: 'go', goStimulus: 'left', ssdMs: null },
  { trialType: 'go', goStimulus: 'right', ssdMs: null },
  { trialType: 'stop', goStimulus: 'left', ssdMs: 250 },
  { trialType: 'stop', goStimulus: 'right', ssdMs: 250 },
]

export const SstTask: React.FC<CognitiveTaskProps> = ({
  taskContext,
  trialIndex,
  onTrialComplete,
  onTaskComplete,
}) => {
  const config = taskContext.config as {
    totalTrials: number
    stopRatio: number
    ssdStartMs: number
    ssdMinMs: number
    ssdMaxMs: number
    ssdStepMs: number
    goTimeoutMs: number
    isiMs: number
  }
  const total = config.totalTrials ?? 96
  const isiMs = config.isiMs ?? 500
  const goTimeoutMs = config.goTimeoutMs ?? 1000
  const sequence = useMemo(
    () => sstSequence(taskContext.randomSeed, total, config.stopRatio ?? 0.25),
    [taskContext.randomSeed, total, config.stopRatio],
  )
  const [phase, setPhase] = useState<Phase>('instruction')
  const [visible, setVisible] = useState(false)
  const [stopVisible, setStopVisible] = useState(false)
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [practiceNonce, setPracticeNonce] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const onsetRef = useRef<number | null>(null)
  const respondedRef = useRef(false)
  const responseRef = useRef<'left' | 'right' | null>(null)
  const rtRef = useRef<number | null>(null)
  const interruptedRef = useRef(false)
  const practiceCorrectRef = useRef(0)
  const submittingRef = useRef(false)
  const ssdRef = useRef(config.ssdStartMs ?? 250)

  const startPractice = () => {
    setPracticeIndex(0)
    setPracticeCorrect(0)
    practiceCorrectRef.current = 0
    setFeedback(null)
    setVisible(false)
    setStopVisible(false)
    respondedRef.current = false
    setPracticeNonce((value) => value + 1)
    setPhase('practice')
  }

  const startFormal = () => {
    setFeedback(null)
    setVisible(false)
    setStopVisible(false)
    respondedRef.current = false
    responseRef.current = null
    rtRef.current = null
    interruptedRef.current = false
    ssdRef.current = config.ssdStartMs ?? 250
    setPhase('formal')
  }

  useEffect(() => {
    const onHidden = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  useEffect(() => {
    if (phase !== 'practice' && phase !== 'formal') return
    const current = phase === 'formal' ? sequence[trialIndex] : PRACTICE[practiceIndex]
    if (phase === 'formal' && (trialIndex >= total || !current)) return
    respondedRef.current = false
    responseRef.current = null
    rtRef.current = null
    interruptedRef.current = false
    submittingRef.current = false
    onsetRef.current = null
    setVisible(false)
    setStopVisible(false)
    setFeedback(null)
    const trialSsd = phase === 'formal'
      ? (current.trialType === 'stop' ? ssdRef.current : null)
      : current.ssdMs
    const show = window.setTimeout(() => {
      setVisible(true)
      onsetRef.current = performance.now()
    }, isiMs)
    const stopTimer = current.trialType === 'stop' && trialSsd != null
      ? window.setTimeout(() => setStopVisible(true), isiMs + trialSsd)
      : null
    const hide = window.setTimeout(async () => {
      setVisible(false)
      setStopVisible(false)
      const responded = respondedRef.current
      const correct = current.trialType === 'stop' ? !responded : responseRef.current === current.goStimulus
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
      if (!submittingRef.current) {
        submittingRef.current = true
        await onTrialComplete({
          trialType: current.trialType,
          goStimulus: current.goStimulus,
          response: responseRef.current,
          rtMs: rtRef.current,
          ssdMs: trialSsd,
          stopSignalPresented: current.trialType === 'stop',
          interrupted: interruptedRef.current,
        })
        if (current.trialType === 'stop') {
          const success = responseRef.current == null
          const next = Math.min(config.ssdMaxMs ?? 800, Math.max(config.ssdMinMs ?? 50, ssdRef.current + (success ? (config.ssdStepMs ?? 50) : -(config.ssdStepMs ?? 50))))
          ssdRef.current = next
        }
        if (trialIndex + 1 >= total) await onTaskComplete?.()
      }
    }, isiMs + goTimeoutMs)
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(hide)
      if (stopTimer != null) window.clearTimeout(stopTimer)
    }
  }, [phase, trialIndex, practiceIndex, practiceNonce, sequence, total, isiMs, goTimeoutMs, onTrialComplete, onTaskComplete, config.ssdMaxMs, config.ssdMinMs, config.ssdStepMs])

  const current = phase === 'formal' ? sequence[trialIndex] : PRACTICE[practiceIndex]

  const respond = (side: 'left' | 'right') => {
    if (!visible || respondedRef.current || onsetRef.current == null) return
    respondedRef.current = true
    responseRef.current = side
    rtRef.current = Math.round(performance.now() - onsetRef.current)
  }

  if (phase === 'instruction') {
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-3">停止信号任务</h2>
        <p className="text-gray-600 mb-4">箭头出现时尽快按对应方向；出现红色停止信号时不要按。</p>
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
      <div className={`mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-full text-5xl ${stopVisible ? 'ring-8 ring-red-500' : ''}`}>
        {visible ? (current?.goStimulus === 'left' ? '←' : '→') : ''}
      </div>
      <div className="flex justify-center gap-6">
        <button type="button" className="btn-secondary px-8" onClick={() => respond('left')}>左</button>
        <button type="button" className="btn-secondary px-8" onClick={() => respond('right')}>右</button>
      </div>
    </div>
  )
}
