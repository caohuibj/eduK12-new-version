import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { sstSequence } from '../shared/prng'
import { PRACTICE_FEEDBACK_MS } from '../shared/practice'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'
type PracticeStage = 'go' | 'mixed'
type PracticeTrial = { trialType: 'go' | 'stop'; goStimulus: 'left' | 'right'; ssdMs: number | null }

const GO_PRACTICE: PracticeTrial[] = [
  { trialType: 'go', goStimulus: 'left', ssdMs: null },
  { trialType: 'go', goStimulus: 'right', ssdMs: null },
  { trialType: 'go', goStimulus: 'left', ssdMs: null },
  { trialType: 'go', goStimulus: 'right', ssdMs: null },
]

const MIXED_PRACTICE: PracticeTrial[] = [
  { trialType: 'go', goStimulus: 'left', ssdMs: null },
  { trialType: 'go', goStimulus: 'right', ssdMs: null },
  { trialType: 'stop', goStimulus: 'left', ssdMs: 250 },
  { trialType: 'go', goStimulus: 'left', ssdMs: null },
  { trialType: 'go', goStimulus: 'right', ssdMs: null },
  { trialType: 'stop', goStimulus: 'right', ssdMs: 250 },
  { trialType: 'go', goStimulus: 'left', ssdMs: null },
  { trialType: 'go', goStimulus: 'right', ssdMs: null },
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
  const [practiceStage, setPracticeStage] = useState<PracticeStage>('go')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [practiceStopCorrect, setPracticeStopCorrect] = useState(0)
  const [practiceNonce, setPracticeNonce] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const onsetRef = useRef<number | null>(null)
  const respondedRef = useRef(false)
  const responseRef = useRef<'left' | 'right' | null>(null)
  const rtRef = useRef<number | null>(null)
  const interruptedRef = useRef(false)
  const practiceCorrectRef = useRef(0)
  const practiceStopCorrectRef = useRef(0)
  const submittingRef = useRef(false)
  const ssdRef = useRef(config.ssdStartMs ?? 250)

  const practiceTrials = practiceStage === 'go' ? GO_PRACTICE : MIXED_PRACTICE

  const startPracticeStage = (stage: PracticeStage) => {
    setPracticeStage(stage)
    setPracticeIndex(0)
    setPracticeCorrect(0)
    setPracticeStopCorrect(0)
    practiceCorrectRef.current = 0
    practiceStopCorrectRef.current = 0
    setFeedback(null)
    setVisible(false)
    setStopVisible(false)
    respondedRef.current = false
    responseRef.current = null
    rtRef.current = null
    setPracticeNonce((value) => value + 1)
    setPhase('practice')
  }

  const startPractice = () => startPracticeStage('go')

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
    const current = phase === 'formal' ? sequence[trialIndex] : practiceTrials[practiceIndex]
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
      : practiceTrials[practiceIndex]?.ssdMs ?? null
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
        if (correct) {
          practiceCorrectRef.current += 1
          if (current.trialType === 'stop') practiceStopCorrectRef.current += 1
        }
        if (current.trialType === 'stop') {
          setFeedback(correct ? '正确：看到红色停止信号后没有继续按。' : '看到红色停止信号后要停止响应。')
        } else {
          setFeedback(correct ? '正确：箭头出现后立即按对应方向。' : '箭头出现后要立即按对应方向，不要等待停止信号。')
        }
        const nextIndex = practiceIndex + 1
        window.setTimeout(() => {
          if (nextIndex >= practiceTrials.length) {
            setPracticeCorrect(practiceCorrectRef.current)
            setPracticeStopCorrect(practiceStopCorrectRef.current)
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
  }, [
    phase,
    trialIndex,
    practiceIndex,
    practiceNonce,
    practiceStage,
    practiceTrials,
    sequence,
    total,
    isiMs,
    goTimeoutMs,
    onTrialComplete,
    onTaskComplete,
    config.ssdMaxMs,
    config.ssdMinMs,
    config.ssdStepMs,
  ])

  const current = phase === 'formal' ? sequence[trialIndex] : practiceTrials[practiceIndex]

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
        <p className="text-gray-600 mb-2">箭头出现时请立即、尽快按对应方向。</p>
        <p className="text-gray-600 mb-2">偶尔会在箭头出现后看到红色停止信号；只有看到停止信号时才尝试停止按键。</p>
        <p className="text-gray-600 mb-4 font-medium">不要为了等待停止信号而故意放慢普通箭头反应。</p>
        <p className="text-xs text-gray-400 mb-6">先练习快速方向反应，再练习混合的 Go / Stop 试次；练习不计入正式成绩。</p>
        <button className="btn-primary" onClick={startPractice}>开始练习</button>
      </div>
    )
  }

  if (phase === 'practice-result') {
    const goPassed = practiceCorrect >= 3
    const mixedPassed = practiceCorrect >= 6 && practiceStopCorrect >= 1
    const passed = practiceStage === 'go' ? goPassed : mixedPassed
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-3">{practiceStage === 'go' ? '第一阶段：方向反应' : '第二阶段：Go / Stop 混合'}练习结果</h2>
        <p className="mb-2">练习正确 {practiceCorrect} / {practiceTrials.length}</p>
        {practiceStage === 'mixed' && <p className="text-sm text-gray-500 mb-2">Stop 试次正确 {practiceStopCorrect} / 2</p>}
        <p className="text-sm text-gray-500 mb-4">
          {practiceStage === 'go' ? '至少正确 3 / 4 才进入停止信号练习。' : '至少正确 6 / 8，且至少成功停止 1 次。'}
        </p>
        {passed ? (
          practiceStage === 'go' ? (
            <button className="btn-primary" onClick={() => startPracticeStage('mixed')}>继续停止信号练习</button>
          ) : (
            <button className="btn-primary" onClick={startFormal}>开始正式测验</button>
          )
        ) : (
          <button className="btn-secondary" onClick={() => startPracticeStage(practiceStage)}>重新练习本阶段</button>
        )}
      </div>
    )
  }

  return (
    <div className="text-center p-8">
      <p className="text-sm text-gray-500 mb-2">
        {phase === 'practice'
          ? `${practiceStage === 'go' ? '方向反应练习' : 'Go / Stop 混合练习'} ${practiceIndex + 1} / ${practiceTrials.length}`
          : `试次 ${trialIndex + 1} / ${total}`}
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
