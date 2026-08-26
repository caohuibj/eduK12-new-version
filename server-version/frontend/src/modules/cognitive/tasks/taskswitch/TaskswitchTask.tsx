import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { taskswitchSequence } from '../shared/prng'
import { PRACTICE_FEEDBACK_MS, PRACTICE_PASS_CORRECT, PRACTICE_TRIAL_COUNT } from '../shared/practice'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'
type SubPhase = 'cue' | 'stimulus'

const PRACTICE = [
  { taskRule: 'parity' as const, stimulus: 3, correctResponse: 'left' as const },
  { taskRule: 'parity' as const, stimulus: 4, correctResponse: 'right' as const },
  { taskRule: 'magnitude' as const, stimulus: 2, correctResponse: 'left' as const },
  { taskRule: 'magnitude' as const, stimulus: 8, correctResponse: 'right' as const },
]

const cueLabel = (rule: 'parity' | 'magnitude') => (rule === 'parity' ? '奇偶' : '大小')

export const TaskswitchTask: React.FC<CognitiveTaskProps> = ({
  taskContext,
  trialIndex,
  onTrialComplete,
  onTaskComplete,
}) => {
  const config = taskContext.config as {
    totalTrials: number
    switchRatio: number
    blockCount: number
    includePureBlocks: boolean
    cueMs: number
    stimulusMs: number
    isiMs: number
  }
  const total = config.totalTrials ?? 128
  const cueMs = config.cueMs ?? 400
  const stimulusMs = config.stimulusMs ?? 2000
  const isiMs = config.isiMs ?? 400
  const sequence = useMemo(
    () => taskswitchSequence(
      taskContext.randomSeed,
      total,
      config.blockCount ?? 4,
      config.switchRatio ?? 0.5,
      config.includePureBlocks ?? false,
    ),
    [taskContext.randomSeed, total, config.blockCount, config.switchRatio, config.includePureBlocks],
  )
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('cue')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [practiceNonce, setPracticeNonce] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const onsetRef = useRef<number | null>(null)
  const respondedRef = useRef(false)
  const responseRef = useRef<'left' | 'right' | null>(null)
  const rtRef = useRef<number | null>(null)
  const interruptedRef = useRef(false)
  const practiceCorrectRef = useRef(0)
  const submittingRef = useRef(false)

  const startPractice = () => {
    setPracticeIndex(0)
    setPracticeCorrect(0)
    practiceCorrectRef.current = 0
    setFeedback(null)
    setSubPhase('cue')
    setPracticeNonce((value) => value + 1)
    setPhase('practice')
  }

  const startFormal = () => {
    setFeedback(null)
    setSubPhase('cue')
    respondedRef.current = false
    responseRef.current = null
    rtRef.current = null
    interruptedRef.current = false
    setPhase('formal')
  }

  useEffect(() => {
    const onHidden = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  useEffect(() => {
    if (phase !== 'practice' && phase !== 'formal') return
    const current = phase === 'formal' ? sequence[trialIndex] : PRACTICE[practiceIndex]
    if (phase === 'formal' && (trialIndex >= total || !current)) return
    respondedRef.current = false
    responseRef.current = null
    rtRef.current = null
    interruptedRef.current = false
    submittingRef.current = false
    onsetRef.current = null
    setFeedback(null)
    setSubPhase('cue')
    const showStimulus = window.setTimeout(() => {
      setSubPhase('stimulus')
      onsetRef.current = performance.now()
    }, isiMs + cueMs)
    const hide = window.setTimeout(async () => {
      const currentTrial = phase === 'formal' ? sequence[trialIndex] : PRACTICE[practiceIndex]
      const correct = responseRef.current === currentTrial.correctResponse
      if (phase === 'practice') {
        setFeedback(correct ? '正确' : '错误')
        if (correct) practiceCorrectRef.current += 1
        const nextIndex = practiceIndex + 1
        window.setTimeout(() => {
          if (nextIndex >= PRACTICE_TRIAL_COUNT) {
            setPracticeCorrect(practiceCorrectRef.current)
            setPhase('practice-result')
            return
          }
          setPracticeIndex(nextIndex)
        }, PRACTICE_FEEDBACK_MS)
        return
      }
      if (!submittingRef.current && 'blockIndex' in currentTrial) {
        submittingRef.current = true
        await onTrialComplete({
          blockIndex: currentTrial.blockIndex,
          taskRule: currentTrial.taskRule,
          previousTaskRule: currentTrial.previousTaskRule,
          switchType: currentTrial.switchType,
          stimulus: currentTrial.stimulus,
          response: responseRef.current,
          rtMs: rtRef.current,
          interrupted: interruptedRef.current,
        })
        if (trialIndex + 1 >= total) await onTaskComplete?.()
      }
    }, isiMs + cueMs + stimulusMs)
    return () => {
      window.clearTimeout(showStimulus)
      window.clearTimeout(hide)
    }
  }, [phase, trialIndex, practiceIndex, practiceNonce, sequence, total, cueMs, stimulusMs, isiMs, onTrialComplete, onTaskComplete])

  const current = phase === 'formal' ? sequence[trialIndex] : PRACTICE[practiceIndex]

  const respond = (side: 'left' | 'right') => {
    if (subPhase !== 'stimulus' || respondedRef.current || onsetRef.current == null) return
    respondedRef.current = true
    responseRef.current = side
    rtRef.current = Math.round(performance.now() - onsetRef.current)
  }

  if (phase === 'instruction') {
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-3">任务转换</h2>
        <p className="text-gray-600 mb-2">看到“奇偶”：奇数按左，偶数按右。</p>
        <p className="text-gray-600 mb-4">看到“大小”：小于 5 按左，大于 5 按右。</p>
        <p className="text-xs text-gray-400 mb-6">练习不计入正式成绩，未通过可以重练。</p>
        <button className="btn-primary" onClick={startPractice}>开始练习</button>
      </div>
    )
  }

  if (phase === 'practice-result') {
    const passed = practiceCorrect >= PRACTICE_PASS_CORRECT
    return (
      <div className="text-center p-8">
        <p className="mb-4">练习正确 {practiceCorrect} / {PRACTICE_TRIAL_COUNT}</p>
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
      <p className="text-sm text-gray-500 mb-2">
        {phase === 'practice' ? `练习 ${practiceIndex + 1} / ${PRACTICE_TRIAL_COUNT}` : `试次 ${trialIndex + 1} / ${total}`}
      </p>
      {feedback && <p className="text-sm mb-3">{feedback}</p>}
      <p className="text-lg text-gray-500 mb-3">{current ? cueLabel(current.taskRule) : ''}</p>
      <div className="text-6xl font-bold text-gray-800 h-24 mb-6">{subPhase === 'stimulus' ? current?.stimulus : ''}</div>
      <div className="flex justify-center gap-6">
        <button type="button" className="btn-secondary px-8" onClick={() => respond('left')}>左</button>
        <button type="button" className="btn-secondary px-8" onClick={() => respond('right')}>右</button>
      </div>
    </div>
  )
}
