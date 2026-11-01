import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { AuditorynbackConfig, AuditorynbackTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { prepareAudioContext, playTone, type CognitiveAudio } from '../shared/audio'
import { generateAuditoryNbackPracticeSequence, generateAuditoryNbackSequence, PRACTICE_SEQUENCE_LENGTH } from './generator'

const MAX_PRACTICE_ATTEMPTS = 3

type Phase = 'instruction' | 'practice-instruction' | 'practice' | 'formal' | 'blocked'
type SubPhase = 'sound' | 'isi' | 'feedback'

export const AuditorynbackTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as AuditorynbackConfig
  const nLevel = config?.nLevel ?? 2
  const totalTrials = config?.totalTrials ?? 40
  const targetRatio = config?.targetRatio ?? 0.3
  const stimulusMs = config?.stimulusMs ?? 500
  const isiMs = config?.isiMs ?? 1500
  const toneFrequenciesHz = config?.toneFrequenciesHz ?? [262, 330, 392, 494, 587]
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('sound')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceAttempt, setPracticeAttempt] = useState(1)
  const [practiceCorrect, setPracticeCorrect] = useState<boolean[]>([])
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const audioRef = useRef<CognitiveAudio | null>(null)
  const interruptedRef = useRef(false)
  const onsetRef = useRef<number | null>(null)
  const respondedRef = useRef(false)
  const rtRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const pendingPayloadRef = useRef<AuditorynbackTrialPayload | null>(null)
  const formalSequence = useMemo(
    () => generateAuditoryNbackSequence(taskContext.randomSeed, totalTrials, nLevel, targetRatio, toneFrequenciesHz.length),
    [taskContext.randomSeed, totalTrials, nLevel, targetRatio, toneFrequenciesHz.length],
  )
  const practiceSequence = useMemo(
    () => generateAuditoryNbackPracticeSequence(taskContext.randomSeed, nLevel, toneFrequenciesHz.length),
    [taskContext.randomSeed, nLevel, toneFrequenciesHz.length],
  )
  const activeSequence = phase === 'practice' ? practiceSequence : formalSequence
  const currentIndex = phase === 'practice' ? practiceIndex : trialIndex
  const currentToneIndex = activeSequence[currentIndex]

  useEffect(() => {
    if (phase !== 'formal' || activeSequence[trialIndex] === undefined) return
    interruptedRef.current = false; respondedRef.current = false; rtRef.current = null; onsetRef.current = null
    setFormalFeedback(null); setSubPhase('sound')
  }, [phase, trialIndex, activeSequence])

  const finishPracticeTrial = useCallback(() => {
    const index = practiceIndex
    const responded = respondedRef.current
    let correct: boolean
    let feedback: string
    if (index < nLevel) {
      correct = !responded
      feedback = responded ? `前 ${nLevel} 个音只听不按，先记住它们。` : '正确：先听、先记住。'
    } else {
      const isMatch = activeSequence[index] === activeSequence[index - nLevel]
      if (isMatch) {
        correct = responded
        feedback = responded ? `正确：这个音和往前第${nLevel}个相同。` : '刚才应该按键——它是匹配音。'
      } else {
        correct = !responded
        feedback = responded ? `这不是匹配音——要与往前第${nLevel}个比较。` : '正确：不一样，不用按。'
      }
    }
    setPracticeCorrect((current) => { const next = [...current]; next[index] = correct; return next })
    setPracticeFeedback(feedback)
    setSubPhase('feedback')
  }, [practiceIndex, nLevel, activeSequence])

  const persistFormal = useCallback(async (payload: AuditorynbackTrialPayload) => {
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

  const submitFormal = useCallback(async () => {
    if (phase !== 'formal' || submittingRef.current || pendingPayloadRef.current || activeSequence[trialIndex] === undefined) return
    const responded = respondedRef.current
    await persistFormal({
      trialIndex,
      toneIndex: activeSequence[trialIndex],
      responded,
      rtMs: responded ? rtRef.current : null,
      interrupted: interruptedRef.current,
      audioLatencyMs: audioRef.current?.latencyMs ?? null,
    })
  }, [phase, activeSequence, trialIndex, persistFormal])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || subPhase !== 'sound') return
    const audio = audioRef.current
    if (!audio || currentToneIndex === undefined) return
    playTone(audio, toneFrequenciesHz[currentToneIndex], stimulusMs)
    onsetRef.current = performance.now()
    const timer = window.setTimeout(() => setSubPhase('isi'), stimulusMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, currentToneIndex, toneFrequenciesHz, stimulusMs])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || subPhase !== 'isi') return
    const timer = window.setTimeout(() => {
      if (phase === 'practice') finishPracticeTrial()
      else void submitFormal()
    }, isiMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, isiMs, finishPracticeTrial, submitFormal])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const respond = useCallback(() => {
    if ((phase !== 'formal' && phase !== 'practice') || (subPhase !== 'sound' && subPhase !== 'isi') || submittingRef.current || pendingPayloadRef.current) return
    if (respondedRef.current) return
    respondedRef.current = true
    rtRef.current = onsetRef.current === null ? null : Math.max(0, Math.round(performance.now() - onsetRef.current))
  }, [phase, subPhase])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || (phase !== 'practice' && phase !== 'formal') || (subPhase !== 'sound' && subPhase !== 'isi')) return
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
    setPracticeIndex(0); setPracticeAttempt(1); setPracticeCorrect([]); setPracticeFeedback(null)
    respondedRef.current = false; rtRef.current = null
    setSubPhase('sound'); setPhase('practice')
  }, [toneFrequenciesHz, stimulusMs])

  const advancePractice = useCallback(() => {
    if (practiceIndex + 1 < PRACTICE_SEQUENCE_LENGTH) {
      setPracticeIndex((current) => current + 1); setPracticeFeedback(null)
      respondedRef.current = false; rtRef.current = null; setSubPhase('sound'); return
    }
    const passed = practiceCorrect.length === PRACTICE_SEQUENCE_LENGTH && practiceCorrect.every(Boolean)
    if (passed) { setFormalFeedback(null); respondedRef.current = false; rtRef.current = null; setSubPhase('sound'); setPhase('formal') }
    else if (practiceAttempt < MAX_PRACTICE_ATTEMPTS) {
      setPracticeAttempt((current) => current + 1); setPracticeIndex(0); setPracticeCorrect([]); setPracticeFeedback(null)
      respondedRef.current = false; rtRef.current = null; setSubPhase('sound'); setPhase('practice-instruction')
    } else setPhase('blocked')
  }, [practiceIndex, practiceCorrect, practiceAttempt])

  if (phase === 'instruction' || phase === 'practice-instruction') return <CognitiveTaskIntro title="听觉 n-back 工作记忆" description={<p>你会听到一串高低不同的音。规则：新音和「往前第 {nLevel} 个」相同时，立刻按空格键（或点击按钮）。请在安静环境、戴耳机或调好音量后进行。</p>} hint={<><p>点「开始练习」后开始播放练习音。请先调好舒适音量；前 {nLevel} 个音只听不按。</p><p>例如二音比较时，低音→高音→低音，第三个音与第一个相同，此时按一次。不同则不按；声音后的空档仍可回答，下一声开始后不要补答。每题只记首按，按住不连答。练习共8个音，全部正确才继续；失败重呈完整说明，最多3轮。练习不计入成绩。</p></>} onAction={() => { if (phase === 'practice-instruction') setPhase('practice'); else void startPractice() }} />
  if (phase === 'blocked') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700 mb-4">{practiceCorrect.length > 0 ? '练习尚未通过，本次正式测评未开始。' : '当前设备无法播放音频，本次测评未开始。请检查设备音量与浏览器音频权限。'}</p><button type="button" className="btn-secondary" onClick={() => window.history.back()}>返回</button></div>

  if (phase === 'practice') {
    const isWarmup = practiceIndex < nLevel
    return <CognitiveFocusStage ariaLabel="听觉 n-back 练习"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500 mb-4">练习 {practiceIndex + 1} / {PRACTICE_SEQUENCE_LENGTH} · 第 {practiceAttempt} 轮 · 不计入成绩</div>{subPhase === 'sound' && <div className="text-5xl h-28 pt-6">🔊</div>}{subPhase === 'isi' && <div className="text-4xl text-gray-400 h-28 pt-8">和往前第 {nLevel} 个比</div>}{subPhase === 'feedback' && <div className="h-28 pt-8 text-gray-700">{practiceFeedback}</div>}<button type="button" className="btn-primary min-h-16 min-w-48 mt-4" onPointerDown={respond} onClick={(event) => { if (event.detail === 0) respond() }}>{isWarmup ? '前段只听，不用按' : '是匹配音就按'}</button>{subPhase === 'feedback' && <button type="button" onClick={advancePractice} className="btn-primary mt-4">{practiceIndex + 1 >= PRACTICE_SEQUENCE_LENGTH ? practiceCorrect.filter(Boolean).length === PRACTICE_SEQUENCE_LENGTH ? '开始正式测评' : practiceAttempt < MAX_PRACTICE_ATTEMPTS ? '重新练习' : '结束' : '下一个'}</button>}</div></CognitiveFocusStage>
  }

  if (currentToneIndex === undefined) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return <CognitiveFocusStage ariaLabel="听觉 n-back 正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-400">第 {trialIndex + 1} / {totalTrials} 题</div>{subPhase === 'sound' && <div className="text-5xl h-28 pt-6">🔊</div>}{subPhase === 'isi' && <div className="text-4xl text-gray-400 h-28 pt-8">…</div>}{subPhase === 'feedback' && <><div className="h-28 pt-8 text-xl font-semibold text-gray-700">{formalFeedback}</div>{pendingPayloadRef.current && <button type="button" className="btn-secondary" onClick={() => { const payload = pendingPayloadRef.current; if (payload) void persistFormal(payload) }}>重试保存</button>}</>}<button type="button" aria-label="匹配按键" className="btn-primary min-h-16 min-w-48 mt-4" onPointerDown={respond} onClick={(event) => { if (event.detail === 0) respond() }}>和往前第 {nLevel} 个相同就按 / 空格</button></div></CognitiveFocusStage>
}
