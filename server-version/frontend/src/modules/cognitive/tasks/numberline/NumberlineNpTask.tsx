import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { NumberlineTrialPayload } from '../../types'
import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { NumberlineTrack } from './NumberlineTask'
import { buildNumberlineNpTargets } from './prng.np'

type Config = { totalTrials: 6; lineMax: 100 | 1000; targetSet: 'A' | 'B'; maxResponseMs: 4000 | 30000 }
type Phase = 'instruction' | 'practice' | 'formal' | 'complete'
type Step = 'fixation' | 'response' | 'saving'

export const NumberlineNpTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as Config
  const targets = useMemo(() => buildNumberlineNpTargets(taskContext.randomSeed, config.lineMax, config.targetSet), [taskContext.randomSeed, config.lineMax, config.targetSet])
  const [phase, setPhase] = useState<Phase>('instruction')
  const [step, setStep] = useState<Step>('fixation')
  const [practiceDone, setPracticeDone] = useState(false)
  const [message, setMessage] = useState('')
  const [saveFailed, setSaveFailed] = useState(false)
  const [completionFailed, setCompletionFailed] = useState(false)
  const onsetRef = useRef<number | null>(null)
  const interruptedRef = useRef(false)
  const savingRef = useRef(false)
  const pendingRef = useRef<NumberlineTrialPayload | null>(null)
  const current = targets[trialIndex]

  useEffect(() => {
    if (phase !== 'formal' || !current) return
    onsetRef.current = null; interruptedRef.current = false; savingRef.current = false; pendingRef.current = null
    setStep('fixation'); setMessage(''); setSaveFailed(false)
    const timer = window.setTimeout(() => { onsetRef.current = performance.now(); setStep('response') }, 400)
    return () => window.clearTimeout(timer)
  }, [phase, trialIndex])

  useEffect(() => {
    if (phase !== 'formal') return
    const hidden = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', hidden)
    return () => document.removeEventListener('visibilitychange', hidden)
  }, [phase])

  const finish = useCallback(async () => {
    try { await onTaskComplete?.(); setCompletionFailed(false); setPhase('complete') }
    catch { setCompletionFailed(true); setMessage('答案已保存，请重试完成任务。') }
  }, [onTaskComplete])

  const save = useCallback(async (position: number | null, retry = false) => {
    if (phase !== 'formal' || !current || savingRef.current || (pendingRef.current && !retry)) return
    if (!retry) {
      if (step !== 'response' || onsetRef.current === null) return
      const elapsed = performance.now() - onsetRef.current
      const inTime = position !== null && elapsed < config.maxResponseMs
      pendingRef.current = { targetNumber: current.targetNumber, responsePosition: inTime ? position : null, rtMs: inTime ? Math.max(0, Math.round(elapsed)) : null, interrupted: interruptedRef.current }
    }
    const payload = pendingRef.current
    if (!payload) return
    savingRef.current = true; setSaveFailed(false); setStep('saving'); setMessage('正在保存本次位置…')
    try {
      const accepted = await onTrialComplete({ ...payload })
      if (accepted === false) { setSaveFailed(true); setMessage('保存尚未确认；本次位置和用时已固定，请重试保存。'); return }
      if (trialIndex + 1 === config.totalTrials) await finish()
    } catch { setSaveFailed(true); setMessage('网络暂时不可用；本次位置和用时已固定，请重试保存。') }
    finally { savingRef.current = false }
  }, [phase, current, step, config.maxResponseMs, config.totalTrials, onTrialComplete, trialIndex, finish])

  useEffect(() => {
    if (phase !== 'formal' || step !== 'response' || onsetRef.current === null || pendingRef.current) return
    const remaining = Math.max(0, onsetRef.current + config.maxResponseMs - performance.now())
    const timer = window.setTimeout(() => { void save(null) }, remaining)
    return () => window.clearTimeout(timer)
  }, [phase, step, trialIndex, config.maxResponseMs, save])

  if (phase === 'instruction') return <CognitiveTaskIntro title="数字到位置估计" description={<p>这条线的左端是0，右端是{config.lineMax}。每题会给一个数字，请在线上点击你估计的位置。</p>} hint={<><p>正式共6题，每题预定{config.maxResponseMs / 1000}秒；正式题不提示正确位置。</p><p>先用一题熟悉点击方式；练习不计分，不提示位置对错，也没有准确率通过要求。</p></>} onAction={() => { setPracticeDone(false); setPhase('practice') }} />
  if (phase === 'complete') return <div className="card p-8 text-center">6题记录已保存，任务已完成。</div>
  if (phase === 'practice') return <div className="card p-8 text-center"><p>点击练习 · 不计入正式记录</p><p className="my-4 text-4xl">{config.lineMax === 100 ? 31 : 310}</p><NumberlineTrack key="neutral-practice" lineMax={config.lineMax} showReferenceTicks={false} disabled={practiceDone} marker={null} onPick={() => setPracticeDone(true)} />{practiceDone && <><p>练习点击已收到；这里不提示位置对错。</p><button type="button" className="btn-primary mt-4" onClick={() => setPhase('formal')}>开始正式任务</button></>}</div>
  if (!current) return <div className="card p-8">正在完成任务…</div>
  return <CognitiveFocusStage ariaLabel="NP数字到位置正式任务"><div className="card p-6 text-center"><p>正式 {trialIndex + 1} / 6 · 本次范围0到{config.lineMax}</p><p className="my-4 text-4xl">{step === 'fixation' ? '+' : current.targetNumber}</p><NumberlineTrack key={`np-${trialIndex}`} lineMax={config.lineMax} showReferenceTicks={false} marker={null} disabled={step !== 'response'} onPick={position => void save(position)} /><p className="mt-3 text-sm">{message || `每题预定${config.maxResponseMs / 1000}秒，请给出你估计的位置。`}</p>{saveFailed && <button type="button" className="btn-secondary mt-4" disabled={savingRef.current} onClick={() => void save(null, true)}>重试保存本次位置</button>}{completionFailed && <button type="button" className="btn-secondary mt-4" onClick={() => void finish()}>重试完成任务</button>}</div></CognitiveFocusStage>
}
