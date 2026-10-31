import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { LetternumseriesConfig, LetternumseriesTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { buildLetternumseriesSequences, LETTERNUMSERIES_PRACTICE_SEQUENCE } from './prng'

const LETTER_POOL = ['B', 'D', 'F', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T']
const DIGIT_POOL = ['2', '3', '4', '5', '6', '7', '8', '9']

type Phase = 'instruction' | 'practice' | 'formal' | 'blocked'
type PhaseStep = 'presentation' | 'recall-letters' | 'recall-digits' | 'feedback'

const isLetter = (item: string): boolean => /[A-Za-z]/.test(item)

export const LetternumseriesTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as LetternumseriesConfig
  const totalTrials = config?.totalTrials ?? 10
  const lettersPerTrial = config?.lettersPerTrial ?? 4
  const digitsPerTrial = config?.digitsPerTrial ?? 3
  const stimulusMs = config?.stimulusMs ?? 700
  const isiMs = config?.isiMs ?? 300
  const [phase, setPhase] = useState<Phase>('instruction')
  const [step, setStep] = useState<PhaseStep>('presentation')
  const [presentationPosition, setPresentationPosition] = useState(-1)
  const [visibleItem, setVisibleItem] = useState<string | null>(null)
  const [lettersSelection, setLettersSelection] = useState<string[]>([])
  const [digitsSelection, setDigitsSelection] = useState<string[]>([])
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const interruptedRef = useRef(false)
  const recallStartRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const pendingSubmissionRef = useRef<LetternumseriesTrialPayload | null>(null)
  const [submissionFailed, setSubmissionFailed] = useState(false)
  const trials = useMemo(
    () => buildLetternumseriesSequences(taskContext.randomSeed, totalTrials, lettersPerTrial, digitsPerTrial),
    [taskContext.randomSeed, totalTrials, lettersPerTrial, digitsPerTrial]
  )
  const currentTrial = trials[trialIndex]
  const sequence = phase === 'practice' ? LETTERNUMSERIES_PRACTICE_SEQUENCE : currentTrial?.sequence ?? []
  const practiceTargetLetters = useMemo(() => LETTERNUMSERIES_PRACTICE_SEQUENCE.filter(isLetter).sort(), [])
  const practiceTargetDigits = useMemo(() => LETTERNUMSERIES_PRACTICE_SEQUENCE.filter((item) => !isLetter(item)).sort((a, b) => Number(a) - Number(b)), [])
  const requiredLetters = phase === 'practice' ? practiceTargetLetters.length : lettersPerTrial
  const requiredDigits = phase === 'practice' ? practiceTargetDigits.length : digitsPerTrial

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || step !== 'presentation') return
    if (presentationPosition < 0) {
      setVisibleItem(null); setLettersSelection([]); setDigitsSelection([]); setPracticeFeedback(null); setFormalFeedback(null); interruptedRef.current = false
    }
    if (presentationPosition >= sequence.length) {
      recallStartRef.current = performance.now()
      const timer = window.setTimeout(() => setStep('recall-letters'), isiMs)
      return () => window.clearTimeout(timer)
    }
    setVisibleItem(sequence[presentationPosition])
    const hideTimer = window.setTimeout(() => setVisibleItem(null), stimulusMs)
    const nextTimer = window.setTimeout(() => setPresentationPosition((current) => current + 1), stimulusMs + isiMs)
    return () => { window.clearTimeout(hideTimer); window.clearTimeout(nextTimer) }
  }, [phase, step, presentationPosition, sequence, stimulusMs, isiMs])

  useEffect(() => {
    if (phase !== 'formal') return
    pendingSubmissionRef.current = null; setSubmissionFailed(false)
    setFormalFeedback(null); setPresentationPosition(-1); setVisibleItem(null); setLettersSelection([]); setDigitsSelection([]); setStep('presentation'); interruptedRef.current = false
  }, [trialIndex])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const submitFormal = useCallback(async (lettersResponse: string[], digitsResponse: string[]) => {
    if (phase !== 'formal' || !currentTrial || submittingRef.current) return
    submittingRef.current = true
    const payload: LetternumseriesTrialPayload = pendingSubmissionRef.current ?? {
      sequence: currentTrial.sequence,
      lettersResponse,
      digitsResponse,
      responseDurationMs: recallStartRef.current === null ? 0 : Math.max(0, Math.round(performance.now() - recallStartRef.current)),
      interrupted: interruptedRef.current,
    }
    pendingSubmissionRef.current = payload; setSubmissionFailed(false)
    setFormalFeedback('已记录，下一题准备中'); setStep('feedback')
    try {
      const accepted = await Promise.resolve().then(() => onTrialComplete(payload)).catch(() => false)
      if (accepted === false) { setFormalFeedback('提交尚未确认，请重试已记录的答案'); setSubmissionFailed(true); return }
      pendingSubmissionRef.current = null
      if (trialIndex + 1 >= totalTrials) await onTaskComplete?.()
    } finally { submittingRef.current = false }
  }, [phase, currentTrial, onTrialComplete, trialIndex, totalTrials, onTaskComplete])

  const finishPracticeLetters = useCallback(() => {
    const correct = practiceTargetLetters.every((letter, slot) => lettersSelection[slot] === letter)
    setPracticeFeedback(correct ? '字母部分正确！接下来排数字。' : `正确顺序应为 ${practiceTargetLetters.join(' ')}。`)
    setStep('recall-digits')
  }, [lettersSelection, practiceTargetLetters])

  const finishPracticeDigits = useCallback(() => {
    const lettersOk = practiceTargetLetters.every((letter, slot) => lettersSelection[slot] === letter)
    const digitsOk = practiceTargetDigits.every((digit, slot) => digitsSelection[slot] === digit)
    setPracticeFeedback(digitsOk && lettersOk ? '完全正确！正式测验不再提示。' : `数字正确顺序应为 ${practiceTargetDigits.join(' ')}。`)
    setStep('feedback')
  }, [digitsSelection, practiceTargetDigits, lettersSelection, practiceTargetLetters])

  const handlePracticeSubmit = useCallback(() => {
    if (step === 'recall-letters') finishPracticeLetters()
    else if (step === 'recall-digits') finishPracticeDigits()
  }, [step, finishPracticeLetters, finishPracticeDigits])

  const startPractice = useCallback(() => { setPresentationPosition(-1); setLettersSelection([]); setDigitsSelection([]); setStep('presentation'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    setFormalFeedback(null); setPresentationPosition(-1); setLettersSelection([]); setDigitsSelection([]); setStep('presentation'); setPhase('formal')
  }, [])

  const LetterPanel: React.FC<{ show: boolean }> = ({ show }) => show ? (
    <div className="mt-3">
      <p className="text-gray-700">按 A→Z 的顺序，选出刚才的字母：</p>
      <div className="flex justify-center gap-2 my-2 min-h-12">
        {Array.from({ length: requiredLetters }, (_, slot) => (
          <span key={slot} className="inline-flex h-12 w-12 items-center justify-center rounded border-2 border-dashed border-gray-300 text-2xl font-bold text-gray-800">{lettersSelection[slot] ?? ''}</span>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
        {LETTER_POOL.map((letter) => (
          <button key={letter} type="button" disabled={lettersSelection.length >= requiredLetters || lettersSelection.includes(letter)} onClick={() => setLettersSelection((current) => [...current, letter])} className="btn-secondary min-h-11 min-w-11">{letter}</button>
        ))}
      </div>
      <div className="flex justify-center gap-3 mt-3">
        <button type="button" className="btn-secondary" onClick={() => setLettersSelection((current) => current.slice(0, -1))} disabled={lettersSelection.length === 0}>撤销</button>
        <button type="button" className="btn-primary" onClick={phase === 'practice' ? handlePracticeSubmit : () => setStep('recall-digits')} disabled={lettersSelection.length < requiredLetters}>{phase === 'practice' ? '提交字母' : '下一步：排数字'}</button>
      </div>
    </div>
  ) : null

  const DigitPanel: React.FC<{ show: boolean }> = ({ show }) => show ? (
    <div className="mt-3">
      <p className="text-gray-700">按从小到大的顺序，选出刚才的数字：</p>
      <div className="flex justify-center gap-2 my-2 min-h-12">
        {Array.from({ length: requiredDigits }, (_, slot) => (
          <span key={slot} className="inline-flex h-12 w-12 items-center justify-center rounded border-2 border-dashed border-gray-300 text-2xl font-bold text-gray-800">{digitsSelection[slot] ?? ''}</span>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
        {DIGIT_POOL.map((digit) => (
          <button key={digit} type="button" disabled={digitsSelection.length >= requiredDigits || digitsSelection.includes(digit)} onClick={() => setDigitsSelection((current) => [...current, digit])} className="btn-secondary min-h-11 min-w-11">{digit}</button>
        ))}
      </div>
      <div className="flex justify-center gap-3 mt-3">
        <button type="button" className="btn-secondary" onClick={() => setDigitsSelection((current) => current.slice(0, -1))} disabled={digitsSelection.length === 0}>撤销</button>
        <button type="button" className="btn-primary" onClick={phase === 'practice' ? handlePracticeSubmit : () => void submitFormal(lettersSelection, digitsSelection)} disabled={digitsSelection.length < requiredDigits}>提交答案</button>
      </div>
    </div>
  ) : null

  if (phase === 'instruction') return <CognitiveTaskIntro title="字母数字序列" description={<p>字母和数字会混在一起逐个出现。停止后分两步回忆：先把字母按 A→Z 的顺序选出来，再把数字按从小到大选出来。</p>} hint={<><p>回忆阶段不限时；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'blocked') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700 mb-4">练习未完成，本次正式测评未开始。</p><button type="button" className="btn-secondary" onClick={() => window.history.back()}>返回</button></div>

  if (phase === 'practice') {
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 · 不计入成绩</div>{step === 'presentation' && <div className="text-6xl font-bold text-gray-800 h-32 pt-8">{visibleItem ?? (presentationPosition < 0 ? '准备…' : '')}</div>}{step === 'recall-letters' && <LetterPanel show />}{step === 'recall-digits' && <><div className="h-10 text-sm text-green-700 pt-2">{practiceFeedback}</div><DigitPanel show /></>}{step === 'feedback' && <div className="h-24 pt-6 text-gray-700">{practiceFeedback}</div>}{step === 'feedback' && <button type="button" className="btn-primary" onClick={advancePractice}>开始正式测评</button>}</div>
  }

  if (!currentTrial) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return <CognitiveFocusStage ariaLabel="字母数字序列正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">第 {trialIndex + 1} / {totalTrials} 题</div>{step === 'presentation' && <div className="text-6xl font-bold text-gray-800 h-32 pt-8">{visibleItem ?? (presentationPosition < 0 ? '准备…' : '')}</div>}{step === 'recall-letters' && <LetterPanel show />}{step === 'recall-digits' && <DigitPanel show />}{step === 'feedback' && <div className="h-24 pt-8 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{step === 'recall-letters' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}{step === 'presentation' && <p className="text-xs text-gray-400 mt-4">记住出现的字母和数字</p>}{submissionFailed && <button type="button" className="btn-primary mt-3" onClick={() => void submitFormal([], [])}>重试提交已记录答案</button>}</div></CognitiveFocusStage>
}
