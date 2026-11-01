import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { CancellationConfig, CancellationTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { CANCELLATION_GRID_COLS, CANCELLATION_GRID_SIZE, cancellationScan } from './generator'

type Phase = 'instruction' | 'practice' | 'formal' | 'completed'
type PhaseStep = 'brief' | 'scanning' | 'feedback'

export const CancellationTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as CancellationConfig
  const totalTrials = config?.totalTrials ?? 2
  const durationMs = config?.durationMs ?? 45000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [step, setStep] = useState<PhaseStep>('brief')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [timeLeftMs, setTimeLeftMs] = useState(0)
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const interruptedRef = useRef(false)
  const scanStartRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const pendingSubmissionRef = useRef<CancellationTrialPayload | null>(null)
  const [submissionFailed, setSubmissionFailed] = useState(false)
  const scan = useMemo(() => cancellationScan(taskContext.randomSeed, trialIndex), [taskContext.randomSeed, trialIndex])
  const practiceScan = useMemo(() => cancellationScan(`${taskContext.randomSeed}:practice`, 0), [taskContext.randomSeed])
  const activeScan = phase === 'practice' ? practiceScan : scan

  useEffect(() => {
    if (phase !== 'formal') return
    pendingSubmissionRef.current = null; setSubmissionFailed(false)
    setFormalFeedback(null); setSelected(new Set()); setStep('brief'); interruptedRef.current = false
  }, [trialIndex])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || step !== 'brief') return
    setSelected(new Set()); setPracticeFeedback(null); setFormalFeedback(null); interruptedRef.current = false
    const timer = window.setTimeout(() => {
      scanStartRef.current = performance.now()
      setTimeLeftMs(durationMs)
      setStep('scanning')
    }, 500)
    return () => window.clearTimeout(timer)
  }, [phase, step, trialIndex, durationMs])

  useEffect(() => {
    if (step !== 'scanning') return
    const startedAt = scanStartRef.current
    if (startedAt === null) return
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, durationMs - (performance.now() - startedAt))
      setTimeLeftMs(remaining)
      if (remaining <= 0) window.clearInterval(interval)
    }, 250)
    return () => window.clearInterval(interval)
  }, [step, durationMs])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const finishScan = useCallback(async (finalSelection: Set<number>) => {
    const payload: CancellationTrialPayload = pendingSubmissionRef.current ?? {
      scanIndex: trialIndex,
      selectedCells: [...finalSelection].sort((a, b) => a - b),
      responseDurationMs: scanStartRef.current === null ? 0 : Math.max(0, Math.round(performance.now() - scanStartRef.current)),
      interrupted: interruptedRef.current,
    }
    if (phase === 'practice') {
      setPracticeFeedback(`练习结束：你点亮了 ${finalSelection.size} 个格子。正式测验共 ${totalTrials} 轮。`)
      setStep('feedback')
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    pendingSubmissionRef.current = payload; setSubmissionFailed(false)
    setFormalFeedback('已记录，下一轮准备中'); setStep('feedback')
    try {
      const accepted = await Promise.resolve().then(() => onTrialComplete(payload)).catch(() => false)
      if (accepted === false) { setFormalFeedback('提交尚未确认，请重试已记录的答案'); setSubmissionFailed(true); return }
      pendingSubmissionRef.current = null
      if (trialIndex + 1 >= totalTrials) { setPhase('completed'); await onTaskComplete?.() }
    } finally { submittingRef.current = false }
  }, [phase, trialIndex, totalTrials, onTrialComplete, onTaskComplete])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || step !== 'scanning') return
    const startedAt = scanStartRef.current
    if (startedAt === null) return
    const capTimer = window.setTimeout(() => { void finishScan(selected) }, Math.max(0, durationMs - (performance.now() - startedAt)))
    return () => window.clearTimeout(capTimer)
  }, [phase, step, selected, durationMs, finishScan])

  const toggleCell = useCallback((cellIndex: number) => {
    if (step !== 'scanning') return
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(cellIndex)) next.delete(cellIndex)
      else next.add(cellIndex)
      return next
    })
  }, [step])

  const startPractice = useCallback(() => { setStep('brief'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    setFormalFeedback(null); setStep('brief'); setPhase('formal')
  }, [])

  const CellGrid: React.FC<{ show: boolean; target: string }> = ({ show, target }) => show ? (
    <div>
      <p className="text-gray-700 mb-2">本轮目标：<span className="text-2xl font-bold text-sky-700">{target}</span></p>
      <div className="grid gap-1 mx-auto" style={{ gridTemplateColumns: `repeat(${CANCELLATION_GRID_COLS}, minmax(0, 1fr))`, maxWidth: 560 }}>
        {activeScan.grid.map((symbol, cellIndex) => (
          <button
            key={cellIndex}
            type="button"
            onPointerDown={() => toggleCell(cellIndex)}
            onClick={(event) => { if (event.detail === 0) toggleCell(cellIndex) }}
            aria-pressed={selected.has(cellIndex)}
            className={`h-9 rounded text-lg font-semibold border transition-colors ${selected.has(cellIndex) ? 'bg-sky-500 border-sky-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-sky-300'}`}
            aria-label={`格子 ${cellIndex + 1}：${symbol}${selected.has(cellIndex) ? '，已选中' : ''}`}
          >
            {symbol}
          </button>
        ))}
      </div>
    </div>
  ) : null

  if (phase === 'instruction') return <CognitiveTaskIntro title="视觉划消" description={<p>每轮出现一墙符号。限时内找到所有目标符号并点亮它们：点一下选中，再点一下取消。全部轮次共用同一个目标符号。</p>} hint={<><p>每轮限时 {Math.round(durationMs / 1000)} 秒；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'completed') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700">已全部完成，正在生成结果…</p></div>

  if (phase === 'practice') {
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 · 不计入成绩</div>{step === 'brief' && <div className="text-4xl text-gray-400 h-24 pt-8">准备…</div>}{step !== 'brief' && <CellGrid show target={activeScan.target} />}{step === 'scanning' && <p className="text-sm text-gray-500 mt-2">剩余 {Math.ceil(timeLeftMs / 1000)} 秒 · 已点亮 {selected.size} 个</p>}{step === 'scanning' && <button type="button" className="btn-secondary mt-3" onClick={() => void finishScan(selected)}>提前结束本轮</button>}{step === 'feedback' && <><div className="h-10 pt-3 text-gray-700">{practiceFeedback}</div><button type="button" className="btn-primary" onClick={advancePractice}>开始正式测评</button></>}</div>
  }

  return <CognitiveFocusStage ariaLabel="视觉划消正式测验"><div className="card mx-auto max-w-3xl p-5 text-center sm:p-6"><div className="text-sm text-gray-500">第 {trialIndex + 1} / {totalTrials} 轮</div>{step === 'brief' && <div className="text-4xl text-gray-400 h-40 pt-16">准备…</div>}{step !== 'brief' && <div className="pt-2"><CellGrid show target={activeScan.target} /></div>}{step === 'scanning' && <p className="text-sm text-gray-500 mt-3">剩余 {Math.ceil(timeLeftMs / 1000)} 秒 · 已点亮 {selected.size} 个</p>}{step === 'scanning' && <button type="button" className="btn-secondary mt-2" onClick={() => void finishScan(selected)}>提前结束本轮</button>}{step === 'feedback' && <div className="h-24 pt-8 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{step === 'scanning' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<p className="text-xs text-gray-400 mt-3">点击点亮目标 · 再点取消 · 限时 {Math.round(durationMs / 1000)} 秒</p>{submissionFailed && <button type="button" className="btn-primary mt-3" onClick={() => void finishScan(new Set())}>重试提交已记录答案</button>}</div></CognitiveFocusStage>
}
