import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { LineangleConfig, LineangleTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { buildLineangleTrials, buildLineangleTrialsV2, axisAngle } from './prng'
import { AxisFigure } from './AxisFigure'

const MAX_PRACTICE_ATTEMPTS = 2

type Phase = 'instruction' | 'practice' | 'formal' | 'blocked'
type SubPhase = 'fixation' | 'stimulus' | 'feedback'

const ANGLE_STEP = 15

const LineFigure: React.FC<{ angle: number; width?: number; className?: string }> = ({ angle, width = 120, className }) => {
  const rad = (angle * Math.PI) / 180
  const half = width / 2 - 8
  const cx = width / 2
  const cy = 56
  const dx = Math.cos(rad) * half
  const dy = -Math.sin(rad) * half
  return (
    <svg width={width} height="112" viewBox="0 0 120 112" className={className} role="img" aria-label={`${angle} 度线段`}>
      <line x1={cx - dx} y1={cy - dy} x2={cx + dx} y2={cy + dy} stroke="#334155" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}

export const LineangleTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const revised = taskContext.engineVersion === '2.0.0'
  const Figure = revised ? AxisFigure : LineFigure
  const buildTrials = revised ? buildLineangleTrialsV2 : buildLineangleTrials
  const config = taskContext.config as unknown as LineangleConfig
  const totalTrials = config?.totalTrials ?? 30
  const angleStepDeg = config?.angleStepDeg ?? ANGLE_STEP
  const optionCount = config?.optionCount ?? 4
  const minAngleSepSteps = config?.minAngleSepSteps ?? 2
  const fixationMs = config?.fixationMs ?? 500
  const timeoutMs = config?.timeoutMs ?? 8000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('fixation')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceAttempt, setPracticeAttempt] = useState(1)
  const [practiceCorrect, setPracticeCorrect] = useState<boolean[]>([])
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const interruptedRef = useRef(false)
  const onsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const trials = useMemo(
    () => buildTrials(taskContext.randomSeed, totalTrials, angleStepDeg, optionCount, minAngleSepSteps),
    [buildTrials, taskContext.randomSeed, totalTrials, angleStepDeg, optionCount, minAngleSepSteps]
  )
  const currentTrial = trials[trialIndex]
  const practiceTrials = useMemo(
    () => buildTrials(`${taskContext.randomSeed}:practice`, 2, angleStepDeg, optionCount, minAngleSepSteps),
    [buildTrials, taskContext.randomSeed, angleStepDeg, optionCount, minAngleSepSteps]
  )
  const activeTrial = phase === 'practice' ? practiceTrials[practiceIndex] : currentTrial

  useEffect(() => {
    if (phase !== 'formal' || !currentTrial) return
    setFormalFeedback(null); interruptedRef.current = false; setSubPhase('fixation')
  }, [phase, trialIndex, currentTrial])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || subPhase !== 'fixation') return
    const delay = phase === 'practice' ? 400 : fixationMs + (trialIndex > 0 ? 300 : 0)
    const timer = window.setTimeout(() => { onsetRef.current = performance.now(); setSubPhase('stimulus') }, delay)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, trialIndex, fixationMs])

  const submitFormal = useCallback(async (responseAngle: number | null) => {
    if (phase !== 'formal' || subPhase !== 'stimulus' || !currentTrial || submittingRef.current) return
    submittingRef.current = true
    const payload: LineangleTrialPayload = {
      targetAngle: currentTrial.targetAngle,
      optionAngles: currentTrial.optionAngles,
      responseAngle,
      rtMs: responseAngle === null || onsetRef.current === null ? null : Math.max(0, Math.round(performance.now() - onsetRef.current)),
      interrupted: interruptedRef.current,
    }
    setFormalFeedback('已记录，下一题准备中'); setSubPhase('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前试次'); setSubPhase('stimulus'); return }
      if (trialIndex + 1 >= totalTrials) await onTaskComplete?.()
    } finally { submittingRef.current = false }
  }, [phase, subPhase, currentTrial, onTrialComplete, trialIndex, totalTrials, onTaskComplete])

  useEffect(() => {
    if (phase !== 'formal' || subPhase !== 'stimulus') return
    const timer = window.setTimeout(() => { void submitFormal(null) }, timeoutMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, timeoutMs, submitFormal])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const handleResponse = useCallback((responseAngle: number) => {
    if (phase === 'practice') {
      const trial = practiceTrials[practiceIndex]
      if (subPhase !== 'stimulus' || !trial) return
      const correct = revised ? axisAngle(responseAngle) === axisAngle(trial.targetAngle) : responseAngle === trial.targetAngle
      setPracticeCorrect((current) => { const next = [...current]; next[practiceIndex] = correct; return next })
      setPracticeFeedback(correct ? '正确：找与目标平行的选项。' : '再对比一次：目标线段斜向哪边、角度多大？')
      setSubPhase('feedback'); return
    }
    void submitFormal(responseAngle)
  }, [phase, practiceIndex, subPhase, practiceTrials, revised])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const index = Number(event.key)
      if (activeTrial && index >= 1 && index <= activeTrial.optionAngles.length) {
        event.preventDefault()
        handleResponse(activeTrial.optionAngles[index - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleResponse, activeTrial])

  const startPractice = useCallback(() => { setPracticeIndex(0); setPracticeAttempt(1); setPracticeCorrect([]); setPracticeFeedback(null); setSubPhase('fixation'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    if (practiceIndex + 1 < practiceTrials.length) { setPracticeIndex((current) => current + 1); setPracticeFeedback(null); setSubPhase('fixation'); return }
    const passed = practiceCorrect.length === practiceTrials.length && practiceCorrect.every(Boolean)
    if (passed) { setFormalFeedback(null); setSubPhase('fixation'); setPhase('formal') }
    else if (practiceAttempt < MAX_PRACTICE_ATTEMPTS) { setPracticeAttempt((current) => current + 1); setPracticeIndex(0); setPracticeCorrect([]); setPracticeFeedback(null); setSubPhase('fixation') }
    else setPhase('blocked')
  }, [practiceIndex, practiceCorrect, practiceAttempt, practiceTrials.length])

  if (phase === 'instruction') return <CognitiveTaskIntro title="线条方向判断" description={(taskContext.config.report as { reportVersion?: string } | undefined)?.reportVersion === '3.0.0' ? (<><p>上方会出现一条目标线段，下方有几条方向不同的选项线段。请选出与目标方向完全一样（平行）的那一条。</p><p>给墙上挂画时，可以对照画框边缘与门框是否平行；这里也要看方向，而不只看端点位置。 这次任务只记录本次作答表现。</p></>) : (<p>上方会出现一条目标线段，下方有几条方向不同的选项线段。请选出与目标方向完全一样（平行）的那一条。</p>)} hint={<><p>按键 1–4 或点击选项作答；练习不计入成绩。</p>{revised && <p>线段没有箭头，反向但平行仍是同一个方向。每题只有一个平行选项。</p>}</>} onAction={startPractice} />
  if (phase === 'blocked') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700 mb-4">练习尚未通过，本次正式测评未开始。</p><button type="button" className="btn-secondary" onClick={() => window.history.back()}>返回</button></div>

  if (phase === 'practice') {
    const trial = practiceTrials[practiceIndex]
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-2">练习 {practiceIndex + 1} / {practiceTrials.length} · 第 {practiceAttempt} 轮 · 不计入成绩</div>{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-24 pt-8">+</div>}{subPhase !== 'fixation' && trial && (<><div className="flex justify-center pt-2"><Figure angle={trial.targetAngle} /></div><div className={revised ? 'flex flex-wrap justify-center gap-2 pt-3' : 'flex justify-center gap-4 pt-3'}>{trial.optionAngles.map((angle, index) => <button key={angle} type="button" onPointerDown={() => handleResponse(angle)} className="btn-secondary p-2"><Figure angle={angle} width={90} />{revised && <span>{index + 1}</span>}</button>)}</div></>)}{subPhase === 'feedback' && <div className="h-16 pt-4 text-gray-700">{practiceFeedback}</div>}{subPhase === 'feedback' && <button type="button" onClick={advancePractice} className="btn-primary">{practiceIndex + 1 >= practiceTrials.length ? practiceCorrect.every(Boolean) ? '开始正式测评' : practiceAttempt < MAX_PRACTICE_ATTEMPTS ? '重新练习' : '结束' : '下一个'}</button>}</div>
  }

  if (!currentTrial) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return <CognitiveFocusStage ariaLabel="线条方向判断正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8">{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-44 pt-10">+</div>}{subPhase !== 'fixation' && (<><div className="flex justify-center pt-2"><Figure angle={currentTrial.targetAngle} /></div><div className={revised ? 'flex flex-wrap justify-center gap-2 pt-3' : 'flex justify-center gap-4 pt-3'}>{currentTrial.optionAngles.map((angle, index) => <button key={angle} type="button" onPointerDown={() => handleResponse(angle)} className="btn-secondary p-2"><Figure angle={angle} width={90} />{revised && <span>{index + 1}</span>}</button>)}</div></>)}{subPhase === 'feedback' && <div className="h-16 pt-4 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{subPhase === 'stimulus' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<p className="text-xs text-gray-400 mt-4">按键 1–{currentTrial.optionAngles.length} 或点击选项作答</p></div></CognitiveFocusStage>
}
