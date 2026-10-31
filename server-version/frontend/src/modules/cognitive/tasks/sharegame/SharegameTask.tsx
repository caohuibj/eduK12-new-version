import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { SharegameConfig, SharegameTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { givenForFraction, SHAREGAME_OPTIONS, SHAREGAME_PRACTICE_ENDOWMENT } from './prng'

type Phase = 'instruction' | 'practice' | 'formal' | 'completed'
type SubPhase = 'fixation' | 'choice' | 'feedback'

export const SharegameTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as SharegameConfig
  const endowments = config?.endowments ?? [20, 50, 100, 50, 100]
  const fixationMs = config?.fixationMs ?? 400
  const timeoutMs = config?.timeoutMs ?? 20000
  const totalRounds = endowments.length
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('fixation')
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const [completedCount, setCompletedCount] = useState(0)
  const interruptedRef = useRef(false)
  const onsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const currentEndowment = phase === 'practice' ? SHAREGAME_PRACTICE_ENDOWMENT : endowments[trialIndex]

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
    const timer = window.setTimeout(() => { void submitFormal(0) }, timeoutMs)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, subPhase, trialIndex, timeoutMs])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const submitFormal = useCallback(async (given: number) => {
    if (phase !== 'formal' || subPhase !== 'choice' || submittingRef.current) return
    submittingRef.current = true
    const endowment = endowments[trialIndex]
    const payload: SharegameTrialPayload = {
      endowment,
      given,
      rtMs: onsetRef.current === null ? null : Math.max(0, Math.round(performance.now() - onsetRef.current)),
      interrupted: interruptedRef.current,
    }
    setFormalFeedback('已记录，下一轮准备中'); setSubPhase('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前轮'); setSubPhase('choice'); return }
      setCompletedCount((current) => current + 1)
      if (completedCount + 1 >= totalRounds) { setPhase('completed'); await onTaskComplete?.() }
    } finally { submittingRef.current = false }
  }, [phase, subPhase, endowments, trialIndex, completedCount, totalRounds, onTrialComplete, onTaskComplete])

  const handlePracticeChoice = useCallback((fraction: number) => {
    if (subPhase !== 'choice') return
    setPracticeFeedback(`已记录：你选择分出 ${givenForFraction(SHAREGAME_PRACTICE_ENDOWMENT, fraction)} 点。正式测验不再提示。`)
    setSubPhase('feedback')
  }, [subPhase])

  const OptionButtons: React.FC<{ show: boolean; endowment: number }> = ({ show, endowment }) => show ? (
    <div className="grid grid-cols-2 gap-3 max-w-xl mx-auto mt-4 sm:grid-cols-5">
      {SHAREGAME_OPTIONS.map((option) => (
        <button
          key={option.label}
          type="button"
          onPointerDown={() => (phase === 'practice' ? handlePracticeChoice(option.fraction) : void submitFormal(givenForFraction(endowment, option.fraction)))}
          className="btn-secondary min-h-16 flex flex-col items-center justify-center"
        >
          <span className="font-bold text-gray-800">{givenForFraction(endowment, option.fraction)}</span>
          <span className="text-xs text-gray-500">{option.label}</span>
        </button>
      ))}
    </div>
  ) : null

  if (phase === 'instruction') return <CognitiveTaskIntro title="分享决策" description={<p>每轮你都会拿到一笔点数。你可以全部自留，也可以分一部分给一位看不到名字、无法回报你的同伴。你的选择不会被评判对错。</p>} hint={<><p>点击档位作答；练习不计入成绩。</p></>} onAction={() => { setSubPhase('fixation'); setPhase('practice') }} />
  if (phase === 'completed') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700">已全部完成，正在生成结果…</p></div>

  if (phase === 'practice') {
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-2">练习 · 不计入成绩</div>{subPhase === 'fixation' && <div className="h-16"></div>}{subPhase !== 'fixation' && <><p className="text-2xl font-semibold text-gray-800 pt-2">本轮你有 {SHAREGAME_PRACTICE_ENDOWMENT} 点</p><p className="text-gray-600 pt-1">分多少给同伴？</p></>}<OptionButtons show={subPhase === 'choice'} endowment={SHAREGAME_PRACTICE_ENDOWMENT} />{subPhase === 'feedback' && <><div className="h-10 pt-3 text-gray-700">{practiceFeedback}</div><button type="button" className="btn-primary" onClick={() => { setPracticeFeedback(null); setSubPhase('fixation'); setPhase('formal') }}>开始正式测评</button></>}</div>
  }

  return <CognitiveFocusStage ariaLabel="分享决策正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">第 {trialIndex + 1} / {totalRounds} 轮</div>{subPhase === 'fixation' && <div className="h-20"></div>}{subPhase !== 'fixation' && <><p className="text-2xl font-semibold text-gray-800 pt-2">本轮你有 {currentEndowment} 点</p><p className="text-gray-600 pt-1">分多少给同伴？</p></>}<OptionButtons show={subPhase === 'choice'} endowment={currentEndowment} />{subPhase === 'feedback' && <div className="h-10 pt-3 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{subPhase === 'choice' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<p className="text-xs text-gray-400 mt-4">限时 {Math.round(timeoutMs / 1000)} 秒 · 超时视为不给</p></div></CognitiveFocusStage>
}
