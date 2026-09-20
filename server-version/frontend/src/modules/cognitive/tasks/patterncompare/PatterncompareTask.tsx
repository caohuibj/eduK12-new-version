import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { patterncompareTrial, type PatternStimulus } from '../shared/prng'
import { PRACTICE_PASS_CORRECT, PRACTICE_TRIAL_COUNT } from '../shared/practice'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'

const PRACTICE = [
  { leftPattern: { shape: 'circle', fill: 'solid', marks: 1, rotation: 0 } as PatternStimulus, rightPattern: { shape: 'circle', fill: 'solid', marks: 1, rotation: 0 } as PatternStimulus, correctResponse: 'same' as const },
  { leftPattern: { shape: 'square', fill: 'outline', marks: 2, rotation: 0 } as PatternStimulus, rightPattern: { shape: 'square', fill: 'solid', marks: 2, rotation: 0 } as PatternStimulus, correctResponse: 'different' as const },
  { leftPattern: { shape: 'triangle', fill: 'outline', marks: 3, rotation: 90 } as PatternStimulus, rightPattern: { shape: 'triangle', fill: 'outline', marks: 3, rotation: 90 } as PatternStimulus, correctResponse: 'same' as const },
  { leftPattern: { shape: 'circle', fill: 'outline', marks: 1, rotation: 0 } as PatternStimulus, rightPattern: { shape: 'square', fill: 'outline', marks: 1, rotation: 0 } as PatternStimulus, correctResponse: 'different' as const },
]

const Pattern: React.FC<{ pattern: PatternStimulus }> = ({ pattern }) => {
  const clipPath = pattern.shape === 'triangle' ? 'polygon(50% 0, 100% 100%, 0 100%)' : undefined
  const borderRadius = pattern.shape === 'circle' ? '9999px' : '8px'
  return <div role="img" aria-label="视觉图形刺激" className="relative flex h-28 w-28 items-center justify-center" style={{ transform: `rotate(${pattern.rotation}deg)`, clipPath, borderRadius, border: pattern.fill === 'outline' ? '5px solid #334155' : undefined, background: pattern.fill === 'solid' ? '#334155' : '#f8fafc' }}><span aria-hidden="true" className={`absolute left-1/2 top-2 h-2 w-2 -translate-x-1/2 rounded-sm ${pattern.fill === 'solid' ? 'bg-white' : 'bg-slate-700'}`} /><span aria-hidden="true" className={pattern.fill === 'solid' ? 'text-xl text-white' : 'text-xl text-slate-700'}>{'•'.repeat(pattern.marks)}</span></div>
}

export const PatterncompareTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as { durationSec: number; trialTimeoutMs: number; isiMs: number }
  const durationSec = config.durationSec ?? 60
  const trialTimeoutMs = config.trialTimeoutMs ?? 2500
  const isiMs = config.isiMs ?? 250
  const [phase, setPhase] = useState<Phase>('instruction')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [remainingSec, setRemainingSec] = useState(durationSec)
  const deadlineRef = useRef<number | null>(null)
  const onsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const completingRef = useRef(false)
  const interruptedRef = useRef(false)

  const startPractice = () => { setPracticeIndex(0); setPracticeCorrect(0); setPracticeFeedback(null); setPhase('practice') }
  const startFormal = () => { deadlineRef.current = performance.now() + durationSec * 1000; completingRef.current = false; setRemainingSec(durationSec); setPhase('formal') }
  const completeOnce = useCallback(async () => { if (completingRef.current) return; completingRef.current = true; await onTaskComplete?.() }, [onTaskComplete])

  useEffect(() => {
    const onHidden = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  useEffect(() => {
    if (phase !== 'formal' || deadlineRef.current == null) return
    const update = () => setRemainingSec(Math.max(0, Math.ceil(((deadlineRef.current as number) - performance.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'formal' || deadlineRef.current == null) return
    submittingRef.current = false
    interruptedRef.current = false
    onsetRef.current = null
    setVisible(false)
    const remainingMs = deadlineRef.current - performance.now()
    if (remainingMs <= 0) { void completeOnce(); return }
    const show = window.setTimeout(() => { setVisible(true); onsetRef.current = performance.now() }, Math.min(isiMs, remainingMs))
    const timeout = window.setTimeout(async () => {
      if (submittingRef.current) return
      submittingRef.current = true
      const spec = patterncompareTrial(taskContext.randomSeed, trialIndex)
      await onTrialComplete({ leftPattern: spec.leftPattern, rightPattern: spec.rightPattern, response: null, rtMs: null, interrupted: interruptedRef.current, timedOut: true })
      if ((deadlineRef.current ?? 0) <= performance.now()) await completeOnce()
    }, Math.min(isiMs + trialTimeoutMs, remainingMs))
    return () => { window.clearTimeout(show); window.clearTimeout(timeout) }
  }, [phase, trialIndex, taskContext.randomSeed, isiMs, trialTimeoutMs, onTrialComplete, completeOnce])

  const respondPractice = (response: 'same' | 'different') => {
    const correct = response === PRACTICE[practiceIndex].correctResponse
    setPracticeFeedback(correct ? '正确' : '错误')
    const nextCorrect = practiceCorrect + (correct ? 1 : 0)
    if (practiceIndex + 1 >= PRACTICE_TRIAL_COUNT) { setPracticeCorrect(nextCorrect); setPhase('practice-result') }
    else { setPracticeCorrect(nextCorrect); setPracticeIndex((value) => value + 1) }
  }

  const respondFormal = async (response: 'same' | 'different') => {
    if (!visible || submittingRef.current || onsetRef.current == null) return
    submittingRef.current = true
    const spec = patterncompareTrial(taskContext.randomSeed, trialIndex)
    await onTrialComplete({ leftPattern: spec.leftPattern, rightPattern: spec.rightPattern, response, rtMs: Math.round(performance.now() - onsetRef.current), interrupted: interruptedRef.current, timedOut: false })
    if ((deadlineRef.current ?? 0) <= performance.now()) await completeOnce()
  }

  const respond = (response: 'same' | 'different') => { if (phase === 'practice') respondPractice(response); else void respondFormal(response) }

  useEffect(() => {
    if (phase !== 'practice' && phase !== 'formal') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (event.key === 'ArrowLeft') { event.preventDefault(); respond('same') }
      else if (event.key === 'ArrowRight') { event.preventDefault(); respond('different') }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const onPointerResponse = (event: ReactPointerEvent<HTMLButtonElement>, response: 'same' | 'different') => {
    if (!event.isPrimary || event.button !== 0) return
    event.preventDefault()
    respond(response)
  }

  if (phase === 'instruction') return <div className="p-8 text-center"><h2 className="mb-3 text-xl font-semibold">图形模式比较</h2><p className="mb-2 text-gray-600">判断左右图形是否完全相同，包括形状、填充、标记和方向。</p><p className="mb-2 text-sm text-gray-500">键盘可使用 ← 表示相同、→ 表示不同；也可触控或鼠标选择。</p><p className="mb-6 text-xs text-gray-400">本任务依赖视觉图形比较；辅助文本不会逐项描述刺激属性。练习不计入正式成绩，至少答对 3 题才能开始。</p><button className="btn-primary" onClick={startPractice}>开始练习</button></div>
  if (phase === 'practice-result') { const passed = practiceCorrect >= PRACTICE_PASS_CORRECT; return <div className="p-8 text-center"><p className="mb-4">练习正确 {practiceCorrect} / {PRACTICE_TRIAL_COUNT}</p><button className={passed ? 'btn-primary' : 'btn-secondary'} onClick={passed ? startFormal : startPractice}>{passed ? '开始正式测验' : '重新练习'}</button></div> }

  const spec = phase === 'practice' ? PRACTICE[practiceIndex] : patterncompareTrial(taskContext.randomSeed, trialIndex)
  const content = <div className="p-8 text-center"><p className="mb-4 text-sm text-gray-500">{phase === 'practice' ? `练习 ${practiceIndex + 1} / ${PRACTICE_TRIAL_COUNT}` : `剩余约 ${remainingSec} 秒`}</p>{phase === 'practice' && practiceFeedback && <p className="mb-3 text-sm">上一题：{practiceFeedback}</p>}<div className={`mb-8 flex min-h-28 justify-center gap-12 ${phase === 'formal' && !visible ? 'invisible' : ''}`}><Pattern pattern={spec.leftPattern} /><Pattern pattern={spec.rightPattern} /></div><div className="flex justify-center gap-4"><button className="btn-secondary min-h-12 px-8" onPointerDown={(event) => onPointerResponse(event, 'same')} onClick={(event) => { if (event.detail === 0) respond('same') }}>相同</button><button className="btn-secondary min-h-12 px-8" onPointerDown={(event) => onPointerResponse(event, 'different')} onClick={(event) => { if (event.detail === 0) respond('different') }}>不同</button></div></div>
  return phase === 'formal' ? <CognitiveFocusStage ariaLabel="图形模式比较正式作答">{content}</CognitiveFocusStage> : content
}
