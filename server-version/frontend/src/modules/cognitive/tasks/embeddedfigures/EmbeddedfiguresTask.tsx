import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { EmbeddedfiguresConfig, EmbeddedfiguresTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { EMBEDDEDFIGURES_CANVAS, embeddedfiguresItem, type Poly } from './generator'

type Phase = 'instruction' | 'practice' | 'formal' | 'completed'
type PhaseStep = 'show-target' | 'search' | 'feedback'

const PolyFigure: React.FC<{ poly: Poly; size: number; color?: string; strokeWidth?: number; interactive?: boolean; onPick?: () => void }> = ({ poly, size, color = '#334155', strokeWidth = 2, interactive = false, onPick }) => {
  const scale = size / EMBEDDEDFIGURES_CANVAS
  const points = poly.points.map((point) => `${point.x * scale},${point.y * scale}`).join(' ')
  return (
    <polygon
      points={points}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      style={interactive ? { cursor: 'pointer' } : undefined}
      onPointerDown={interactive ? onPick : undefined}
    />
  )
}

export const EmbeddedfiguresTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as EmbeddedfiguresConfig
  const totalTrials = config?.totalTrials ?? 10
  const showTargetMs = config?.showTargetMs ?? 3000
  const timeoutMs = config?.timeoutMs ?? 15000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [step, setStep] = useState<PhaseStep>('show-target')
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const [timeLeftMs, setTimeLeftMs] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)
  const interruptedRef = useRef(false)
  const searchStartRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const item = useMemo(() => embeddedfiguresItem(taskContext.randomSeed, trialIndex), [taskContext.randomSeed, trialIndex])

  useEffect(() => {
    if (phase !== 'formal') return
    setFormalFeedback(null); interruptedRef.current = false
  }, [trialIndex])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || step !== 'show-target') return
    setPracticeFeedback(null); setFormalFeedback(null); interruptedRef.current = false
    const timer = window.setTimeout(() => {
      searchStartRef.current = performance.now()
      setTimeLeftMs(timeoutMs)
      setStep('search')
    }, showTargetMs)
    return () => window.clearTimeout(timer)
  }, [phase, step, trialIndex, showTargetMs, timeoutMs])

  useEffect(() => {
    if (step !== 'search') return
    const startedAt = searchStartRef.current
    if (startedAt === null) return
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, timeoutMs - (performance.now() - startedAt))
      setTimeLeftMs(remaining)
      if (remaining <= 0) window.clearInterval(interval)
    }, 250)
    return () => window.clearInterval(interval)
  }, [step, timeoutMs])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const submitFormal = useCallback(async (clickedShapeId: string | null) => {
    if (phase !== 'formal' || step !== 'search' || submittingRef.current) return
    submittingRef.current = true
    const payload: EmbeddedfiguresTrialPayload = {
      itemIndex: trialIndex,
      clickedShapeId,
      rtMs: clickedShapeId === null || searchStartRef.current === null ? null : Math.max(0, Math.round(performance.now() - searchStartRef.current)),
      interrupted: interruptedRef.current,
    }
    setFormalFeedback('已记录，下一题准备中'); setStep('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前试次'); setStep('search'); return }
      setCompletedCount((current) => current + 1)
      if (completedCount + 1 >= totalTrials) { setPhase('completed'); await onTaskComplete?.() }
    } finally { submittingRef.current = false }
  }, [phase, step, onTrialComplete, trialIndex, totalTrials, completedCount, onTaskComplete])

  useEffect(() => {
    if (phase !== 'formal' || step !== 'search') return
    const startedAt = searchStartRef.current
    if (startedAt === null) return
    const capTimer = window.setTimeout(() => { void submitFormal(null) }, Math.max(0, timeoutMs - (performance.now() - startedAt)))
    return () => window.clearTimeout(capTimer)
  }, [phase, step, timeoutMs, submitFormal])

  const handlePracticePick = useCallback(() => {
    if (step !== 'search') return
    setPracticeFeedback('点中了！练习里的目标就在第一个位置。正式测验不再提示。')
    setStep('feedback')
  }, [step])

  const startPractice = useCallback(() => { setStep('show-target'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    setFormalFeedback(null); setStep('show-target'); setPhase('formal')
  }, [])

  if (phase === 'instruction') return <CognitiveTaskIntro title="嵌入图形" description={<p>先看一个目标三角形（3 秒），然后它会藏进一个复杂图形场里。请尽快点击场中的目标三角形——它的形状和大小与刚才完全一样。</p>} hint={<><p>目标总是三角形，干扰是四边形和五边形；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'completed') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700">已全部完成，正在生成结果…</p></div>

  if (phase === 'practice') {
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 · 不计入成绩</div>{step === 'show-target' && <><p className="text-gray-600 pt-2">记住这个目标：</p><svg width={220} height={160} viewBox={`0 0 ${EMBEDDEDFIGURES_CANVAS} ${EMBEDDEDFIGURES_CANVAS}`} className="mx-auto"><PolyFigure poly={item.targetOutline} size={EMBEDDEDFIGURES_CANVAS} color="#0284c7" strokeWidth={4} /></svg></>}{step === 'search' && <><p className="text-gray-600">点出藏在里面的目标三角形：</p><svg width={280} height={280} viewBox={`0 0 ${EMBEDDEDFIGURES_CANVAS} ${EMBEDDEDFIGURES_CANVAS}`} className="mx-auto">{item.field.map((poly) => <PolyFigure key={poly.id} poly={poly} size={EMBEDDEDFIGURES_CANVAS} interactive onPick={handlePracticePick} />)}</svg></>}{step === 'feedback' && <><div className="h-10 pt-3 text-gray-700">{practiceFeedback}</div><button type="button" className="btn-primary" onClick={advancePractice}>开始正式测评</button></>}</div>
  }

  return <CognitiveFocusStage ariaLabel="嵌入图形正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">第 {trialIndex + 1} / {totalTrials} 题</div>{step === 'show-target' && <><p className="text-gray-600 pt-2">记住这个目标：</p><svg width={220} height={160} viewBox={`0 0 ${EMBEDDEDFIGURES_CANVAS} ${EMBEDDEDFIGURES_CANVAS}`} className="mx-auto"><PolyFigure poly={item.targetOutline} size={EMBEDDEDFIGURES_CANVAS} color="#0284c7" strokeWidth={4} /></svg></>}{step === 'search' && <><p className="text-gray-600 pt-1">点出藏在里面的目标三角形：</p><svg width={280} height={280} viewBox={`0 0 ${EMBEDDEDFIGURES_CANVAS} ${EMBEDDEDFIGURES_CANVAS}`} className="mx-auto">{item.field.map((poly) => <PolyFigure key={poly.id} poly={poly} size={EMBEDDEDFIGURES_CANVAS} interactive onPick={() => void submitFormal(poly.id)} />)}</svg><p className="text-sm text-gray-500">{Math.ceil(timeLeftMs / 1000)} 秒</p></>}{step === 'feedback' && <div className="h-28 pt-10 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{step === 'search' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<p className="text-xs text-gray-400 mt-3">目标总是三角形 · 限时 {Math.round(timeoutMs / 1000)} 秒</p></div></CognitiveFocusStage>
}
