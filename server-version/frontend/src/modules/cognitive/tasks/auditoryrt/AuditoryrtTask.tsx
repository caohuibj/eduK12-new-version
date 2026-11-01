import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { AuditoryrtConfig, AuditoryrtTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { prepareAudioContext, playTone, type CognitiveAudio } from '../shared/audio'
import { generateAuditoryRtForeperiods } from './generator'

const PRACTICE_FOREPERIODS = [1200, 2000]
const MAX_PRACTICE_ATTEMPTS = 3

type Phase = 'instruction' | 'practice-instruction' | 'practice' | 'formal' | 'blocked'
type SubPhase = 'ready' | 'sound' | 'feedback'

export const AuditoryrtTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as AuditoryrtConfig
  const totalTrials = config?.totalTrials ?? 24
  const foreperiodMinMs = config?.foreperiodMinMs ?? 1000
  const foreperiodMaxMs = config?.foreperiodMaxMs ?? 4000
  const toneFrequencyHz = config?.toneFrequencyHz ?? 880
  const toneDurationMs = config?.toneDurationMs ?? 120
  const maxRtWindowMs = config?.maxRtWindowMs ?? 1500
  const interTrialIntervalMs = config?.interTrialIntervalMs ?? 800
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('ready')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceAttempt, setPracticeAttempt] = useState(1)
  const [practicePassed, setPracticePassed] = useState<boolean[]>([])
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const audioRef = useRef<CognitiveAudio | null>(null)
  const interruptedRef = useRef(false)
  const onsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const practiceResponseLockedRef = useRef(false)
  const pendingPayloadRef = useRef<AuditoryrtTrialPayload | null>(null)
  const foreperiods = useMemo(
    () => generateAuditoryRtForeperiods(taskContext.randomSeed, totalTrials, foreperiodMinMs, foreperiodMaxMs),
    [taskContext.randomSeed, totalTrials, foreperiodMinMs, foreperiodMaxMs],
  )
  const currentForeperiodMs = phase === 'practice' ? PRACTICE_FOREPERIODS[practiceIndex] : foreperiods[trialIndex]

  useEffect(() => {
    if (phase !== 'formal' || !foreperiods[trialIndex]) return
    setFormalFeedback(null); interruptedRef.current = false; onsetRef.current = null; setSubPhase('ready')
  }, [phase, trialIndex, foreperiods])

  const persistFormal = useCallback(async (payload: AuditoryrtTrialPayload) => {
    if (submittingRef.current) return
    submittingRef.current = true
    pendingPayloadRef.current = payload
    setFormalFeedback('正在保存本题记录…'); setSubPhase('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前试次'); return }
      pendingPayloadRef.current = null
      if (trialIndex + 1 >= totalTrials) await onTaskComplete?.()
    } catch {
      setFormalFeedback('提交失败，请重试当前试次')
    } finally { submittingRef.current = false }
  }, [onTrialComplete, trialIndex, totalTrials, onTaskComplete])

  const submitFormal = useCallback(async (rtMs: number | null) => {
    if (phase !== 'formal' || (subPhase !== 'ready' && subPhase !== 'sound') || currentForeperiodMs === undefined || submittingRef.current || pendingPayloadRef.current) return
    await persistFormal({
      trialIndex,
      foreperiodMs: currentForeperiodMs,
      rtMs,
      interrupted: interruptedRef.current,
      audioLatencyMs: audioRef.current?.latencyMs ?? null,
    })
  }, [phase, subPhase, currentForeperiodMs, trialIndex, persistFormal])

  const respond = useCallback(() => {
    if (phase === 'practice') {
      if ((subPhase !== 'sound' && subPhase !== 'ready') || practiceResponseLockedRef.current) return
      practiceResponseLockedRef.current = true
      if (subPhase === 'ready') { setPracticePassed((current) => { const next = [...current]; next[practiceIndex] = false; return next }); setPracticeFeedback('太快了——要等声音响起后再按。'); setSubPhase('feedback'); return }
      const rt = onsetRef.current === null ? null : Math.max(0, Math.round(performance.now() - onsetRef.current))
      const correct = rt !== null && rt >= 150
      setPracticePassed((current) => { const next = [...current]; next[practiceIndex] = correct; return next })
      setPracticeFeedback(correct ? '正确：听到声音后立即按键。' : '这次没有落在有效窗口内——听到声音后立即按键，不抢拍。')
      setSubPhase('feedback')
      return
    }
    void submitFormal(subPhase === 'sound' && onsetRef.current !== null ? Math.max(0, Math.round(performance.now() - onsetRef.current)) : 0)
  }, [phase, subPhase, practiceIndex, submitFormal])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || subPhase !== 'ready') return
    const audio = audioRef.current
    if (!audio) return
    if (phase === 'practice') practiceResponseLockedRef.current = false
    const waitMs = (phase === 'formal' && trialIndex > 0 ? interTrialIntervalMs : 0) + (currentForeperiodMs ?? 0)
    const timer = window.setTimeout(() => {
      playTone(audio, toneFrequencyHz, toneDurationMs)
      onsetRef.current = performance.now()
      setSubPhase('sound')
    }, waitMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, trialIndex, currentForeperiodMs, interTrialIntervalMs, toneFrequencyHz, toneDurationMs])

  useEffect(() => {
    if (phase !== 'formal' || subPhase !== 'sound') return
    const timer = window.setTimeout(() => { void submitFormal(null) }, maxRtWindowMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, maxRtWindowMs, submitFormal])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || (phase !== 'practice' && phase !== 'formal') || (subPhase !== 'ready' && subPhase !== 'sound')) return
      if (event.code !== 'Space' && event.key !== ' ') return
      event.preventDefault()
      respond()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [respond, phase, subPhase])

  const startPractice = useCallback(async () => {
    const audio = await prepareAudioContext()
    if (!audio) { setPhase('blocked'); return }
    audioRef.current = audio
    playTone(audio, toneFrequencyHz, toneDurationMs)
    setPracticeIndex(0); setPracticeAttempt(1); setPracticePassed([]); setPracticeFeedback(null)
    setSubPhase('ready'); setPhase('practice')
  }, [toneFrequencyHz, toneDurationMs])

  const advancePractice = useCallback(() => {
    if (practiceIndex + 1 < PRACTICE_FOREPERIODS.length) {
      setPracticeIndex((current) => current + 1); setPracticeFeedback(null); setSubPhase('ready'); return
    }
    const passed = practicePassed.length === PRACTICE_FOREPERIODS.length && practicePassed.every(Boolean)
    if (passed) { setFormalFeedback(null); setSubPhase('ready'); setPhase('formal') }
    else if (practiceAttempt < MAX_PRACTICE_ATTEMPTS) {
      setPracticeAttempt((current) => current + 1); setPracticeIndex(0); setPracticePassed([]); setPracticeFeedback(null); setSubPhase('ready'); setPhase('practice-instruction')
    } else setPhase('blocked')
  }, [practiceIndex, practicePassed, practiceAttempt])

  if (phase === 'instruction' || phase === 'practice-instruction') return <CognitiveTaskIntro title="听觉简单反应时" description={<p>请戴上耳机或打开声音。安静等待，「嘀」的一声响起后，立刻按空格键（或点击按钮）。声音出现的时间不固定，请不要抢拍。像听到提示音后点一下，这里记录电脑上的一次提示与按键过程，不是纯听觉神经传导速度。</p>} hint={<><p>需要可发声的设备；点「开始练习」后会先播一声提示音，可用于调整音量。</p><p>练习共2次，每次听到声音后按一次；要等下一声再按，按住空格不算新的回答。请先确认能听清提示音；练习失败会重呈完整说明，最多3轮。练习不计入成绩。</p></>} onAction={() => { if (phase === 'practice-instruction') setPhase('practice'); else void startPractice() }} />
  if (phase === 'blocked') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700 mb-4">{practicePassed.length > 0 ? '练习尚未通过，本次正式测评未开始。' : '当前设备无法播放音频，本次测评未开始。请检查设备音量与浏览器音频权限。'}</p><button type="button" className="btn-secondary" onClick={() => window.history.back()}>返回</button></div>

  if (phase === 'practice') {
    return <CognitiveFocusStage ariaLabel="听觉反应练习"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500 mb-4">练习 {practiceIndex + 1} / {PRACTICE_FOREPERIODS.length} · 第 {practiceAttempt} 轮 · 不计入成绩</div>{subPhase === 'ready' && <div className="text-4xl text-gray-400 h-28 pt-8">请安静等待声音…</div>}{subPhase === 'sound' && <div className="text-4xl font-bold h-28 pt-8">🔊 现在按！</div>}{subPhase === 'feedback' && <div className="h-28 pt-8 text-gray-700">{practiceFeedback}</div>}<button type="button" className="btn-primary min-h-16 min-w-48 mt-4" onPointerDown={respond} onClick={(event) => { if (event.detail === 0) respond() }}>按 空格 或点这里</button>{subPhase === 'feedback' && <button type="button" onClick={advancePractice} className="btn-primary mt-4">{practiceIndex + 1 >= PRACTICE_FOREPERIODS.length ? practicePassed.every(Boolean) ? '开始正式测评' : practiceAttempt < MAX_PRACTICE_ATTEMPTS ? '重新练习' : '结束' : '下一个'}</button>}</div></CognitiveFocusStage>
  }

  if (!currentForeperiodMs) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return <CognitiveFocusStage ariaLabel="听觉反应正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-400">第 {trialIndex + 1} / {totalTrials} 题</div>{subPhase === 'ready' && <div className="text-4xl text-gray-400 h-28 pt-8">+</div>}{subPhase === 'sound' && <div className="text-5xl h-28 pt-6">🔊</div>}{subPhase === 'feedback' && <><div className="h-28 pt-8 text-xl font-semibold text-gray-700">{formalFeedback}</div>{pendingPayloadRef.current && <button type="button" className="btn-secondary" onClick={() => { const payload = pendingPayloadRef.current; if (payload) void persistFormal(payload) }}>重试保存</button>}</>}<button type="button" aria-label="反应按键" className="btn-primary min-h-16 min-w-48 mt-4" onPointerDown={respond} onClick={(event) => { if (event.detail === 0) respond() }}>听到声音按这里 / 空格</button></div></CognitiveFocusStage>
}
