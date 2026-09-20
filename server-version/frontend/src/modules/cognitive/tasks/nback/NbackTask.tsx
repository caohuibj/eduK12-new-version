import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { nbackSequence } from '../shared/prng'
import { PRACTICE_FEEDBACK_MS } from '../shared/practice'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'
type NLevel = 1 | 2 | 3
type PracticeTrial = { nLevel: NLevel; stimulus: string; target: boolean }

const PRACTICE_BY_N: Record<NLevel, PracticeTrial[]> = {
  1: [
    { nLevel: 1, stimulus: 'B', target: false },
    { nLevel: 1, stimulus: 'B', target: true },
    { nLevel: 1, stimulus: 'C', target: false },
    { nLevel: 1, stimulus: 'C', target: true },
  ],
  2: [
    { nLevel: 2, stimulus: 'B', target: false },
    { nLevel: 2, stimulus: 'C', target: false },
    { nLevel: 2, stimulus: 'B', target: true },
    { nLevel: 2, stimulus: 'D', target: false },
    { nLevel: 2, stimulus: 'C', target: false },
    { nLevel: 2, stimulus: 'D', target: true },
  ],
  3: [
    { nLevel: 3, stimulus: 'B', target: false },
    { nLevel: 3, stimulus: 'C', target: false },
    { nLevel: 3, stimulus: 'D', target: false },
    { nLevel: 3, stimulus: 'B', target: true },
    { nLevel: 3, stimulus: 'E', target: false },
    { nLevel: 3, stimulus: 'D', target: true },
  ],
}

export const NbackTask: React.FC<CognitiveTaskProps> = ({
  taskContext,
  trialIndex,
  onTrialComplete,
  onTaskComplete,
}) => {
  const config = taskContext.config as {
    nLevels: NLevel[]
    trialCountByN: number[]
    blockCountByN: number[]
    targetRatio: number
    stimulusMs: number
    isiMs: number
    validRtFloorMs: number
  }
  const isiMs = config.isiMs ?? 2000
  const stimulusMs = config.stimulusMs ?? 500
  const sequence = useMemo(
    () => nbackSequence(
      taskContext.randomSeed,
      config.nLevels ?? [1],
      config.trialCountByN ?? [30],
      config.blockCountByN ?? [1],
      config.targetRatio ?? 0.3,
    ),
    [taskContext.randomSeed, config.nLevels, config.trialCountByN, config.blockCountByN, config.targetRatio],
  )
  const total = sequence.length
  const firstNLevel = config.nLevels?.[0] ?? 1
  const [phase, setPhase] = useState<Phase>('instruction')
  const [visible, setVisible] = useState(false)
  const [practiceNLevel, setPracticeNLevel] = useState<NLevel>(firstNLevel)
  const [practiceReturnToFormal, setPracticeReturnToFormal] = useState(false)
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [practiceNonce, setPracticeNonce] = useState(0)
  const [practicedLevels, setPracticedLevels] = useState<NLevel[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)
  const [acknowledgedBlockIndex, setAcknowledgedBlockIndex] = useState<number | null>(null)
  const onsetRef = useRef<number | null>(null)
  const respondedRef = useRef(false)
  const interruptedRef = useRef(false)
  const practiceCorrectRef = useRef(0)
  const submittingRef = useRef(false)

  const practiceTrials = PRACTICE_BY_N[practiceNLevel]
  const practicePassCorrect = Math.ceil(practiceTrials.length * 0.75)

  const startPractice = (nLevel: NLevel = firstNLevel, returnToFormal = false) => {
    setPracticeNLevel(nLevel)
    setPracticeReturnToFormal(returnToFormal)
    setPracticeIndex(0)
    setPracticeCorrect(0)
    practiceCorrectRef.current = 0
    setFeedback(null)
    setVisible(false)
    respondedRef.current = false
    interruptedRef.current = false
    onsetRef.current = null
    setPracticeNonce((value) => value + 1)
    setPhase('practice')
  }

  const startFormal = () => {
    setFeedback(null)
    setVisible(false)
    respondedRef.current = false
    interruptedRef.current = false
    onsetRef.current = null
    setAcknowledgedBlockIndex(null)
    setPhase('formal')
  }

  const completePassedPractice = () => {
    setPracticedLevels((current) => current.includes(practiceNLevel) ? current : [...current, practiceNLevel])
    if (practiceReturnToFormal) {
      setFeedback(null)
      setVisible(false)
      setPhase('formal')
      return
    }
    startFormal()
  }

  const current = phase === 'formal' ? sequence[trialIndex] : practiceTrials[practiceIndex]

  useEffect(() => {
    const onHidden = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  useEffect(() => {
    if (phase !== 'practice' && phase !== 'formal') return
    if (phase === 'formal' && (trialIndex >= total || !current || !('blockIndex' in current))) return
    if (phase === 'formal' && !practicedLevels.includes(current.nLevel)) return
    if (phase === 'formal' && acknowledgedBlockIndex !== current.blockIndex) return
    respondedRef.current = false
    interruptedRef.current = false
    onsetRef.current = null
    submittingRef.current = false
    setVisible(false)
    setFeedback(null)
    const show = window.setTimeout(() => {
      setVisible(true)
      onsetRef.current = performance.now()
    }, isiMs)
    const hide = window.setTimeout(async () => {
      setVisible(false)
      const responded = respondedRef.current
      const correct = current.target ? responded : !responded
      if (phase === 'practice') {
        setFeedback(correct ? '正确' : `错误：${practiceNLevel}-back 要判断当前字母是否和前 ${practiceNLevel} 个位置的字母相同。`)
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
      if (!responded && !submittingRef.current && 'blockIndex' in current) {
        submittingRef.current = true
        await onTrialComplete({
          blockIndex: current.blockIndex,
          nLevel: current.nLevel,
          stimulus: current.stimulus,
          target: current.target,
          responded: false,
          rtMs: null,
          interrupted: interruptedRef.current,
        })
        if (trialIndex + 1 >= total) await onTaskComplete?.()
      }
    }, isiMs + stimulusMs)
    return () => { window.clearTimeout(show); window.clearTimeout(hide) }
  }, [
    phase,
    trialIndex,
    practiceIndex,
    practiceNonce,
    practiceNLevel,
    practiceTrials.length,
    practicedLevels,
    current,
    total,
    isiMs,
    stimulusMs,
    acknowledgedBlockIndex,
    onTrialComplete,
    onTaskComplete,
  ])

  const respond = async () => {
    if (!visible || respondedRef.current || onsetRef.current == null || submittingRef.current) return
    respondedRef.current = true
    const rtMs = Math.round(performance.now() - onsetRef.current)
    if (phase !== 'formal' || !current || !('blockIndex' in current)) return
    submittingRef.current = true
    await onTrialComplete({
      blockIndex: current.blockIndex,
      nLevel: current.nLevel,
      stimulus: current.stimulus,
      target: current.target,
      responded: true,
      rtMs,
      interrupted: interruptedRef.current,
    })
    if (trialIndex + 1 >= total) await onTaskComplete?.()
  }

  useEffect(() => {
    if (phase !== 'practice' && phase !== 'formal') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return
      event.preventDefault()
      void respond()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (phase === 'instruction') {
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-3">N-Back</h2>
        <p className="text-gray-600 mb-2">字母与 N 个之前相同时尽快按下，否则不要按。</p>
        <p className="text-gray-600 mb-4">如果正式测验升级到 2-back 或 3-back，会先完成对应的不计分练习，再进入该难度。</p>
        <p className="text-xs text-gray-400 mb-6">电脑可按空格或 Enter；触屏可点击中央作答区。练习不计入正式成绩。</p>
        <button className="btn-primary" onClick={() => startPractice(firstNLevel, false)}>开始练习</button>
      </div>
    )
  }

  if (phase === 'practice-result') {
    const passed = practiceCorrect >= practicePassCorrect
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-3">{practiceNLevel}-back 练习结果</h2>
        <p className="mb-2">练习正确 {practiceCorrect} / {practiceTrials.length}</p>
        <p className="text-sm text-gray-500 mb-4">需要至少正确 {practicePassCorrect} 题才能继续。</p>
        {passed ? (
          <button className="btn-primary" onClick={completePassedPractice}>
            {practiceReturnToFormal ? `继续 ${practiceNLevel}-back 正式测验` : '开始正式测验'}
          </button>
        ) : (
          <button className="btn-secondary" onClick={() => startPractice(practiceNLevel, practiceReturnToFormal)}>重新练习</button>
        )}
      </div>
    )
  }

  if (phase === 'formal' && current && 'blockIndex' in current && !practicedLevels.includes(current.nLevel)) {
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-3">准备进入 {current.nLevel}-back</h2>
        <p className="text-gray-600 mb-2">难度即将变化。先完成一组 {current.nLevel}-back 不计分练习，确认规则后再继续正式测验。</p>
        <p className="text-xs text-gray-400 mb-6">练习结果不会计入最终得分。</p>
        <button className="btn-primary" onClick={() => startPractice(current.nLevel, true)}>开始 {current.nLevel}-back 练习</button>
      </div>
    )
  }

  if (phase === 'formal' && current && 'blockIndex' in current && acknowledgedBlockIndex !== current.blockIndex) {
    const totalBlocks = sequence.length === 0 ? 0 : Math.max(...sequence.map((trial) => trial.blockIndex)) + 1
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-3">{current.nLevel}-back</h2>
        <p className="text-gray-600 mb-2">区块 {current.blockIndex + 1} / {totalBlocks}</p>
        <p className="text-xs text-gray-400 mb-6">每个区块会重新开始；前 {current.nLevel} 个字母不会是目标。</p>
        <button className="btn-primary" onClick={() => setAcknowledgedBlockIndex(current.blockIndex)}>开始本区块</button>
      </div>
    )
  }

  const taskBody = (
    <div
      className="mx-auto max-w-2xl text-center p-8"
      onPointerDown={() => { void respond() }}
      role="button"
      tabIndex={-1}
      aria-label={phase === 'practice' ? `${practiceNLevel}-back 练习作答区` : 'N-back 正式作答区'}
    >
      <p className="text-sm text-gray-500 mb-2">
        {phase === 'practice'
          ? `${practiceNLevel}-back 练习 ${practiceIndex + 1} / ${practiceTrials.length}`
          : `${current && 'nLevel' in current ? current.nLevel : firstNLevel}-back`}
      </p>
      {feedback && <p className="text-sm mb-3">{feedback}</p>}
      <div className="text-6xl font-bold text-gray-800 h-24">{visible ? current?.stimulus : ''}</div>
      <p className="mt-5 text-xs text-gray-400">目标出现时按空格 / Enter，或点击此区域</p>
    </div>
  )

  return phase === 'formal'
    ? <CognitiveFocusStage ariaLabel="N-back 正式测验">{taskBody}</CognitiveFocusStage>
    : taskBody
}
