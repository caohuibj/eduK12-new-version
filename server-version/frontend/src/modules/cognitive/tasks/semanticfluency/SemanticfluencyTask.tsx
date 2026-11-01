import { reportIntroV3 } from './report-intro-v3'
import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { SemanticfluencyConfig, SemanticfluencyTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { buildSemanticfluencyRounds, SEMANTICFLUENCY_PRACTICE_CATEGORY } from './prng'
import { CATEGORY_LABELS } from './bank'

type Phase = 'instruction' | 'practice' | 'formal' | 'completed'
type PhaseStep = 'fixation' | 'typing' | 'feedback'

export const SemanticfluencyTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as SemanticfluencyConfig
  const totalTrials = config?.totalTrials ?? 4
  const durationMs = config?.durationMs ?? 45000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [step, setStep] = useState<PhaseStep>('fixation')
  const [input, setInput] = useState('')
  const [responses, setResponses] = useState<string[]>([])
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const [timeLeftMs, setTimeLeftMs] = useState(0)
  const interruptedRef = useRef(false)
  const typingStartRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const pendingSubmissionRef = useRef<SemanticfluencyTrialPayload | null>(null)
  const [submissionFailed, setSubmissionFailed] = useState(false)
  const rounds = useMemo(() => buildSemanticfluencyRounds(taskContext.randomSeed, totalTrials), [taskContext.randomSeed, totalTrials])
  const currentRound = rounds[trialIndex]
  const activeCategory = phase === 'practice' ? SEMANTICFLUENCY_PRACTICE_CATEGORY : currentRound?.category

  useEffect(() => {
    if (phase !== 'formal') return
    pendingSubmissionRef.current = null; setSubmissionFailed(false)
    setFormalFeedback(null); setResponses([]); setInput(''); setStep('fixation'); interruptedRef.current = false
  }, [trialIndex])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || step !== 'fixation') return
    const timer = window.setTimeout(() => {
      typingStartRef.current = performance.now()
      setTimeLeftMs(durationMs)
      setStep('typing')
    }, 400)
    return () => window.clearTimeout(timer)
  }, [phase, step, trialIndex, durationMs])

  useEffect(() => {
    if (step !== 'typing') return
    const interval = window.setInterval(() => {
      if (typingStartRef.current === null) return
      const elapsed = performance.now() - typingStartRef.current
      const remaining = Math.max(0, durationMs - elapsed)
      setTimeLeftMs(remaining)
      if (remaining <= 0) window.clearInterval(interval)
    }, 250)
    return () => window.clearInterval(interval)
  }, [step, durationMs])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const finishRound = useCallback(async (roundResponses: string[]) => {
    const payload: SemanticfluencyTrialPayload = pendingSubmissionRef.current ?? {
      category: activeCategory!,
      responses: roundResponses,
      responseDurationMs: typingStartRef.current === null ? 0 : Math.max(0, Math.round(performance.now() - typingStartRef.current)),
      interrupted: interruptedRef.current,
    }
    if (phase === 'practice') {
      setPracticeFeedback(`练习结束：你输入了 ${roundResponses.length} 个词。正式测验共 ${totalTrials} 轮。`)
      setStep('feedback')
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    pendingSubmissionRef.current = payload; setSubmissionFailed(false)
    setFormalFeedback('已记录，下一轮准备中'); setStep('feedback')
    try {
      const accepted = await Promise.resolve().then(() => onTrialComplete(payload)).catch(() => false)
      if (accepted === false) { setFormalFeedback('提交尚未确认，请重试已记录的答案'); setSubmissionFailed(true); return }
      pendingSubmissionRef.current = null
      setResponses([])
      setInput('')
      if (trialIndex + 1 >= totalTrials) { setPhase('completed'); await onTaskComplete?.() }
    } finally { submittingRef.current = false }
  }, [phase, activeCategory, totalTrials, onTrialComplete, trialIndex, onTaskComplete])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || step !== 'typing') return
    const startedAt = typingStartRef.current
    if (startedAt === null) return
    const capTimer = window.setTimeout(() => { void finishRound(responses) }, Math.max(0, durationMs - (performance.now() - startedAt)))
    return () => window.clearTimeout(capTimer)
  }, [phase, step, responses, durationMs, finishRound])

  const startPractice = useCallback(() => { setResponses([]); setInput(''); setPracticeFeedback(null); setStep('fixation'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    setFormalFeedback(null); setResponses([]); setInput(''); setStep('fixation'); setPhase('formal')
  }, [])

  if (phase === 'instruction') return <CognitiveTaskIntro title={config.report?.reportVersion === '3.0.0' ? reportIntroV3.title : "语义流畅性"} description={config.report?.reportVersion === '3.0.0' ? <p>{reportIntroV3.description}</p> : <p>每轮给一个类别（如“动物”）。限时内把属于这个类别的词尽量多、尽量快地输入，想到就打，不用管顺序。</p>} hint={config.report?.reportVersion === '3.0.0' ? <p>本次正式任务共 {totalTrials}{reportIntroV3.unit}。{reportIntroV3.hint}</p> : <><p>每轮限时 {Math.round(durationMs / 1000)} 秒；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'completed') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700">已全部完成，正在生成结果…</p></div>

  if (phase === 'practice') {
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 · 不计入成绩</div>{step === 'fixation' && <div className="text-4xl text-gray-400 h-24 pt-8">+</div>}{step !== 'fixation' && <><p className="text-2xl font-bold text-gray-800 pt-2">类别：{CATEGORY_LABELS[activeCategory!]}</p><p className="text-sm text-gray-500">{Math.ceil(timeLeftMs / 1000)} 秒</p></>}{step === 'typing' && <><input type="text" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.repeat && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && input.trim() && typingStartRef.current !== null && performance.now() - typingStartRef.current < durationMs) { event.preventDefault(); setResponses((current) => [...current, input.trim()]); setInput('') } }} className="mt-3 w-full max-w-md mx-auto block border border-gray-300 rounded px-3 py-2" placeholder="输入词语后按回车" autoFocus /><p className="text-sm text-gray-500 mt-2">已输入 {responses.length} 个</p><button type="button" className="btn-primary mt-3" onClick={() => void finishRound(responses)}>提前结束本轮</button></>}{step === 'feedback' && <><div className="h-16 pt-4 text-gray-700">{practiceFeedback}</div><button type="button" className="btn-primary" onClick={advancePractice}>开始正式测评</button></>}</div>
  }

  if (!currentRound) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return <CognitiveFocusStage ariaLabel="语义流畅性正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">第 {trialIndex + 1} / {totalTrials} 轮</div>{step === 'fixation' && <div className="text-4xl text-gray-400 h-24 pt-10">+</div>}{step !== 'fixation' && <><p className="text-2xl font-bold text-gray-800 pt-2">类别：{CATEGORY_LABELS[activeCategory!]}</p><p className="text-sm text-gray-500">{Math.ceil(timeLeftMs / 1000)} 秒</p></>}{step === 'typing' && <><input type="text" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.repeat && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && input.trim() && typingStartRef.current !== null && performance.now() - typingStartRef.current < durationMs) { event.preventDefault(); setResponses((current) => [...current, input.trim()]); setInput('') } }} className="mt-3 w-full max-w-md mx-auto block border border-gray-300 rounded px-3 py-2" placeholder="输入词语后按回车" autoFocus /><p className="text-sm text-gray-500 mt-2">已输入 {responses.length} 个</p><button type="button" className="btn-secondary mt-3" onClick={() => void finishRound(responses)}>提前结束本轮</button></>}{step === 'feedback' && <div className="h-24 pt-8 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{step === 'typing' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<p className="text-xs text-gray-400 mt-4">想到就输入 · 按回车确认 · 不限顺序</p>{submissionFailed && <button type="button" className="btn-primary mt-3" onClick={() => void finishRound([])}>重试提交已记录答案</button>}</div></CognitiveFocusStage>
}
