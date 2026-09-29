import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { cardsortCorrectResponse, cardsortSequence, type CardsortTrialSpec } from '../shared/prng'
import { PRACTICE_PASS_CORRECT, PRACTICE_TRIAL_COUNT } from '../shared/practice'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import {
  CognitivePracticeResult,
  CognitiveTaskIntro,
  CognitiveTaskTransition,
} from '../shared/CognitiveTaskPresentation'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'block-gate' | 'formal'

const practiceTrial = (
  ruleCue: 'color' | 'shape',
  stimulusColor: 'red' | 'blue',
  stimulusShape: 'circle' | 'star',
): CardsortTrialSpec => ({
  blockIndex: 0,
  ruleCue,
  previousRule: null,
  switchType: 'start',
  stimulusColor,
  stimulusShape,
  correctResponse: cardsortCorrectResponse(ruleCue, stimulusColor, stimulusShape),
  previousRuleResponse: null,
})

const PRACTICE = [
  practiceTrial('color', 'red', 'star'),
  practiceTrial('color', 'blue', 'circle'),
  practiceTrial('shape', 'red', 'circle'),
  practiceTrial('shape', 'blue', 'star'),
]

const Card: React.FC<{ color: 'red' | 'blue'; shape: 'circle' | 'star'; compact?: boolean }> = ({ color, shape, compact }) => (
  <div className={`flex flex-col items-center justify-center rounded-lg border bg-white ${compact ? 'h-20 w-16 sm:h-28 sm:w-28' : 'h-24 w-20 sm:h-36 sm:w-36'}`}>
    <span className={`${compact ? 'text-3xl sm:text-5xl' : 'text-4xl sm:text-6xl'} ${color === 'red' ? 'text-red-500' : 'text-blue-600'}`}>{shape === 'circle' ? '●' : '★'}</span>
    <span className="mt-1 text-xs text-gray-500">{color === 'red' ? '红色' : '蓝色'} · {shape === 'circle' ? '圆形' : '星形'}</span>
  </div>
)

export const CardsortTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as { totalTrials: number; switchRatio: number; blockCount: number; cueMs: number; stimulusMs: number; isiMs: number }
  const total = config.totalTrials ?? 72
  const cueMs = config.cueMs ?? 500
  const stimulusMs = config.stimulusMs ?? 2000
  const isiMs = config.isiMs ?? 350
  const sequence = useMemo(() => cardsortSequence(taskContext.randomSeed, total, config.blockCount ?? 3, config.switchRatio ?? 0.33), [taskContext.randomSeed, total, config.blockCount, config.switchRatio])
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
  const releasedBlockRef = useRef(0)

  const startPractice = () => { setPracticeIndex(0); setPracticeCorrect(0); setPracticeFeedback(null); setPhase('practice') }
  const startFormal = () => { releasedBlockRef.current = sequence[0]?.blockIndex ?? 0; setPhase('formal') }

  useEffect(() => {
    const onHidden = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  useEffect(() => {
    if (phase !== 'formal' || trialIndex <= 0) return
    const current = sequence[trialIndex]
    const previous = sequence[trialIndex - 1]
    if (current && previous && current.blockIndex !== previous.blockIndex && releasedBlockRef.current !== current.blockIndex) setPhase('block-gate')
  }, [phase, trialIndex, sequence])

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
    const show = window.setTimeout(() => { setVisible(true); onsetRef.current = performance.now() }, isiMs + cueMs)
    const finish = window.setTimeout(async () => {
      if (submittingRef.current) return
      submittingRef.current = true
      await onTrialComplete({
        ruleCue: current.ruleCue,
        stimulusColor: current.stimulusColor,
        stimulusShape: current.stimulusShape,
        response: responseRef.current,
        rtMs: rtRef.current,
        interrupted: interruptedRef.current,
        timedOut: responseRef.current == null,
      })
      if (trialIndex + 1 >= total) await onTaskComplete?.()
    }, isiMs + cueMs + stimulusMs)
    return () => { window.clearTimeout(show); window.clearTimeout(finish) }
  }, [phase, trialIndex, sequence, total, cueMs, stimulusMs, isiMs, onTrialComplete, onTaskComplete])

  const respond = (response: 'left' | 'right') => {
    if (phase === 'practice') {
      const correct = response === PRACTICE[practiceIndex].correctResponse
      setPracticeFeedback(correct ? '正确' : '错误')
      const nextCorrect = practiceCorrect + (correct ? 1 : 0)
      if (practiceIndex + 1 >= PRACTICE_TRIAL_COUNT) { setPracticeCorrect(nextCorrect); setPhase('practice-result') }
      else { setPracticeCorrect(nextCorrect); setPracticeIndex((value) => value + 1) }
      return
    }
    if (phase !== 'formal' || !visible || responseRef.current || onsetRef.current == null) return
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
        title="规则卡片分类"
        description="按屏幕提示的“颜色”或“形状”规则，把中间卡片分到左侧或右侧目标卡。"
        hint="左侧目标：红色圆形；右侧目标：蓝色星形。键盘可用 ← / →。颜色同时用文字标注。练习不计入成绩，至少答对 3 题才能开始。"
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
      />
    )
  }
  if (phase === 'block-gate') {
    const blockIndex = sequence[trialIndex]?.blockIndex ?? 0
    return (
      <CognitiveTaskTransition
        title="区块完成，可以短暂休息"
        description="准备好后继续下一组规则分类。"
        actionLabel="继续"
        onAction={() => { releasedBlockRef.current = blockIndex; setPhase('formal') }}
      />
    )
  }

  const current = phase === 'practice' ? PRACTICE[practiceIndex] : sequence[trialIndex]
  const content = <div className="p-6 text-center"><p className="mb-2 text-sm text-gray-500">{phase === 'practice' ? `练习 ${practiceIndex + 1} / ${PRACTICE_TRIAL_COUNT}` : `试次 ${trialIndex + 1} / ${total}`}</p>{phase === 'practice' && practiceFeedback && <p className="mb-2 text-sm">上一题：{practiceFeedback}</p>}<p className="mb-4 text-xl font-semibold text-primary">按{current?.ruleCue === 'color' ? '颜色' : '形状'}分类</p><div className="flex items-end justify-center gap-2 sm:gap-8"><button aria-label="分到左侧红色圆形" className="rounded border-2 border-transparent hover:border-primary" onPointerDown={(event) => onPointerResponse(event, 'left')} onClick={(event) => { if (event.detail === 0) respond('left') }}><Card color="red" shape="circle" compact /></button><div className={phase === 'formal' && !visible ? 'invisible' : ''}>{current && <Card color={current.stimulusColor} shape={current.stimulusShape} />}</div><button aria-label="分到右侧蓝色星形" className="rounded border-2 border-transparent hover:border-primary" onPointerDown={(event) => onPointerResponse(event, 'right')} onClick={(event) => { if (event.detail === 0) respond('right') }}><Card color="blue" shape="star" compact /></button></div></div>
  return phase === 'formal' ? <CognitiveFocusStage ariaLabel="规则卡片分类正式作答">{content}</CognitiveFocusStage> : content
}
