import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { nbackSequence } from '../shared/prng'
import { PRACTICE_FEEDBACK_MS, PRACTICE_PASS_CORRECT, PRACTICE_TRIAL_COUNT } from '../shared/practice'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'

const PRACTICE = [
  { nLevel: 1 as const, blockIndex: 0, stimulus: 'B', target: false },
  { nLevel: 1 as const, blockIndex: 0, stimulus: 'B', target: true },
  { nLevel: 1 as const, blockIndex: 0, stimulus: 'C', target: false },
  { nLevel: 1 as const, blockIndex: 0, stimulus: 'C', target: true },
]

export const NbackTask: React.FC<CognitiveTaskProps> = ({
  taskContext,
  trialIndex,
  onTrialComplete,
  onTaskComplete,
}) => {
  const config = taskContext.config as {
    nLevels: Array<1 | 2 | 3>
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
  const [phase, setPhase] = useState<Phase>('instruction')
  const [visible, setVisible] = useState(false)
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [practiceNonce, setPracticeNonce] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [acknowledgedBlockIndex, setAcknowledgedBlockIndex] = useState<number | null>(null)
  const onsetRef = useRef<number | null>(null)
  const respondedRef = useRef(false)
  const interruptedRef = useRef(false)
  const practiceCorrectRef = useRef(0)
  const submittingRef = useRef(false)

  const startPractice = () => {
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

  const current = phase === 'formal' ? sequence[trialIndex] : PRACTICE[practiceIndex]

  useEffect(() => {
    const onHidden = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  useEffect(() => {
    if (phase !== 'practice' && phase !== 'formal') return
    if (phase === 'formal' && (trialIndex >= total || !current)) return
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
      if (!responded && !submittingRef.current) {
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
  }, [phase, trialIndex, practiceIndex, practiceNonce, current, total, isiMs, stimulusMs, acknowledgedBlockIndex, onTrialComplete, onTaskComplete])

  const respond = async () => {
    if (!visible || respondedRef.current || onsetRef.current == null || submittingRef.current) return
    respondedRef.current = true
    const rtMs = Math.round(performance.now() - onsetRef.current)
    if (phase !== 'formal' || !current || !('nLevel' in current)) return
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

  if (phase === 'instruction') {
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-3">N-Back</h2>
        <p className="text-gray-600 mb-4">字母与 N 个之前相同时尽快按下，否则不要按。</p>
        <p className="text-xs text-gray-400 mb-6">练习为 1-back，不计入正式成绩，未通过可以重练。</p>
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

  if (phase === 'formal' && current && acknowledgedBlockIndex !== current.blockIndex) {
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

  return (
    <div className="text-center p-8" onClick={() => { void respond() }} onKeyDown={() => { void respond() }} role="button" tabIndex={0}>
      <p className="text-sm text-gray-500 mb-2">
        {phase === 'practice'
          ? `练习 ${practiceIndex + 1} / ${PRACTICE_TRIAL_COUNT} · 1-back`
          : `试次 ${trialIndex + 1} / ${total} · ${current && 'nLevel' in current ? current.nLevel : 1}-back`}
      </p>
      {feedback && <p className="text-sm mb-3">{feedback}</p>}
      <div className="text-6xl font-bold text-gray-800 h-24">{visible ? current?.stimulus : ''}</div>
    </div>
  )
}
