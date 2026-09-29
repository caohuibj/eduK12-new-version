import React, { useEffect, useMemo, useRef, useState } from 'react'
import { captureFrameTimingOnset, resolveEventResponseTimestamp, type CognitiveTimingOnset } from '../../core/response-timing'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { createTaskTimingDiagnostics } from '../../core/task-timing-diagnostics'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { cptSequence } from '../shared/prng'
import { PRACTICE_FEEDBACK_MS, PRACTICE_PASS_CORRECT, PRACTICE_TRIAL_COUNT } from '../shared/practice'
import {
  CognitivePracticeResult,
  CognitiveTaskCompletionNotice,
  CognitiveTaskIntro,
  CognitiveTaskTransition,
} from '../shared/CognitiveTaskPresentation'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'

export const CptFrameTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete }) => {
  const config = taskContext.config as { totalTrials: number; targetRatio: number; blockCount: number; stimulusMs: number; isiMs: number }
  const total = config.totalTrials ?? 180
  const blockCount = config.blockCount ?? 1
  const isiMs = config.isiMs ?? 400
  const stimulusMs = config.stimulusMs ?? 500
  const sequence = useMemo(() => cptSequence(taskContext.randomSeed, total, config.targetRatio ?? 0.2, blockCount), [taskContext.randomSeed, total, config.targetRatio, blockCount])
  const [timingDiagnostics] = useState(createTaskTimingDiagnostics)
  const [phase, setPhase] = useState<Phase>('instruction')
  const [visible, setVisible] = useState(false)
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [practiceNonce, setPracticeNonce] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [acknowledgedBlockIndex, setAcknowledgedBlockIndex] = useState<number | null>(blockCount > 1 ? null : 0)
  const onsetRef = useRef<CognitiveTimingOnset | null>(null)
  const respondedRef = useRef(false)
  const interruptedRef = useRef(false)
  const practiceCorrectRef = useRef(0)

  const startPractice = () => {
    setPracticeIndex(0); setPracticeCorrect(0); practiceCorrectRef.current = 0; setFeedback(null); setVisible(false)
    respondedRef.current = false; interruptedRef.current = false; onsetRef.current = null; setPracticeNonce((value) => value + 1); setPhase('practice')
  }
  const startFormal = () => {
    setFeedback(null); setVisible(false); respondedRef.current = false; interruptedRef.current = false; onsetRef.current = null
    setAcknowledgedBlockIndex(blockCount > 1 ? null : 0); setPhase('formal')
  }

  useEffect(() => {
    const onHidden = () => {
      if (!document.hidden) return
      interruptedRef.current = true
      if (phase === 'formal' && trialIndex < total) timingDiagnostics.visibilityLost(performance.now(), trialIndex)
    }
    const onBlur = () => { if (phase === 'formal' && trialIndex < total) timingDiagnostics.focusLost(performance.now(), trialIndex) }
    document.addEventListener('visibilitychange', onHidden); window.addEventListener('blur', onBlur)
    return () => { document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('blur', onBlur) }
  }, [phase, trialIndex, total, timingDiagnostics])

  useEffect(() => {
    if (phase !== 'practice' && phase !== 'formal') return
    const current = phase === 'formal' ? sequence[trialIndex] : { stimulus: practiceIndex % 2 === 0 ? 'X' : 'A', isTarget: practiceIndex % 2 === 0, blockIndex: 0 }
    if (phase === 'formal' && (trialIndex >= total || !current)) return
    if (phase === 'formal' && blockCount > 1 && acknowledgedBlockIndex !== current.blockIndex) return
    respondedRef.current = false; interruptedRef.current = false; onsetRef.current = null; setVisible(false); setFeedback(null)
    let animationFrameId: number | null = null
    let hideTimerId: number | null = null
    const finishStimulus = async () => {
      setVisible(false)
      const responded = respondedRef.current
      const correct = current.isTarget ? responded : !responded
      if (phase === 'practice') {
        setFeedback(correct ? '正确' : '错误')
        if (correct) practiceCorrectRef.current += 1
        const nextIndex = practiceIndex + 1
        window.setTimeout(() => {
          if (nextIndex >= PRACTICE_TRIAL_COUNT) { setPracticeCorrect(practiceCorrectRef.current); setPhase('practice-result'); return }
          setPracticeIndex(nextIndex)
        }, PRACTICE_FEEDBACK_MS)
        return
      }
      if (!responded) await onTrialComplete({ blockIndex: current.blockIndex, stimulus: current.stimulus, isTarget: current.isTarget, responded: false, rtMs: null, interrupted: interruptedRef.current })
    }
    const present = (onsetPerfMs: number) => {
      const captured = captureFrameTimingOnset(onsetPerfMs)
      if (captured.ok) onsetRef.current = captured.onset
      else { interruptedRef.current = true; onsetRef.current = null }
      setVisible(true)
      hideTimerId = window.setTimeout(() => { void finishStimulus() }, stimulusMs)
    }
    const show = window.setTimeout(() => {
      const eligiblePerfMs = performance.now()
      if (typeof window.requestAnimationFrame !== 'function') { interruptedRef.current = true; present(performance.now()); return }
      animationFrameId = window.requestAnimationFrame((framePerfMs) => {
        if (phase === 'formal') timingDiagnostics.frameCallback({ eligiblePerfMs, framePerfMs, trialIndex })
        present(framePerfMs)
      })
    }, isiMs)
    return () => {
      window.clearTimeout(show); if (hideTimerId != null) window.clearTimeout(hideTimerId)
      if (animationFrameId != null && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(animationFrameId)
    }
  }, [phase, trialIndex, practiceIndex, practiceNonce, sequence, total, blockCount, acknowledgedBlockIndex, isiMs, stimulusMs, onTrialComplete, timingDiagnostics])

  const current = phase === 'formal' ? sequence[trialIndex] : { stimulus: practiceIndex % 2 === 0 ? 'X' : 'A', isTarget: practiceIndex % 2 === 0, blockIndex: 0 }

  const respond = async (eventTimeStamp: number) => {
    if (!visible || respondedRef.current || onsetRef.current == null || !current) return
    const resolved = resolveEventResponseTimestamp(eventTimeStamp, onsetRef.current)
    const responsePerfMs = resolved.ok ? resolved.responsePerfMs : resolved.fallbackPerfMs
    if (!resolved.ok) {
      interruptedRef.current = true
      if (phase === 'formal') timingDiagnostics.responseFailure({ result: resolved, eventTimeStamp, trialIndex })
    }
    if (responsePerfMs == null) return
    respondedRef.current = true
    const rtMs = Math.round(Math.max(0, responsePerfMs - onsetRef.current.perfMs))
    if (phase !== 'formal') return
    await onTrialComplete({ blockIndex: current.blockIndex, stimulus: current.stimulus, isTarget: current.isTarget, responded: true, rtMs, interrupted: interruptedRef.current })
  }

  useEffect(() => {
    if (phase !== 'practice' && phase !== 'formal') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return
      event.preventDefault(); void respond(event.timeStamp)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    void respond(event.timeStamp)
  }
  const pointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return
    interruptedRef.current = true
    if (phase === 'formal') timingDiagnostics.pointerCancelled(performance.now(), trialIndex)
  }

  if (phase === 'instruction') {
    return (
      <CognitiveTaskIntro
        title="连续执行任务"
        description="只在出现字母 X 时按下，其他字母不要按。"
        hint="电脑可按空格或 Enter；触屏可点击中央作答区。练习不计入正式成绩，多区块版本会在区块之间暂停。"
        onAction={startPractice}
      />
    )
  }
  if (phase === 'practice-result') {
    const passed = practiceCorrect >= PRACTICE_PASS_CORRECT
    return (
      <CognitivePracticeResult
        correct={practiceCorrect}
        total={PRACTICE_TRIAL_COUNT}
        passed={passed}
        onContinue={startFormal}
        onRetry={startPractice}
      />
    )
  }
  if (phase === 'formal' && trialIndex >= total) return <CognitiveTaskCompletionNotice />
  if (phase === 'formal' && current && blockCount > 1 && acknowledgedBlockIndex !== current.blockIndex) {
    const isFirstBlock = current.blockIndex === 0
    return (
      <CognitiveTaskTransition
        title={isFirstBlock ? '准备开始持续注意测验' : '区块完成，可以短暂休息'}
        meta={`即将开始区块 ${current.blockIndex + 1} / ${blockCount}`}
        description={isFirstBlock
          ? '正式测验分为多个区块。每个区块都保持同一规则：只对 X 作答。'
          : '准备好后继续。休息时请不要离开测评页面太久。'}
        actionLabel={isFirstBlock ? '开始第 1 区块' : '继续下一组'}
        onAction={() => setAcknowledgedBlockIndex(current.blockIndex)}
      />
    )
  }

  const taskBody = <div className="mx-auto max-w-2xl text-center p-8" onPointerDown={pointerDown} onPointerCancel={pointerCancel} role="button" tabIndex={-1} aria-label={phase === 'practice' ? 'CPT 练习作答区' : 'CPT 正式作答区'}>{phase === 'practice' ? <p className="text-sm text-gray-500 mb-2">练习 {practiceIndex + 1} / {PRACTICE_TRIAL_COUNT}</p> : null}{feedback && <p className="text-sm mb-3">{feedback}</p>}<div className="text-6xl font-bold text-gray-800 h-24">{visible ? current?.stimulus : ''}</div>{phase === 'formal' ? <p className="mt-5 text-xs text-gray-400">仅看到 X 时按空格 / Enter，或点击此区域</p> : null}</div>
  return phase === 'formal' ? <CognitiveFocusStage ariaLabel="CPT 正式测验">{taskBody}</CognitiveFocusStage> : taskBody
}
