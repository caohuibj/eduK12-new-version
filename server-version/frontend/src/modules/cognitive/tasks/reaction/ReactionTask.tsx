import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { ReactionConfig, ReactionTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { deterministicForeperiod } from './prng'

const PRACTICE_TRIALS = 3

type Phase = 'instruction' | 'practice' | 'formal'
type Sub = 'ready' | 'gray' | 'green' | 'feedback'

const stimulusClass = (isGo: boolean) => isGo ? 'bg-green-500 ring-4 ring-green-200' : 'bg-gray-300'

export const ReactionTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete }) => {
  const config = taskContext.config as unknown as ReactionConfig
  const total = config?.totalTrials ?? 20
  const foreperiodMin = config?.foreperiodMinMs ?? 700
  const foreperiodMax = config?.foreperiodMaxMs ?? 1500
  const timeoutMs = config?.timeoutMs ?? 2000
  const readyDurationMs = config?.readyDurationMs ?? 1000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceSub, setPracticeSub] = useState<Sub>('ready')
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [practicePremature, setPracticePremature] = useState(false)
  const [practiceOnset, setPracticeOnset] = useState<number | null>(null)
  const [sub, setSub] = useState<Sub>('ready')
  const [foreperiodMs, setForeperiodMs] = useState(0)
  const [stimulusOnset, setStimulusOnset] = useState<number | null>(null)
  const [prematureCount, setPrematureCount] = useState(0)
  const [interrupted, setInterrupted] = useState(false)
  const interruptedRef = useRef(false)
  const [round, setRound] = useState(0)
  const respondingRef = useRef(false)

  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total) return
    setForeperiodMs(deterministicForeperiod(taskContext.randomSeed, trialIndex, foreperiodMin, foreperiodMax))
    setSub('ready'); setStimulusOnset(null); setPrematureCount(0); setInterrupted(false); interruptedRef.current = false; setRound(0)
  }, [phase, trialIndex, total, taskContext.randomSeed, foreperiodMin, foreperiodMax])

  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total || sub !== 'ready') return
    const timer = window.setTimeout(() => setSub('gray'), readyDurationMs)
    return () => window.clearTimeout(timer)
  }, [phase, trialIndex, total, sub, readyDurationMs, round])

  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total || sub !== 'gray') return
    const timer = window.setTimeout(() => { setSub('green'); setStimulusOnset(performance.now()) }, foreperiodMs)
    return () => window.clearTimeout(timer)
  }, [phase, trialIndex, total, sub, foreperiodMs, round])

  const submit = useCallback(async (rtMs: number | null, inputMode: ReactionTrialPayload['inputMode']) => {
    if (respondingRef.current || trialIndex >= total) return
    respondingRef.current = true
    try {
      await onTrialComplete({ foreperiodMs, rtMs, prematureCount, interrupted: interruptedRef.current, inputMode })
    } finally { respondingRef.current = false }
  }, [foreperiodMs, prematureCount, onTrialComplete, trialIndex, total])

  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total || sub !== 'green' || stimulusOnset == null) return
    const timer = window.setTimeout(() => { setSub('feedback'); void submit(null, 'pointer') }, timeoutMs)
    return () => window.clearTimeout(timer)
  }, [phase, trialIndex, total, sub, stimulusOnset, timeoutMs, submit])

  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total) return
    const onVis = () => { if (document.hidden) { interruptedRef.current = true; setInterrupted(true) } }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [phase, trialIndex, total])

  const handleFormalInput = useCallback((inputMode: ReactionTrialPayload['inputMode']) => {
    if (phase !== 'formal' || trialIndex >= total) return
    if (sub === 'ready' || sub === 'gray') {
      setPrematureCount((count) => count + 1); setStimulusOnset(null); setSub('ready'); setRound((value) => value + 1); return
    }
    if (sub === 'green' && stimulusOnset != null) {
      const rt = Math.round(performance.now() - stimulusOnset)
      setSub('feedback'); void submit(rt, inputMode)
    }
  }, [phase, sub, stimulusOnset, submit, trialIndex, total])

  useEffect(() => {
    if (phase !== 'formal' || trialIndex >= total) return
    const onKey = (event: KeyboardEvent) => { if (!event.repeat) handleFormalInput('keyboard') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, trialIndex, total, handleFormalInput])

  useEffect(() => {
    if (phase !== 'practice' || practiceSub !== 'ready') return
    const timer = window.setTimeout(() => { setPracticeSub('green'); setPracticeOnset(performance.now()) }, readyDurationMs)
    return () => window.clearTimeout(timer)
  }, [phase, practiceSub, readyDurationMs])

  const finishPractice = useCallback((rtMs: number | null) => {
    setPracticePremature(false)
    if (rtMs == null) setPracticeFeedback('超时了，绿色出现后再点击。')
    else if (rtMs < 150) setPracticeFeedback('太快了！等绿色圆点出现再点击。')
    else setPracticeFeedback('很好！保持专注，等绿色出现再点击。')
    setPracticeSub('feedback')
  }, [])

  useEffect(() => {
    if (phase !== 'practice' || practiceSub !== 'green' || practiceOnset == null) return
    const timer = window.setTimeout(() => finishPractice(null), timeoutMs)
    return () => window.clearTimeout(timer)
  }, [phase, practiceSub, practiceOnset, timeoutMs, finishPractice])

  const handlePracticeInput = useCallback(() => {
    if (phase !== 'practice') return
    if (practiceSub === 'ready') { setPracticePremature(true); setPracticeFeedback('太快了，等绿色出现再点击。'); setPracticeSub('feedback'); return }
    if (practiceSub === 'green' && practiceOnset != null) finishPractice(performance.now() - practiceOnset)
  }, [phase, practiceSub, practiceOnset, finishPractice])

  const retryPractice = () => { setPracticePremature(false); setPracticeSub('ready'); setPracticeOnset(null); setPracticeFeedback(null) }
  const advancePractice = () => {
    if (practiceIndex + 1 >= PRACTICE_TRIALS) { setPhase('formal'); setPracticeIndex(0); setPracticePremature(false); setPracticeFeedback(null); return }
    setPracticeIndex((index) => index + 1); setPracticeSub('ready'); setPracticeOnset(null); setPracticePremature(false); setPracticeFeedback(null)
  }

  if (phase === 'instruction') return <CognitiveTaskIntro title="反应速度" description={<p>屏幕上的圆点会在短暂等待后变成<span className="text-green-600 font-semibold">绿色</span>。看到绿色后，尽快点击或按任意键。</p>} hint={<><p>练习不计分；正式测验只以颜色变化作为目标刺激，不再同时改变指令文字。</p></>} onAction={() => setPhase('practice')} />

  if (phase === 'practice') return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 {practiceIndex + 1} / {PRACTICE_TRIALS}</div>{practiceSub !== 'feedback' ? <button aria-label={`practice trial ${practiceIndex}`} onClick={handlePracticeInput} className={`w-40 h-40 rounded-full mx-auto flex items-center justify-center ${stimulusClass(practiceSub === 'green')}`}><span className={`text-2xl font-bold ${practiceSub === 'green' ? 'text-white' : 'text-gray-600'}`}>{practiceSub === 'green' ? '点击！' : '等待…'}</span></button> : <div><p className="text-gray-700 mb-6">{practiceFeedback}</p><button onClick={practicePremature ? retryPractice : advancePractice} className="btn-primary">{practicePremature ? '重试' : practiceIndex + 1 >= PRACTICE_TRIALS ? '开始正式测评' : '下一个'}</button></div>}</div>

  if (trialIndex >= total) return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700">正式试次已完成，请提交测评结果。</p></div>

  return <CognitiveFocusStage ariaLabel="反应速度正式测验"><div className="mx-auto max-w-2xl text-center"><span className="sr-only">试次 {trialIndex + 1} / {total}</span><button onPointerDown={(event) => { if (event.isPrimary && (event.pointerType !== 'mouse' || event.button === 0)) handleFormalInput(event.pointerType === 'touch' ? 'touch' : 'pointer') }} className={`w-48 h-48 rounded-full mx-auto ${stimulusClass(sub === 'green')}`} aria-label={`trial ${trialIndex}`}><span className="sr-only">{sub === 'green' ? '点击！' : '等待'}</span></button><p className="text-xs text-gray-400 mt-6">看到绿色后尽快点击或按任意键{interrupted ? '（检测到页面切走，本次记为中断）' : ''}</p></div></CognitiveFocusStage>
}
