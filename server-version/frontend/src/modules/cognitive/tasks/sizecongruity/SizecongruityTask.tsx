import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { SizecongruityConfig, SizecongruityTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { buildSizecongruityTrials, SIZECONGRUITY_PRACTICE_TRIALS, type SizecongruitySide } from './prng'

const MAX_PRACTICE_ATTEMPTS = 2

type Phase = 'instruction' | 'practice' | 'formal' | 'blocked'
type SubPhase = 'fixation' | 'stimulus' | 'feedback'

const DigitPair: React.FC<{
  leftDigit: number
  rightDigit: number
  leftFontScale: 'large' | 'small'
  rightFontScale: 'large' | 'small'
  fontLargeRem: number
  fontSmallRem: number
}> = ({ leftDigit, rightDigit, leftFontScale, rightFontScale, fontLargeRem, fontSmallRem }) => (
  <div className="flex items-center justify-center gap-10 sm:gap-16 h-32 pt-4">
    <span className="font-bold text-gray-800" style={{ fontSize: `${leftFontScale === 'large' ? fontLargeRem : fontSmallRem}rem` }}>{leftDigit}</span>
    <span className="font-bold text-gray-800" style={{ fontSize: `${rightFontScale === 'large' ? fontLargeRem : fontSmallRem}rem` }}>{rightDigit}</span>
  </div>
)

export const SizecongruityTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as SizecongruityConfig
  const totalTrials = config?.totalTrials ?? 40
  const congruentRatio = config?.congruentRatio ?? 0.5
  const minDigit = config?.minDigit ?? 1
  const maxDigit = config?.maxDigit ?? 9
  const minGap = config?.minGap ?? 2
  const fontLargeRem = config?.fontLargeRem ?? 2.8
  const fontSmallRem = config?.fontSmallRem ?? 1.3
  const fixationMs = config?.fixationMs ?? 500
  const timeoutMs = config?.timeoutMs ?? 3000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('fixation')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceAttempt, setPracticeAttempt] = useState(1)
  const [practiceCorrect, setPracticeCorrect] = useState<boolean[]>([])
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const interruptedRef = useRef(false)
  const onsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const trials = useMemo(
    () => buildSizecongruityTrials(taskContext.randomSeed, totalTrials, congruentRatio, minDigit, maxDigit, minGap),
    [taskContext.randomSeed, totalTrials, congruentRatio, minDigit, maxDigit, minGap]
  )
  const currentTrial = trials[trialIndex]

  useEffect(() => {
    if (phase !== 'formal' || !currentTrial) return
    setFormalFeedback(null); interruptedRef.current = false; setSubPhase('fixation')
  }, [phase, trialIndex, currentTrial])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || subPhase !== 'fixation') return
    const delay = phase === 'practice' ? 400 : fixationMs + (trialIndex > 0 ? 300 : 0)
    const timer = window.setTimeout(() => { onsetRef.current = performance.now(); setSubPhase('stimulus') }, delay)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, trialIndex, fixationMs])

  const submitFormal = useCallback(async (response: SizecongruitySide | null) => {
    if (phase !== 'formal' || subPhase !== 'stimulus' || !currentTrial || submittingRef.current) return
    submittingRef.current = true
    const payload: SizecongruityTrialPayload = {
      leftDigit: currentTrial.leftDigit,
      rightDigit: currentTrial.rightDigit,
      leftFontScale: currentTrial.leftFontScale,
      rightFontScale: currentTrial.rightFontScale,
      response,
      rtMs: response === null || onsetRef.current === null ? null : Math.max(0, Math.round(performance.now() - onsetRef.current)),
      interrupted: interruptedRef.current,
    }
    setFormalFeedback('已记录，下一题准备中'); setSubPhase('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前试次'); setSubPhase('stimulus'); return }
      if (trialIndex + 1 >= totalTrials) await onTaskComplete?.()
    } finally { submittingRef.current = false }
  }, [phase, subPhase, currentTrial, onTrialComplete, trialIndex, totalTrials, onTaskComplete])

  useEffect(() => {
    if (phase !== 'formal' || subPhase !== 'stimulus') return
    const timer = window.setTimeout(() => { void submitFormal(null) }, timeoutMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, timeoutMs, submitFormal])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const handleResponse = useCallback((response: SizecongruitySide) => {
    if (phase === 'practice') {
      const trial = SIZECONGRUITY_PRACTICE_TRIALS[practiceIndex]
      if (subPhase !== 'stimulus' || !trial) return
      const largerSide: SizecongruitySide = trial.leftDigit > trial.rightDigit ? 'left' : 'right'
      const correct = response === largerSide
      setPracticeCorrect((current) => { const next = [...current]; next[practiceIndex] = correct; return next })
      setPracticeFeedback(correct ? '正确：只比数值大小。' : '请忽略字号，只比较两个数的数值。')
      setSubPhase('feedback'); return
    }
    void submitFormal(response)
  }, [phase, practiceIndex, subPhase, submitFormal])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === '1' || event.key === 'ArrowLeft') { event.preventDefault(); handleResponse('left') }
      if (event.key === '2' || event.key === 'ArrowRight') { event.preventDefault(); handleResponse('right') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleResponse])

  const startPractice = useCallback(() => { setPracticeIndex(0); setPracticeCorrect([]); setPracticeFeedback(null); setSubPhase('fixation'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    if (practiceIndex + 1 < SIZECONGRUITY_PRACTICE_TRIALS.length) { setPracticeIndex((current) => current + 1); setPracticeFeedback(null); setSubPhase('fixation'); return }
    const passed = practiceCorrect.length === SIZECONGRUITY_PRACTICE_TRIALS.length && practiceCorrect.every(Boolean)
    if (passed) { setFormalFeedback(null); setSubPhase('fixation'); setPhase('formal') }
    else if (practiceAttempt < MAX_PRACTICE_ATTEMPTS) { setPracticeAttempt((current) => current + 1); setPracticeIndex(0); setPracticeCorrect([]); setPracticeFeedback(null); setSubPhase('fixation'); setPhase('instruction') }
    else setPhase('blocked')
  }, [practiceIndex, practiceCorrect, practiceAttempt])

  const ResponseButtons: React.FC<{ show: boolean }> = ({ show }) => show ? (
    <div className="grid grid-cols-2 gap-3 max-w-md mx-auto mt-4">
      <button type="button" onPointerDown={() => handleResponse('left')} onClick={event => { if (event.detail === 0) handleResponse('left') }} className="btn-secondary min-h-12">1 · 左边的数大</button>
      <button type="button" onPointerDown={() => handleResponse('right')} onClick={event => { if (event.detail === 0) handleResponse('right') }} className="btn-secondary min-h-12">2 · 右边的数大</button>
    </div>
  ) : null

  if (phase === 'instruction') return <CognitiveTaskIntro title="数量大小比较" description={<p>屏幕上会同时出现两个数字。请判断哪个数的数值更大：左边大按「1」，右边大按「2」。注意：只比数值，忽略数字显示的大小。</p>} hint={<>{practiceAttempt > 1 && <p>上一轮练习未通过，请重新阅读完整说明和例子，再开始下一轮。</p>}<p>例子：7写得小、3写得大时，也要选择数值较大的7。</p><p>按键 1/2、方向键或点击按钮作答；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'blocked') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700 mb-4">练习尚未通过，本次正式测评未开始。</p><button type="button" className="btn-secondary" onClick={() => window.history.back()}>返回</button></div>

  if (phase === 'practice') {
    const trial = SIZECONGRUITY_PRACTICE_TRIALS[practiceIndex]
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 {practiceIndex + 1} / {SIZECONGRUITY_PRACTICE_TRIALS.length} · 第 {practiceAttempt} 轮 · 不计入成绩</div>{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-32 pt-8">+</div>}{subPhase === 'stimulus' && trial && <DigitPair {...trial} fontLargeRem={fontLargeRem} fontSmallRem={fontSmallRem} />}{subPhase === 'feedback' && <div className="h-32 pt-8 text-gray-700">{practiceFeedback}</div>}<ResponseButtons show={subPhase === 'stimulus'} />{subPhase === 'feedback' && <button type="button" onClick={advancePractice} className="btn-primary">{practiceIndex + 1 >= SIZECONGRUITY_PRACTICE_TRIALS.length ? practiceCorrect.every(Boolean) ? '开始正式测评' : practiceAttempt < MAX_PRACTICE_ATTEMPTS ? '重新练习' : '结束' : '下一个'}</button>}</div>
  }

  if (!currentTrial) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return <CognitiveFocusStage ariaLabel="数量大小比较正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8">{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-32 pt-8">+</div>}{subPhase === 'stimulus' && <DigitPair {...currentTrial} fontLargeRem={fontLargeRem} fontSmallRem={fontSmallRem} />}{subPhase === 'feedback' && <div className="h-32 pt-8 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{subPhase === 'stimulus' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<ResponseButtons show={subPhase === 'stimulus'} /><p className="text-xs text-gray-400 mt-6">按键 1/2、方向键或点击按钮作答</p></div></CognitiveFocusStage>
}
