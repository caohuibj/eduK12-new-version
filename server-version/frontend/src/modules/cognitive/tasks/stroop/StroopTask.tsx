import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { StroopColor, StroopConfig, StroopTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { buildStroopTrials, type StroopStimulus } from './prng'

const COLORS: StroopColor[] = ['red', 'green', 'blue', 'yellow']
const COLOR_LABEL: Record<StroopColor, string> = { red: '红', green: '绿', blue: '蓝', yellow: '黄' }
const COLOR_HEX: Record<StroopColor, string> = { red: '#ef4444', green: '#22c55e', blue: '#3b82f6', yellow: '#eab308' }
const PRACTICE_TRIALS: StroopStimulus[] = [{ word: '红', inkColor: 'red' }, { word: '红', inkColor: 'green' }]
const MAX_PRACTICE_ATTEMPTS = 2

type Phase = 'instruction' | 'practice' | 'formal' | 'blocked'
type SubPhase = 'fixation' | 'stimulus' | 'feedback'

export const StroopTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as StroopConfig
  const totalTrials = config?.totalTrials ?? 24
  const congruentRatio = config?.congruentRatio ?? 0.5
  const fixationMs = config?.fixationMs ?? 500
  const stimulusDurationMs = config?.stimulusDurationMs ?? 2000
  const isiMs = config?.isiMs ?? 500
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
  const trials = useMemo(() => buildStroopTrials(taskContext.randomSeed, totalTrials, congruentRatio), [taskContext.randomSeed, totalTrials, congruentRatio])
  const currentTrial = trials[trialIndex]

  useEffect(() => {
    if (phase !== 'formal' || !currentTrial) return
    setFormalFeedback(null); interruptedRef.current = false; setSubPhase('fixation')
  }, [phase, trialIndex, currentTrial])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || subPhase !== 'fixation') return
    const delay = phase === 'practice' ? 400 : fixationMs + (trialIndex > 0 ? isiMs : 0)
    const timer = window.setTimeout(() => { onsetRef.current = performance.now(); setSubPhase('stimulus') }, delay)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, trialIndex, fixationMs, isiMs])

  const submitFormal = useCallback(async (response: StroopColor | null) => {
    if (phase !== 'formal' || subPhase !== 'stimulus' || !currentTrial || submittingRef.current) return
    submittingRef.current = true
    const payload: StroopTrialPayload = {
      word: currentTrial.word,
      inkColor: currentTrial.inkColor,
      response,
      rtMs: response === null || onsetRef.current === null ? null : Math.max(0, Math.round(performance.now() - onsetRef.current)),
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
    const timer = window.setTimeout(() => { void submitFormal(null) }, stimulusDurationMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, stimulusDurationMs, submitFormal])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const handleResponse = useCallback((color: StroopColor) => {
    if (phase === 'practice') {
      const trial = PRACTICE_TRIALS[practiceIndex]
      if (subPhase !== 'stimulus' || !trial) return
      const correct = color === trial.inkColor
      setPracticeCorrect((current) => { const next = [...current]; next[practiceIndex] = correct; return next })
      setPracticeFeedback(correct ? '正确：只看字体颜色。' : '请忽略字义，只看字体颜色。'); setSubPhase('feedback'); return
    }
    void submitFormal(color)
  }, [phase, practiceIndex, subPhase, submitFormal])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const color = COLORS[Number(event.key) - 1]
      if (color) { event.preventDefault(); handleResponse(color) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleResponse])

  const startPractice = useCallback(() => { setPracticeIndex(0); setPracticeAttempt(1); setPracticeCorrect([]); setPracticeFeedback(null); setSubPhase('fixation'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    if (practiceIndex + 1 < PRACTICE_TRIALS.length) { setPracticeIndex((current) => current + 1); setPracticeFeedback(null); setSubPhase('fixation'); return }
    const passed = practiceCorrect.length === PRACTICE_TRIALS.length && practiceCorrect.every(Boolean)
    if (passed) { setFormalFeedback(null); setSubPhase('fixation'); setPhase('formal') }
    else if (practiceAttempt < MAX_PRACTICE_ATTEMPTS) { setPracticeAttempt((current) => current + 1); setPracticeIndex(0); setPracticeCorrect([]); setPracticeFeedback(null); setSubPhase('fixation') }
    else setPhase('blocked')
  }, [practiceIndex, practiceCorrect, practiceAttempt])

  if (phase === 'instruction') return <CognitiveTaskIntro title="色词 Stroop" description={<p>请忽略汉字含义，只报告文字显示的字体颜色。正式测验包含一致与冲突试次。</p>} hint={<><p>按键 1–4 或点击颜色按钮作答；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'blocked') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700 mb-4">练习尚未通过，本次正式测评未开始。</p><button type="button" className="btn-secondary" onClick={() => window.history.back()}>返回</button></div>

  if (phase === 'practice') {
    const trial = PRACTICE_TRIALS[practiceIndex]
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 {practiceIndex + 1} / {PRACTICE_TRIALS.length} · 第 {practiceAttempt} 轮 · 不计入成绩</div>{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-24 pt-6">+</div>}{subPhase === 'stimulus' && trial && <div className="text-6xl font-bold h-24 pt-3" style={{ color: COLOR_HEX[trial.inkColor] }}>{trial.word}</div>}{subPhase === 'feedback' && <div className="h-24 pt-6 text-gray-700">{practiceFeedback}</div>}{subPhase === 'stimulus' && <div className="grid grid-cols-2 gap-2 max-w-md mx-auto mt-4 sm:grid-cols-4">{COLORS.map((color, index) => <button key={color} type="button" onPointerDown={() => handleResponse(color)} className="btn-secondary min-h-12">{index + 1} · {COLOR_LABEL[color]}</button>)}</div>}{subPhase === 'feedback' && <button type="button" onClick={advancePractice} className="btn-primary">{practiceIndex + 1 >= PRACTICE_TRIALS.length ? practiceCorrect.every(Boolean) ? '开始正式测评' : practiceAttempt < MAX_PRACTICE_ATTEMPTS ? '重新练习' : '结束' : '下一个'}</button>}</div>
  }

  if (!currentTrial) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return <CognitiveFocusStage ariaLabel="Stroop 正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8">{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-28 pt-8">+</div>}{subPhase === 'stimulus' && <div className="text-6xl font-bold h-28 pt-3" style={{ color: COLOR_HEX[currentTrial.inkColor] }}>{currentTrial.word}</div>}{subPhase === 'feedback' && <div className="h-28 pt-8 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{subPhase === 'stimulus' && <div className="grid grid-cols-2 gap-3 max-w-md mx-auto mt-4 sm:grid-cols-4">{COLORS.map((color, index) => <button key={color} type="button" onPointerDown={() => handleResponse(color)} className="btn-secondary min-h-12">{index + 1} · {COLOR_LABEL[color]}</button>)}</div>}<p className="text-xs text-gray-400 mt-6">按键 1–4 或点击颜色按钮作答</p></div></CognitiveFocusStage>
}
