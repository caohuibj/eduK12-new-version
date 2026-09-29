import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { flankerSequence, type FlankerTrialSpec } from '../shared/prng'
import { PRACTICE_PASS_CORRECT, PRACTICE_TRIAL_COUNT } from '../shared/practice'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import {
  CognitivePracticeResult,
  CognitiveTaskIntro,
  CognitiveTaskTransition,
} from '../shared/CognitiveTaskPresentation'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'

const PRACTICE: FlankerTrialSpec[] = [
  { targetDirection: 'left', flankerDirection: 'left', correctResponse: 'left' },
  { targetDirection: 'right', flankerDirection: 'left', correctResponse: 'right' },
  { targetDirection: 'right', flankerDirection: 'right', correctResponse: 'right' },
  { targetDirection: 'left', flankerDirection: 'right', correctResponse: 'left' },
]

const responseLabel = (response: 'left' | 'right') => response === 'left' ? '左' : '右'

const ArrowRow: React.FC<{ trial: FlankerTrialSpec }> = ({ trial }) => {
  const flank = trial.flankerDirection === 'left' ? '←' : '→'
  const target = trial.targetDirection === 'left' ? '←' : '→'
  const arrows = [flank, flank, target, flank, flank]
  return (
    <div
      role="img"
      aria-label="视觉箭头干扰刺激"
      className="flex h-20 items-center justify-center gap-1 font-mono text-4xl font-bold text-gray-800 sm:h-24 sm:gap-2 sm:text-6xl"
    >
      {arrows.map((arrow, index) => <span key={index} aria-hidden="true">{arrow}</span>)}
    </div>
  )
}

export const FlankerTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as { totalTrials: number; stimulusMs: number; isiMs: number }
  const total = config.totalTrials ?? 80
  const stimulusMs = config.stimulusMs ?? 1800
  const isiMs = config.isiMs ?? 400
  const sequence = useMemo(() => flankerSequence(taskContext.randomSeed, total), [taskContext.randomSeed, total])
  const [phase, setPhase] = useState<Phase>('instruction')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const onsetRef = useRef<number | null>(null)
  const responseRef = useRef<'left' | 'right' | null>(null)
  const rtRef = useRef<number | null>(null)
  const interruptedRef = useRef(false)
  const submittingRef = useRef(false)
  const practiceAnsweredRef = useRef(false)

  const startPractice = () => {
    practiceAnsweredRef.current = false
    setPracticeIndex(0)
    setPracticeCorrect(0)
    setPracticeFeedback(null)
    setPhase('practice')
  }
  const startFormal = () => setPhase('formal')

  useEffect(() => {
    if (phase === 'practice') practiceAnsweredRef.current = false
  }, [phase, practiceIndex])

  useEffect(() => {
    const onHidden = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  useEffect(() => {
    if (phase !== 'formal') return
    const current = sequence[trialIndex]
    if (!current || trialIndex >= total) return
    onsetRef.current = null
    responseRef.current = null
    rtRef.current = null
    interruptedRef.current = false
    submittingRef.current = false
    setVisible(false)
    const show = window.setTimeout(() => { setVisible(true); onsetRef.current = performance.now() }, isiMs)
    const finish = window.setTimeout(async () => {
      if (submittingRef.current) return
      submittingRef.current = true
      await onTrialComplete({
        targetDirection: current.targetDirection,
        flankerDirection: current.flankerDirection,
        response: responseRef.current,
        rtMs: rtRef.current,
        interrupted: interruptedRef.current,
        timedOut: responseRef.current == null,
      })
      if (trialIndex + 1 >= total) await onTaskComplete?.()
    }, isiMs + stimulusMs)
    return () => { window.clearTimeout(show); window.clearTimeout(finish) }
  }, [phase, trialIndex, sequence, total, stimulusMs, isiMs, onTrialComplete, onTaskComplete])

  const respond = (response: 'left' | 'right') => {
    if (phase === 'practice') {
      if (practiceAnsweredRef.current) return
      practiceAnsweredRef.current = true
      const practiceTrial = PRACTICE[practiceIndex]
      const correct = response === practiceTrial.correctResponse
      setPracticeFeedback(correct
        ? '正确'
        : `不正确，正确答案是「${responseLabel(practiceTrial.correctResponse)}」`)
      const nextCorrect = practiceCorrect + (correct ? 1 : 0)
      if (practiceIndex + 1 >= PRACTICE_TRIAL_COUNT) {
        setPracticeCorrect(nextCorrect)
        setPhase('practice-result')
      } else {
        setPracticeCorrect(nextCorrect)
        setPracticeIndex((value) => value + 1)
      }
      return
    }
    if (!visible || responseRef.current || onsetRef.current == null) return
    responseRef.current = response
    rtRef.current = Math.round(performance.now() - onsetRef.current)
  }

  useEffect(() => {
    if (phase !== 'practice' && phase !== 'formal') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (event.key === 'ArrowLeft') { event.preventDefault(); respond('left') }
      else if (event.key === 'ArrowRight') { event.preventDefault(); respond('right') }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const onPointerResponse = (event: ReactPointerEvent<HTMLButtonElement>, response: 'left' | 'right') => {
    if (!event.isPrimary || event.button !== 0) return
    event.preventDefault()
    respond(response)
  }

  if (phase === 'instruction') {
    return (
      <CognitiveTaskIntro
        title="Flanker 箭头干扰"
        description={<>每次会出现 5 个箭头。只判断正中央箭头指向左还是右，忽略两侧箭头。正式阶段共 {total} 个试次，请在保证准确的前提下尽快回答。</>}
        hint={<>键盘可使用 ← / →；触控或鼠标可使用下方左右按钮。练习共 {PRACTICE_TRIAL_COUNT} 题，至少答对 {PRACTICE_PASS_CORRECT} 题才能开始。若无法清楚辨认中央箭头方向，请不要进入正式测验，并联系测验组织者。</>}
        onAction={startPractice}
      />
    )
  }

  if (phase === 'practice-result') {
    const passed = practiceCorrect >= PRACTICE_PASS_CORRECT
    return (
      <CognitivePracticeResult
        correct={practiceCorrect}
        total={PRACTICE_TRIAL_COUNT}
        passed={passed}
        onContinue={startFormal}
        onRetry={startPractice}
        detail={!passed ? '请再次确认：只看正中央箭头，忽略两侧箭头，然后重新练习。' : undefined}
      />
    )
  }

  const current = phase === 'practice' ? PRACTICE[practiceIndex] : sequence[trialIndex]
  const content = (
    <div className="p-4 text-center sm:p-8">
      <p className="mb-4 text-sm text-gray-500">
        {phase === 'practice' ? `练习 ${practiceIndex + 1} / ${PRACTICE_TRIAL_COUNT}` : `试次 ${trialIndex + 1} / ${total}`}
      </p>
      {phase === 'practice' && practiceFeedback && <p className="mb-3 text-sm">上一题：{practiceFeedback}</p>}
      <div className={phase === 'formal' && !visible ? 'invisible' : ''}>{current && <ArrowRow trial={current} />}</div>
      <div className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-3 sm:gap-6">
        <button className="btn-secondary min-h-12 px-4 sm:px-10" onPointerDown={(event) => onPointerResponse(event, 'left')} onClick={(event) => { if (event.detail === 0) respond('left') }}>← 左</button>
        <button className="btn-secondary min-h-12 px-4 sm:px-10" onPointerDown={(event) => onPointerResponse(event, 'right')} onClick={(event) => { if (event.detail === 0) respond('right') }}>右 →</button>
      </div>
    </div>
  )
  return phase === 'formal' ? <CognitiveFocusStage ariaLabel="Flanker 正式作答">{content}</CognitiveFocusStage> : content
}
