import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { flankerSequence, type FlankerTrialSpec } from '../shared/prng'
import { PRACTICE_PASS_CORRECT, PRACTICE_TRIAL_COUNT } from '../shared/practice'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'

const PRACTICE: FlankerTrialSpec[] = [
  { targetDirection: 'left', flankerDirection: 'left', correctResponse: 'left' },
  { targetDirection: 'right', flankerDirection: 'left', correctResponse: 'right' },
  { targetDirection: 'right', flankerDirection: 'right', correctResponse: 'right' },
  { targetDirection: 'left', flankerDirection: 'right', correctResponse: 'left' },
]

const ArrowRow: React.FC<{ trial: FlankerTrialSpec }> = ({ trial }) => {
  const flank = trial.flankerDirection === 'left' ? '←' : '→'
  const target = trial.targetDirection === 'left' ? '←' : '→'
  return (
    <div role="img" aria-label="视觉箭头干扰刺激" className="flex h-24 items-center justify-center gap-2 text-6xl font-bold">
      <span aria-hidden="true" className="text-gray-400">{flank}{flank}</span>
      <span aria-hidden="true" className="text-primary">{target}</span>
      <span aria-hidden="true" className="text-gray-400">{flank}{flank}</span>
    </div>
  )
}

export const FlankerTask: React.FC<CognitiveTaskProps> = ({
  taskContext,
  trialIndex,
  onTrialComplete,
  onTaskComplete,
}) => {
  const config = taskContext.config as { totalTrials: number; stimulusMs: number; isiMs: number }
  const total = config.totalTrials ?? 80
  const stimulusMs = config.stimulusMs ?? 1800
  const isiMs = config.isiMs ?? 400
  const sequence = useMemo(
    () => flankerSequence(taskContext.randomSeed, total),
    [taskContext.randomSeed, total],
  )
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

  const startPractice = () => {
    setPracticeIndex(0)
    setPracticeCorrect(0)
    setPracticeFeedback(null)
    setPhase('practice')
  }
  const startFormal = () => setPhase('formal')

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
    const show = window.setTimeout(() => {
      setVisible(true)
      onsetRef.current = performance.now()
    }, isiMs)
    const finish = window.setTimeout(async () => {
      if (submittingRef.current) return
      submittingRef.current = true
      await onTrialComplete({
        targetDirection: current.targetDirection,
        flankerDirection: current.flankerDirection,
        response: responseRef.current,
        rtMs: rtRef.current,
        interrupted: interruptedRef.current,
      })
      if (trialIndex + 1 >= total) await onTaskComplete?.()
    }, isiMs + stimulusMs)
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(finish)
    }
  }, [phase, trialIndex, sequence, total, stimulusMs, isiMs, onTrialComplete, onTaskComplete])

  const respond = (response: 'left' | 'right') => {
    if (phase === 'practice') {
      const correct = response === PRACTICE[practiceIndex].correctResponse
      setPracticeFeedback(correct ? '正确' : '错误')
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

  const onPointerResponse = (event: ReactPointerEvent<HTMLButtonElement>, response: 'left' | 'right') => {
    if (!event.isPrimary || event.button !== 0) return
    event.preventDefault()
    respond(response)
  }

  if (phase === 'instruction') {
    return (
      <div className="p-8 text-center">
        <h2 className="mb-3 text-xl font-semibold">Flanker 箭头干扰</h2>
        <p className="mb-2 text-gray-600">只判断中央蓝色箭头的方向，忽略两侧灰色箭头。</p>
        <p className="mb-2 text-sm text-gray-500">键盘可使用 ← / →；触控或鼠标按左右按钮。</p>
        <p className="mb-6 text-xs text-gray-400">本任务依赖视觉箭头刺激；刺激的正确方向不会通过辅助文本直接朗读。练习不计入正式成绩，至少答对 3 题才能开始。</p>
        <button className="btn-primary" onClick={startPractice}>开始练习</button>
      </div>
    )
  }

  if (phase === 'practice-result') {
    const passed = practiceCorrect >= PRACTICE_PASS_CORRECT
    return (
      <div className="p-8 text-center">
        <p className="mb-4">练习正确 {practiceCorrect} / {PRACTICE_TRIAL_COUNT}</p>
        <button className={passed ? 'btn-primary' : 'btn-secondary'} onClick={passed ? startFormal : startPractice}>
          {passed ? '开始正式测验' : '重新练习'}
        </button>
      </div>
    )
  }

  const current = phase === 'practice' ? PRACTICE[practiceIndex] : sequence[trialIndex]
  const content = (
    <div className="p-8 text-center">
      <p className="mb-4 text-sm text-gray-500">
        {phase === 'practice' ? `练习 ${practiceIndex + 1} / ${PRACTICE_TRIAL_COUNT}` : `试次 ${trialIndex + 1} / ${total}`}
      </p>
      {phase === 'practice' && practiceFeedback && <p className="mb-3 text-sm">上一题：{practiceFeedback}</p>}
      <div className={phase === 'formal' && !visible ? 'invisible' : ''}>
        {current && <ArrowRow trial={current} />}
      </div>
      <div className="mt-6 flex justify-center gap-6">
        <button
          className="btn-secondary min-h-12 px-10"
          onPointerDown={(event) => onPointerResponse(event, 'left')}
          onClick={(event) => { if (event.detail === 0) respond('left') }}
        >← 左</button>
        <button
          className="btn-secondary min-h-12 px-10"
          onPointerDown={(event) => onPointerResponse(event, 'right')}
          onClick={(event) => { if (event.detail === 0) respond('right') }}
        >右 →</button>
      </div>
    </div>
  )

  return phase === 'formal'
    ? <CognitiveFocusStage ariaLabel="Flanker 正式作答">{content}</CognitiveFocusStage>
    : content
}
