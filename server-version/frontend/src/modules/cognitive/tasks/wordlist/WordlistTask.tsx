import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { normalizeWordlistResponse } from './wordlist.utils'
import { wordlistStages, type WordlistStage } from '../shared/pr13Stimuli'

type Phase = 'instruction' | 'practice-study' | 'practice-recall' | 'practice-feedback' | 'practice-result' | 'formal-delay' | 'formal-study' | 'formal-recall'

const PRACTICE_WORDS = ['太阳', '钥匙', '花园', '雨伞']
const MAX_RESPONSES = 64

export const WordlistTask: React.FC<CognitiveTaskProps> = ({
  taskContext,
  trialIndex,
  onTrialComplete,
  onTaskComplete,
}) => {
  const config = taskContext.config as {
    listLength?: number
    learningRounds?: number
    delayedEnabled?: boolean
    delayedDelayMs?: number
    studyMsPerWord?: number
    recallTimeoutMs?: number
  }
  const stages = useMemo(() => wordlistStages(
    taskContext.randomSeed,
    config.listLength ?? 12,
    config.learningRounds ?? 3,
    config.delayedEnabled ?? false,
  ), [config.delayedEnabled, config.learningRounds, config.listLength, taskContext.randomSeed])
  const stage: WordlistStage | undefined = stages[trialIndex]
  const studyMsPerWord = config.studyMsPerWord ?? 800
  const recallTimeoutMs = config.recallTimeoutMs ?? 60000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practicePassedRounds, setPracticePassedRounds] = useState(0)
  const [studyIndex, setStudyIndex] = useState(-1)
  const [responses, setResponses] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [feedback, setFeedback] = useState('')
  const [interrupted, setInterrupted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [completionPending, setCompletionPending] = useState(false)
  const startedAtRef = useRef(0)
  const submittedRef = useRef(false)
  const completionRequestedRef = useRef(false)
  const formalStartedRef = useRef(false)
  const responsesRef = useRef<string[]>([])
  const interruptedRef = useRef(false)

  const activeStudyWords = phase === 'practice-study' ? PRACTICE_WORDS : stage?.words ?? []
  const activeRecallWords = phase === 'practice-recall' ? PRACTICE_WORDS : stage?.words ?? []

  useEffect(() => {
    if (!formalStartedRef.current || !stage) return
    responsesRef.current = []
    setResponses([])
    setDraft('')
    setFeedback('')
    setInterrupted(false)
    interruptedRef.current = false
    submittedRef.current = false
    setSubmitting(false)
    setCompletionPending(false)
    setStudyIndex(stage.phase === 'delayed' ? -1 : 0)
    setPhase(stage.phase === 'delayed' ? 'formal-delay' : 'formal-study')
    startedAtRef.current = performance.now()
  }, [stage, trialIndex])

  useEffect(() => {
    if (phase !== 'practice-study' && phase !== 'formal-study') return
    if (studyIndex < 0) {
      setStudyIndex(0)
      return
    }
    if (studyIndex >= activeStudyWords.length) {
      const timer = window.setTimeout(() => {
        startedAtRef.current = performance.now()
        setPhase(phase === 'practice-study' ? 'practice-recall' : 'formal-recall')
      }, 120)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => setStudyIndex((value) => value + 1), studyMsPerWord)
    return () => window.clearTimeout(timer)
  }, [activeStudyWords.length, phase, studyIndex, studyMsPerWord])

  useEffect(() => {
    if (phase !== 'formal-delay') return
    const timer = window.setTimeout(() => {
      startedAtRef.current = performance.now()
      setPhase('formal-recall')
    }, config.delayedDelayMs ?? 60000)
    return () => window.clearTimeout(timer)
  }, [config.delayedDelayMs, phase])

  useEffect(() => {
    if (phase !== 'formal-recall') return
    startedAtRef.current = performance.now()
    const timer = window.setTimeout(() => { void submitFormal(true) }, recallTimeoutMs)
    return () => window.clearTimeout(timer)
  }, [phase, recallTimeoutMs])

  useEffect(() => {
    if (phase !== 'formal-delay' && phase !== 'formal-recall' && phase !== 'formal-study') return
    const onVisibilityChange = () => {
      if (document.hidden) {
        interruptedRef.current = true
        setInterrupted(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const submitFormal = useCallback(async (timedOut = false) => {
    if (!stage || !formalStartedRef.current || submittedRef.current || submitting) return
    submittedRef.current = true
    setSubmitting(true)
    try {
      const accepted = await onTrialComplete({
        listId: stage.listId,
        stimulusSetVersion: stage.stimulusSetVersion,
        phase: stage.phase === 'delayed' ? 'delayed' : 'learning',
        responses: responsesRef.current,
        responseDurationMs: Math.max(0, Math.round(performance.now() - startedAtRef.current)),
        interrupted: interruptedRef.current || timedOut,
      })
      if (accepted === false) {
        submittedRef.current = false
        setSubmitting(false)
        setFeedback('提交未成功，请保留当前输入并重试。')
        return
      }
      if (trialIndex + 1 >= stages.length) {
        completionRequestedRef.current = true
        setCompletionPending(true)
        await onTaskComplete?.()
      } else {
        setInterrupted(false)
        interruptedRef.current = false
      }
    } catch {
      submittedRef.current = false
      setSubmitting(false)
      setFeedback('网络暂时不可用，请重试本阶段。')
    }
  }, [onTaskComplete, onTrialComplete, stage, stages.length, submitting, trialIndex])

  const addResponse = () => {
    const normalized = draft.normalize('NFKC').trim()
    if (!normalized || submitting || submittedRef.current) return
    if (responsesRef.current.length >= MAX_RESPONSES) {
      setFeedback(`本阶段最多输入 ${MAX_RESPONSES} 个词；可以删除已有输入后继续。`)
      return
    }
    const next = [...responsesRef.current, draft]
    responsesRef.current = next
    setResponses(next)
    setDraft('')
  }

  const removeResponse = (index: number) => {
    if (submitting || submittedRef.current) return
    const next = responsesRef.current.filter((_, responseIndex) => responseIndex !== index)
    responsesRef.current = next
    setResponses(next)
    setFeedback('')
  }

  const finishPractice = () => {
    const expected = new Set(PRACTICE_WORDS.map(normalizeWordlistResponse))
    const correct = new Set(responsesRef.current.map(normalizeWordlistResponse).filter((value) => expected.has(value))).size
    setPracticePassedRounds((value) => value + (correct >= 3 ? 1 : 0))
    setFeedback(`本轮记住了 ${correct} / ${PRACTICE_WORDS.length} 个词。`)
    setPhase('practice-feedback')
  }

  const nextPractice = () => {
    if (practiceIndex + 1 >= 4) setPhase('practice-result')
    else {
      setPracticeIndex((value) => value + 1)
      responsesRef.current = []
      setResponses([])
      setDraft('')
      setPhase('practice-study')
      setStudyIndex(-1)
    }
  }

  const startPractice = () => {
    formalStartedRef.current = false
    setPracticeIndex(0)
    setPracticePassedRounds(0)
    responsesRef.current = []
    setResponses([])
    setDraft('')
    setFeedback('')
    setPhase('practice-study')
    setStudyIndex(-1)
  }

  const startFormal = () => {
    formalStartedRef.current = true
    completionRequestedRef.current = false
    setCompletionPending(false)
    setInterrupted(false)
    interruptedRef.current = false
    responsesRef.current = []
    setResponses([])
    setDraft('')
    setFeedback('')
    setStudyIndex(stage?.phase === 'delayed' ? -1 : 0)
    setPhase(stage?.phase === 'delayed' ? 'formal-delay' : 'formal-study')
    startedAtRef.current = performance.now()
  }

  if (phase === 'instruction') {
    return (
      <div className="card p-8 text-center">
        <h1 className="mb-4 text-2xl font-bold text-gray-800">中文词表自由回忆</h1>
        <p className="mb-3 text-gray-600">请记住逐词出现的中文词，并在每轮用键盘自由输入你记得的词。可以按 Enter 把输入加入列表。</p>
        <p className="mb-6 text-xs text-gray-400">练习需要至少 3 / 4 轮达到基本熟悉；正式结果只描述本次作答，不进行繁简转换、同义词匹配或模糊纠错。</p>
        <button type="button" onClick={startPractice} className="btn-primary">开始练习</button>
      </div>
    )
  }

  if (phase === 'practice-result') {
    const passed = practicePassedRounds >= 3
    return (
      <div className="card p-8 text-center">
        <p className="mb-4 text-gray-700">练习达到基本熟悉 {practicePassedRounds} / 4 轮</p>
        <button type="button" onClick={passed ? startFormal : startPractice} className={passed ? 'btn-primary' : 'btn-secondary'}>
          {passed ? '开始正式测验' : '重新练习'}
        </button>
      </div>
    )
  }

  if (phase === 'practice-feedback') {
    return (
      <div className="card p-8 text-center">
        <p className="mb-5 text-gray-700">{feedback}</p>
        <button type="button" onClick={nextPractice} className="btn-primary">
          {practiceIndex + 1 >= 4 ? '查看练习结果' : '下一轮练习'}
        </button>
      </div>
    )
  }

  if (phase === 'practice-study' || phase === 'formal-study') {
    return (
      <div className="card p-8 text-center">
        <p className="mb-3 text-sm text-gray-500">{phase === 'practice-study' ? `练习 ${practiceIndex + 1} / 4` : `正式阶段 ${trialIndex + 1} / ${stages.length}`}</p>
        <p className="mb-6 text-gray-600">请记住当前词</p>
        <div className="flex min-h-24 items-center justify-center rounded-xl bg-sky-50 text-4xl font-semibold text-sky-700" aria-live="polite">
          {activeStudyWords[studyIndex] ?? '准备中…'}
        </div>
      </div>
    )
  }

  if (phase === 'formal-delay') {
    return (
      <div className="card p-8 text-center">
        <p className="mb-3 text-sm text-gray-500">正式延迟阶段</p>
        <p className="text-gray-700">请保持当前页面，等待结束后将再次回忆刚才学习的词语。</p>
      </div>
    )
  }

  const isPractice = phase === 'practice-recall'
  return (
    <div className="card p-8">
      <div className="mb-4 flex items-center justify-between text-sm text-gray-500">
        <span>{isPractice ? `练习 ${practiceIndex + 1} / 4` : `正式阶段 ${trialIndex + 1} / ${stages.length}`}</span>
        {!isPractice && stage?.phase === 'delayed' && <span>延迟回忆</span>}
      </div>
      <p className="mb-4 text-gray-700">请输入你记得的词，输入完成后提交本轮。</p>
      <div className="mb-4 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addResponse() } }}
          disabled={submitting || submittedRef.current}
          aria-label="输入回忆词"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-sky-500 focus:outline-none"
          autoFocus
        />
        <button type="button" onClick={addResponse} disabled={!draft.trim() || submitting || submittedRef.current} className="btn-secondary">加入</button>
      </div>
      <div className="mb-2 flex min-h-12 flex-wrap gap-2" aria-live="polite">
        {responses.map((response, index) => (
          <span key={`${response}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-sm text-sky-800">
            <span>{response}</span>
            <button type="button" onClick={() => removeResponse(index)} disabled={submitting || submittedRef.current} aria-label={`删除第 ${index + 1} 个输入`} className="rounded-full px-1 text-sky-700 hover:bg-sky-200 disabled:opacity-50">×</button>
          </span>
        ))}
        {responses.length === 0 && <span className="text-sm text-gray-400">尚未输入</span>}
      </div>
      <p className="mb-5 text-xs text-gray-400">已输入 {responses.length} / {MAX_RESPONSES}</p>
      <button type="button" onClick={() => isPractice ? finishPractice() : void submitFormal()} disabled={submitting || submittedRef.current} className="btn-primary w-full">
        {isPractice ? '提交练习本轮' : '提交本阶段'}
      </button>
      {feedback && <p className="mt-4 text-sm text-amber-700">{feedback}</p>}
      {!isPractice && interrupted && <p className="mt-3 text-xs text-amber-700">检测到页面切换，中断状态会随正式阶段提交。</p>}
      {!isPractice && completionPending && onTaskComplete && <button type="button" onClick={() => void onTaskComplete()} className="btn-secondary mt-4 w-full">重试完成测评</button>}
      {!isPractice && stage?.phase === 'delayed' && config.delayedDelayMs && config.delayedDelayMs > 0 && <p className="mt-3 text-xs text-gray-400">本阶段不再呈现词表，请凭记忆输入；想不起来的词可以留空。</p>}
      {activeRecallWords.length > 0 && <span className="sr-only">本阶段包含 {activeRecallWords.length} 个目标词</span>}
    </div>
  )
}
