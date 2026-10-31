import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { TimecopyConfig, TimecopyTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { buildTimecopyTargets, TIMECOPY_PRACTICE_TARGET } from './prng'

type Phase = 'instruction' | 'practice' | 'formal' | 'blocked'
type PhaseStep = 'watch' | 'ready' | 'reproducing' | 'feedback'

export const TimecopyTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as TimecopyConfig
  const totalTrials = config?.totalTrials ?? 10
  const targetMinMs = config?.targetMinMs ?? 1000
  const targetMaxMs = config?.targetMaxMs ?? 3000
  const maxResponseMs = config?.maxResponseMs ?? 10000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [step, setStep] = useState<PhaseStep>('watch')
  const [practiceAttempt, setPracticeAttempt] = useState(1)
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const [barFill, setBarFill] = useState(false)
  const interruptedRef = useRef(false)
  const reproduceStartRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const targets = useMemo(
    () => buildTimecopyTargets(taskContext.randomSeed, totalTrials, targetMinMs, targetMaxMs),
    [taskContext.randomSeed, totalTrials, targetMinMs, targetMaxMs]
  )
  const currentTrial = targets[trialIndex]
  const activeTarget = phase === 'practice' ? TIMECOPY_PRACTICE_TARGET : currentTrial?.targetMs ?? 0

  // 观察阶段：光条从空到满持续 targetMs。
  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || step !== 'watch') return
    setBarFill(false); setPracticeFeedback(null); setFormalFeedback(null); interruptedRef.current = false
    const startTimer = window.setTimeout(() => setBarFill(true), 200)
    const doneTimer = window.setTimeout(() => setStep('ready'), 200 + activeTarget)
    return () => { window.clearTimeout(startTimer); window.clearTimeout(doneTimer) }
  }, [phase, step, trialIndex, activeTarget])

  const finishReproduction = useCallback(async (responseMs: number) => {
    const clamped = Math.min(maxResponseMs, Math.max(0, responseMs))
    if (phase === 'practice') {
      const error = Math.abs(clamped - TIMECOPY_PRACTICE_TARGET) / TIMECOPY_PRACTICE_TARGET
      setPracticeFeedback(
        error <= 0.2
          ? `目标 ${TIMECOPY_PRACTICE_TARGET}ms，你复制了 ${clamped}ms，很接近！正式测验不再提示。`
          : `目标 ${TIMECOPY_PRACTICE_TARGET}ms，你复制了 ${clamped}ms。正式测验不再提示对错。`
      )
      setStep('feedback'); return
    }
    if (phase !== 'formal' || submittingRef.current) return
    submittingRef.current = true
    const payload: TimecopyTrialPayload = {
      targetMs: currentTrial!.targetMs,
      responseMs: clamped,
      interrupted: interruptedRef.current,
    }
    setFormalFeedback('已记录，下一题准备中'); setStep('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前试次'); setStep('ready'); return }
      if (trialIndex + 1 >= totalTrials) await onTaskComplete?.()
    } finally { submittingRef.current = false }
  }, [phase, currentTrial, onTrialComplete, trialIndex, totalTrials, onTaskComplete, maxResponseMs])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  useEffect(() => {
    if (step !== 'reproducing') return
    const startedAt = reproduceStartRef.current
    if (startedAt === null) return
    const capTimer = window.setTimeout(() => { void finishReproduction(maxResponseMs) }, maxResponseMs - (performance.now() - startedAt))
    return () => window.clearTimeout(capTimer)
  }, [step, finishReproduction, maxResponseMs])

  const handleStart = useCallback(() => {
    if (step !== 'ready') return
    reproduceStartRef.current = performance.now()
    interruptedRef.current = false
    setStep('reproducing')
  }, [step])

  const handleStop = useCallback(() => {
    if (step !== 'reproducing' || reproduceStartRef.current === null) return
    void finishReproduction(Math.round(performance.now() - reproduceStartRef.current))
  }, [step, finishReproduction])

  const startPractice = useCallback(() => { setPracticeAttempt(1); setStep('watch'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    setFormalFeedback(null); setStep('watch'); setPhase('formal')
  }, [])

  const ProgressBar: React.FC<{ fill: boolean; target: number }> = ({ fill, target }) => (
    <div className="w-full max-w-md mx-auto h-6 rounded bg-gray-200 overflow-hidden" aria-hidden="true">
      <div className="h-full bg-sky-400 transition-none" style={{ width: fill ? '100%' : '0%', transition: `width ${target}ms linear` }} />
    </div>
  )

  if (phase === 'instruction') return <CognitiveTaskIntro title="时间间隔复制" description={<p>每题先看一段光条从空到满——记住它亮了多久。然后点击「开始」，凭感觉觉得到了同样的时长，再点击「结束」。</p>} hint={<><p>复制阶段不限时但会自动封顶；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'blocked') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700 mb-4">练习未完成，本次正式测评未开始。</p><button type="button" className="btn-secondary" onClick={() => window.history.back()}>返回</button></div>

  if (phase === 'practice') {
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 · 第 {practiceAttempt} 轮 · 不计入成绩</div>{(step === 'watch' || step === 'ready') && <><ProgressBar fill={step === 'ready'} target={TIMECOPY_PRACTICE_TARGET} /><p className="text-gray-600 pt-4">{step === 'watch' ? '记住光条亮了多久…' : '光条已结束'}</p></>}{step === 'ready' && <button type="button" className="btn-primary mt-3" onClick={handleStart}>开始复制</button>}{step === 'reproducing' && <><div className="h-24 flex items-center justify-center"><span className="h-6 w-6 rounded-full bg-sky-400 animate-pulse" aria-hidden="true" /></div><button type="button" className="btn-primary" onClick={handleStop}>结束复制</button></>}{step === 'feedback' && <><div className="h-16 pt-4 text-gray-700">{practiceFeedback}</div><button type="button" className="btn-primary" onClick={advancePractice}>开始正式测评</button></>}</div>
  }

  if (!currentTrial) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return <CognitiveFocusStage ariaLabel="时间间隔复制正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">第 {trialIndex + 1} / {totalTrials} 题</div>{(step === 'watch' || step === 'ready') && <><div className="pt-4"><ProgressBar fill={step === 'ready'} target={activeTarget} /></div><p className="text-gray-600 pt-3">{step === 'watch' ? '记住光条亮了多久…' : '光条已结束'}</p></>}{step === 'ready' && <button type="button" className="btn-primary mt-3" onClick={handleStart}>开始复制</button>}{step === 'reproducing' && <><div className="h-24 flex items-center justify-center"><span className="h-6 w-6 rounded-full bg-sky-400 animate-pulse" aria-hidden="true" /></div><button type="button" className="btn-primary" onClick={handleStop}>结束复制</button></>}{step === 'feedback' && <div className="h-16 pt-4 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{step === 'ready' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<p className="text-xs text-gray-400 mt-4">凭感觉复制同样的时长 · 不看表</p></div></CognitiveFocusStage>
}
