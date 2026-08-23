import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { corsiSequence } from '../shared/prng'

const PRACTICE_SEQUENCES = [[0, 4, 8], [2, 6, 1]]
const PRACTICE_PASS = 1

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'
type SubPhase = 'ready' | 'display' | 'response'

const sameSequence = (left: number[], right: number[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

const BOARD = [
  { left: '8%', top: '10%' },
  { left: '42%', top: '8%' },
  { left: '76%', top: '14%' },
  { left: '12%', top: '42%' },
  { left: '42%', top: '40%' },
  { left: '72%', top: '46%' },
  { left: '10%', top: '74%' },
  { left: '44%', top: '72%' },
  { left: '76%', top: '70%' },
]

export const CorsiTask: React.FC<CognitiveTaskProps> = ({
  taskContext,
  trialIndex,
  onTrialComplete,
  onTaskComplete,
}) => {
  const config = taskContext.config as {
    startSpan: number
    maxSpan: number
    highlightMs: number
    intervalMs: number
    readyDurationMs: number
    inactivityGuardMs: number
  }
  const startSpan = config.startSpan ?? 3
  const maxSpan = config.maxSpan ?? 8
  const highlightMs = config.highlightMs ?? 500
  const intervalMs = config.intervalMs ?? 250
  const readyDurationMs = config.readyDurationMs ?? 800
  const inactivityGuardMs = config.inactivityGuardMs ?? 30000

  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('ready')
  const [span, setSpan] = useState(startSpan)
  const [trialWithinLevel, setTrialWithinLevel] = useState<1 | 2>(1)
  const [levelCorrectCount, setLevelCorrectCount] = useState(0)
  const [response, setResponse] = useState<number[]>([])
  const [lit, setLit] = useState<number | null>(null)
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [practiceNonce, setPracticeNonce] = useState(0)
  const [inactivityExpired, setInactivityExpired] = useState(false)
  const [interrupted, setInterrupted] = useState(false)
  const responseStartedAtRef = useRef<number | null>(null)
  const responseRef = useRef<number[]>([])
  const submittingRef = useRef(false)

  const sequence = useMemo(
    () => corsiSequence(taskContext.randomSeed, trialIndex, span),
    [taskContext.randomSeed, trialIndex, span],
  )
  const practiceSequence = PRACTICE_SEQUENCES[practiceIndex] ?? PRACTICE_SEQUENCES[0]
  const activeSequence = phase === 'practice' ? practiceSequence : sequence

  const startPractice = () => {
    setPracticeIndex(0)
    setPracticeCorrect(0)
    setResponse([])
    responseRef.current = []
    setLit(null)
    setPracticeNonce((value) => value + 1)
    setSubPhase('ready')
    setPhase('practice')
  }

  const startFormal = () => {
    setSpan(startSpan)
    setTrialWithinLevel(1)
    setLevelCorrectCount(0)
    setResponse([])
    responseRef.current = []
    setInterrupted(false)
    setLit(null)
    setSubPhase('ready')
    setPhase('formal')
  }

  useEffect(() => {
    if (phase !== 'practice' && phase !== 'formal') return
    if (subPhase !== 'ready') return
    const timer = window.setTimeout(() => setSubPhase('display'), readyDurationMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, readyDurationMs, practiceNonce, trialIndex, trialWithinLevel])

  useEffect(() => {
    if ((phase !== 'practice' && phase !== 'formal') || subPhase !== 'display') return
    const timers: number[] = []
    const step = highlightMs + intervalMs
    activeSequence.forEach((block, index) => {
      const showAt = index * step
      timers.push(window.setTimeout(() => setLit(block), showAt))
      timers.push(window.setTimeout(() => setLit(null), showAt + highlightMs))
    })
    const doneAt = (activeSequence.length - 1) * step + highlightMs
    timers.push(window.setTimeout(() => {
      responseStartedAtRef.current = performance.now()
      setSubPhase('response')
    }, doneAt))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [phase, subPhase, activeSequence, highlightMs, intervalMs, practiceNonce])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => {
      if (document.hidden) setInterrupted(true)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const tap = (block: number) => {
    if (subPhase !== 'response') return
    if (phase === 'practice') {
      setResponse((current) => (current.length < practiceSequence.length ? [...current, block] : current))
      return
    }
    if (!inactivityExpired) {
      setResponse((current) => {
        const next = current.length < sequence.length ? [...current, block] : current
        responseRef.current = next
        return next
      })
    }
  }

  const submitPractice = () => {
    if (subPhase !== 'response' || response.length !== practiceSequence.length) return
    const correct = sameSequence(response, practiceSequence)
    const nextCorrect = practiceCorrect + (correct ? 1 : 0)
    const nextIndex = practiceIndex + 1
    if (nextIndex >= PRACTICE_SEQUENCES.length) {
      setPracticeCorrect(nextCorrect)
      setPhase('practice-result')
      return
    }
    setPracticeCorrect(nextCorrect)
    setPracticeIndex(nextIndex)
    setResponse([])
    setLit(null)
    setSubPhase('ready')
  }

  const submitFormal = useCallback(async (answer: number[] = response, timedOut = false) => {
    if (
      phase !== 'formal'
      || subPhase !== 'response'
      || (!timedOut && (inactivityExpired || answer.length !== sequence.length))
      || submittingRef.current
    ) return
    submittingRef.current = true
    const correct = sameSequence(sequence, answer)
    try {
      const accepted = await onTrialComplete({
        spanLength: span,
        trialWithinLevel,
        sequence,
        response: answer,
        responseDurationMs: Math.max(0, Math.round(performance.now() - (responseStartedAtRef.current ?? performance.now()))),
        interrupted: interrupted || timedOut,
      })
      if (accepted === false) {
        setInactivityExpired(false)
        return
      }
      if (trialWithinLevel === 1) {
        setLevelCorrectCount(correct ? 1 : 0)
        setTrialWithinLevel(2)
        setResponse([])
        responseRef.current = []
        setInterrupted(false)
        setInactivityExpired(false)
        setSubPhase('ready')
      } else {
        const levelPassed = levelCorrectCount + (correct ? 1 : 0) > 0
        if (!levelPassed || span >= maxSpan) {
          await onTaskComplete?.()
          return
        }
        setSpan((current) => current + 1)
        setTrialWithinLevel(1)
        setLevelCorrectCount(0)
        setResponse([])
        responseRef.current = []
        setInterrupted(false)
        setInactivityExpired(false)
        setSubPhase('ready')
      }
    } finally {
      submittingRef.current = false
    }
  }, [phase, subPhase, inactivityExpired, response, sequence, span, trialWithinLevel, interrupted, levelCorrectCount, maxSpan, onTrialComplete, onTaskComplete])

  useEffect(() => {
    if (phase !== 'formal' || subPhase !== 'response' || inactivityExpired) return
    setInactivityExpired(false)
    const timer = window.setTimeout(() => {
      setInactivityExpired(true)
      void submitFormal(responseRef.current, true)
    }, inactivityGuardMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, inactivityGuardMs, inactivityExpired, trialIndex, submitFormal])

  if (phase === 'instruction') {
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-3">Corsi 方块广度</h2>
        <p className="text-gray-600 mb-4">方块会依次亮起，请按同样顺序点击。</p>
        <p className="text-xs text-gray-400 mb-6">练习不计入正式成绩，未通过可以重练。</p>
        <button className="btn-primary" onClick={startPractice}>开始练习</button>
      </div>
    )
  }

  if (phase === 'practice-result') {
    const passed = practiceCorrect >= PRACTICE_PASS
    return (
      <div className="text-center p-8">
        <p className="mb-4">练习正确 {practiceCorrect} / {PRACTICE_SEQUENCES.length}</p>
        {passed ? (
          <button className="btn-primary" onClick={startFormal}>开始正式测验</button>
        ) : (
          <button className="btn-secondary" onClick={startPractice}>重新练习</button>
        )}
      </div>
    )
  }

  return (
    <div className="text-center p-8">
      <p className="text-sm text-gray-500 mb-4">
        {phase === 'practice'
          ? `练习 ${practiceIndex + 1} / ${PRACTICE_SEQUENCES.length}`
          : `正式试次 ${trialIndex + 1} · 广度 ${span} · 第 ${trialWithinLevel} 题 / 2`}
      </p>
      {subPhase === 'ready' && <p className="text-gray-500 mb-4">准备记忆…</p>}
      <div className="relative mx-auto mb-4 h-72 w-72 rounded-xl bg-slate-100">
        {BOARD.map((position, index) => (
          <button
            key={index}
            type="button"
            aria-label={`block-${index}`}
            className={`absolute h-14 w-14 rounded-lg border ${lit === index ? 'bg-sky-500 border-sky-600' : 'bg-white border-gray-300'}`}
            style={{ left: position.left, top: position.top }}
            onClick={() => tap(index)}
          />
        ))}
      </div>
      {subPhase === 'response' && (
        <>
          <p className="text-sm text-gray-500 mb-3">已点 {response.length} / {activeSequence.length}</p>
          {inactivityExpired && <p className="text-sm text-amber-700 mb-3">响应超时，正在记录并进入下一题…</p>}
          <button
            type="button"
            className="btn-primary"
            disabled={inactivityExpired || response.length !== activeSequence.length}
            onClick={() => { phase === 'practice' ? submitPractice() : void submitFormal() }}
          >
            提交
          </button>
        </>
      )}
    </div>
  )
}
