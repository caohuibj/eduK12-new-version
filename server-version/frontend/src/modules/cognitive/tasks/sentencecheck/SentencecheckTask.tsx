import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { SentencecheckConfig, SentencecheckTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { buildSentencecheckTrials, SENTENCECHECK_PRACTICE_TRIALS, type SentenceColor, type SentenceShape } from './prng'

const MAX_PRACTICE_ATTEMPTS = 2

type Phase = 'instruction' | 'practice' | 'formal' | 'blocked'
type SubPhase = 'fixation' | 'stimulus' | 'feedback'

const COLOR_HEX: Record<SentenceColor, string> = { red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308' }

const ShapeFigure: React.FC<{ shape: SentenceShape; color: SentenceColor }> = ({ shape, color }) => (
  <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="目标图形">
    {shape === 'circle' && <circle cx="60" cy="60" r="42" fill={COLOR_HEX[color]} />}
    {shape === 'square' && <rect x="20" y="20" width="80" height="80" fill={COLOR_HEX[color]} />}
    {shape === 'triangle' && <polygon points="60,16 104,102 16,102" fill={COLOR_HEX[color]} />}
  </svg>
)

export const SentencecheckTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as SentencecheckConfig
  const totalTrials = config?.totalTrials ?? 30
  const trueRatio = config?.trueRatio ?? 0.5
  const negationRatio = config?.negationRatio ?? 0.5
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
  const trials = useMemo(() => buildSentencecheckTrials(taskContext.randomSeed, totalTrials, trueRatio, negationRatio), [taskContext.randomSeed, totalTrials, trueRatio, negationRatio])
  const currentTrial = trials[trialIndex]

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

  const submitFormal = useCallback(async (response: boolean | null) => {
    if (phase !== 'formal' || subPhase !== 'stimulus' || !currentTrial || submittingRef.current) return
    submittingRef.current = true
    const payload: SentencecheckTrialPayload = {
      shape: currentTrial.shape,
      color: currentTrial.color,
      questionKind: currentTrial.questionKind,
      negated: currentTrial.negated,
      askedValue: currentTrial.askedValue,
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
    const timer = window.setTimeout(() => { void submitFormal(null) }, timeoutMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, timeoutMs, submitFormal])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const handleResponse = useCallback((response: boolean) => {
    if (phase === 'practice') {
      const trial = SENTENCECHECK_PRACTICE_TRIALS[practiceIndex]
      if (subPhase !== 'stimulus' || !trial) return
      const actualValue = trial.questionKind === 'shape' ? '圆形' : '红色'
      const statementTrue = trial.negated ? trial.askedValue !== actualValue : trial.askedValue === actualValue
      const correct = response === statementTrue
      setPracticeCorrect((current) => { const next = [...current]; next[practiceIndex] = correct; return next })
      setPracticeFeedback(correct ? '正确：先核对句子说的属性，再与图片比较。' : '再核对一次：句子的属性值与图片实际一致吗？注意“不是”。')
      setSubPhase('feedback'); return
    }
    void submitFormal(response)
  }, [phase, practiceIndex, subPhase])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (event.key === '1') { event.preventDefault(); handleResponse(true) }
      if (event.key === '2') { event.preventDefault(); handleResponse(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleResponse])

  const startPractice = useCallback(() => { setPracticeIndex(0); setPracticeCorrect([]); setPracticeFeedback(null); setSubPhase('fixation'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    if (practiceIndex + 1 < SENTENCECHECK_PRACTICE_TRIALS.length) { setPracticeIndex((current) => current + 1); setPracticeFeedback(null); setSubPhase('fixation'); return }
    const passed = practiceCorrect.length === SENTENCECHECK_PRACTICE_TRIALS.length && practiceCorrect.every(Boolean)
    if (passed) { setFormalFeedback(null); setSubPhase('fixation'); setPhase('formal') }
    else if (practiceAttempt < MAX_PRACTICE_ATTEMPTS) { setPracticeAttempt((current) => current + 1); setPracticeIndex(0); setPracticeCorrect([]); setPracticeFeedback(null); setSubPhase('fixation'); setPhase('instruction') }
    else setPhase('blocked')
  }, [practiceIndex, practiceCorrect, practiceAttempt])

  const ResponseButtons: React.FC<{ show: boolean }> = ({ show }) => show ? (
    <div className="grid grid-cols-2 gap-3 max-w-md mx-auto mt-4">
      <button type="button" onPointerDown={() => handleResponse(true)} onClick={(event) => { if (event.detail === 0) handleResponse(true) }} onKeyDown={(event) => { if (event.repeat) event.preventDefault() }} className="btn-secondary min-h-12">1 · 相符</button>
      <button type="button" onPointerDown={() => handleResponse(false)} onClick={(event) => { if (event.detail === 0) handleResponse(false) }} onKeyDown={(event) => { if (event.repeat) event.preventDefault() }} className="btn-secondary min-h-12">2 · 不相符</button>
    </div>
  ) : null

  if (phase === 'instruction') return <CognitiveTaskIntro title="句图验证推理" description={<p>每题会给一句话和一张图形。请判断句子与图片是否相符：相符按「相符」，不符按「不相符」。注意“不是”这样的否定说法。</p>} hint={<><p>按键 1/2 或点击按钮作答；练习不计入成绩。</p></>} actionLabel={practiceAttempt > 1 ? '重新开始练习' : '开始练习'} onAction={startPractice} />
  if (phase === 'blocked') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700 mb-4">练习尚未通过，本次正式测评未开始。</p><button type="button" className="btn-secondary" onClick={() => window.history.back()}>返回</button></div>

  if (phase === 'practice') {
    const trial = SENTENCECHECK_PRACTICE_TRIALS[practiceIndex]
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 {practiceIndex + 1} / {SENTENCECHECK_PRACTICE_TRIALS.length} · 第 {practiceAttempt} 轮 · 不计入成绩</div>{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-28 pt-8">+</div>}{subPhase === 'stimulus' && trial && <><p className="text-2xl font-semibold text-gray-800 pt-4">{trial.sentence}</p><div className="flex justify-center pt-3"><ShapeFigure shape={trial.shape} color={trial.color} /></div></>}{subPhase === 'feedback' && <div className="h-28 pt-8 text-gray-700">{practiceFeedback}</div>}<ResponseButtons show={subPhase === 'stimulus'} />{subPhase === 'feedback' && <button type="button" onClick={advancePractice} className="btn-primary">{practiceIndex + 1 >= SENTENCECHECK_PRACTICE_TRIALS.length ? practiceCorrect.every(Boolean) ? '开始正式测评' : practiceAttempt < MAX_PRACTICE_ATTEMPTS ? '重新练习' : '结束' : '下一个'}</button>}</div>
  }

  if (!currentTrial) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return <CognitiveFocusStage ariaLabel="句图验证推理正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8">{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-40 pt-10">+</div>}{subPhase === 'stimulus' && <><p className="text-2xl font-semibold text-gray-800 pt-4">{currentTrial.sentence}</p><div className="flex justify-center pt-3"><ShapeFigure shape={currentTrial.shape} color={currentTrial.color} /></div></>}{subPhase === 'feedback' && <div className="h-40 pt-10 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{subPhase === 'stimulus' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<ResponseButtons show={subPhase === 'stimulus'} /><p className="text-xs text-gray-400 mt-6">按键 1 = 相符、2 = 不相符，或点击按钮作答</p></div></CognitiveFocusStage>
}
