import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { cptSequence } from '../shared/prng'

type Phase = 'instruction' | 'practice' | 'formal'

export const CptTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete }) => {
  const config = taskContext.config as {
    totalTrials: number
    targetRatio: number
    blockCount: number
    stimulusMs: number
    isiMs: number
  }
  const total = config.totalTrials ?? 180
  const sequence = useMemo(
    () => cptSequence(taskContext.randomSeed, total, config.targetRatio ?? 0.2, config.blockCount ?? 1),
    [taskContext.randomSeed, total, config.targetRatio, config.blockCount],
  )
  const [phase, setPhase] = useState<Phase>('instruction')
  const [visible, setVisible] = useState(false)
  const [practiceLeft, setPracticeLeft] = useState(4)
  const onsetRef = useRef<number | null>(null)
  const respondedRef = useRef(false)
  const interruptedRef = useRef(false)

  useEffect(() => {
    const onHidden = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  useEffect(() => {
    if (phase === 'instruction') return
    const current = phase === 'formal' ? sequence[trialIndex] : { stimulus: practiceLeft % 2 === 0 ? 'X' : 'A', isTarget: practiceLeft % 2 === 0, blockIndex: 0 }
    if (!current || (phase === 'formal' && trialIndex >= total)) return
    respondedRef.current = false
    interruptedRef.current = false
    onsetRef.current = null
    setVisible(false)
    const show = window.setTimeout(() => {
      setVisible(true)
      onsetRef.current = performance.now()
    }, config.isiMs ?? 400)
    const hide = window.setTimeout(async () => {
      setVisible(false)
      if (phase === 'practice') {
        setPracticeLeft((value) => {
          const next = value - 1
          if (next <= 0) setPhase('formal')
          return next
        })
        return
      }
      if (!respondedRef.current) {
        await onTrialComplete({
          blockIndex: current.blockIndex,
          stimulus: current.stimulus,
          isTarget: current.isTarget,
          responded: false,
          rtMs: null,
          interrupted: interruptedRef.current,
        })
      }
    }, (config.isiMs ?? 400) + (config.stimulusMs ?? 500))
    return () => { window.clearTimeout(show); window.clearTimeout(hide) }
  }, [phase, trialIndex, practiceLeft, sequence, total, config.isiMs, config.stimulusMs, onTrialComplete])

  const current = phase === 'formal' ? sequence[trialIndex] : { stimulus: practiceLeft % 2 === 0 ? 'X' : 'A', isTarget: practiceLeft % 2 === 0, blockIndex: 0 }

  const respond = async () => {
    if (!visible || respondedRef.current || onsetRef.current == null) return
    respondedRef.current = true
    const rtMs = Math.round(performance.now() - onsetRef.current)
    if (phase === 'practice') return
    await onTrialComplete({
      blockIndex: current.blockIndex,
      stimulus: current.stimulus,
      isTarget: current.isTarget,
      responded: true,
      rtMs,
      interrupted: interruptedRef.current,
    })
  }

  if (phase === 'instruction') {
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-3">连续执行任务</h2>
        <p className="text-gray-600 mb-4">只在出现字母 X 时按下，其他字母不要按。</p>
        <p className="text-xs text-gray-400 mb-6">练习不计入正式成绩。</p>
        <button className="btn-primary" onClick={() => setPhase('practice')}>开始练习</button>
      </div>
    )
  }

  return (
    <div className="text-center p-8" onClick={() => { void respond() }} onKeyDown={() => { void respond() }} role="button" tabIndex={0}>
      <p className="text-sm text-gray-500 mb-6">{phase === 'practice' ? `练习剩余 ${practiceLeft}` : `试次 ${trialIndex + 1} / ${total}`}</p>
      <div className="text-6xl font-bold text-gray-800 h-24">{visible ? current.stimulus : ''}</div>
    </div>
  )
}
