import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { sstSequence } from '../shared/prng'
import { PRACTICE_FEEDBACK_MS } from '../shared/practice'
import {
  CognitivePracticeResult,
  CognitiveTaskIntro,
  CognitiveTaskTransition,
} from '../shared/CognitiveTaskPresentation'

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

  useEffect(() => {
    if (phase !== 'practice' && phase !== 'formal') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        respond('left')
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        respond('right')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (phase === 'instruction') {
    return (
      <CognitiveTaskIntro
        title="停止信号任务"
        description={<>箭头出现时请立即、尽快按对应方向。偶尔会在箭头出现后看到红色停止信号；只有看到停止信号时才尝试停止按键。<strong className="block mt-2">不要为了等待停止信号而故意放慢普通箭头反应。</strong></>}
        hint="电脑使用左右方向键；触屏使用下方左右按键。练习不计入正式成绩。"
        onAction={startPractice}
      />
    )
  }

  if (phase === 'practice-result') {
    const goPassed = practiceCorrect >= 3
    const mixedPassed = practiceCorrect >= 6 && practiceStopCorrect >= 1
    const passed = practiceStage === 'go' ? goPassed : mixedPassed
    return (
      <CognitivePracticeResult
        title={`${practiceStage === 'go' ? '第一阶段：方向反应' : '第二阶段：Go / Stop 混合'}练习结果`}
        correct={practiceCorrect}
        total={practiceTrials.length}
        passed={passed}
        onContinue={() => practiceStage === 'go' ? startPracticeStage('mixed') : startFormal()}
        onRetry={() => startPracticeStage(practiceStage)}
        continueLabel={practiceStage === 'go' ? '继续停止信号练习' : '开始正式测验'}
        retryLabel="重新练习本阶段"
        detail={(
          <>
            {practiceStage === 'mixed' ? <p>Stop 试次正确 {practiceStopCorrect} / 2</p> : null}
            <p>{practiceStage === 'go' ? '至少正确 3 / 4 才进入停止信号练习。' : '至少正确 6 / 8，且至少成功停止 1 次。'}</p>
          </>
        )}
      />
    )
  }

  const taskBody = (
    <div className="mx-auto max-w-2xl text-center p-6 sm:p-8">
      {phase === 'practice' ? (
        <p className="text-sm text-gray-500 mb-2">{`${practiceStage === 'go' ? '方向反应练习' : 'Go / Stop 混合练习'} ${practiceIndex + 1} / ${practiceTrials.length}`}</p>
      ) : null}
      {feedback && <p className="text-sm mb-3">{feedback}</p>}
      <div className={`mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-full text-5xl ${stopVisible ? 'ring-8 ring-red-500' : ''}`}>
        {visible ? (current?.goStimulus === 'left' ? '←' : '→') : ''}
      </div>
      <div className="flex justify-center gap-4 sm:gap-6">
        <button type="button" className="btn-secondary min-h-12 min-w-24 px-8" onPointerDown={() => respond('left')}>← 左</button>
        <button type="button" className="btn-secondary min-h-12 min-w-24 px-8" onPointerDown={() => respond('right')}>右 →</button>
      </div>
      {phase === 'formal' ? <p className="mt-5 text-xs text-gray-400">使用 ← / →，看到红色停止信号后不要继续按</p> : null}
    </div>
  )

  return phase === 'formal'
    ? <CognitiveFocusStage ariaLabel="停止信号正式测验">{taskBody}</CognitiveFocusStage>
    : taskBody
}
