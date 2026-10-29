import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { ReadingcompConfig, ReadingcompTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { buildReadingcompItems, READINGCOMP_PRACTICE_ITEM } from './prng'

type Phase = 'instruction' | 'practice' | 'formal' | 'blocked'
type SubPhase = 'fixation' | 'stimulus' | 'feedback'

const PRACTICE_ANSWER = 1

export const ReadingcompTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as ReadingcompConfig
  const totalTrials = config?.totalTrials ?? 30
  const fixationMs = config?.fixationMs ?? 400
  const timeoutMs = config?.timeoutMs ?? 15000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('fixation')
  const [practiceChoice, setPracticeChoice] = useState<number | null>(null)
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const interruptedRef = useRef(false)
  const onsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const items = useMemo(() => buildReadingcompItems(taskContext.randomSeed, totalTrials), [taskContext.randomSeed, totalTrials])
  const currentTrial = items[trialIndex]

  useEffect(() => {
    if (phase !== 'formal' || !currentTrial) return
    setFormalFeedback(null); interruptedRef.current = false; setSubPhase('fixation')
  }, [phase, trialIndex, currentTrial])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || subPhase !== 'fixation') return
    const delay = phase === 'practice' ? 400 : fixationMs + (trialIndex > 0 ? 200 : 0)
    const timer = window.setTimeout(() => { onsetRef.current = performance.now(); setSubPhase('stimulus') }, delay)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, trialIndex, fixationMs])

  const submitFormal = useCallback(async (responseIndex: number | null) => {
    if (phase !== 'formal' || subPhase !== 'stimulus' || !currentTrial || submittingRef.current) return
    submittingRef.current = true
    const payload: ReadingcompTrialPayload = {
      itemId: currentTrial.itemId,
      responseIndex,
      rtMs: responseIndex === null || onsetRef.current === null ? null : Math.max(0, Math.round(performance.now() - onsetRef.current)),
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

  const handlePracticeChoice = useCallback((choice: number) => {
    if (subPhase !== 'stimulus' || practiceChoice !== null) return
    setPracticeChoice(choice)
    setPracticeFeedback(choice === PRACTICE_ANSWER ? '正确：上课更有精神。正式测验不再提示。' : '再读一遍：坚持晨跑后上课怎么了？')
    setSubPhase('feedback')
  }, [subPhase, practiceChoice])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const index = Number(event.key) - 1
      if (index >= 0 && index <= 3) {
        event.preventDefault()
        if (phase === 'practice') handlePracticeChoice(index)
        else void submitFormal(index)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, handlePracticeChoice, submitFormal])

  const startPractice = useCallback(() => { setPracticeChoice(null); setPracticeFeedback(null); setSubPhase('fixation'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    setFormalFeedback(null); setSubPhase('fixation'); setPhase('formal')
  }, [])

  const item = phase === 'practice' ? READINGCOMP_PRACTICE_ITEM : currentTrial

  if (phase === 'instruction') return <CognitiveTaskIntro title="阅读理解" description={<p>每题给出一对词的关系（例如“医生 对于 病人”），请从四个选项中选出与该关系最匹配的词。</p>} hint={<><p>按键 1–4 或点击选项作答；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'blocked') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700 mb-4">练习未完成，本次正式测评未开始。</p><button type="button" className="btn-secondary" onClick={() => window.history.back()}>返回</button></div>

  const OptionButtons: React.FC<{ show: boolean }> = ({ show }) => show ? (
    <div className="grid grid-cols-2 gap-3 max-w-xl mx-auto mt-5">
      {item!.options.map((option, index) => (
        <button key={option} type="button" onPointerDown={() => (phase === 'practice' ? handlePracticeChoice(index) : void submitFormal(index))} className="btn-secondary min-h-12 text-left px-4">
          <span className="text-gray-400 mr-2">{index + 1} ·</span>{option}
        </button>
      ))}
    </div>
  ) : null

  if (phase === 'practice') {
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 · 不计入成绩</div>{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-24 pt-8">+</div>}{subPhase !== 'fixation' && <p className="text-xl font-semibold text-gray-800 pt-4">{item!.passage}</p>}<OptionButtons show={subPhase === 'stimulus'} />{subPhase === 'feedback' && <><div className="h-16 pt-4 text-gray-700">{practiceFeedback}</div><button type="button" className="btn-primary" onClick={advancePractice}>开始正式测评</button></>}</div>
  }

  if (!currentTrial) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return <CognitiveFocusStage ariaLabel="阅读理解正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">第 {trialIndex + 1} / {totalTrials} 题</div>{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-28 pt-10">+</div>}{subPhase === 'stimulus' && <p className="text-xl font-semibold text-gray-800 pt-6">{currentTrial.passage}</p>}{subPhase === 'feedback' && <div className="h-28 pt-10 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{subPhase === 'stimulus' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<OptionButtons show={subPhase === 'stimulus'} /><p className="text-xs text-gray-400 mt-5">按键 1–4 或点击选项作答</p></div></CognitiveFocusStage>
}
