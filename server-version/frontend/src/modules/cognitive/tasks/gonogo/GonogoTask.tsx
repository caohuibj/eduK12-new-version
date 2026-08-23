import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { gonogoSequence } from '../shared/prng'

type Phase = 'instruction' | 'practice' | 'formal'

export const GonogoTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete }) => {
  const config = taskContext.config as {
    totalTrials: number
    nogoRatio: number
    stimulusMs: number
    isiMs: number
    validRtFloorMs: number
  }
  const total = config.totalTrials ?? 120
  const sequence = useMemo(
    () => gonogoSequence(taskContext.randomSeed, total, config.nogoRatio ?? 0.25),
    [taskContext.randomSeed, total, config.nogoRatio],
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
    const trialType = phase === 'formal' ? sequence[trialIndex] : practiceLeft % 2 === 0 ? 'nogo' : 'go'
    if (!trialType || (phase === 'formal' && trialIndex >= total)) return
    respondedRef.current = false
    interruptedRef.current = false
    onsetRef.current = null
    setVisible(false)
    const show = window.setTimeout(() => {
      setVisible(true)
      onsetRef.current = performance.now()
    }, 300)
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
          trialType,
          responded: false,
          rtMs: null,
          interrupted: interruptedRef.current,
        })
      }
    }, 300 + (config.stimulusMs ?? 800))
    return () => { window.clearTimeout(show); window.clearTimeout(hide) }
  }, [phase, trialIndex, practiceLeft, sequence, total, config.stimulusMs, onTrialComplete])

  const trialType = phase === 'formal' ? sequence[trialIndex] : practiceLeft % 2 === 0 ? 'nogo' : 'go'

  const respond = async () => {
    if (!visible || respondedRef.current || onsetRef.current == null) return
    respondedRef.current = true
    const rtMs = Math.round(performance.now() - onsetRef.current)
    if (phase === 'practice') return
    await onTrialComplete({
      trialType,
      responded: true,
      rtMs,
      interrupted: interruptedRef.current,
    })
  }

  if (phase === 'instruction') {
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-3">Go/No-Go</h2>
        <p className="text-gray-600 mb-4">绿色出现时尽快按下；红色出现时不要按。</p>
        <p className="text-xs text-gray-400 mb-6">练习不计入正式成绩。</p>
        <button className="btn-primary" onClick={() => setPhase('practice')}>开始练习</button>
      </div>
    )
  }

  return (
    <div className="text-center p-8">
      <p className="text-sm text-gray-500 mb-6">{phase === 'practice' ? `练习剩余 ${practiceLeft}` : `试次 ${trialIndex + 1} / ${total}`}</p>
      <button
        type="button"
        aria-label="respond"
        className={`mx-auto h-32 w-32 rounded-full ${visible ? (trialType === 'go' ? 'bg-green-500' : 'bg-red-500') : 'bg-gray-200'}`}
        onClick={() => { void respond() }}
      />
    </div>
  )
}
