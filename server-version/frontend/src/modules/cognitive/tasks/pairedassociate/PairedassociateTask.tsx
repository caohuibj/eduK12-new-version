import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { pairedAssociateSet } from '../shared/prng'

type Phase = 'instruction' | 'practice-study' | 'practice-recall' | 'practice-feedback' | 'practice-result' | 'formal-study' | 'formal-recall' | 'delayed-wait'
type Response = { itemId: string; selectedPosition: number | null }
const PRACTICE = [
  [{ itemId: 'practice-circle', targetPosition: 0 }, { itemId: 'practice-star', targetPosition: 2 }],
  [{ itemId: 'practice-circle', targetPosition: 1 }, { itemId: 'practice-star', targetPosition: 3 }],
  [{ itemId: 'practice-circle', targetPosition: 3 }, { itemId: 'practice-star', targetPosition: 0 }],
  [{ itemId: 'practice-circle', targetPosition: 2 }, { itemId: 'practice-star', targetPosition: 1 }],
]
const Symbol: React.FC<{ itemId: string }> = ({ itemId }) => {
  const index = itemId === 'practice-circle' ? 0 : itemId === 'practice-star' ? 1 : Math.max(0, Number(itemId.slice(-2)) - 1)
  const outer = index % 3
  const color = ['#0f766e', '#7c3aed', '#c2410c'][Math.floor(index / 3) % 3]
  return <svg aria-label={`抽象图形 ${index + 1}`} viewBox="0 0 64 64" className="mx-auto h-12 w-12">
    {outer === 0 && <circle cx="32" cy="32" r="24" fill="none" stroke={color} strokeWidth="6" />}
    {outer === 1 && <rect x="10" y="10" width="44" height="44" rx="7" fill="none" stroke={color} strokeWidth="6" />}
    {outer === 2 && <polygon points="32,6 58,54 6,54" fill="none" stroke={color} strokeWidth="6" strokeLinejoin="round" />}
    <path d={index % 2 === 0 ? 'M20 32 H44' : 'M32 20 V44'} stroke="#334155" strokeWidth="6" strokeLinecap="round" />
    {index % 4 >= 2 && <circle cx="32" cy="32" r="5" fill={color} />}
  </svg>
}

export const PairedassociateTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as { pairCount: number; learningRounds: number; delayedEnabled: boolean; delayedDelayMs: number; studyDurationMs: number; inactivityGuardMs: number }
  const pairCount = config.pairCount ?? 12
  const learningRounds = config.learningRounds ?? 3
  const delayedEnabled = config.delayedEnabled ?? false
  const delayedDelayMs = config.delayedDelayMs ?? 0
  const studyDurationMs = config.studyDurationMs ?? 12000
  const inactivityGuardMs = config.inactivityGuardMs ?? 90000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [responseIndex, setResponseIndex] = useState(0)
  const [responses, setResponses] = useState<Response[]>([])
  const [interrupted, setInterrupted] = useState(false)
  const startedRef = useRef(0)
  const completingRef = useRef(false)
  const submittingRef = useRef(false)
  const set = useMemo(() => pairedAssociateSet(taskContext.randomSeed, pairCount), [taskContext.randomSeed, pairCount])
  const isDelayed = trialIndex >= learningRounds
  const activeSet = phase.startsWith('practice') ? PRACTICE[practiceIndex] : set

  const completeOnce = useCallback(async () => { if (completingRef.current) return; completingRef.current = true; await onTaskComplete?.() }, [onTaskComplete])
  const resetRecall = useCallback(() => { setResponseIndex(0); setResponses([]) }, [])
  const startPractice = () => { setPracticeIndex(0); setPracticeCorrect(0); resetRecall(); setPhase('practice-study') }
  const startFormal = () => { completingRef.current = false; setInterrupted(false); resetRecall(); setPhase('formal-study') }
  const beginRecall = useCallback(() => { resetRecall(); startedRef.current = performance.now(); setPhase(phase === 'practice-study' ? 'practice-recall' : 'formal-recall') }, [phase, resetRecall])

  useEffect(() => {
    if (phase !== 'formal-study') return
    const timer = window.setTimeout(beginRecall, studyDurationMs)
    return () => window.clearTimeout(timer)
  }, [phase, studyDurationMs, beginRecall])
  useEffect(() => {
    if (phase !== 'delayed-wait') return
    const timer = window.setTimeout(() => { resetRecall(); startedRef.current = performance.now(); setPhase('formal-recall') }, delayedDelayMs)
    return () => window.clearTimeout(timer)
  }, [phase, delayedDelayMs, resetRecall])
  useEffect(() => {
    if (!phase.startsWith('formal') && phase !== 'delayed-wait') return
    const onHidden = () => { if (document.hidden) setInterrupted(true) }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [phase])

  const advanceAfterFormal = useCallback(async () => {
    resetRecall(); setInterrupted(false)
    if (isDelayed || (!delayedEnabled && trialIndex + 1 >= learningRounds)) await completeOnce()
    else if (delayedEnabled && trialIndex + 1 >= learningRounds) setPhase('delayed-wait')
    else setPhase('formal-study')
  }, [isDelayed, delayedEnabled, trialIndex, learningRounds, completeOnce, resetRecall])

  const persistFormal = useCallback(async (answers: Response[], timedOut: boolean) => {
    if (submittingRef.current) return
    submittingRef.current = true
    try {
      const byId = new Map(answers.map((item) => [item.itemId, item.selectedPosition]))
      const normalized = set.map((item) => ({ itemId: item.itemId, selectedPosition: byId.get(item.itemId) ?? null }))
      const accepted = await onTrialComplete({ phase: isDelayed ? 'delayed' : 'learning', roundIndex: isDelayed ? 1 : trialIndex + 1, responses: normalized, responseDurationMs: Math.max(0, Math.round(performance.now() - startedRef.current)), interrupted: interrupted || timedOut })
      if (accepted !== false) await advanceAfterFormal()
    } finally { submittingRef.current = false }
  }, [set, isDelayed, trialIndex, interrupted, onTrialComplete, advanceAfterFormal])

  useEffect(() => {
    if (phase !== 'formal-recall') return
    const timer = window.setTimeout(() => { void persistFormal(responses, true) }, inactivityGuardMs)
    return () => window.clearTimeout(timer)
  }, [phase, responses, inactivityGuardMs, persistFormal])

  const choosePosition = (position: number) => {
    if (responseIndex >= activeSet.length) return
    const next = [...responses, { itemId: activeSet[responseIndex].itemId, selectedPosition: position }]
    setResponses(next); setResponseIndex((value) => value + 1)
  }
  const submitPractice = () => {
    if (responses.length !== activeSet.length) return
    const correct = responses.every((item, index) => item.selectedPosition === activeSet[index].targetPosition)
    setPracticeCorrect((value) => value + (correct ? 1 : 0)); setFeedback(correct ? '正确' : '至少有一个位置不正确'); setPhase('practice-feedback')
  }
  const nextPractice = () => {
    if (practiceIndex + 1 >= PRACTICE.length) { setPhase('practice-result'); return }
    setPracticeIndex((value) => value + 1); resetRecall(); setPhase('practice-study')
  }

  if (phase === 'instruction') return <div className="text-center p-8"><h2 className="text-xl font-semibold mb-3">图形—位置配对学习</h2><p className="mb-2 text-gray-600">记住每个抽象图形所在的位置，随后为每个图形选择原位置。</p><p className="mb-6 text-xs text-gray-400">练习至少答对 3 / 4；练习不计分。</p><button className="btn-primary" onClick={startPractice}>开始练习</button></div>
  if (phase === 'practice-result') { const passed = practiceCorrect >= 3; return <div className="text-center p-8"><p className="mb-4">练习正确 {practiceCorrect} / 4</p><button className={passed ? 'btn-primary' : 'btn-secondary'} onClick={passed ? startFormal : startPractice}>{passed ? '开始正式测验' : '重新练习'}</button></div> }
  if (phase === 'practice-feedback') return <div className="text-center p-8"><p className="mb-4">上一题：{feedback}</p><button className="btn-primary" onClick={nextPractice}>{practiceIndex + 1 >= 4 ? '查看练习结果' : '下一题'}</button></div>
  if (phase === 'delayed-wait') return <div className="text-center p-8"><h3 className="text-lg font-semibold mb-3">延迟保持阶段</h3><p className="text-gray-600">请稍候，之后将在不重复呈现配对的情况下再次作答。</p></div>

  const studying = phase === 'practice-study' || phase === 'formal-study'
  const positions = Array.from({ length: phase.startsWith('practice') ? 4 : activeSet.length }, (_, index) => index)
  return <div className="p-6 text-center"><p className="mb-4 text-sm text-gray-500">{phase.startsWith('practice') ? `练习 ${practiceIndex + 1} / 4` : isDelayed ? '延迟回忆' : `学习轮次 ${trialIndex + 1} / ${learningRounds}`}</p>
    {studying ? <><div className="grid grid-cols-3 gap-2 md:grid-cols-6">{positions.map((position) => { const item = activeSet.find((candidate) => candidate.targetPosition === position); return <div key={position} className="rounded-lg border bg-white p-3"><div className="text-xs text-gray-400">位置 {position + 1}</div><div className="mt-2">{item ? <Symbol itemId={item.itemId} /> : '·'}</div></div> })}</div><button className="btn-primary mt-6" onClick={beginRecall}>我记好了，开始作答</button></> : <><div className="mb-5">{responseIndex < activeSet.length ? <Symbol itemId={activeSet[responseIndex].itemId} /> : <span className="text-5xl">✓</span>}</div><p className="mb-3 text-sm text-gray-500">已回答 {responses.length} / {activeSet.length}</p><div className="grid grid-cols-3 gap-2 md:grid-cols-6">{positions.map((position) => <button key={position} className="btn-secondary" disabled={responseIndex >= activeSet.length} onClick={() => choosePosition(position)}>位置 {position + 1}</button>)}</div>{responses.length === activeSet.length && <button className="btn-primary mt-6" onClick={() => phase === 'practice-recall' ? submitPractice() : void persistFormal(responses, false)}>提交本轮</button>}</>}
  </div>
}
