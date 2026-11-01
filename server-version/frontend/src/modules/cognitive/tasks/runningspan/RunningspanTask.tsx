import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { RunningspanConfig, RunningspanTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { buildRunningspanSequences, RUNNINGSPAN_LETTERS } from './prng'

type Phase = 'instruction' | 'practice' | 'formal' | 'blocked'
type PhaseStep = 'presentation' | 'recall' | 'feedback'

export const RunningspanTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as RunningspanConfig
  const totalTrials = config?.totalTrials ?? 12
  const listLengthMin = config?.listLengthMin ?? 7
  const listLengthMax = config?.listLengthMax ?? 11
  const recallLength = config?.recallLength ?? 3
  const stimulusMs = config?.stimulusMs ?? 500
  const isiMs = config?.isiMs ?? 250
  const [phase, setPhase] = useState<Phase>('instruction')
  const [step, setStep] = useState<PhaseStep>('presentation')
  const [presentationPosition, setPresentationPosition] = useState(-1)
  const [selection, setSelection] = useState<string[]>([])
  const [practiceAttempt, setPracticeAttempt] = useState(1)
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const [visibleLetter, setVisibleLetter] = useState<string | null>(null)
  const interruptedRef = useRef(false)
  const presentationStartRef = useRef<number | null>(null)
  const recallStartRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const trials = useMemo(
    () => buildRunningspanSequences(taskContext.randomSeed, totalTrials, listLengthMin, listLengthMax),
    [taskContext.randomSeed, totalTrials, listLengthMin, listLengthMax]
  )
  const currentTrial = trials[trialIndex]
  const practiceSequence = useMemo(() => ['D', 'N', 'R', 'T', 'X'], [])
  const sequence = phase === 'practice' ? practiceSequence : currentTrial?.sequence ?? []

  // 逐字母呈现：position 推进到序列结束后进入回忆。
  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || step !== 'presentation') return
    if (presentationPosition < 0) { presentationStartRef.current = performance.now(); setVisibleLetter(null); setSelection([]); setPracticeFeedback(null); setFormalFeedback(null) }
    if (presentationPosition >= sequence.length) {
      const timer = window.setTimeout(() => {
        recallStartRef.current = performance.now()
        setStep('recall')
      }, isiMs)
      return () => window.clearTimeout(timer)
    }
    setVisibleLetter(sequence[presentationPosition])
    const hideTimer = window.setTimeout(() => setVisibleLetter(null), stimulusMs)
    const nextTimer = window.setTimeout(() => setPresentationPosition((current) => current + 1), stimulusMs + isiMs)
    return () => { window.clearTimeout(hideTimer); window.clearTimeout(nextTimer) }
  }, [phase, step, presentationPosition, sequence, stimulusMs, isiMs])

  useEffect(() => {
    if (phase !== 'formal') return
    interruptedRef.current = false
    setFormalFeedback(null)
    setPresentationPosition(-1)
    setSelection([])
    setStep('presentation')
  }, [phase, trialIndex])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const submitFormal = useCallback(async (response: string[]) => {
    if (phase !== 'formal' || step !== 'recall' || !currentTrial || submittingRef.current) return
    submittingRef.current = true
    const payload: RunningspanTrialPayload = {
      sequence: currentTrial.sequence,
      response,
      responseDurationMs: recallStartRef.current === null ? 0 : Math.max(0, Math.round(performance.now() - recallStartRef.current)),
      interrupted: interruptedRef.current,
    }
    setFormalFeedback('已记录，下一题准备中'); setStep('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前试次'); setStep('recall'); return }
      if (trialIndex + 1 >= totalTrials) await onTaskComplete?.()
    } finally { submittingRef.current = false }
  }, [phase, step, currentTrial, onTrialComplete, trialIndex, totalTrials, onTaskComplete])

  const handlePracticeSubmit = useCallback(() => {
    if (step !== 'recall') return
    const window = practiceSequence.slice(-recallLength)
    const correctCount = selection.filter((letter, slot) => window[slot] === letter).length
    setPracticeFeedback(`正确答案：${window.join(' ')}。你答对了 ${correctCount} / ${recallLength} 个位置。正式测验不再提示。`)
    setStep('feedback')
  }, [step, selection, practiceSequence, recallLength])

  const pickLetter = useCallback((letter: string) => {
    if (step !== 'recall' || selection.length >= recallLength) return
    setSelection((current) => [...current, letter])
  }, [step, selection.length, recallLength])

  const startPractice = useCallback(() => { setPresentationPosition(-1); setSelection([]); setPracticeAttempt(1); setPracticeFeedback(null); setStep('presentation'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    if (practiceAttempt < 1) { setPracticeAttempt((current) => current + 1); setPresentationPosition(-1); setSelection([]); setPracticeFeedback(null); setStep('presentation'); return }
    setFormalFeedback(null); setPresentationPosition(-1); setSelection([]); setStep('presentation'); setPhase('formal')
  }, [practiceAttempt])

  const RecallPanel: React.FC<{ show: boolean }> = ({ show }) => show ? (
    <div className="mt-4">
      <p className="text-gray-700 mb-2">请按出现顺序，选出最后 {recallLength} 个字母：</p>
      <div className="flex justify-center gap-2 mb-3 min-h-12">
        {Array.from({ length: recallLength }, (_, slot) => (
          <span key={slot} className="inline-flex h-12 w-12 items-center justify-center rounded border-2 border-dashed border-gray-300 text-2xl font-bold text-gray-800">{selection[slot] ?? ''}</span>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
        {RUNNINGSPAN_LETTERS.map((letter) => (
          <button key={letter} type="button" disabled={selection.length >= recallLength} onClick={() => pickLetter(letter)} className="btn-secondary min-h-11 min-w-11">{letter}</button>
        ))}
      </div>
      <div className="flex justify-center gap-3 mt-4">
        <button type="button" className="btn-secondary" onClick={() => setSelection((current) => current.slice(0, -1))} disabled={selection.length === 0}>撤销</button>
        <button type="button" className="btn-secondary" onClick={() => setSelection([])} disabled={selection.length === 0}>清空</button>
        {phase === 'practice'
          ? <button type="button" className="btn-primary" onClick={handlePracticeSubmit}>提交答案</button>
          : <button type="button" className="btn-primary" onClick={() => void submitFormal(selection)}>提交答案</button>}
      </div>
    </div>
  ) : null

  if (phase === 'instruction') return <CognitiveTaskIntro title="运行记忆广度" description={<p>字母会一个接一个出现，你不知道何时停止。请在心里一直保留“最近的几个”字母。序列停止后，按出现顺序选出最后 {recallLength} 个字母。像在滚动消息里记住最后几条，这里观察序列结束后能否按顺序找回末尾内容。</p>} hint={<><p>回忆阶段不限时；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'blocked') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700 mb-4">练习未完成，本次正式测评未开始。</p><button type="button" className="btn-secondary" onClick={() => window.history.back()}>返回</button></div>

  if (phase === 'practice') {
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 · 第 {practiceAttempt} 轮 · 不计入成绩</div>{step === 'presentation' && <div className="text-6xl font-bold text-gray-800 h-32 pt-8">{visibleLetter ?? (presentationPosition < 0 ? '准备…' : '')}</div>}{step === 'recall' && <RecallPanel show />}{step === 'feedback' && <div className="h-32 pt-8 text-gray-700">{practiceFeedback}</div>}{step === 'feedback' && <button type="button" className="btn-primary" onClick={advancePractice}>开始正式测评</button>}</div>
  }

  if (!currentTrial) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return <CognitiveFocusStage ariaLabel="运行记忆广度正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">第 {trialIndex + 1} / {totalTrials} 题</div>{step === 'presentation' && <div className="text-6xl font-bold text-gray-800 h-32 pt-8">{visibleLetter ?? (presentationPosition < 0 ? '准备…' : '')}</div>}{step === 'recall' && <RecallPanel show />}{step === 'feedback' && <div className="h-32 pt-8 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{step === 'recall' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}{step === 'presentation' && <p className="text-xs text-gray-400 mt-6">记住最近的 {recallLength} 个字母</p>}</div></CognitiveFocusStage>
}
