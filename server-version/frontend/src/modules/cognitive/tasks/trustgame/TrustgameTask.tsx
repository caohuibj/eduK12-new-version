import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { TrustgameConfig, TrustgameTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { TRUSTGAME_PRACTICE_OFFER, TRUSTGAME_PRACTICE_POT } from './prng'

type Phase = 'instruction' | 'practice' | 'formal' | 'completed'
type SubPhase = 'fixation' | 'choice' | 'feedback'

export const TrustgameTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as TrustgameConfig
  const offers = config?.offers ?? [50, 20, 80, 10, 40, 30, 60, 20]
  const potTotal = config?.potTotal ?? 100
  const fixationMs = config?.fixationMs ?? 400
  const timeoutMs = config?.timeoutMs ?? 20000
  const totalRounds = offers.length
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('fixation')
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const [completedCount, setCompletedCount] = useState(0)
  const interruptedRef = useRef(false)
  const onsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const currentOffer = phase === 'practice' ? TRUSTGAME_PRACTICE_OFFER : offers[trialIndex]
  const isFair = currentOffer !== undefined && currentOffer * 2 >= potTotal

  useEffect(() => {
    if (phase !== 'formal') return
    setFormalFeedback(null); interruptedRef.current = false; setSubPhase('fixation')
  }, [trialIndex])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || subPhase !== 'fixation') return
    const timer = window.setTimeout(() => { onsetRef.current = performance.now(); setSubPhase('choice') }, fixationMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, trialIndex, fixationMs])

  useEffect(() => {
    if (phase !== 'formal' || subPhase !== 'choice') return
    const timer = window.setTimeout(() => { void submitFormal(null) }, timeoutMs)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, subPhase, trialIndex, timeoutMs])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const submitFormal = useCallback(async (response: 'accept' | 'reject') => {
    if (phase !== 'formal' || subPhase !== 'choice' || submittingRef.current) return
    submittingRef.current = true
    const payload: TrustgameTrialPayload = {
      roundIndex: trialIndex,
      offerToSelf: offers[trialIndex],
      response,
      rtMs: response === null || onsetRef.current === null ? null : Math.max(0, Math.round(performance.now() - onsetRef.current)),
      interrupted: interruptedRef.current,
    }
    setFormalFeedback('已记录，下一轮准备中'); setSubPhase('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前轮'); setSubPhase('choice'); return }
      setCompletedCount((current) => current + 1)
      if (completedCount + 1 >= totalRounds) { setPhase('completed'); await onTaskComplete?.() }
    } finally { submittingRef.current = false }
  }, [phase, subPhase, offers, trialIndex, completedCount, totalRounds, onTrialComplete, onTaskComplete])

  const handlePracticeChoice = useCallback((response: 'accept' | 'reject') => {
    if (subPhase !== 'choice') return
    setPracticeFeedback(response === 'accept' ? '已记录：你接受了这个方案。正式测验不再提示。' : '已记录：你拒绝了——双方都得零。正式测验不再提示。')
    setSubPhase('feedback')
  }, [subPhase])

  const OptionButtons: React.FC<{ show: boolean }> = ({ show }) => show ? (
    <div className="grid grid-cols-2 gap-3 max-w-md mx-auto mt-5">
      <button type="button" onPointerDown={() => (phase === 'practice' ? handlePracticeChoice('accept') : void submitFormal('accept'))} className="btn-secondary min-h-16">
        <span className="text-xs text-gray-500">按 1</span>
        <div className="font-bold text-gray-800">接受</div>
      </button>
      <button type="button" onPointerDown={() => (phase === 'practice' ? handlePracticeChoice('reject') : void submitFormal('reject'))} className="btn-secondary min-h-16">
        <span className="text-xs text-gray-500">按 2</span>
        <div className="font-bold text-gray-800">拒绝</div>
      </button>
    </div>
  ) : null

  if (phase === 'instruction') return <CognitiveTaskIntro title="信任与公平博弈" description={<p>每轮有一位匿名同伴把 {potTotal} 点分成两份：一份给你、一份留给对方。你可以接受（按方案分），也可以拒绝（双方都得零）。你的选择不会被评判对错。</p>} hint={<><p>点击按钮作答；练习不计入成绩。</p></>} onAction={() => { setSubPhase('fixation'); setPhase('practice') }} />
  if (phase === 'completed') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700">已全部完成，正在生成结果…</p></div>

  if (phase === 'practice') {
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-2">练习 · 不计入成绩</div>{subPhase === 'fixation' && <div className="h-16"></div>}{subPhase !== 'fixation' && <><p className="text-gray-600 pt-2">匿名同伴的方案：</p><p className="text-2xl font-bold text-gray-800 pt-1">你 {TRUSTGAME_PRACTICE_OFFER} 点 · 对方 {TRUSTGAME_PRACTICE_POT - TRUSTGAME_PRACTICE_OFFER} 点</p></>}<OptionButtons show={subPhase === 'choice'} />{subPhase === 'feedback' && <><div className="h-10 pt-3 text-gray-700">{practiceFeedback}</div><button type="button" className="btn-primary" onClick={() => { setPracticeFeedback(null); setSubPhase('fixation'); setPhase('formal') }}>开始正式测评</button></>}</div>
  }

  return <CognitiveFocusStage ariaLabel="信任与公平博弈正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">第 {trialIndex + 1} / {totalRounds} 轮</div>{subPhase === 'fixation' && <div className="h-20"></div>}{subPhase !== 'fixation' && <><p className="text-gray-600 pt-2">匿名同伴的方案：</p><p className="text-2xl font-bold text-gray-800 pt-1">你 {currentOffer} 点 · 对方 {potTotal - currentOffer} 点</p>{isFair && <p className="text-xs text-emerald-600 pt-1">这是一半或更多</p>}</>}<OptionButtons show={subPhase === 'choice'} />{subPhase === 'feedback' && <div className="h-10 pt-3 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{subPhase === 'choice' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<p className="text-xs text-gray-400 mt-4">接受按方案分 · 拒绝双方得零 · 限时 {Math.round(timeoutMs / 1000)} 秒</p></div></CognitiveFocusStage>
}
