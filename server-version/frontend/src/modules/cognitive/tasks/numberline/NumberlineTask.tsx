import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { NumberlineConfig, NumberlineTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { buildNumberlineTargets, NUMBERLINE_PRACTICE_TARGET } from './prng'

const PRACTICE_TARGET = NUMBERLINE_PRACTICE_TARGET
const MAX_PRACTICE_ATTEMPTS = 2

type Phase = 'instruction' | 'practice' | 'formal' | 'blocked'
type SubPhase = 'fixation' | 'response' | 'feedback'

/** 点击/触控点在轨道内的位置比例；越界收敛到 0..1。 */
const positionFromEvent = (event: { clientX: number }, track: HTMLElement | null): number | null => {
  if (!track || typeof event.clientX !== 'number' || !Number.isFinite(event.clientX)) return null
  const rect = track.getBoundingClientRect()
  if (rect.width <= 0) return null
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
}

export const NumberlineTrack: React.FC<{
  lineMax: number
  showReferenceTicks?: boolean
  onPick: (position: number) => void
  disabled?: boolean
  marker?: { position: number; kind: 'response' | 'target' } | null
}> = ({ lineMax, onPick, disabled, marker, showReferenceTicks = true }) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const pointerHandledRef = useRef(false)
  const [keyboardPosition, setKeyboardPosition] = useState<number | null>(null)
  const pickFrom = (event: { clientX: number }) => {
    const position = positionFromEvent(event, trackRef.current)
    if (position !== null) onPick(position)
  }
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button > 0) return
    event.preventDefault()
    pointerHandledRef.current = true
    pickFrom(event)
  }
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return
    if (pointerHandledRef.current) { pointerHandledRef.current = false; return }
    pickFrom(event)
  }
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const step = 1 / lineMax
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const delta = event.key === 'ArrowLeft' ? -step : step
      setKeyboardPosition((current) => Math.min(1, Math.max(0, (current ?? (showReferenceTicks ? 0.5 : 0)) + delta)))
      return
    }
    if (event.key === 'Home') { event.preventDefault(); setKeyboardPosition(0); return }
    if (event.key === 'End') { event.preventDefault(); setKeyboardPosition(1); return }
    if ((event.key === 'Enter' || event.key === ' ') && keyboardPosition !== null) {
      event.preventDefault()
      onPick(keyboardPosition)
    }
  }
  const shownMarker = keyboardPosition !== null && marker === null ? { position: keyboardPosition, kind: 'response' as const } : marker
  return (
    <div className="w-full max-w-xl mx-auto select-none">
      <div
        ref={trackRef}
        role="slider"
        aria-label={`0 到 ${lineMax} 的数字线`}
        aria-valuemin={0}
        aria-valuemax={lineMax}
        aria-valuenow={keyboardPosition === null ? undefined : Math.round(keyboardPosition * lineMax)}
        aria-valuetext={keyboardPosition === null ? undefined : `当前标记约 ${Math.round(keyboardPosition * lineMax)}`}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="relative h-16 cursor-pointer"
      >
        <div className="absolute left-0 right-0 top-8 h-1.5 rounded bg-gray-300" />
        {(showReferenceTicks ? [0, 0.25, 0.5, 0.75, 1] : [0, 1]).map((tick) => (
          <div key={tick} className="absolute top-6 h-5 w-px bg-gray-400" style={{ left: `calc(${tick * 100}% - 0.5px)` }} />
        ))}
        {shownMarker && (
          <div
            className={`absolute top-2 h-3.5 w-3.5 rounded-full border-2 border-white shadow ${shownMarker.kind === 'response' ? 'bg-blue-500' : 'bg-emerald-500'}`}
            style={{ left: `calc(${shownMarker.position * 100}% - 7px)` }}
          />
        )}
      </div>
      <div className="flex justify-between text-sm text-gray-500 mt-1" aria-hidden="true">
        <span>0</span>{showReferenceTicks && <span>{Math.round(lineMax / 2)}</span>}<span>{lineMax}</span>
      </div>
    </div>
  )
}

export const NumberlineTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as NumberlineConfig
  const totalTrials = config?.totalTrials ?? 20
  const lineMax = config?.lineMax ?? 100
  const maxResponseMs = config?.maxResponseMs ?? 10000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('fixation')
  const [practiceAttempt, setPracticeAttempt] = useState(1)
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [practiceMarker, setPracticeMarker] = useState<{ response: number; target: number } | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const interruptedRef = useRef(false)
  const onsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const trials = useMemo(() => buildNumberlineTargets(taskContext.randomSeed, totalTrials, lineMax), [taskContext.randomSeed, totalTrials, lineMax])
  const currentTrial = trials[trialIndex]

  useEffect(() => {
    if (phase !== 'formal' || !currentTrial) return
    setFormalFeedback(null); interruptedRef.current = false; setSubPhase('fixation')
  }, [phase, trialIndex, currentTrial])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || subPhase !== 'fixation') return
    const timer = window.setTimeout(() => { onsetRef.current = performance.now(); setSubPhase('response') }, 400)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, trialIndex])

  const submitFormal = useCallback(async (position: number | null) => {
    if (phase !== 'formal' || subPhase !== 'response' || !currentTrial || submittingRef.current) return
    submittingRef.current = true
    const payload: NumberlineTrialPayload = {
      targetNumber: currentTrial.targetNumber,
      responsePosition: position,
      rtMs: position === null || onsetRef.current === null ? null : Math.max(0, Math.round(performance.now() - onsetRef.current)),
      interrupted: interruptedRef.current,
    }
    setFormalFeedback('已记录，下一题准备中'); setSubPhase('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前试次'); setSubPhase('response'); return }
      if (trialIndex + 1 >= totalTrials) await onTaskComplete?.()
    } finally { submittingRef.current = false }
  }, [phase, subPhase, currentTrial, onTrialComplete, trialIndex, totalTrials, onTaskComplete])

  useEffect(() => {
    if (phase !== 'formal' || subPhase !== 'response') return
    const timer = window.setTimeout(() => { void submitFormal(null) }, maxResponseMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, maxResponseMs, submitFormal])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const handlePracticePick = useCallback((position: number) => {
    if (subPhase !== 'response') return
    const responseValue = position * lineMax
    const error = Math.abs(responseValue - PRACTICE_TARGET)
    setPracticeMarker({ response: position, target: PRACTICE_TARGET / lineMax })
    setPracticeFeedback(
      error <= lineMax * 0.05
        ? '很接近！正式测验里不再提示对错。'
        : `目标在蓝色圆点附近，绿色圆点是正确位置。试试先想中点，再定位。`
    )
    setSubPhase('feedback')
  }, [subPhase, lineMax])

  const startPractice = useCallback(() => { setPracticeMarker(null); setPracticeFeedback(null); setSubPhase('fixation'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    if (practiceAttempt < MAX_PRACTICE_ATTEMPTS && practiceMarker && Math.abs(practiceMarker.response * lineMax - PRACTICE_TARGET) > lineMax * 0.15) {
      setPracticeAttempt((current) => current + 1); setPracticeMarker(null); setPracticeFeedback(null); setSubPhase('fixation'); setPhase('instruction'); return
    }
    setFormalFeedback(null); setSubPhase('fixation'); setPhase('formal')
  }, [practiceAttempt, practiceMarker, lineMax])

  if (phase === 'instruction') return <CognitiveTaskIntro title="数字线估计" description={(taskContext.config.report as { reportVersion?: string } | undefined)?.reportVersion === '3.0.0' ? (<p>给数字找个位置：屏幕上会出现一个 0 到 {lineMax} 的数字线和一个目标数。请在数字线上点击，点出这个数应该在的位置。</p>) : (<p>屏幕上会出现一个 0 到 {lineMax} 的数字线和一个目标数。请在数字线上点击，点出这个数应该在的位置。</p>)} hint={<>{practiceAttempt > 1 && <p>请重新阅读完整说明和例子，再开始下一轮练习。</p>}<p>例子：数字线中点对应{lineMax / 2}；可先找中点，再判断目标在它的哪一边。</p><p>每题限时 {Math.round(maxResponseMs / 1000)} 秒；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'blocked') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700 mb-4">练习尚未完成，本次正式测评未开始。</p><button type="button" className="btn-secondary" onClick={() => window.history.back()}>返回</button></div>

  if (phase === 'practice') {
    return (
      <div className="card p-8 max-w-2xl text-center">
        <div className="text-sm text-gray-500 mb-4">练习 · 第 {practiceAttempt} 轮 · 不计入成绩</div>
        <div className="text-5xl font-bold text-gray-800 h-16">{subPhase === 'feedback' ? PRACTICE_TARGET : subPhase === 'response' ? PRACTICE_TARGET : '···'}</div>
        <div className="my-6">
          <NumberlineTrack lineMax={lineMax} onPick={handlePracticePick} disabled={subPhase !== 'response'} marker={practiceMarker ? { position: practiceMarker.response, kind: 'response' } : null} />
          {practiceMarker && <div className="relative max-w-xl mx-auto h-0"><div className="absolute h-3.5 w-3.5 rounded-full border-2 border-white shadow bg-emerald-500" style={{ left: `calc(${(PRACTICE_TARGET / lineMax) * 100}% - 7px)`, top: '-3.5rem' }} /></div>}
        </div>
        <div className="h-8 text-gray-700">{practiceFeedback ?? (subPhase === 'fixation' ? '准备中…' : '点击数字线上你心中的位置')}</div>
        {subPhase === 'feedback' && <button type="button" onClick={advancePractice} className="btn-primary mt-2">{practiceAttempt < MAX_PRACTICE_ATTEMPTS && practiceMarker && Math.abs(practiceMarker.response * lineMax - PRACTICE_TARGET) > lineMax * 0.15 ? '查看说明并重新练习' : '开始正式测评'}</button>}
      </div>
    )
  }

  if (!currentTrial) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return (
    <CognitiveFocusStage ariaLabel="数字线估计正式测验">
      <div className="card mx-auto max-w-2xl p-5 text-center sm:p-8">
        {subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-16 pt-3">+</div>}
        {subPhase !== 'fixation' && <div className="text-5xl font-bold text-gray-800 h-16 pt-3">{currentTrial.targetNumber}</div>}
        <div className="my-6">
          <NumberlineTrack lineMax={lineMax} onPick={(position) => void submitFormal(position)} disabled={subPhase !== 'response'} marker={null} />
        </div>
        <div className="h-8 text-gray-700">{formalFeedback ?? (subPhase === 'fixation' ? '准备中…' : '点击数字线上你心中的位置')}</div>
        <p className="text-xs text-gray-400 mt-4">点击或触控数字线作答 · 限时 {Math.round(maxResponseMs / 1000)} 秒</p>
      </div>
    </CognitiveFocusStage>
  )
}
