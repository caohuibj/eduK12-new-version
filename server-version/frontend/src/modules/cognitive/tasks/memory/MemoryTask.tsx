import { CognitivePracticeFeedback, CognitiveTaskExample, CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { MemoryConfig, MemoryTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { deterministicMemorySequence } from './prng'
import { CognitiveDigitEntry } from '../shared/CognitiveDigitEntry'

const PRACTICE_SEQUENCES = [[3, 7, 1], [9, 4, 2]]
const PRACTICE_PASS_CORRECT = 1

type Phase = 'instruction' | 'practice' | 'formal'
type FormalSubPhase = 'ready' | 'display' | 'response'
type PracticeSubPhase = 'ready' | 'display' | 'response' | 'feedback'

const sameSequence = (left: number[], right: number[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

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
  const [saving, setSaving] = useState(false)
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
    if (submittingRef.current) return
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

  const editResponse = useCallback((clear: boolean) => {
    if (submittingRef.current) return
    if (phase === 'practice' && practiceSubPhase === 'response') {
      setPracticeResponse(current => clear ? [] : current.slice(0, -1))
    } else if (phase === 'formal' && formalSubPhase === 'response' && !inactivityExpired) {
      setResponse(current => clear ? [] : current.slice(0, -1))
    }
  }, [phase, practiceSubPhase, formalSubPhase, inactivityExpired])

  const submitPractice = useCallback(() => {
    if (practiceSubPhase !== 'response' || practiceResponse.length !== practiceSequence.length) return
    const correct = sameSequence(practiceResponse, practiceSequence)
    if (correct) setPracticeCorrectCount((current) => current + 1)
    setPracticeFeedback(
      (correct ? '顺序正确。' : '这次顺序不一致。') + '原顺序：' + practiceSequence.join(' → ') + '；你的输入：' + practiceResponse.join(' → ') + '。从最先出现的数字开始，依次输入，不要倒序。'
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
    setSaving(true)
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
      setSaving(false)
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
      if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
      const ready = phase === 'formal' ? formalSubPhase === 'response' : phase === 'practice' && practiceSubPhase === 'response'
      if (!ready) return
      if (/^[0-9]$/.test(event.key)) { event.preventDefault(); handleDigit(Number(event.key)) }
      else if (event.key === 'Backspace') { event.preventDefault(); editResponse(false) }
      else if (event.key === 'Enter') { event.preventDefault(); if (phase === 'practice') submitPractice(); else void submitFormal() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleDigit, editResponse, submitPractice, submitFormal, phase, formalSubPhase, practiceSubPhase])

  if (phase === 'instruction') {
    return (
      <CognitiveTaskIntro
        title="数字序列短时记忆"
        description={<p>屏幕会一次显示一个数字。请按它们出现的先后顺序记住整串数字；全部消失后，从第一个数字开始，依次输入到最后一个。</p>}
        example={(
          <CognitiveTaskExample
            title="图示：看到的顺序，就是输入顺序"
            steps={[
              { label: '先出现', value: '4', note: '记住第 1 个', state: 'observe' },
              { label: '再出现', value: '2', note: '记住第 2 个', state: 'observe' },
              { label: '最后出现', value: '8', note: '记住第 3 个', state: 'observe' },
            ]}
            result={<>数字消失后输入 <strong>4 → 2 → 8</strong>，不要倒过来。</>}
            explanation="按屏幕数字键或实体键盘输入。练习和正式作答都会显示你已输入的数字；提交前可退格修改或清空重填，确认无误后再提交。"
          />
        )}
        hint={<><p><strong>练习：</strong>先完成两道不计分练习，至少答对一道才开始正式测评。</p><p><strong>正式规则：</strong>每个长度有两题；至少答对一题才进入更长的序列，否则测评结束。</p></>}
        onAction={startPractice}
      />
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
            <CognitiveDigitEntry values={practiceResponse} length={practiceSequence.length} onDigit={handleDigit}
              onBackspace={() => editResponse(false)} onClear={() => editResponse(true)} onSubmit={submitPractice} submitLabel="提交练习" />
          </>
        )}
        {practiceSubPhase === 'feedback' && (
          <div>
            <CognitivePracticeFeedback title="练习解析"><p>{practiceFeedback}</p></CognitivePracticeFeedback>
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
    <CognitiveFocusStage ariaLabel="数字广度正式测验" progress={{ completed: trialWithinLevel - 1, total: 2, label: `当前长度 ${length} · 本级已完成 / 总量` }}>
      <div className="card mx-auto max-w-2xl p-5 text-center sm:p-8">
        <div className="text-sm text-gray-500 mb-4">当前长度 {length} · 第 {trialWithinLevel} 题 / 2</div>
        {formalSubPhase === 'ready' && <div className="text-gray-500 h-20 pt-6">准备…</div>}
        {formalSubPhase === 'display' && <div className="text-6xl font-bold text-primary h-20">{displayDigit}</div>}
        {formalSubPhase === 'response' && (
          <>
            <CognitiveDigitEntry values={response} length={sequence.length} onDigit={handleDigit}
              onBackspace={() => editResponse(false)} onClear={() => editResponse(true)} onSubmit={() => void submitFormal()}
              disabled={!responseReady} busy={saving} />
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
    </CognitiveFocusStage>
  )
}
