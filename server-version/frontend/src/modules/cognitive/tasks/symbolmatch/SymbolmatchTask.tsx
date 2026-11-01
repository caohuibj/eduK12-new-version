import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { SymbolmatchConfig, SymbolmatchTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { buildSymbolmatchSequence, SYMBOLMATCH_PRACTICE_SYMBOLS } from './prng'

const MAX_PRACTICE_ATTEMPTS = 2

type Phase = 'instruction' | 'practice' | 'formal' | 'blocked'
type SubPhase = 'fixation' | 'stimulus' | 'feedback'

export const SymbolmatchTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as SymbolmatchConfig
  const totalTrials = config?.totalTrials ?? 40
  const symbolDigitMap = config?.symbolDigitMap ?? [['●', 1], ['■', 2], ['▲', 3], ['◆', 4], ['★', 5]] as Array<[string, number]>
  const fixationMs = config?.fixationMs ?? 400
  const timeoutMs = config?.timeoutMs ?? 8000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('fixation')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceAttempt, setPracticeAttempt] = useState(1)
  const [practiceCorrect, setPracticeCorrect] = useState<boolean[]>([])
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const interruptedRef = useRef(false)
  const onsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const symbols = useMemo(() => symbolDigitMap.map(([symbol]) => symbol), [symbolDigitMap])
  const expectedDigit = useMemo(() => new Map(symbolDigitMap), [symbolDigitMap])
  const sequence = useMemo(() => buildSymbolmatchSequence(taskContext.randomSeed, totalTrials, symbols), [taskContext.randomSeed, totalTrials, symbols])
  const currentSymbol = sequence[trialIndex]

  useEffect(() => {
    if (phase !== 'formal' || !currentSymbol) return
    setFormalFeedback(null); interruptedRef.current = false; setSubPhase('fixation')
  }, [phase, trialIndex, currentSymbol])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || subPhase !== 'fixation') return
    const delay = phase === 'practice' ? 400 : fixationMs + (trialIndex > 0 ? 200 : 0)
    const timer = window.setTimeout(() => { onsetRef.current = performance.now(); setSubPhase('stimulus') }, delay)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, trialIndex, fixationMs])

  const submitFormal = useCallback(async (response: number | null) => {
    if (phase !== 'formal' || subPhase !== 'stimulus' || !currentSymbol || submittingRef.current) return
    submittingRef.current = true
    const payload: SymbolmatchTrialPayload = {
      symbol: currentSymbol,
      response,
      rtMs: response === null || onsetRef.current === null ? null : Math.max(0, Math.round(performance.now() - onsetRef.current)),
      interrupted: interruptedRef.current,
    }
    setFormalFeedback('已记录，下一题准备中'); setSubPhase('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前试次'); setSubPhase('stimulus'); return }
      if (trialIndex + 1 >= totalTrials) await onTaskComplete?.()
    } finally { submittingRef.current = false }
  }, [phase, subPhase, currentSymbol, onTrialComplete, trialIndex, totalTrials, onTaskComplete])

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

  const handleResponse = useCallback((digit: number) => {
    if (phase === 'practice') {
      const symbol = SYMBOLMATCH_PRACTICE_SYMBOLS[practiceIndex]
      const expected = expectedDigit.get(symbol)
      if (subPhase !== 'stimulus' || expected === undefined) return
      const correct = digit === expected
      setPracticeCorrect((current) => { const next = [...current]; next[practiceIndex] = correct; return next })
      setPracticeFeedback(correct ? '正确：照着图例找数字。' : '再看一眼图例：找到这个符号对应的数字。')
      setSubPhase('feedback'); return
    }
    void submitFormal(digit)
  }, [phase, practiceIndex, subPhase, expectedDigit, submitFormal])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const digit = Number(event.key)
      if (digit >= 1 && digit <= 5) { event.preventDefault(); handleResponse(digit) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleResponse])

  const startPractice = useCallback(() => { setPracticeIndex(0); setPracticeCorrect([]); setPracticeFeedback(null); setSubPhase('fixation'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    if (practiceIndex + 1 < SYMBOLMATCH_PRACTICE_SYMBOLS.length) { setPracticeIndex((current) => current + 1); setPracticeFeedback(null); setSubPhase('fixation'); return }
    const passed = practiceCorrect.length === SYMBOLMATCH_PRACTICE_SYMBOLS.length && practiceCorrect.every(Boolean)
    if (passed) { setFormalFeedback(null); setSubPhase('fixation'); setPhase('formal') }
    else if (practiceAttempt < MAX_PRACTICE_ATTEMPTS) { setPracticeAttempt((current) => current + 1); setPracticeIndex(0); setPracticeCorrect([]); setPracticeFeedback(null); setSubPhase('fixation'); setPhase('instruction') }
    else setPhase('blocked')
  }, [practiceIndex, practiceCorrect, practiceAttempt])

  const KeyLegend: React.FC = () => (
    <div className="flex flex-wrap justify-center gap-2 mb-4">
      {symbolDigitMap.map(([symbol, digit]) => (
        <span key={symbol} className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-lg">
          <span className="font-bold">{symbol}</span>
          <span className="text-gray-400">=</span>
          <span className="font-semibold text-gray-700">{digit}</span>
        </span>
      ))}
    </div>
  )

  const ResponseButtons: React.FC<{ show: boolean }> = ({ show }) => show ? (
    <div className="grid grid-cols-5 gap-2 max-w-lg mx-auto mt-4">
      {symbolDigitMap.map(([, digit]) => (
        <button key={digit} type="button" onPointerDown={() => handleResponse(digit)} onClick={event => { if (event.detail === 0) handleResponse(digit) }} className="btn-secondary min-h-12">{digit}</button>
      ))}
    </div>
  ) : null

  if (phase === 'instruction') return <CognitiveTaskIntro title="符号数字配对" description={<p>上方图例显示五个“符号 = 数字”的配对。每题出现一个符号，请尽快按它对应的数字（按键 1–5 或点击按钮）。</p>} hint={<>{practiceAttempt > 1 && <p>上一轮练习未通过，请重新阅读完整说明和例子，再开始下一轮。</p>}<p>例子：若图例显示「● = 1」，出现●时就选1；以本次图例为准。</p><p>图例全程可见；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'blocked') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700 mb-4">练习尚未通过，本次正式测评未开始。</p><button type="button" className="btn-secondary" onClick={() => window.history.back()}>返回</button></div>

  if (phase === 'practice') {
    const symbol = SYMBOLMATCH_PRACTICE_SYMBOLS[practiceIndex]
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-2">练习 {practiceIndex + 1} / {SYMBOLMATCH_PRACTICE_SYMBOLS.length} · 第 {practiceAttempt} 轮 · 不计入成绩</div><KeyLegend />{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-24 pt-6">+</div>}{subPhase === 'stimulus' && symbol && <div className="text-6xl font-bold text-gray-800 h-24 pt-4">{symbol}</div>}{subPhase === 'feedback' && <div className="h-24 pt-6 text-gray-700">{practiceFeedback}</div>}<ResponseButtons show={subPhase === 'stimulus'} />{subPhase === 'feedback' && <button type="button" onClick={advancePractice} className="btn-primary">{practiceIndex + 1 >= SYMBOLMATCH_PRACTICE_SYMBOLS.length ? practiceCorrect.every(Boolean) ? '开始正式测评' : practiceAttempt < MAX_PRACTICE_ATTEMPTS ? '重新练习' : '结束' : '下一个'}</button>}</div>
  }

  if (!currentSymbol) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return <CognitiveFocusStage ariaLabel="符号数字配对正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><KeyLegend />{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-24 pt-6">+</div>}{subPhase === 'stimulus' && <div className="text-6xl font-bold text-gray-800 h-24 pt-4">{currentSymbol}</div>}{subPhase === 'feedback' && <div className="h-24 pt-6 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{subPhase === 'stimulus' && formalFeedback && <p className="mt-1 text-sm text-amber-600">{formalFeedback}</p>}<ResponseButtons show={subPhase === 'stimulus'} /><p className="text-xs text-gray-400 mt-6">按键 1–5 或点击按钮作答</p></div></CognitiveFocusStage>
}
