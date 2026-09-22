import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { mentalRotationSequence, type RotationItemSpec } from '../shared/prng'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'
const PRACTICE = mentalRotationSequence('rotation-practice-v1', 12).slice(0, 4)

const ObjectGlyph: React.FC<{ family: RotationItemSpec['objectFamily']; variant: 0 | 1; angle?: number; mirrored?: boolean }> = ({ family, variant, angle = 0, mirrored = false }) => {
  const paths = {
    elbow: 'M16 12 V48 H52',
    fork: 'M14 14 L32 32 L50 14 M32 32 V52',
    step: 'M12 46 H28 V30 H44 V14 H54',
    zigzag: 'M10 16 H28 L40 48 H56',
  }
  return <div style={{ transform: `rotate(${angle}deg) scaleX(${mirrored ? -1 : 1})` }}><svg aria-hidden="true" viewBox="0 0 64 64" className="h-28 w-28"><path d={paths[family]} fill="none" stroke="#0f766e" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" /><circle cx="16" cy="12" r="4" fill="#c2410c" />{variant === 1 && <rect x="45" y="43" width="8" height="8" rx="2" fill="#7c3aed" />}</svg></div>
}

export const MentalrotationTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as { totalTrials: number; stimulusMs: number; isiMs: number }
  const total = config.totalTrials ?? 40
  const stimulusMs = config.stimulusMs ?? 5000
  const isiMs = config.isiMs ?? 400
  const sequence = useMemo(() => mentalRotationSequence(taskContext.randomSeed, total), [taskContext.randomSeed, total])
  const [phase, setPhase] = useState<Phase>('instruction')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [visible, setVisible] = useState(false)
  const [interrupted, setInterrupted] = useState(false)
  const onsetRef = useRef(0)
  const submittingRef = useRef(false)
  const completingRef = useRef(false)
  const item = phase === 'practice' ? PRACTICE[practiceIndex] : sequence[trialIndex] ?? sequence[sequence.length - 1]
  const completeOnce = useCallback(async () => { if (completingRef.current) return; completingRef.current = true; await onTaskComplete?.() }, [onTaskComplete])
  const startPractice = () => { setPracticeIndex(0); setPracticeCorrect(0); setFeedback(''); setPhase('practice') }
  const startFormal = () => { completingRef.current = false; setInterrupted(false); setVisible(false); setPhase('formal') }

  const submitFormal = useCallback(async (response: 'same' | 'mirror' | null, timedOut = false) => {
    if (phase !== 'formal' || submittingRef.current) return
    submittingRef.current = true
    try {
      const accepted = await onTrialComplete({
        itemId: item.itemId,
        response,
        rtMs: response == null ? null : Math.max(0, Math.round(performance.now() - onsetRef.current)),
        interrupted,
        timedOut,
      })
      if (accepted !== false) { setInterrupted(false); if (trialIndex + 1 >= total) await completeOnce() }
    } finally { submittingRef.current = false }
  }, [phase, item.itemId, interrupted, onTrialComplete, trialIndex, total, completeOnce])

  useEffect(() => {
    if (phase !== 'formal') return
    setVisible(false)
    const show = window.setTimeout(() => { onsetRef.current = performance.now(); setVisible(true) }, isiMs)
    const timeout = window.setTimeout(() => { void submitFormal(null, true) }, isiMs + stimulusMs)
    return () => { window.clearTimeout(show); window.clearTimeout(timeout) }
  }, [phase, trialIndex, isiMs, stimulusMs, submitFormal])
  useEffect(() => {
    if (phase !== 'formal') return
    const onHidden = () => { if (document.hidden) setInterrupted(true) }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [phase])
  useEffect(() => {
    if (phase !== 'formal') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!visible || submittingRef.current || event.repeat) return
      if (event.key === 'ArrowLeft') { event.preventDefault(); void submitFormal('same') }
      if (event.key === 'ArrowRight') { event.preventDefault(); void submitFormal('mirror') }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase, visible, submitFormal])

  const choose = (response: 'same' | 'mirror') => {
    if (phase === 'formal') { if (visible) void submitFormal(response); return }
    const correct = response === item.correctResponse
    const next = practiceCorrect + (correct ? 1 : 0)
    setPracticeCorrect(next); setFeedback(correct ? '正确' : '错误')
    if (practiceIndex + 1 >= 4) setPhase('practice-result'); else setPracticeIndex((value) => value + 1)
  }

  const onPointerResponse = (event: ReactPointerEvent<HTMLButtonElement>, response: 'same' | 'mirror') => {
    if (phase !== 'formal' || !event.isPrimary || event.button !== 0) return
    event.preventDefault()
    choose(response)
  }

  if (phase === 'instruction') return <div className="text-center p-8"><h2 className="text-xl font-semibold mb-3">心理旋转</h2><p className="mb-2 text-gray-600">判断右侧图形只是旋转后的同一图形，还是镜像图形。</p><p className="mb-2 text-xs text-gray-400">正式测验可用方向键：← 同一图形，→ 镜像图形。</p><p className="mb-6 text-xs text-gray-400">本任务依赖视觉比较；练习至少答对 3 / 4。</p><button className="btn-primary" onClick={startPractice}>开始练习</button></div>
  if (phase === 'practice-result') { const passed = practiceCorrect >= 3; return <div className="text-center p-8"><p className="mb-2">练习正确 {practiceCorrect} / 4</p><p className="mb-4 text-sm text-gray-500">上一题：{feedback}</p><button className={passed ? 'btn-primary' : 'btn-secondary'} onClick={passed ? startFormal : startPractice}>{passed ? '开始正式测验' : '重新练习'}</button></div> }
  const content = <div className="p-8 text-center"><p className="mb-5 text-sm text-gray-500">{phase === 'practice' ? `练习 ${practiceIndex + 1} / 4${feedback ? ` · 上一题：${feedback}` : ''}` : `正式试次 ${trialIndex + 1} / ${total}`}</p><div aria-label="两幅图形，请视觉判断是否为镜像" className={`mb-7 flex min-h-32 items-center justify-center gap-4 sm:gap-16 ${phase === 'formal' && !visible ? 'invisible' : ''}`}><ObjectGlyph family={item.objectFamily} variant={item.variant} /><ObjectGlyph family={item.objectFamily} variant={item.variant} angle={item.angle} mirrored={item.mirrored} /></div><div className="flex justify-center gap-4"><button className="btn-secondary px-4 sm:px-8" onPointerDown={(event) => onPointerResponse(event, 'same')} onClick={() => { if (phase !== 'formal') choose('same') }}>同一图形</button><button className="btn-secondary px-4 sm:px-8" onPointerDown={(event) => onPointerResponse(event, 'mirror')} onClick={() => { if (phase !== 'formal') choose('mirror') }}>镜像图形</button></div></div>
  return phase === 'formal' ? <CognitiveFocusStage ariaLabel="心理旋转正式作答">{content}</CognitiveFocusStage> : content
}
