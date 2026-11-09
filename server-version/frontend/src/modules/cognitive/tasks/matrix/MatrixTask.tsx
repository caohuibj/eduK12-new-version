import { CognitivePracticeReview, type PracticeReview } from '../shared/CognitivePracticeReview'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import {MATRIX_PRACTICE_SET_V11,MATRIX_PRACTICE_V11} from './practice-v1.1'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './matrix-layout.css'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { matrixSequence, type MatrixItemSpec } from '../shared/prng'
import {
  CognitivePracticeResult,
  CognitiveTaskIntro,
  CognitiveTaskTransition,
} from '../shared/CognitiveTaskPresentation'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'
const LEGACY_PRACTICE = matrixSequence('matrix-practice-v1', 6).slice(0, 4)

const Glyph: React.FC<{ value: number }> = ({ value }) => {
  const shape = value % 3
  const count = Math.floor((value - 1) / 3) + 1
  return <svg aria-hidden="true" viewBox="0 0 72 72" className="h-16 w-16">
    {Array.from({ length: count }, (_, index) => {
      const x = 20 + index * 16
      if (shape === 0) return <circle key={index} cx={x} cy="36" r="9" fill="#0f766e" />
      if (shape === 1) return <rect key={index} x={x - 9} y="27" width="18" height="18" rx="3" fill="#7c3aed" />
      return <polygon key={index} points={`${x},25 ${x + 10},45 ${x - 10},45`} fill="#c2410c" />
    })}
  </svg>
}

const ItemView: React.FC<{ item: MatrixItemSpec; choose: (index: number) => void; disabled?: boolean }> = ({ item, choose, disabled }) => (
  <>
    <div className="cognitive-matrix-grid mb-6 grid gap-2 rounded-xl bg-slate-200 p-2" aria-label="矩阵图形题">
      {item.panels.map((value, index) => <div key={`${value}-${index}`} className="flex h-20 w-24 items-center justify-center rounded-lg bg-white"><Glyph value={value} /></div>)}
      <div className="flex h-20 w-24 items-center justify-center rounded-lg bg-white text-3xl font-bold text-slate-400">?</div>
    </div>
    <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">{item.options.map((value, index) => <button key={`${value}-${index}`} type="button" className="btn-secondary flex justify-center" disabled={disabled} aria-label={`选项 ${index + 1}`} onClick={() => choose(index)}><Glyph value={value} /></button>)}</div>
  </>
)

export const MatrixTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as { itemCount: number; itemTimeoutMs: number; practiceSetVersion?:string }
  const practice=config.practiceSetVersion===MATRIX_PRACTICE_SET_V11?MATRIX_PRACTICE_V11:LEGACY_PRACTICE
  const itemCount = config.itemCount ?? 16
  const itemTimeoutMs = config.itemTimeoutMs ?? 30000
  const sequence = useMemo(() => matrixSequence(taskContext.randomSeed, itemCount), [taskContext.randomSeed, itemCount])
  const [phase, setPhase] = useState<Phase>('instruction')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceReview, setPracticeReview] = useState<PracticeReview | null>(null)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [interrupted, setInterrupted] = useState(false)
  const startedRef = useRef(0)
  const submittingRef = useRef(false)
  const completingRef = useRef(false)
  const item = phase === 'practice' ? practice[practiceIndex] : sequence[trialIndex] ?? sequence[sequence.length - 1]

  const completeOnce = useCallback(async () => { if (completingRef.current) return; completingRef.current = true; await onTaskComplete?.() }, [onTaskComplete])
  const startPractice = () => { setPracticeReview(null); setPracticeIndex(0); setPracticeCorrect(0); setFeedback(''); setPhase('practice') }
  const startFormal = () => { completingRef.current = false; setInterrupted(false); startedRef.current = performance.now(); setPhase('formal') }

  useEffect(() => { if (phase === 'formal') startedRef.current = performance.now() }, [phase, trialIndex])
  useEffect(() => {
    if (phase !== 'formal') return
    const onHidden = () => { if (document.hidden) setInterrupted(true) }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [phase])

  const submitFormal = useCallback(async (selectedOption: number | null, timedOut = false) => {
    if (phase !== 'formal' || submittingRef.current) return
    submittingRef.current = true
    try {
      const accepted = await onTrialComplete({
        itemId: item.itemId,
        selectedOption,
        rtMs: selectedOption == null ? null : Math.max(0, Math.round(performance.now() - startedRef.current)),
        interrupted,
        timedOut,
      })
      if (accepted !== false) { setInterrupted(false); if (trialIndex + 1 >= itemCount) await completeOnce() }
    } finally { submittingRef.current = false }
  }, [phase, item.itemId, interrupted, onTrialComplete, trialIndex, itemCount, completeOnce])

  useEffect(() => {
    if (phase !== 'formal') return
    const timer = window.setTimeout(() => { void submitFormal(null, true) }, itemTimeoutMs)
    return () => window.clearTimeout(timer)
  }, [phase, trialIndex, itemTimeoutMs, submitFormal])

  const choosePractice = (option: number) => {
    const correct = option === item.correctOption
    const total = practiceCorrect + (correct ? 1 : 0)
    setPracticeCorrect(total); setFeedback(correct ? '正确' : '错误')
    setPracticeReview({ correct, expected: '选项 ' + (item.correctOption + 1), actual: '选项 ' + (option + 1), explanation: item.ruleFamily === 'alternation' ? '本题每行第一个和第三个图形相同。用前两行核对，再补入与第三行首格相同的图形。' : item.ruleFamily === 'progression' ? '本题各行按相同步长沿图形序列变化。比较前两行的连续变化，再延续第三行。' : '本题需要组合每行前两个位置的变化。对照前两行的完整关系，再选择能补全第三行的图形。' })
  }

  if (phase === 'practice' && practiceReview) return <CognitivePracticeReview visual={<div><ItemView item={item} disabled choose={() => {}} /></div>} feedback={practiceReview} completed={practiceIndex + 1} total={4} onContinue={() => {
    setPracticeReview(null)
    if (practiceIndex + 1 >= 4) setPhase('practice-result')
    else { setPracticeIndex(value => value + 1);  }
  }} />

  if (phase === 'instruction') {
    return (
      <CognitiveTaskIntro
        title="矩阵规则推理"
        description={(taskContext.config.report as { reportVersion?: string } | undefined)?.reportVersion === '3.0.0' ? (<><p>观察前两行的变化规律，选择最适合填入第三行问号的图形。</p><p>整理一盒彩色积木时，可能先看颜色交替，再看形状顺序；找到一个线索后，还要用另一行核对。 这次任务只记录本次作答表现。</p></>) : ("观察前两行的变化规律，选择最适合填入第三行问号的图形。")}
        hint={<>本任务依赖视觉规则归纳；正式题目不会提示设计难度。练习至少答对 3 / 4。</>}
        onAction={startPractice}
      />
    )
  }
  if (phase === 'practice-result') {
    const passed = practiceCorrect >= 3
    return (
      <CognitivePracticeResult
        correct={practiceCorrect}
        total={4}
        passed={passed}
        onContinue={startFormal}
        onRetry={startPractice}
        detail={<>上一题：{feedback}</>}
      />
    )
  }
  const content = <div className="p-6 text-center"><p className="mb-4 text-sm text-gray-500">{phase === 'practice' ? `练习 ${practiceIndex + 1} / 4${feedback ? ` · 上一题：${feedback}` : ''}` : `正式题目 ${trialIndex + 1} / ${itemCount}`}</p><ItemView item={item} disabled={submittingRef.current} choose={(option) => phase === 'practice' ? choosePractice(option) : void submitFormal(option)} /></div>
  return phase === 'formal' ? <CognitiveFocusStage ariaLabel="矩阵规则推理正式测验" progress={{ completed: trialIndex, total: itemCount }}>{content}</CognitiveFocusStage> : content

}
