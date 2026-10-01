import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { digitBackwardSequence } from '../shared/prng'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'

type Phase = 'instruction' | 'practice' | 'practice-feedback' | 'practice-result' | 'formal'
type SubPhase = 'ready' | 'display' | 'response'
const PRACTICE = [[3, 8, 1], [6, 2, 9], [4, 7, 0], [5, 1, 8]]

const same = (left: number[], right: number[]) => left.length === right.length && left.every((value, index) => value === right[index])

const Keypad: React.FC<{ onDigit: (digit: number) => void; disabled?: boolean }> = ({ onDigit, disabled }) => (
  <div className="mx-auto grid max-w-sm grid-cols-5 gap-2">
    {Array.from({ length: 10 }, (_, digit) => (
      <button key={digit} type="button" disabled={disabled} className="btn-secondary min-h-12" onClick={() => onDigit(digit)}>{digit}</button>
    ))}
  </div>
)

export const DigitbackwardTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as { startSpan: number; maxSpan: number; digitDisplayMs: number; digitIntervalMs: number; readyDurationMs: number; inactivityGuardMs: number }
  const startSpan = config.startSpan ?? 2
  const maxSpan = config.maxSpan ?? 7
  const digitDisplayMs = config.digitDisplayMs ?? 800
  const digitIntervalMs = config.digitIntervalMs ?? 200
  const readyDurationMs = config.readyDurationMs ?? 800
  const inactivityGuardMs = config.inactivityGuardMs ?? 30000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('ready')
  const [span, setSpan] = useState(startSpan)
  const [trialWithinLevel, setTrialWithinLevel] = useState<1 | 2>(1)
  const [levelCorrect, setLevelCorrect] = useState(0)
  const [response, setResponse] = useState<number[]>([])
  const [displayDigit, setDisplayDigit] = useState('')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [practiceFeedback, setPracticeFeedback] = useState('')
  const [interrupted, setInterrupted] = useState(false)
  const responseStartedRef = useRef(0)
  const responseRef = useRef<number[]>([])
  const submittingRef = useRef(false)
  const completingRef = useRef(false)

  const sequence = useMemo(() => digitBackwardSequence(taskContext.randomSeed, trialIndex, span), [taskContext.randomSeed, trialIndex, span])
  const activeSequence = phase.startsWith('practice') ? PRACTICE[practiceIndex] : sequence

  const resetResponse = () => { setResponse([]); responseRef.current = []; setDisplayDigit(''); setSubPhase('ready') }
  const startPractice = () => { setPracticeIndex(0); setPracticeCorrect(0); setPracticeFeedback(''); resetResponse(); setPhase('practice') }
  const startFormal = () => { setSpan(startSpan); setTrialWithinLevel(1); setLevelCorrect(0); setInterrupted(false); completingRef.current = false; resetResponse(); setPhase('formal') }
  const completeOnce = useCallback(async () => { if (completingRef.current) return; completingRef.current = true; await onTaskComplete?.() }, [onTaskComplete])

  useEffect(() => {
    if ((phase !== 'practice' && phase !== 'formal') || subPhase !== 'ready') return
    const timer = window.setTimeout(() => setSubPhase('display'), readyDurationMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, readyDurationMs, practiceIndex, trialIndex])

  useEffect(() => {
    if ((phase !== 'practice' && phase !== 'formal') || subPhase !== 'display') return
    const timers: number[] = []
    const step = digitDisplayMs + digitIntervalMs
    activeSequence.forEach((digit, index) => {
      timers.push(window.setTimeout(() => setDisplayDigit(String(digit)), index * step))
      timers.push(window.setTimeout(() => setDisplayDigit(''), index * step + digitDisplayMs))
    })
    timers.push(window.setTimeout(() => { responseStartedRef.current = performance.now(); setSubPhase('response') }, (activeSequence.length - 1) * step + digitDisplayMs))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [phase, subPhase, activeSequence, digitDisplayMs, digitIntervalMs])

  useEffect(() => {
    if (phase !== 'formal') return
    const onHidden = () => { if (document.hidden) setInterrupted(true) }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [phase])

  const submitFormal = useCallback(async (answer: number[] = responseRef.current, timedOut = false) => {
    if (phase !== 'formal' || subPhase !== 'response' || submittingRef.current || (!timedOut && answer.length !== sequence.length)) return
    submittingRef.current = true
    const correct = same(answer, [...sequence].reverse())
    try {
      const accepted = await onTrialComplete({ spanLength: span, trialWithinLevel, sequence, response: answer, responseDurationMs: Math.max(0, Math.round(performance.now() - responseStartedRef.current)), interrupted, timedOut })
      if (accepted === false) return
      if (trialWithinLevel === 1) { setLevelCorrect(correct ? 1 : 0); setTrialWithinLevel(2); setInterrupted(false); resetResponse() }
      else if (levelCorrect + (correct ? 1 : 0) === 0 || span >= maxSpan) await completeOnce()
      else { setSpan((value) => value + 1); setTrialWithinLevel(1); setLevelCorrect(0); setInterrupted(false); resetResponse() }
    } finally { submittingRef.current = false }
  }, [phase, subPhase, sequence, span, trialWithinLevel, interrupted, levelCorrect, maxSpan, onTrialComplete, completeOnce])

  useEffect(() => {
    if (phase !== 'formal' || subPhase !== 'response') return
    const timer = window.setTimeout(() => { void submitFormal(responseRef.current, true) }, inactivityGuardMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, trialIndex, inactivityGuardMs, submitFormal])

  const addDigit = (digit: number) => {
    if (subPhase !== 'response' || responseRef.current.length >= activeSequence.length) return
    const next = [...responseRef.current, digit]
    setResponse(next); responseRef.current = next
  }
  const removeLastPracticeDigit = () => {
    if (phase !== 'practice' || subPhase !== 'response') return
    const next = responseRef.current.slice(0, -1)
    setResponse(next); responseRef.current = next
  }
  const submitPractice = () => {
    if (responseRef.current.length !== activeSequence.length) return
    const correct = same(responseRef.current, [...activeSequence].reverse())
    setPracticeCorrect((value) => value + (correct ? 1 : 0))
    setPracticeFeedback(correct ? '正确：按出现顺序的反方向输入。' : '错误：请从最后一个数字开始倒着输入。')
    setPhase('practice-feedback')
  }
  const submitCurrent = () => {
    if (responseRef.current.length !== activeSequence.length) return
    if (phase === 'practice') submitPractice()
    else void submitFormal()
  }

  useEffect(() => {
    if ((phase !== 'practice' && phase !== 'formal') || subPhase !== 'response') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (/^[0-9]$/.test(event.key)) { event.preventDefault(); addDigit(Number(event.key)); return }
      if (event.key === 'Enter') { event.preventDefault(); submitCurrent(); return }
      if (event.key === 'Backspace' && phase === 'practice') { event.preventDefault(); removeLastPracticeDigit() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const nextPractice = () => {
    if (practiceIndex + 1 >= PRACTICE.length) { setPhase('practice-result'); return }
    setPracticeIndex((value) => value + 1); resetResponse(); setPhase('practice')
  }

  if (phase === 'instruction') return <CognitiveTaskIntro title="数字倒背" description={<p>记住依次出现的数字，然后从最后一个开始倒着输入。</p>} hint={<><p>可使用数字键输入，Enter 提交。正式测验不会回显已输入数字，也不提供退格修改。</p><p>练习至少答对 3 / 4；练习不计分。</p></>} onAction={startPractice} />
  if (phase === 'practice-result') { const passed = practiceCorrect >= 3; return <div className="p-8 text-center"><p className="mb-4">练习正确 {practiceCorrect} / 4</p><button className={passed ? 'btn-primary' : 'btn-secondary'} onClick={passed ? startFormal : startPractice}>{passed ? '开始正式测验' : '重新练习'}</button></div> }
  if (phase === 'practice-feedback') return <div className="p-8 text-center"><p className="mb-5">{practiceFeedback}</p><button className="btn-primary" onClick={nextPractice}>{practiceIndex + 1 >= 4 ? '查看练习结果' : '下一题'}</button></div>

  const content = <div className="p-8 text-center"><p className="mb-4 text-sm text-gray-500">{phase === 'practice' ? `练习 ${practiceIndex + 1} / 4` : `正式试次 ${trialIndex + 1} · 广度 ${span} · 第 ${trialWithinLevel} 题 / 2`}</p>{subPhase === 'ready' && <div className="h-20 pt-5 text-gray-500">准备记忆…</div>}{subPhase === 'display' && <div className="h-20 text-6xl font-bold text-primary">{displayDigit}</div>}{subPhase === 'response' && <><p className="mb-4">{phase === 'formal' ? `已输入 ${response.length} / ${activeSequence.length}` : `倒序输入：${response.join(' ') || '—'}`}</p><Keypad onDigit={addDigit} disabled={submittingRef.current} /><div className="mt-5 flex justify-center gap-3">{phase === 'practice' && <button className="btn-secondary" onClick={removeLastPracticeDigit}>退格</button>}<button className="btn-primary" disabled={response.length !== activeSequence.length} onClick={submitCurrent}>提交</button></div></>}</div>
  return phase === 'formal' ? <CognitiveFocusStage ariaLabel="数字倒背正式作答">{content}</CognitiveFocusStage> : content
}
