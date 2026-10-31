import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { DelaydiscountConfig, DelaydiscountTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { buildDelaydiscountBandOrder, DELAYDISCOUNT_PRACTICE_TRIAL, immediateForBounds } from './prng'

type Phase = 'instruction' | 'practice' | 'formal' | 'completed'
type SubPhase = 'fixation' | 'choice' | 'feedback'

interface BandState {
  delayDays: number
  low: number
  high: number
  step: number
}

export const DelaydiscountTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as DelaydiscountConfig
  const delayBands = config?.delayBands ?? [7, 30, 90]
  const delayedAmount = config?.delayedAmount ?? 100
  const bisectionSteps = config?.bisectionSteps ?? 5
  const fixationMs = config?.fixationMs ?? 500
  const timeoutMs = config?.timeoutMs ?? 15000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('fixation')
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const bandOrder = useMemo(() => buildDelaydiscountBandOrder(taskContext.randomSeed, delayBands.length), [taskContext.randomSeed, delayBands.length])
  const [bands, setBands] = useState<BandState[]>(() => delayBands.map((delayDays) => ({ delayDays, low: 0, high: delayedAmount, step: 0 })))
  const [completedCount, setCompletedCount] = useState(0)
  const totalTrials = delayBands.length * bisectionSteps
  const interruptedRef = useRef(false)
  const onsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)

  /** 当前应作答的带：step < bisectionSteps 的第一个（按 bandOrder）。 */
  const activeBand = useMemo(() => {
    for (const index of bandOrder) {
      const band = bands[index]
      if (band && band.step < bisectionSteps) return { index, ...band }
    }
    return null
  }, [bandOrder, bands, bisectionSteps])

  useEffect(() => {
    if (phase !== 'formal') return
    setFormalFeedback(null); interruptedRef.current = false; setSubPhase('fixation')
  }, [completedCount])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || subPhase !== 'fixation') return
    const timer = window.setTimeout(() => { onsetRef.current = performance.now(); setSubPhase('choice') }, fixationMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, completedCount, fixationMs])

  const submitFormal = useCallback(async (choice: 'now' | 'later' | null) => {
    if (phase !== 'formal' || subPhase !== 'choice' || !activeBand || submittingRef.current) return
    submittingRef.current = true
    const payload: DelaydiscountTrialPayload = {
      delayDays: activeBand.delayDays,
      delayedAmount,
      immediateAmount: immediateForBounds(activeBand.low, activeBand.high),
      choice,
      rtMs: choice === null || onsetRef.current === null ? null : Math.max(0, Math.round(performance.now() - onsetRef.current)),
      interrupted: interruptedRef.current,
    }
    setFormalFeedback('已记录，下一题准备中'); setSubPhase('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前试次'); setSubPhase('choice'); return }
      setBands((current) => current.map((band, index) => (
        index === activeBand.index
          ? {
              ...band,
              low: choice === 'later' ? payload.immediateAmount : band.low,
              high: choice === 'now' ? payload.immediateAmount : band.high,
              step: band.step + 1,
            }
          : band
      )))
      setCompletedCount((current) => current + 1)
      if (completedCount + 1 >= totalTrials) { setPhase('completed'); await onTaskComplete?.() }
    } finally { submittingRef.current = false }
  }, [phase, subPhase, activeBand, delayedAmount, onTrialComplete, completedCount, totalTrials, onTaskComplete])

  useEffect(() => {
    if (phase !== 'formal' || subPhase !== 'choice') return
    const timer = window.setTimeout(() => { void submitFormal(null) }, timeoutMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, timeoutMs, submitFormal])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const handlePracticeChoice = useCallback((choice: 'now' | 'later') => {
    if (subPhase !== 'choice') return
    setPracticeFeedback(choice === 'later' ? '已记录。正式测验里金额会跟着你的选择调整。' : '已记录。正式测验里金额会跟着你的选择调整。')
    setSubPhase('feedback')
  }, [subPhase])

  useEffect(() => {
    if ((phase !== 'practice' && phase !== 'formal') || subPhase !== 'choice') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return
      const choice = event.key === '1' ? 'now' : event.key === '2' ? 'later' : null
      if (!choice) return
      event.preventDefault()
      if (phase === 'practice') handlePracticeChoice(choice)
      else void submitFormal(choice)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase, subPhase, handlePracticeChoice, submitFormal])

  const ChoiceButtons: React.FC<{ show: boolean; immediateAmount: number }> = ({ show, immediateAmount }) => show ? (
    <div className="grid grid-cols-2 gap-4 max-w-xl mx-auto mt-6">
      <button type="button" onPointerDown={() => (phase === 'practice' ? handlePracticeChoice('now') : void submitFormal('now'))} onClick={(event) => { if (event.detail === 0) { if (phase === 'practice') handlePracticeChoice('now'); else void submitFormal('now') } }} onKeyDown={(event) => { if (event.repeat) event.preventDefault() }} className="btn-secondary min-h-24 flex flex-col items-center justify-center">
        <span className="text-xs text-gray-500">按 1 · 现在立刻</span>
        <span className="text-2xl font-bold text-gray-800">现在拿 {immediateAmount}</span>
      </button>
      <button type="button" onPointerDown={() => (phase === 'practice' ? handlePracticeChoice('later') : void submitFormal('later'))} onClick={(event) => { if (event.detail === 0) { if (phase === 'practice') handlePracticeChoice('later'); else void submitFormal('later') } }} onKeyDown={(event) => { if (event.repeat) event.preventDefault() }} className="btn-secondary min-h-24 flex flex-col items-center justify-center">
        <span className="text-xs text-gray-500">按 2 · 延后多得</span>
        <span className="text-2xl font-bold text-gray-800">{phase === 'practice' ? DELAYDISCOUNT_PRACTICE_TRIAL.delayDays : activeBand?.delayDays} 天后拿 {phase === 'practice' ? DELAYDISCOUNT_PRACTICE_TRIAL.delayedAmount : delayedAmount}</span>
      </button>
    </div>
  ) : null

  if (phase === 'instruction') return <CognitiveTaskIntro title="延迟满足选择" description={<p>每题在两个选项之间做选择：「现在立刻拿一笔较小的」，或「过一段时间拿 {delayedAmount}」。你的选择会让“现在”的金额逐步调整，找到对你来说两边差不多的点。</p>} hint={<><p>没有标准答案，按真实偏好选择；练习不计入成绩。</p></>} onAction={() => { setSubPhase('fixation'); setPhase('practice') }} />
  if (phase === 'completed') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700">已全部完成，正在生成结果…</p></div>

  if (phase === 'practice') {
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 · 不计入成绩</div>{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-24 pt-6">+</div>}{subPhase !== 'fixation' && <div className="pt-6"><p className="text-gray-600 mb-2">如果只能二选一，你会选哪个？</p><div className="text-sm text-gray-500">练习：现在 50 vs 7 天后 {DELAYDISCOUNT_PRACTICE_TRIAL.delayedAmount}</div></div>}<ChoiceButtons show={subPhase === 'choice'} immediateAmount={DELAYDISCOUNT_PRACTICE_TRIAL.immediateAmount} />{subPhase === 'feedback' && <><div className="h-12 pt-4 text-gray-700">{practiceFeedback}</div><button type="button" className="btn-primary" onClick={() => { setFormalFeedback(null); setSubPhase('fixation'); setPhase('formal') }}>开始正式测评</button></>}</div>
  }

  if (!activeBand) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return <CognitiveFocusStage ariaLabel="延迟满足选择正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">{completedCount} / {totalTrials} · 延迟 {activeBand.delayDays} 天</div>{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-20 pt-6">+</div>}{subPhase !== 'fixation' && <p className="text-gray-600 pt-4">如果只能二选一，你会选哪个？</p>}<ChoiceButtons show={subPhase === 'choice'} immediateAmount={immediateForBounds(activeBand.low, activeBand.high)} />{subPhase === 'feedback' && <div className="h-12 pt-4 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{subPhase === 'choice' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<p className="text-xs text-gray-400 mt-6">按键 1 = 现在拿，2 = 延后拿；限时 {Math.round(timeoutMs / 1000)} 秒</p></div></CognitiveFocusStage>
}
