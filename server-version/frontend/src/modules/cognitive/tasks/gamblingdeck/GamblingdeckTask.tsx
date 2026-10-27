import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { GamblingdeckConfig, GamblingdeckTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { deckOutcome, DECKS, DECK_STYLES } from './prng'

type Phase = 'instruction' | 'practice' | 'formal' | 'completed'
type SubPhase = 'choice' | 'feedback'

const DECK_POSITIONS: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 }

export const GamblingdeckTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as GamblingdeckConfig
  const totalTrials = config?.totalTrials ?? 60
  const feedbackMs = config?.feedbackMs ?? 1200
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('choice')
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const [practiceOutcome, setPracticeOutcome] = useState<number | null>(null)
  const [lastOutcome, setLastOutcome] = useState<number | null>(null)
  const [netTotal, setNetTotal] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)
  const interruptedRef = useRef(false)
  const onsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const positionsRef = useRef({ ...DECK_POSITIONS })

  useEffect(() => {
    if (phase !== 'formal') return
    interruptedRef.current = false
  }, [trialIndex])

  useEffect(() => {
    if (phase !== 'formal' || subPhase !== 'choice') return
    onsetRef.current = performance.now()
  }, [phase, subPhase, completedCount])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const submitFormal = useCallback(async (deck: 'A' | 'B' | 'C' | 'D') => {
    if (phase !== 'formal' || subPhase !== 'choice' || submittingRef.current) return
    submittingRef.current = true
    const payload: GamblingdeckTrialPayload = {
      deck,
      rtMs: onsetRef.current === null ? null : Math.max(0, Math.round(performance.now() - onsetRef.current)),
      interrupted: interruptedRef.current,
    }
    setSubPhase('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前试次'); setSubPhase('choice'); return }
      const position = positionsRef.current[payload.deck] ?? 0
      const outcome = deckOutcome(payload.deck, position)
      positionsRef.current[payload.deck] = position + 1
      setLastOutcome(outcome)
      setNetTotal((current) => current + outcome)
      setFormalFeedback(outcome >= 0 ? `本箱 +${outcome}` : `本箱 ${outcome}（损失）`)
      setCompletedCount((current) => current + 1)
      if (completedCount + 1 >= totalTrials) { setPhase('completed'); await onTaskComplete?.(); return }
      window.setTimeout(() => { setFormalFeedback(null); setSubPhase('choice') }, feedbackMs)
    } finally { submittingRef.current = false }
  }, [phase, subPhase, onTrialComplete, completedCount, totalTrials, onTaskComplete, feedbackMs])

  const handlePracticePick = useCallback((deck: 'A' | 'B' | 'C' | 'D') => {
    if (subPhase !== 'choice') return
    const outcome = deckOutcome(deck, 0)
    setPracticeOutcome(outcome)
    setPracticeFeedback(`宝箱 ${deck} 这次 ${outcome >= 0 ? `+${outcome}` : outcome}。正式测验里输赢会按规律变化，记住你的观察。`)
    setSubPhase('feedback')
  }, [subPhase])

  if (phase === 'instruction') return <CognitiveTaskIntro title="宝箱决策学习" description={<p>四个宝箱藏着不同的输赢规律。每轮选一个箱子打开，马上看到这一局的输赢。规则不会提前告诉你——边开边琢磨，争取最后赚到更多。</p>} hint={<><p>点击箱子作答；练习不计入成绩。</p></>} onAction={() => { setSubPhase('choice'); setPhase('practice') }} />
  if (phase === 'completed') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700">已全部完成，正在生成结果…</p></div>

  const DeckGrid: React.FC<{ onPick: (deck: 'A' | 'B' | 'C' | 'D') => void; disabled: boolean }> = ({ onPick, disabled }) => (
    <div className="grid grid-cols-2 gap-3 max-w-xl mx-auto mt-4 sm:grid-cols-4">
      {DECKS.map((deck) => (
        <button key={deck} type="button" disabled={disabled} onPointerDown={() => onPick(deck)} className={`min-h-28 rounded-xl border-2 ${DECK_STYLES[deck]} flex flex-col items-center justify-center gap-1 disabled:opacity-60`}>
          <span className="text-3xl">🎁</span>
          <span className="font-semibold">宝箱 {deck}</span>
        </button>
      ))}
    </div>
  )

  if (phase === 'practice') {
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 · 不计入成绩</div><p className="text-gray-600">选一个箱子试试：</p><DeckGrid onPick={handlePracticePick} disabled={subPhase !== 'choice'} />{subPhase === 'feedback' && <><div className="mt-4 text-gray-700">{practiceFeedback}</div><button type="button" className="btn-primary" onClick={() => { setPracticeFeedback(null); setPracticeOutcome(null); setSubPhase('choice'); setPhase('formal') }}>开始正式测评</button></>}</div>
  }

  return <CognitiveFocusStage ariaLabel="宝箱决策学习正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">{completedCount} / {totalTrials} · 当前累计 {netTotal}</div>{subPhase === 'choice' && <p className="text-gray-600 pt-3">选一个箱子：</p>}<DeckGrid onPick={(deck) => void submitFormal(deck)} disabled={subPhase !== 'choice'} />{subPhase === 'feedback' && <div className="mt-4 text-xl font-semibold text-gray-700">{formalFeedback}{lastOutcome !== null && <span className="ml-2 text-sm text-gray-500">（累计 {netTotal}）</span>}</div>}{subPhase === 'choice' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<p className="text-xs text-gray-400 mt-6">点击箱子作答 · 自定速，不限时</p></div></CognitiveFocusStage>
}
