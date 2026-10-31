import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { VisualwmConfig, VisualwmTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { visualwmTrial } from './generator'

type Phase = 'instruction' | 'practice' | 'formal' | 'completed'
type PhaseStep = 'fixation' | 'study' | 'retention' | 'probe' | 'feedback'

const CANVAS = 260
const ORBIT_RADIUS = 90
const SQUARE_SIZE = 36

export const VisualwmTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as VisualwmConfig
  const totalTrials = config?.totalTrials ?? 16
  const studyMs = config?.studyMs ?? 500
  const retentionMs = config?.retentionMs ?? 900
  const [phase, setPhase] = useState<Phase>('instruction')
  const [step, setStep] = useState<PhaseStep>('fixation')
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const [completedCount, setCompletedCount] = useState(0)
  const interruptedRef = useRef(false)
  const submittingRef = useRef(false)
  const stimulus = useMemo(() => visualwmTrial(taskContext.randomSeed, trialIndex), [taskContext.randomSeed, trialIndex])

  useEffect(() => {
    if (phase !== 'formal') return
    setFormalFeedback(null); interruptedRef.current = false
  }, [trialIndex])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || step !== 'fixation') return
    const timer = window.setTimeout(() => setStep('study'), 400)
    return () => window.clearTimeout(timer)
  }, [phase, step, trialIndex])

  useEffect(() => {
    if (step !== 'study') return
    const timer = window.setTimeout(() => setStep('retention'), studyMs)
    return () => window.clearTimeout(timer)
  }, [step, studyMs])

  useEffect(() => {
    if (step !== 'retention') return
    const timer = window.setTimeout(() => setStep('probe'), retentionMs)
    return () => window.clearTimeout(timer)
  }, [step, retentionMs])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const respond = useCallback(async (response: 'same' | 'change') => {
    if (step !== 'probe' || submittingRef.current) return
    if (phase === 'practice') {
      setPracticeFeedback(stimulus.isChange ? (response === 'change' ? '正确：颜色变了！' : '不对，颜色变了。') : (response === 'same' ? '正确：颜色没变！' : '不对，颜色没变。'))
      setStep('feedback')
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    const payload: VisualwmTrialPayload = {
      setSize: stimulus.setSize,
      isChange: stimulus.isChange,
      response,
      rtMs: 0,
      interrupted: interruptedRef.current,
    }
    setFormalFeedback('已记录，下一题准备中'); setStep('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前试次'); setStep('probe'); return }
      setCompletedCount((current) => current + 1)
      if (completedCount + 1 >= totalTrials) { setPhase('completed'); await onTaskComplete?.() }
    } finally { submittingRef.current = false }
  }, [phase, step, stimulus, totalTrials, onTrialComplete, completedCount, onTaskComplete])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (step !== 'probe') return
      if (event.key === '1') { event.preventDefault(); void respond('same') }
      if (event.key === '2') { event.preventDefault(); void respond('change') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, respond])

  const startPractice = useCallback(() => { setStep('fixation'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    setFormalFeedback(null); setStep('fixation'); setPhase('formal')
  }, [])

  const positionOnCircle = (index: number, total: number): { x: number; y: number } => {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2
    return { x: CANVAS / 2 + ORBIT_RADIUS * Math.cos(angle), y: CANVAS / 2 + ORBIT_RADIUS * Math.sin(angle) }
  }

  const renderSquares = (colors: string[], highlight: number | null, probeColor?: string) => (
    <div className="relative mx-auto" style={{ width: CANVAS, height: CANVAS }}>
      {colors.map((color, index) => {
        const pos = positionOnCircle(index, colors.length)
        const isProbed = highlight === index
        return (
          <div key={index} className="absolute rounded" style={{
            width: SQUARE_SIZE, height: SQUARE_SIZE,
            left: pos.x - SQUARE_SIZE / 2, top: pos.y - SQUARE_SIZE / 2,
            backgroundColor: isProbed && probeColor !== undefined ? probeColor : color,
            border: isProbed ? '3px solid #1e293b' : '1px solid rgba(0,0,0,0.1)',
          }} />
        )
      })}
    </div>
  )

  const ResponseButtons: React.FC<{ show: boolean }> = ({ show }) => show ? (
    <div className="grid grid-cols-2 gap-3 max-w-md mx-auto mt-4">
      <button type="button" onPointerDown={() => void respond('same')} className="btn-secondary min-h-14">1 · 相同</button>
      <button type="button" onPointerDown={() => void respond('change')} className="btn-secondary min-h-14">2 · 改变</button>
    </div>
  ) : null

  if (phase === 'instruction') return <CognitiveTaskIntro title="视觉工作记忆" description={<p>几个彩色方块会同时短暂出现。消失后其中一个会再次出现——但颜色可能变了！请判断它的颜色是\u201c相同\u201d还是\u201c改变\u201d了。</p>} hint={<><p>不要用言语描述颜色，直接记住颜色本身；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'completed') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700">已全部完成，正在生成结果…</p></div>

  if (phase === 'practice') {
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 · 不计入成绩</div>{step === 'fixation' && <div className="text-4xl text-gray-400 h-40 pt-12">+</div>}{step === 'study' && renderSquares(stimulus.colors, null)}{step === 'retention' && <div style={{ width: CANVAS, height: CANVAS }} className="mx-auto flex items-center justify-center"><span className="text-4xl text-gray-300">+</span></div>}{step === 'probe' && renderSquares(stimulus.colors, stimulus.probePosition, stimulus.probeColor)}<ResponseButtons show={step === 'probe'} />{step === 'feedback' && <><div className="h-12 pt-3 text-gray-700">{practiceFeedback}</div><button type="button" className="btn-primary" onClick={advancePractice}>开始正式测评</button></>}</div>
  }

  return <CognitiveFocusStage ariaLabel="视觉工作记忆正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">第 {trialIndex + 1} / {totalTrials} 题</div>{step === 'fixation' && <div className="text-4xl text-gray-400 h-48 pt-16">+</div>}{step === 'study' && renderSquares(stimulus.colors, null)}{step === 'retention' && <div style={{ width: CANVAS, height: CANVAS }} className="mx-auto flex items-center justify-center"><span className="text-4xl text-gray-300">+</span></div>}{step === 'probe' && renderSquares(stimulus.colors, stimulus.probePosition, stimulus.probeColor)}<ResponseButtons show={step === 'probe'} />{step === 'feedback' && <div className="h-24 pt-10 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{step === 'probe' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<p className="text-xs text-gray-400 mt-4">按键 1 = 相同、2 = 改变，或点击按钮</p></div></CognitiveFocusStage>
}
