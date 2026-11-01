import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { ProofreadConfig, ProofreadTrialPayload } from './types'
import { buildProofreadItems, PROOFREAD_PRACTICE_ITEM } from './prng'

type Phase = 'instruction' | 'practice' | 'formal'
type SubPhase = 'fixation' | 'stimulus' | 'feedback'

export const ProofreadTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete }) => {
  const config = taskContext.config as unknown as ProofreadConfig
  const { totalTrials, fixationMs, timeoutMs } = config
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('fixation')
  const [practiceChoice, setPracticeChoice] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [retry, setRetry] = useState(false)
  const interruptedRef = useRef(false)
  const onsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const pendingRef = useRef<ProofreadTrialPayload | null>(null)
  const items = useMemo(() => {
    if (config.stimulusSetVersion !== 'proofread-zh-v1.1.0') return null
    try { return buildProofreadItems(taskContext.randomSeed, totalTrials) } catch { return null }
  }, [config.stimulusSetVersion, taskContext.randomSeed, totalTrials])
  const currentTrial = items?.[trialIndex]

  useEffect(() => {
    if (phase !== 'formal' || !currentTrial) return
    setFeedback(null); setRetry(false); pendingRef.current = null
    interruptedRef.current = false; setSubPhase('fixation')
  }, [phase, trialIndex, currentTrial])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || subPhase !== 'fixation') return
    const timer = window.setTimeout(() => { onsetRef.current = performance.now(); setSubPhase('stimulus') }, phase === 'practice' ? 400 : fixationMs + (trialIndex > 0 ? 200 : 0))
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, trialIndex, fixationMs])

  const persistPending = useCallback(async () => {
    if (!pendingRef.current || submittingRef.current) return
    submittingRef.current = true; setRetry(false)
    setFeedback('正在保存本题…'); setSubPhase('feedback')
    let accepted: boolean | void
    try { accepted = await onTrialComplete(pendingRef.current) }
    catch { accepted = false }
    finally { submittingRef.current = false }
    if (accepted === false) { setFeedback('提交失败，已保留首次答案与用时，请重试提交。'); setRetry(true); return }
    setFeedback('作答已保存')
  }, [onTrialComplete])

  const submitFormal = useCallback((responseIndex: number | null) => {
    if (phase !== 'formal' || subPhase !== 'stimulus' || !currentTrial || pendingRef.current) return
    const elapsed = onsetRef.current === null ? 0 : Math.max(0, Math.round(performance.now() - onsetRef.current))
    // A delayed deadline callback must never turn a late click into an on-time answer.
    const expired = responseIndex === null || elapsed >= timeoutMs
    pendingRef.current = { itemId: currentTrial.itemId, responseIndex: expired ? null : responseIndex,
      rtMs: expired ? null : elapsed, interrupted: interruptedRef.current }
    void persistPending()
  }, [phase, subPhase, currentTrial, timeoutMs, persistPending])

  useEffect(() => {
    if (phase !== 'formal' || subPhase !== 'stimulus') return
    const timer = window.setTimeout(() => submitFormal(null), timeoutMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, timeoutMs, submitFormal])

  useEffect(() => {
    if (phase !== 'formal') return
    const listener = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', listener)
    return () => document.removeEventListener('visibilitychange', listener)
  }, [phase])

  const choosePractice = useCallback((choice: number) => {
    if (phase !== 'practice' || subPhase !== 'stimulus' || practiceChoice !== null) return
    setPracticeChoice(choice); setSubPhase('feedback')
  }, [phase, subPhase, practiceChoice])

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || !/^[1-4]$/.test(event.key)) return
      event.preventDefault()
      const choice = Number(event.key) - 1
      if (phase === 'practice') choosePractice(choice)
      else submitFormal(choice)
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [phase, choosePractice, submitFormal])

  const startPractice = () => { setPracticeChoice(null); setSubPhase('fixation'); setPhase('practice') }
  if (!items) return <div role="alert" className="card p-8">本次题库版本或题量不匹配，请返回任务页联系管理员；正式测验尚未开始。</div>
  if (trialIndex >= totalTrials) return <div role="status" className="card p-6 text-center">正式作答已保存，请使用页面上的“完成测评”按钮确认提交。</div>
  if (phase === 'instruction') return <CognitiveTaskIntro title="文本校对" description={<><p>每题给出一个句子和四个原句中的字词。句子里恰有一处错别字或“的／地”用法错误，请选出含错的那个字词；不要选择改正后的写法。</p><p className="mt-3">例如，“我先整里好书包”中的“整里”应写为“整理”，应选择原句里的“整里”。</p><p>发出消息前再看一遍，容易发现“已经”打成了“以经”；这里也要看原句实际写了什么。 这次任务只记录本次作答表现。</p></>} hint={<><p>按键 1–4 或点击选项作答。先求准确，再保持稳定节奏；每题最多 {timeoutMs / 1000} 秒，正式共 {totalTrials} 题。练习无时限且不计分，答对后才能开始；正式不显示正确答案。</p></>} onAction={startPractice} />
  if (phase === 'formal' && !currentTrial) return <div className="card p-8">作答已记录，正在生成结果…</div>
  const item = phase === 'practice' ? PROOFREAD_PRACTICE_ITEM : currentTrial!
  const content = <div className="card mx-auto max-w-2xl p-5 text-left sm:p-8">
    <div className="text-sm text-gray-500">{phase === 'practice' ? '练习 · 不计入成绩' : `第 ${trialIndex + 1} / ${totalTrials} 题`}</div>
    {subPhase === 'fixation' && <div className="h-28 pt-10 text-center text-4xl text-gray-400">+</div>}
    {subPhase === 'stimulus' && <><p className="pt-5 text-lg leading-relaxed">{item.stem}</p>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">{item.options.map((option, index) => <button key={option} type="button" className="btn-secondary min-h-12 px-4 text-left" onClick={() => phase === 'practice' ? choosePractice(index) : submitFormal(index)}><span className="mr-2">{index + 1} ·</span>{option}</button>)}</div>
      <p className="mt-5 text-xs text-gray-500">按键 1–4 或点击选项作答</p></>}
    {subPhase === 'feedback' && (phase === 'practice' ? <div role="status" className="mt-5">
      <p>{practiceChoice === PROOFREAD_PRACTICE_ITEM.answer ? '练习正确。' : '练习还需再试一次。'}{PROOFREAD_PRACTICE_ITEM.explanation}</p>
      {practiceChoice === PROOFREAD_PRACTICE_ITEM.answer
        ? <button type="button" className="btn-primary mt-4" onClick={() => { setPhase('formal'); setSubPhase('fixation') }}>开始正式测评</button>
        : <button type="button" className="btn-primary mt-4" onClick={() => setPhase('instruction')}>重读说明后再练习</button>}
    </div> : <div role="status" className="mt-5"><p>{feedback}</p>{retry && <button type="button" className="btn-primary mt-4" onClick={() => void persistPending()}>重试提交</button>}</div>)}
  </div>
  return phase === 'formal' ? <CognitiveFocusStage ariaLabel="文本校对正式测验">{content}</CognitiveFocusStage> : content
}
