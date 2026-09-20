import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { MemoryConfig, MemoryTrialPayload } from '../../types'
import { deterministicMemorySequence } from './prng'

const PRACTICE_SEQUENCES = [[3, 7, 1], [9, 4, 2]]
const PRACTICE_PASS_CORRECT = 1

type Phase = 'instruction' | 'practice' | 'formal'
type FormalSubPhase = 'ready' | 'display' | 'response'
type PracticeSubPhase = 'ready' | 'display' | 'response' | 'feedback'

const sameSequence = (left: number[], right: number[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

const Keypad: React.FC<{
  onDigit: (digit: number) => void
  disabled?: boolean
}> = ({ onDigit, disabled = false }) => (
  <div className="grid grid-cols-5 gap-2 max-w-sm mx-auto">
    {Array.from({ length: 10 }, (_, digit) => (
      <button
        key={digit}
        type="button"
        disabled={disabled}
        onClick={() => onDigit(digit)}
        className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-lg font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        {digit}
      </button>
    ))}
  </div>
)

export const MemoryTask: React.FC<CognitiveTaskProps> = ({
  taskContext,
  trialIndex,
  onTrialComplete,
  onTaskComplete,
}) => {
  const config = taskContext.config as unknown as MemoryConfig
  const startLength = config?.startLength ?? 2
  const maxLength = config?.maxLength ?? 11
  const digitDisplayMs = config?.digitDisplayMs ?? 800
  const digitIntervalMs = config?.digitIntervalMs ?? 200
  const readyDurationMs = config?.readyDurationMs ?? 1000
  const inactivityGuardMs = config?.inactivityGuardMs ?? 30000

  const [phase, setPhase] = useState<Phase>('instruction')
  const [formalSubPhase, setFormalSubPhase] = useState<FormalSubPhase>('ready')
  const [practiceSubPhase, setPracticeSubPhase] = useState<PracticeSubPhase>('ready')
  const [length, setLength] = useState(startLength)
  const [trialWithinLevel, setTrialWithinLevel] = useState<1 | 2>(1)
  const [levelCorrectCount, setLevelCorrectCount] = useState(0)
  const [response, setResponse] = useState<number[]>([])
  const [displayDigit, setDisplayDigit] = useState('')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceResponse, setPracticeResponse] = useState<number[]>([])
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [practiceCorrectCount, setPracticeCorrectCount] = useState(0)
  const [inactivityExpired, setInactivityExpired] = useState(false)
  const [guardKey, setGuardKey] = useState(0)
  const [interrupted, setInterrupted] = useState(false)
  const responseStartedAtRef = useRef<number | null>(null)
  const submittingRef = useRef(false)

  const sequence = useMemo(
    () => deterministicMemorySequence(taskContext.randomSeed, trialIndex, length),
    [taskContext.randomSeed, trialIndex, length]
  )
  const practiceSequence = PRACTICE_SEQUENCES[practiceIndex] ?? PRACTICE_SEQUENCES[0]

  useEffect(() => {
    if (phase !== 'formal' || formalSubPhase !== 'ready') return
    const timer = window.setTimeout(() => setFormalSubPhase('display'), readyDurationMs)
    return () => window.clearTimeout(timer)
  }, [phase, formalSubPhase, readyDurationMs])

  useEffect(() => {
    if (phase !== 'formal' || formalSubPhase !== 'display') return
    const timers: number[] = []
    const step = digitDisplayMs + digitIntervalMs
    sequence.forEach((digit, index) => {
      const showAt = index * step
      timers.push(window.setTimeout(() => setDisplayDigit(String(digit)), showAt))
      timers.push(window.setTimeout(() => setDisplayDigit(''), showAt + digitDisplayMs))
    })
    const doneAt = (sequence.length - 1) * step + digitDisplayMs
    timers.push(window.setTimeout(() => {
      responseStartedAtRef.current = performance.now()
      setFormalSubPhase('response')
    }, doneAt))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [phase, formalSubPhase, sequence, digitDisplayMs, digitIntervalMs])

  useEffect(() => {
    if (phase !== 'practice' || practiceSubPhase !== 'ready') return
    const timer = window.setTimeout(() => setPracticeSubPhase('display'), readyDurationMs)
    return () => window.clearTimeout(timer)
  }, [phase, practiceSubPhase, readyDurationMs])

  useEffect(() => {
    if (phase !== 'practice' || practiceSubPhase !== 'display') return
    const timers: number[] = []
    const step = digitDisplayMs + digitIntervalMs
    practiceSequence.forEach((digit, index) => {
      const showAt = index * step
      timers.push(window.setTimeout(() => setDisplayDigit(String(digit)), showAt))
      timers.push(window.setTimeout(() => setDisplayDigit(''), showAt + digitDisplayMs))
    })
    const doneAt = (practiceSequence.length - 1) * step + digitDisplayMs
    timers.push(window.setTimeout(() => setPracticeSubPhase('response'), doneAt))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [phase, practiceSubPhase, practiceSequence, digitDisplayMs, digitIntervalMs])

  useEffect(() => {
    if (phase !== 'formal' || formalSubPhase !== 'response') return
    setInactivityExpired(false)
    const timer = window.setTimeout(() => setInactivityExpired(true), inactivityGuardMs)
    return () => window.clearTimeout(timer)
  }, [phase, formalSubPhase, guardKey, inactivityGuardMs])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => {
      if (document.hidden) setInterrupted(true)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const startPractice = useCallback(() => {
    setPhase('practice')
    setPracticeIndex(0)
    setPracticeResponse([])
    setPracticeFeedback(null)
    setPracticeCorrectCount(0)
    setPracticeSubPhase('ready')
  }, [])

  const startFormal = useCallback(() => {
    setPhase('formal')
    setLength(startLength)
    setTrialWithinLevel(1)
    setLevelCorrectCount(0)
    setResponse([])
    setInterrupted(false)
    setFormalSubPhase('ready')
  }, [startLength])

  const handleDigit = useCallback((digit: number) => {
    if (phase === 'practice' && practiceSubPhase === 'response') {
      setPracticeResponse((current) =>
        current.length < practiceSequence.length ? [...current, digit] : current
      )
      return
    }
    if (phase === 'formal' && formalSubPhase === 'response' && !inactivityExpired) {
      setResponse((current) => (current.length < sequence.length ? [...current, digit] : current))
    }
  }, [phase, formalSubPhase, inactivityExpired, practiceSubPhase, practiceSequence.length, sequence.length])

  const submitPractice = useCallback(() => {
    if (practiceSubPhase !== 'response' || practiceResponse.length !== practiceSequence.length) return
    const correct = sameSequence(practiceResponse, practiceSequence)
    if (correct) setPracticeCorrectCount((current) => current + 1)
    setPracticeFeedback(
      correct
        ? '正确，可以按原顺序输入。'
        : '这次不一致，再看清数字出现的顺序。'
    )
    setPracticeSubPhase('feedback')
  }, [practiceSubPhase, practiceResponse, practiceSequence])

  const advancePractice = useCallback(() => {
    if (practiceIndex + 1 < PRACTICE_SEQUENCES.length) {
      setPracticeIndex((current) => current + 1)
      setPracticeResponse([])
      setPracticeFeedback(null)
      setPracticeSubPhase('ready')
      return
    }
    if (practiceCorrectCount >= PRACTICE_PASS_CORRECT) {
      startFormal()
      return
    }
    startPractice()
  }, [practiceIndex, practiceCorrectCount, startFormal, startPractice])

  const submitFormal = useCallback(async () => {
    if (
      phase !== 'formal' ||
      formalSubPhase !== 'response' ||
      inactivityExpired ||
      response.length !== sequence.length ||
      submittingRef.current
    ) return

    submittingRef.current = true
    const payload: MemoryTrialPayload = {
      length,
      trialWithinLevel,
      sequence,
      response,
      responseDurationMs: Math.max(0, Math.round(performance.now() - (responseStartedAtRef.current ?? performance.now()))),
      interrupted,
    }
    const correct = sameSequence(sequence, response)
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) return

      if (trialWithinLevel === 1) {
        setLevelCorrectCount(correct ? 1 : 0)
        setTrialWithinLevel(2)
        setResponse([])
        setInterrupted(false)
        setFormalSubPhase('ready')
      } else {
        const levelPassed = levelCorrectCount + (correct ? 1 : 0) > 0
        if (!levelPassed || length >= maxLength) {
          await onTaskComplete?.()
          return
        }
        setLength((current) => current + 1)
        setTrialWithinLevel(1)
        setLevelCorrectCount(0)
        setResponse([])
        setInterrupted(false)
        setFormalSubPhase('ready')
      }
    } finally {
      submittingRef.current = false
    }
  }, [
    phase,
    formalSubPhase,
    inactivityExpired,
    response,
    sequence,
    length,
    trialWithinLevel,
    interrupted,
    levelCorrectCount,
    maxLength,
    onTrialComplete,
    onTaskComplete,
  ])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key >= '0' && event.key <= '9') handleDigit(Number(event.key))
      else if (phase === 'formal' && formalSubPhase === 'response' && event.key === 'Backspace') {
        setResponse((current) => current.slice(0, -1))
      } else if (phase === 'formal' && formalSubPhase === 'response' && event.key === 'Enter') {
        void submitFormal()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleDigit, submitFormal, phase, formalSubPhase])

  if (phase === 'instruction') {
    return (
      <div className="card p-8 max-w-2xl text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">数字序列短时记忆</h1>
        <p className="text-gray-600 mb-3">数字会依次出现，请按原顺序输入。每个长度会完成两题，至少答对一题才进入下一长度。</p>
        <p className="text-gray-400 text-xs mb-6">先完成两道不计分练习；至少答对一道才开始正式测评。结果反映本次任务表现，不代表诊断或正式能力评估。</p>
        <button type="button" onClick={startPractice} className="btn-primary">开始练习</button>
      </div>
    )
  }

  if (phase === 'practice') {
    const lastPractice = practiceIndex + 1 >= PRACTICE_SEQUENCES.length
    const practicePassed = practiceCorrectCount >= PRACTICE_PASS_CORRECT
    return (
      <div className="card p-8 max-w-2xl text-center">
        <div className="text-sm text-gray-500 mb-4">练习 {practiceIndex + 1} / {PRACTICE_SEQUENCES.length} · 不计入成绩</div>
        {practiceSubPhase === 'ready' && <div className="text-gray-500 h-20 pt-6">准备记忆…</div>}
        {practiceSubPhase === 'display' && <div className="text-6xl font-bold text-primary h-20">{displayDigit}</div>}
        {practiceSubPhase === 'response' && (
          <>
            <div className="text-lg text-gray-600 mb-4">已输入：{practiceResponse.join(' ') || '—'}</div>
            <Keypad onDigit={handleDigit} />
            <button type="button" onClick={submitPractice} className="btn-primary mt-5" disabled={practiceResponse.length !== practiceSequence.length}>提交练习</button>
          </>
        )}
        {practiceSubPhase === 'feedback' && (
          <div>
            <p className="text-gray-700 mb-2">{practiceFeedback}</p>
            {lastPractice && (
              <p className="text-sm text-gray-500 mb-5">练习正确 {practiceCorrectCount} / {PRACTICE_SEQUENCES.length}；至少正确 {PRACTICE_PASS_CORRECT} 题。</p>
            )}
            <button type="button" onClick={advancePractice} className="btn-primary">
              {!lastPractice ? '下一个' : practicePassed ? '开始正式测评' : '重新练习'}
            </button>
          </div>
        )}
      </div>
    )
  }

  const responseReady = formalSubPhase === 'response' && !inactivityExpired
  return (
    <div className="card p-8 max-w-2xl text-center">
      <div className="text-sm text-gray-500 mb-4">正式试次 {trialIndex + 1} · 当前长度 {length} · 第 {trialWithinLevel} 题 / 2</div>
      {formalSubPhase === 'ready' && <div className="text-gray-500 h-20 pt-6">准备…</div>}
      {formalSubPhase === 'display' && <div className="text-6xl font-bold text-primary h-20">{displayDigit}</div>}
      {formalSubPhase === 'response' && (
        <>
          <div className="text-lg text-gray-600 mb-4">按顺序输入：{response.join(' ') || '—'}</div>
          <Keypad onDigit={handleDigit} disabled={!responseReady || submittingRef.current} />
          <div className="flex items-center justify-center gap-3 mt-5">
            <button type="button" onClick={() => setResponse((current) => current.slice(0, -1))} className="btn-secondary" disabled={!responseReady}>退格</button>
            <button type="button" onClick={() => void submitFormal()} className="btn-primary" disabled={!responseReady || response.length !== sequence.length || submittingRef.current}>提交</button>
          </div>
          {inactivityExpired && (
            <div className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
              <p className="mb-3">输入时间较长，要继续这道题还是退出测评？</p>
              <div className="flex justify-center gap-3">
                <button type="button" className="btn-primary" onClick={() => { setInactivityExpired(false); setGuardKey((key) => key + 1) }}>继续作答</button>
                <button type="button" className="btn-secondary" onClick={() => window.history.back()}>退出测评</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
