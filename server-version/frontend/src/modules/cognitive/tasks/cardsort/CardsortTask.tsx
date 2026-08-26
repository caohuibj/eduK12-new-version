import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { cardsortCorrectResponse, cardsortSequence, type CardsortTrialSpec } from '../shared/prng'
import { PRACTICE_PASS_CORRECT, PRACTICE_TRIAL_COUNT } from '../shared/practice'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'

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
  <div className={`rounded-lg border bg-white flex flex-col items-center justify-center ${compact ? 'w-28 h-28' : 'w-36 h-36'}`}>
    <span className={`${compact ? 'text-5xl' : 'text-6xl'} ${color === 'red' ? 'text-red-500' : 'text-blue-600'}`}>
      {shape === 'circle' ? '●' : '★'}
    </span>
    <span className="text-xs text-gray-500 mt-1">{color === 'red' ? '红色' : '蓝色'} · {shape === 'circle' ? '圆形' : '星形'}</span>
  </div>
)

export const CardsortTask: React.FC<CognitiveTaskProps> = ({
  taskContext,
  trialIndex,
  onTrialComplete,
  onTaskComplete,
}) => {
  const config = taskContext.config as {
    totalTrials: number
    switchRatio: number
    blockCount: number
    cueMs: number
    stimulusMs: number
    isiMs: number
  }
  const total = config.totalTrials ?? 72
  const cueMs = config.cueMs ?? 500
  const stimulusMs = config.stimulusMs ?? 2000
  const isiMs = config.isiMs ?? 350
  const sequence = useMemo(
    () => cardsortSequence(taskContext.randomSeed, total, config.blockCount ?? 3, config.switchRatio ?? 0.33),
    [taskContext.randomSeed, total, config.blockCount, config.switchRatio],
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
    }, isiMs + cueMs)
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
      })
      if (trialIndex + 1 >= total) await onTaskComplete?.()
    }, isiMs + cueMs + stimulusMs)
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(finish)
    }
  }, [phase, trialIndex, sequence, total, cueMs, stimulusMs, isiMs, onTrialComplete, onTaskComplete])

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

  if (phase === 'instruction') {
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-3">规则卡片分类</h2>
        <p className="text-gray-600 mb-2">按屏幕提示的“颜色”或“形状”规则，把中间卡片分到左侧或右侧目标卡。</p>
        <p className="text-sm text-gray-500 mb-4">左侧目标：红色圆形；右侧目标：蓝色星形。</p>
        <p className="text-xs text-gray-400 mb-6">颜色同时用文字标注。练习不计入成绩，至少答对 3 题才能开始。</p>
        <button className="btn-primary" onClick={startPractice}>开始练习</button>
      </div>
    )
  }

  if (phase === 'practice-result') {
    const passed = practiceCorrect >= PRACTICE_PASS_CORRECT
    return (
      <div className="text-center p-8">
        <p className="mb-4">练习正确 {practiceCorrect} / {PRACTICE_TRIAL_COUNT}</p>
        <button className={passed ? 'btn-primary' : 'btn-secondary'} onClick={passed ? startFormal : startPractice}>
          {passed ? '开始正式测验' : '重新练习'}
        </button>
      </div>
    )
  }

  const current = phase === 'practice' ? PRACTICE[practiceIndex] : sequence[trialIndex]
  return (
    <div className="text-center p-6">
      <p className="text-sm text-gray-500 mb-2">
        {phase === 'practice' ? `练习 ${practiceIndex + 1} / ${PRACTICE_TRIAL_COUNT}` : `试次 ${trialIndex + 1} / ${total}`}
      </p>
      {phase === 'practice' && practiceFeedback && <p className="text-sm mb-2">上一题：{practiceFeedback}</p>}
      <p className="text-xl font-semibold text-primary mb-4">
        按{current?.ruleCue === 'color' ? '颜色' : '形状'}分类
      </p>
      <div className="flex items-end justify-center gap-8">
        <button aria-label="分到左侧红色圆形" className="rounded border-2 border-transparent hover:border-primary" onClick={() => respond('left')}>
          <Card color="red" shape="circle" compact />
        </button>
        <div className={phase === 'formal' && !visible ? 'invisible' : ''}>
          {current && <Card color={current.stimulusColor} shape={current.stimulusShape} />}
        </div>
        <button aria-label="分到右侧蓝色星形" className="rounded border-2 border-transparent hover:border-primary" onClick={() => respond('right')}>
          <Card color="blue" shape="star" compact />
        </button>
      </div>
    </div>
  )
}
