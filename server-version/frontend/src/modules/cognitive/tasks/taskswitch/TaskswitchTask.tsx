import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { taskswitchSequence } from '../shared/prng'
import { PRACTICE_FEEDBACK_MS } from '../shared/practice'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'
type SubPhase = 'cue' | 'stimulus'
type PracticeStage = 'parity' | 'magnitude' | 'mixed'
type TaskRule = 'parity' | 'magnitude'
type PracticeTrial = { taskRule: TaskRule; stimulus: number; correctResponse: 'left' | 'right' }

const PARITY_PRACTICE: PracticeTrial[] = [
  { taskRule: 'parity', stimulus: 3, correctResponse: 'left' },
  { taskRule: 'parity', stimulus: 4, correctResponse: 'right' },
  { taskRule: 'parity', stimulus: 7, correctResponse: 'left' },
  { taskRule: 'parity', stimulus: 8, correctResponse: 'right' },
]

const MAGNITUDE_PRACTICE: PracticeTrial[] = [
  { taskRule: 'magnitude', stimulus: 2, correctResponse: 'left' },
  { taskRule: 'magnitude', stimulus: 8, correctResponse: 'right' },
  { taskRule: 'magnitude', stimulus: 3, correctResponse: 'left' },
  { taskRule: 'magnitude', stimulus: 7, correctResponse: 'right' },
]

const MIXED_PRACTICE: PracticeTrial[] = [
  { taskRule: 'parity', stimulus: 3, correctResponse: 'left' },
  { taskRule: 'magnitude', stimulus: 8, correctResponse: 'right' },
  { taskRule: 'magnitude', stimulus: 2, correctResponse: 'left' },
  { taskRule: 'parity', stimulus: 4, correctResponse: 'right' },
  { taskRule: 'parity', stimulus: 7, correctResponse: 'left' },
  { taskRule: 'magnitude', stimulus: 3, correctResponse: 'left' },
  { taskRule: 'parity', stimulus: 8, correctResponse: 'right' },
  { taskRule: 'magnitude', stimulus: 7, correctResponse: 'right' },
]

const cueLabel = (rule: TaskRule) => (rule === 'parity' ? '奇偶' : '大小')
const stageLabel = (stage: PracticeStage) => stage === 'parity' ? '奇偶规则' : stage === 'magnitude' ? '大小规则' : '混合转换'

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
  const [practiceStage, setPracticeStage] = useState<PracticeStage>('parity')
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

  const practiceTrials = practiceStage === 'parity'
    ? PARITY_PRACTICE
    : practiceStage === 'magnitude'
      ? MAGNITUDE_PRACTICE
      : MIXED_PRACTICE

  const startPracticeStage = (stage: PracticeStage) => {
    setPracticeStage(stage)
    setPracticeIndex(0)
    setPracticeCorrect(0)
    practiceCorrectRef.current = 0
    setFeedback(null)
    setSubPhase('cue')
    respondedRef.current = false
    responseRef.current = null
    rtRef.current = null
    setPracticeNonce((value) => value + 1)
    setPhase('practice')
  }

  const startPractice = () => startPracticeStage('parity')

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
    const current = phase === 'formal' ? sequence[trialIndex] : practiceTrials[practiceIndex]
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
      const currentTrial = phase === 'formal' ? sequence[trialIndex] : practiceTrials[practiceIndex]
      const correct = responseRef.current === currentTrial.correctResponse
      if (phase === 'practice') {
        setFeedback(correct ? '正确' : `错误：当前规则是“${cueLabel(currentTrial.taskRule)}”。`)
        if (correct) practiceCorrectRef.current += 1
        const nextIndex = practiceIndex + 1
        window.setTimeout(() => {
          if (nextIndex >= practiceTrials.length) {
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
  }, [
    phase,
    trialIndex,
    practiceIndex,
    practiceNonce,
    practiceStage,
    practiceTrials,
    sequence,
    total,
    cueMs,
    stimulusMs,
    isiMs,
    onTrialComplete,
    onTaskComplete,
  ])

  const current = phase === 'formal' ? sequence[trialIndex] : practiceTrials[practiceIndex]

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
        <p className="text-gray-600 mb-2">看到“大小”：小于 5 按左，大于 5 按右。</p>
        <p className="text-gray-600 mb-4">正式测验中规则会在试次之间切换，所以每一题都先看规则提示，再按对应规则作答。</p>
        <p className="text-xs text-gray-400 mb-6">先分别练习两条规则，再练习规则混合转换；练习不计入正式成绩。</p>
        <button className="btn-primary" onClick={startPractice}>开始练习</button>
      </div>
    )
  }

  if (phase === 'practice-result') {
    const passCorrect = practiceStage === 'mixed' ? 6 : 3
    const passed = practiceCorrect >= passCorrect
    const nextStage: PracticeStage | null = practiceStage === 'parity' ? 'magnitude' : practiceStage === 'magnitude' ? 'mixed' : null
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-3">{stageLabel(practiceStage)}练习结果</h2>
        <p className="mb-2">练习正确 {practiceCorrect} / {practiceTrials.length}</p>
        <p className="text-sm text-gray-500 mb-4">需要至少正确 {passCorrect} 题才能继续。</p>
        {passed ? (
          nextStage ? (
            <button className="btn-primary" onClick={() => startPracticeStage(nextStage)}>继续{stageLabel(nextStage)}练习</button>
          ) : (
            <button className="btn-primary" onClick={startFormal}>开始正式测验</button>
          )
        ) : (
          <button className="btn-secondary" onClick={() => startPracticeStage(practiceStage)}>重新练习本阶段</button>
        )}
      </div>
    )
  }

  return (
    <div className="text-center p-8">
      <p className="text-sm text-gray-500 mb-2">
        {phase === 'practice'
          ? `${stageLabel(practiceStage)}练习 ${practiceIndex + 1} / ${practiceTrials.length}`
          : `试次 ${trialIndex + 1} / ${total}`}
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
