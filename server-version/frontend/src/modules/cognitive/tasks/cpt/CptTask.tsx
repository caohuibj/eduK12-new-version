import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { cptSequence } from '../shared/prng'
import { PRACTICE_FEEDBACK_MS, PRACTICE_PASS_CORRECT, PRACTICE_TRIAL_COUNT } from '../shared/practice'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'

export const CptTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete }) => {
  const config = taskContext.config as {
    totalTrials: number
    targetRatio: number
    blockCount: number
    stimulusMs: number
    isiMs: number
  }
  const total = config.totalTrials ?? 180
  const blockCount = config.blockCount ?? 1
  const isiMs = config.isiMs ?? 400
  const stimulusMs = config.stimulusMs ?? 500
  const sequence = useMemo(
    () => cptSequence(taskContext.randomSeed, total, config.targetRatio ?? 0.2, blockCount),
    [taskContext.randomSeed, total, config.targetRatio, blockCount],
  )
  const [phase, setPhase] = useState<Phase>('instruction')
  const [visible, setVisible] = useState(false)
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [practiceNonce, setPracticeNonce] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [acknowledgedBlockIndex, setAcknowledgedBlockIndex] = useState<number | null>(blockCount > 1 ? null : 0)
  const onsetRef = useRef<number | null>(null)
  const respondedRef = useRef(false)
  const interruptedRef = useRef(false)
  const practiceCorrectRef = useRef(0)

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
    setAcknowledgedBlockIndex(blockCount > 1 ? null : 0)
    setPhase('formal')
  }

  useEffect(() => {
    const onHidden = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  useEffect(() => {
    if (phase !== 'practice' && phase !== 'formal') return
    const current = phase === 'formal'
      ? sequence[trialIndex]
      : { stimulus: practiceIndex % 2 === 0 ? 'X' : 'A', isTarget: practiceIndex % 2 === 0, blockIndex: 0 }
    if (phase === 'formal' && (trialIndex >= total || !current)) return
    if (phase === 'formal' && blockCount > 1 && acknowledgedBlockIndex !== current.blockIndex) return
    respondedRef.current = false
    interruptedRef.current = false
    onsetRef.current = null
    setVisible(false)
    setFeedback(null)
    const show = window.setTimeout(() => {
      setVisible(true)
      onsetRef.current = performance.now()
    }, isiMs)
    const hide = window.setTimeout(async () => {
      setVisible(false)
      const responded = respondedRef.current
      const correct = current.isTarget ? responded : !responded
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
      if (!responded) {
        await onTrialComplete({
          blockIndex: current.blockIndex,
          stimulus: current.stimulus,
          isTarget: current.isTarget,
          responded: false,
          rtMs: null,
          interrupted: interruptedRef.current,
        })
      }
    }, isiMs + stimulusMs)
    return () => { window.clearTimeout(show); window.clearTimeout(hide) }
  }, [
    phase,
    trialIndex,
    practiceIndex,
    practiceNonce,
    sequence,
    total,
    blockCount,
    acknowledgedBlockIndex,
    isiMs,
    stimulusMs,
    onTrialComplete,
  ])

  const current = phase === 'formal'
    ? sequence[trialIndex]
    : { stimulus: practiceIndex % 2 === 0 ? 'X' : 'A', isTarget: practiceIndex % 2 === 0, blockIndex: 0 }

  const respond = async () => {
    if (!visible || respondedRef.current || onsetRef.current == null) return
    respondedRef.current = true
    const rtMs = Math.round(performance.now() - onsetRef.current)
    if (phase !== 'formal' || !current) return
    await onTrialComplete({
      blockIndex: current.blockIndex,
      stimulus: current.stimulus,
      isTarget: current.isTarget,
      responded: true,
      rtMs,
      interrupted: interruptedRef.current,
    })
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
        <h2 className="text-xl font-semibold mb-3">连续执行任务</h2>
        <p className="text-gray-600 mb-4">只在出现字母 X 时按下，其他字母不要按。</p>
        <p className="text-xs text-gray-400 mb-6">电脑可按空格或 Enter；触屏可点击中央作答区。练习不计入正式成绩，多区块版本会在区块之间暂停。</p>
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

  if (phase === 'formal' && trialIndex >= total) {
    return <div className="card p-8 text-center text-gray-600">正式试次已完成，请完成本次测评。</div>
  }

  if (phase === 'formal' && current && blockCount > 1 && acknowledgedBlockIndex !== current.blockIndex) {
    const isFirstBlock = current.blockIndex === 0
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-3">{isFirstBlock ? '准备开始持续注意测验' : '区块完成，可以短暂休息'}</h2>
        <p className="text-gray-600 mb-2">即将开始区块 {current.blockIndex + 1} / {blockCount}</p>
        <p className="text-sm text-gray-500 mb-6">
          {isFirstBlock ? '正式测验分为多个区块。每个区块都保持同一规则：只对 X 作答。' : '准备好后继续。休息时请不要离开测评页面太久。'}
        </p>
        <button className="btn-primary" onClick={() => setAcknowledgedBlockIndex(current.blockIndex)}>
          {isFirstBlock ? '开始第 1 区块' : '继续下一组'}
        </button>
      </div>
    )
  }

  const taskBody = (
    <div
      className="mx-auto max-w-2xl text-center p-8"
      onPointerDown={() => { void respond() }}
      role="button"
      tabIndex={-1}
      aria-label={phase === 'practice' ? 'CPT 练习作答区' : 'CPT 正式作答区'}
    >
      {phase === 'practice' ? <p className="text-sm text-gray-500 mb-2">练习 {practiceIndex + 1} / {PRACTICE_TRIAL_COUNT}</p> : null}
      {feedback && <p className="text-sm mb-3">{feedback}</p>}
      <div className="text-6xl font-bold text-gray-800 h-24">{visible ? current?.stimulus : ''}</div>
      {phase === 'formal' ? <p className="mt-5 text-xs text-gray-400">仅看到 X 时按空格 / Enter，或点击此区域</p> : null}
    </div>
  )

  return phase === 'formal'
    ? <CognitiveFocusStage ariaLabel="CPT 正式测验">{taskBody}</CognitiveFocusStage>
    : taskBody
}
