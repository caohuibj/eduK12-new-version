import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { SeqlearnConfig, SeqlearnTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { buildSeqlearnPositions, SEQLEARN_PRACTICE_POSITIONS } from './prng'

const MAX_PRACTICE_ATTEMPTS = 1

type Phase = 'instruction' | 'practice' | 'formal' | 'blocked'
type SubPhase = 'fixation' | 'stimulus' | 'feedback'

const BOX_KEYS = ['1', '2', '3', '4']

export const SeqlearnTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as SeqlearnConfig
  const totalTrials = config?.totalTrials ?? 60
  const trialsPerBlock = config?.trialsPerBlock ?? 10
  const patternSequence = config?.patternSequence ?? [3, 1, 4, 2, 1, 3, 2, 4, 1, 2]
  const randomBlockIndices = config?.randomBlockIndices ?? [4]
  const fixationMs = config?.fixationMs ?? 300
  const timeoutMs = config?.timeoutMs ?? 1500
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('fixation')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const [practiceWrong, setPracticeWrong] = useState(false)
  const interruptedRef = useRef(false)
  const onsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const positions = useMemo(
    () => buildSeqlearnPositions(taskContext.randomSeed, totalTrials, trialsPerBlock, patternSequence, randomBlockIndices),
    [taskContext.randomSeed, totalTrials, trialsPerBlock, patternSequence, randomBlockIndices]
  )
  const currentTrial = positions[trialIndex]

  useEffect(() => {
    if (phase !== 'formal' || !currentTrial) return
    setFormalFeedback(null); interruptedRef.current = false; setSubPhase('fixation')
  }, [phase, trialIndex, currentTrial])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || subPhase !== 'fixation') return
    const delay = phase === 'practice' ? 400 : fixationMs + (trialIndex > 0 ? 150 : 0)
    const timer = window.setTimeout(() => { onsetRef.current = performance.now(); setSubPhase('stimulus') }, delay)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, trialIndex, fixationMs])

  const submitFormal = useCallback(async (response: number | null) => {
    if (phase !== 'formal' || subPhase !== 'stimulus' || !currentTrial || submittingRef.current) return
    submittingRef.current = true
    const payload: SeqlearnTrialPayload = {
      position: currentTrial.position,
      response,
      rtMs: response === null || onsetRef.current === null ? null : Math.max(0, Math.round(performance.now() - onsetRef.current)),
      interrupted: interruptedRef.current,
    }
    setFormalFeedback('已记录'); setSubPhase('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前试次'); setSubPhase('stimulus'); return }
      if (trialIndex + 1 >= totalTrials) await onTaskComplete?.()
    } finally { submittingRef.current = false }
  }, [phase, subPhase, currentTrial, onTrialComplete, trialIndex, totalTrials, onTaskComplete])

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

  const handleResponse = useCallback((response: number) => {
    if (phase === 'practice') {
      if (subPhase !== 'stimulus') return
      const expected = SEQLEARN_PRACTICE_POSITIONS[practiceIndex]
      const correct = response === expected
      setPracticeWrong(!correct)
      setPracticeFeedback(correct ? '正确：按信号所在格子。' : `信号在第 ${expected} 格。`)
      setSubPhase('feedback'); return
    }
    void submitFormal(response)
  }, [phase, practiceIndex, subPhase])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return
      const index = BOX_KEYS.indexOf(event.key)
      if (index >= 0) { event.preventDefault(); handleResponse(index + 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleResponse])

  const startPractice = useCallback(() => { setPracticeIndex(0); setPracticeFeedback(null); setPracticeWrong(false); setSubPhase('fixation'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    if (practiceIndex + 1 < SEQLEARN_PRACTICE_POSITIONS.length) { setPracticeIndex((current) => current + 1); setPracticeFeedback(null); setSubPhase('fixation'); return }
    if (practiceWrong && MAX_PRACTICE_ATTEMPTS > 1) { setPracticeIndex(0); setPracticeFeedback(null); setPracticeWrong(false); setSubPhase('fixation'); return }
    setFormalFeedback(null); setSubPhase('fixation'); setPhase('formal')
  }, [practiceIndex, practiceWrong])

  const Boxes: React.FC<{ show: boolean; highlight?: number }> = ({ show, highlight }) => (
    <div className="grid grid-cols-4 gap-3 max-w-lg mx-auto mt-4">
      {BOX_KEYS.map((key, index) => (
        <button
          key={key}
          type="button"
          disabled={!show}
          onPointerDown={() => handleResponse(index + 1)} onClick={(event) => { if (event.detail === 0) handleResponse(index + 1) }} onKeyDown={(event) => { if (event.repeat) event.preventDefault() }}
          className={`min-h-24 rounded-xl border-2 flex flex-col items-center justify-center transition-colors ${highlight === index + 1 ? 'border-sky-500 bg-sky-100' : 'border-gray-200 bg-gray-50'} ${show ? 'hover:border-sky-400' : 'opacity-70'}`}
          aria-label={`格子 ${key}`}
        >
          <span className={`h-4 w-4 rounded-full ${highlight === index + 1 ? 'bg-sky-500' : 'bg-transparent'}`} />
          <span className="text-sm text-gray-500 mt-2">按键 {key}</span>
        </button>
      ))}
    </div>
  )

  if (phase === 'instruction') return <CognitiveTaskIntro title="序列反应学习" description={<p>信号会随机出现在四个格子之一，请尽快按它对应的按键（按键 1–4 或点击格子）。位置规律不会提前告知——只管快速反应。</p>} hint={<><p>信号出现后限时作答；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'blocked') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700 mb-4">练习未完成，本次正式测评未开始。</p><button type="button" className="btn-secondary" onClick={() => window.history.back()}>返回</button></div>

  if (phase === 'practice') {
    const expected = SEQLEARN_PRACTICE_POSITIONS[practiceIndex]
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 {practiceIndex + 1} / {SEQLEARN_PRACTICE_POSITIONS.length} · 不计入成绩</div>{subPhase === 'fixation' && <div className="h-16"></div>}{subPhase !== 'fixation' && <Boxes show={subPhase === 'stimulus'} highlight={subPhase === 'stimulus' ? expected : undefined} />}{subPhase === 'feedback' && <div className="h-10 pt-3 text-gray-700">{practiceFeedback}</div>}{subPhase === 'feedback' && <button type="button" onClick={advancePractice} className="btn-primary">{practiceIndex + 1 >= SEQLEARN_PRACTICE_POSITIONS.length ? '开始正式测评' : '下一个'}</button>}</div>
  }

  if (!currentTrial) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return <CognitiveFocusStage ariaLabel="序列反应学习正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">第 {trialIndex + 1} / {totalTrials} 题</div>{subPhase === 'fixation' && <div className="h-24"></div>}{subPhase !== 'fixation' && <Boxes show={subPhase === 'stimulus'} highlight={subPhase === 'stimulus' ? currentTrial.position : undefined} />}{subPhase === 'feedback' && <div className="h-10 pt-3 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{subPhase === 'stimulus' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<p className="text-xs text-gray-400 mt-4">按键 1–4 或点击格子作答</p></div></CognitiveFocusStage>
}
