import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { ArithverifyConfig, ArithverifyTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { ARITHVERIFY_PRACTICE_TRIALS, buildArithverifyTrials } from './prng'

const MAX_PRACTICE_ATTEMPTS = 2

type Phase = 'instruction' | 'practice' | 'formal' | 'blocked'
type SubPhase = 'fixation' | 'stimulus' | 'feedback'

export const ArithverifyTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as ArithverifyConfig
  const totalTrials = config?.totalTrials ?? 30
  const operandMax = config?.operandMax ?? 10
  const trueRatio = config?.trueRatio ?? 0.5
  const fixationMs = config?.fixationMs ?? 500
  const timeoutMs = config?.timeoutMs ?? 6000
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
    () => buildArithverifyTrials(taskContext.randomSeed, totalTrials, operandMax, trueRatio),
    [taskContext.randomSeed, totalTrials, operandMax, trueRatio]
  )
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
    const payload: ArithverifyTrialPayload = {
      leftOperand: currentTrial.leftOperand,
      rightOperand: currentTrial.rightOperand,
      displayedResult: currentTrial.displayedResult,
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
      const trial = ARITHVERIFY_PRACTICE_TRIALS[practiceIndex]
      if (subPhase !== 'stimulus' || !trial) return
      const correct = response === trial.isTrue
      setPracticeCorrect((current) => { const next = [...current]; next[practiceIndex] = correct; return next })
      setPracticeFeedback(correct ? '正确：先心算，再比较。' : '再算一次：先把两个数相加，再和给出的结果比较。')
      setSubPhase('feedback'); return
    }
    void submitFormal(response)
  }, [phase, practiceIndex, subPhase, submitFormal])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '1') { event.preventDefault(); handleResponse(true) }
      if (event.key === '2') { event.preventDefault(); handleResponse(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleResponse])

  const startPractice = useCallback(() => { setPracticeIndex(0); setPracticeAttempt(1); setPracticeCorrect([]); setPracticeFeedback(null); setSubPhase('fixation'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    if (practiceIndex + 1 < ARITHVERIFY_PRACTICE_TRIALS.length) { setPracticeIndex((current) => current + 1); setPracticeFeedback(null); setSubPhase('fixation'); return }
    const passed = practiceCorrect.length === ARITHVERIFY_PRACTICE_TRIALS.length && practiceCorrect.every(Boolean)
    if (passed) { setFormalFeedback(null); setSubPhase('fixation'); setPhase('formal') }
    else if (practiceAttempt < MAX_PRACTICE_ATTEMPTS) { setPracticeAttempt((current) => current + 1); setPracticeIndex(0); setPracticeCorrect([]); setPracticeFeedback(null); setSubPhase('fixation') }
    else setPhase('blocked')
  }, [practiceIndex, practiceCorrect, practiceAttempt])

  if (phase === 'instruction') return <CognitiveTaskIntro title="算术验证" description={<p>屏幕上会出现一个加法算式。心算两个数相加的结果，判断算式是否正确：正确按「对」，错误按「错」。</p>} hint={<><p>按键 1 = 对、2 = 错，或点击按钮作答；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'blocked') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700 mb-4">练习尚未通过，本次正式测评未开始。</p><button type="button" className="btn-secondary" onClick={() => window.history.back()}>返回</button></div>

  if (phase === 'practice') {
    const trial = ARITHVERIFY_PRACTICE_TRIALS[practiceIndex]
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 {practiceIndex + 1} / {ARITHVERIFY_PRACTICE_TRIALS.length} · 第 {practiceAttempt} 轮 · 不计入成绩</div>{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-24 pt-6">+</div>}{subPhase === 'stimulus' && trial && <div className="text-5xl font-bold text-gray-800 h-24 pt-4">{trial.leftOperand} + {trial.rightOperand} = {trial.displayedResult}</div>}{subPhase === 'feedback' && <div className="h-24 pt-6 text-gray-700">{practiceFeedback}</div>}{subPhase === 'stimulus' && <div className="grid grid-cols-2 gap-3 max-w-md mx-auto mt-4"><button type="button" onPointerDown={() => handleResponse(true)} className="btn-secondary min-h-12">1 · 对</button><button type="button" onPointerDown={() => handleResponse(false)} className="btn-secondary min-h-12">2 · 错</button></div>}{subPhase === 'feedback' && <button type="button" onClick={advancePractice} className="btn-primary">{practiceIndex + 1 >= ARITHVERIFY_PRACTICE_TRIALS.length ? practiceCorrect.every(Boolean) ? '开始正式测评' : practiceAttempt < MAX_PRACTICE_ATTEMPTS ? '重新练习' : '结束' : '下一个'}</button>}</div>
  }

  if (!currentTrial) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return <CognitiveFocusStage ariaLabel="算术验证正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8">{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-28 pt-8">+</div>}{subPhase === 'stimulus' && <div className="text-5xl font-bold text-gray-800 h-28 pt-8">{currentTrial.leftOperand} + {currentTrial.rightOperand} = {currentTrial.displayedResult}</div>}{subPhase === 'feedback' && <div className="h-28 pt-8 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{subPhase === 'stimulus' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}{subPhase === 'stimulus' && <div className="grid grid-cols-2 gap-3 max-w-md mx-auto mt-4"><button type="button" onPointerDown={() => handleResponse(true)} className="btn-secondary min-h-12">1 · 对</button><button type="button" onPointerDown={() => handleResponse(false)} className="btn-secondary min-h-12">2 · 错</button></div>}<p className="text-xs text-gray-400 mt-6">按键 1 = 对、2 = 错，或点击按钮作答</p></div></CognitiveFocusStage>
}
