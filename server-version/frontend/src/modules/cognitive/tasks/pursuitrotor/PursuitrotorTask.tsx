import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { PursuitrotorConfig, PursuitrotorTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'

type Phase = 'instruction' | 'practice' | 'formal' | 'completed'
type PhaseStep = 'brief' | 'tracking' | 'feedback'

const CANVAS_SIZE = 300
const ORBIT_RADIUS = 110
const TARGET_RADIUS = 18
const POINTER_RADIUS = 10

export const PursuitrotorTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as PursuitrotorConfig
  const totalTrials = config?.totalTrials ?? 4
  const trackMs = config?.trackMs ?? 20000
  const revolutionMs = config?.revolutionMs ?? 4000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [step, setStep] = useState<PhaseStep>('brief')
  const [timeLeftMs, setTimeLeftMs] = useState(0)
  const [onTargetNow, setOnTargetNow] = useState(false)
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const [completedCount, setCompletedCount] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const interruptedRef = useRef(false)
  const trackStartRef = useRef<number | null>(null)
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null)
  const onTargetAccumRef = useRef(0)
  const lastCheckRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const RAF_ID = 'pursuitrotor-raf'

  useEffect(() => {
    if (phase !== 'formal') return
    setFormalFeedback(null); interruptedRef.current = false
  }, [trialIndex])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || step !== 'brief') return
    onTargetAccumRef.current = 0
    setPracticeFeedback(null); setFormalFeedback(null); interruptedRef.current = false
    const timer = window.setTimeout(() => {
      trackStartRef.current = performance.now()
      lastCheckRef.current = performance.now()
      setStep('tracking')
    }, 500)
    return () => window.clearTimeout(timer)
  }, [phase, step, trialIndex])

  useEffect(() => {
    if (step !== 'tracking') return
    const startedAt = trackStartRef.current
    if (startedAt === null) return
    const checkInterval = window.setInterval(() => {
      const now = performance.now()
      if (lastCheckRef.current !== null && pointerPosRef.current !== null) {
        const dt = now - lastCheckRef.current
        const elapsed = now - startedAt
        const angle = (elapsed / revolutionMs) * Math.PI * 2
        const targetX = CANVAS_SIZE / 2 + ORBIT_RADIUS * Math.cos(angle)
        const targetY = CANVAS_SIZE / 2 + ORBIT_RADIUS * Math.sin(angle)
        const dx = pointerPosRef.current.x - targetX
        const dy = pointerPosRef.current.y - targetY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist <= TARGET_RADIUS + POINTER_RADIUS) {
          onTargetAccumRef.current += dt
          setOnTargetNow(true)
        } else {
          setOnTargetNow(false)
        }
      }
      lastCheckRef.current = now
      setTimeLeftMs(Math.max(0, trackMs - (now - startedAt)))
    }, 100)
    const capTimer = window.setTimeout(() => {
      window.clearInterval(checkInterval)
      void finishTrack(onTargetAccumRef.current, Math.min(trackMs, performance.now() - startedAt))
    }, trackMs)
    return () => { window.clearInterval(checkInterval); window.clearTimeout(capTimer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, trackMs, revolutionMs])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const finishTrack = useCallback(async (timeOnTargetMs: number, totalTrackMs: number) => {
    if (phase === 'practice') {
      const rate = totalTrackMs > 0 ? Math.round((timeOnTargetMs / totalTrackMs) * 100) : 0
      setPracticeFeedback(`练习结束：追踪时间比 ${rate}%。正式测验共 ${totalTrials} 轮。`)
      setStep('feedback')
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    const payload: PursuitrotorTrialPayload = {
      trialIndex,
      timeOnTargetMs: Math.min(timeOnTargetMs, trackMs),
      totalTrackMs: Math.min(totalTrackMs, trackMs),
      interrupted: interruptedRef.current,
    }
    setFormalFeedback('已记录，下一轮准备中'); setStep('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前轮'); setStep('tracking'); return }
      setCompletedCount((current) => current + 1)
      if (completedCount + 1 >= totalTrials) { setPhase('completed'); await onTaskComplete?.() }
    } finally { submittingRef.current = false }
  }, [phase, trialIndex, trackMs, totalTrials, onTrialComplete, completedCount, onTaskComplete])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    pointerPosRef.current = {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_SIZE,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_SIZE,
    }
  }, [])

  const startPractice = useCallback(() => { setStep('brief'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    setFormalFeedback(null); setStep('brief'); setPhase('formal')
  }, [])

  const angle = ((performance.now() - (trackStartRef.current ?? 0)) / revolutionMs) * Math.PI * 2
  const targetX = CANVAS_SIZE / 2 + ORBIT_RADIUS * Math.cos(angle)
  const targetY = CANVAS_SIZE / 2 + ORBIT_RADIUS * Math.sin(angle)

  if (phase === 'instruction') return <CognitiveTaskIntro title="追踪旋转" description={<p>一个点沿圆轨道匀速转动。把你的指针（鼠标/手指）放在它上面，跟着它一起转——看你能跟多久不离。</p>} hint={<><p>每轮 {Math.round(trackMs / 1000)} 秒；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'completed') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700">已全部完成，正在生成结果…</p></div>

  if (phase === 'practice') {
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 · 不计入成绩</div>{step === 'brief' && <div className="text-4xl text-gray-400 h-40 pt-16">准备…</div>}{step !== 'brief' && <div ref={containerRef} className="relative mx-auto rounded-full border-2 border-gray-200" style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }} onPointerMove={handlePointerMove}><div className="absolute rounded-full bg-gray-200" style={{ width: ORBIT_RADIUS * 2, height: ORBIT_RADIUS * 2, left: (CANVAS_SIZE - ORBIT_RADIUS * 2) / 2, top: (CANVAS_SIZE - ORBIT_RADIUS * 2) / 2, border: '2px dashed #cbd5e1' }} /><div className="absolute rounded-full transition-colors" style={{ width: TARGET_RADIUS * 2, height: TARGET_RADIUS * 2, left: targetX - TARGET_RADIUS, top: targetY - TARGET_RADIUS, backgroundColor: onTargetNow ? '#22c55e' : '#0ea5e9' }} /><div className="absolute rounded-full bg-rose-500" style={{ width: POINTER_RADIUS * 2, height: POINTER_RADIUS * 2, left: (pointerPosRef.current?.x ?? CANVAS_SIZE / 2) - POINTER_RADIUS, top: (pointerPosRef.current?.y ?? CANVAS_SIZE / 2) - POINTER_RADIUS }} /></div>}{step === 'tracking' && <p className="text-sm text-gray-500 mt-3">剩余 {Math.ceil(timeLeftMs / 1000)} 秒</p>}{step === 'feedback' && <><div className="h-10 pt-3 text-gray-700">{practiceFeedback}</div><button type="button" className="btn-primary" onClick={advancePractice}>开始正式测评</button></>}</div>
  }

  return <CognitiveFocusStage ariaLabel="追踪旋转正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">第 {trialIndex + 1} / {totalTrials} 轮</div>{step === 'brief' && <div className="text-4xl text-gray-400 h-72 pt-24">准备…</div>}{step !== 'brief' && <div ref={containerRef} className="relative mx-auto rounded-full border-2 border-gray-200" style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }} onPointerMove={handlePointerMove}><div className="absolute rounded-full bg-gray-200" style={{ width: ORBIT_RADIUS * 2, height: ORBIT_RADIUS * 2, left: (CANVAS_SIZE - ORBIT_RADIUS * 2) / 2, top: (CANVAS_SIZE - ORBIT_RADIUS * 2) / 2, border: '2px dashed #cbd5e1' }} /><div className="absolute rounded-full transition-colors" style={{ width: TARGET_RADIUS * 2, height: TARGET_RADIUS * 2, left: targetX - TARGET_RADIUS, top: targetY - TARGET_RADIUS, backgroundColor: onTargetNow ? '#22c55e' : '#0ea5e9' }} /></div>}{step === 'tracking' && <p className="text-sm text-gray-500 mt-3">剩余 {Math.ceil(timeLeftMs / 1000)} 秒</p>}{step === 'feedback' && <div className="h-16 pt-6 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{step === 'tracking' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<p className="text-xs text-gray-400 mt-3">指针放上目标点跟它转 · 限时 {Math.round(trackMs / 1000)} 秒</p></div></CognitiveFocusStage>
}
