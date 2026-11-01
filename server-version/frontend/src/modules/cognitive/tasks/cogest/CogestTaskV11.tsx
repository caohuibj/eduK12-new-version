import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { CogestConfig } from '../../../../../../backend/src/modules/cognitive/schemas/cogest.config'
import type { CogestTrial as CogestTrialPayload } from '../../../../../../backend/src/modules/cognitive/schemas/cogest.trial'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { buildCogestItems, COGEST_PRACTICE_ITEM } from './prng-v1.1'

type Phase = 'instruction' | 'practice' | 'formal' | 'blocked'
type SubPhase = 'fixation' | 'stimulus' | 'feedback' | 'retry'

const PRACTICE_ANSWER = COGEST_PRACTICE_ITEM.answer

export const CogestTaskV11: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete }) => {
  const config = taskContext.config as unknown as CogestConfig
  const totalTrials = config.totalTrials
  const fixationMs = config?.fixationMs ?? 400
  const timeoutMs = config?.timeoutMs ?? 15000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('fixation')
  const [practiceChoice, setPracticeChoice] = useState<number | null>(null)
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const interruptedRef = useRef(false)
  const onsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const pendingPayloadRef = useRef<CogestTrialPayload | null>(null)
  const items = useMemo(() => buildCogestItems(taskContext.randomSeed, totalTrials), [taskContext.randomSeed, totalTrials])
  const currentTrial = items[trialIndex]

  useEffect(() => {
    if (phase !== 'formal' || !currentTrial) return
    pendingPayloadRef.current = null; setFormalFeedback(null); interruptedRef.current = false; setSubPhase('fixation')
  }, [phase, trialIndex, currentTrial])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || subPhase !== 'fixation') return
    const delay = phase === 'practice' ? 400 : fixationMs + (trialIndex > 0 ? 200 : 0)
    const timer = window.setTimeout(() => { onsetRef.current = performance.now(); setSubPhase('stimulus') }, delay)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, trialIndex, fixationMs])

  const submitFormal = useCallback(async (responseIndex: number | null) => {
    if (phase !== 'formal' || (subPhase !== 'stimulus' && subPhase !== 'retry') || !currentTrial || submittingRef.current) return
    if (onsetRef.current !== null && performance.now() - onsetRef.current >= timeoutMs) responseIndex = null
    submittingRef.current = true
    const payload: CogestTrialPayload = pendingPayloadRef.current ?? {
      itemId: currentTrial.itemId,
      responseIndex,
      rtMs: responseIndex === null || onsetRef.current === null ? null : Math.max(0, Math.round(performance.now() - onsetRef.current)),
      interrupted: interruptedRef.current,
    }
    pendingPayloadRef.current = payload
    setFormalFeedback('正在保存本题…'); setSubPhase('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前试次'); setSubPhase('retry'); return }
      setFormalFeedback('已记录，下一题准备中')
    } catch { setFormalFeedback('提交失败，请重试当前试次'); setSubPhase('retry') } finally { submittingRef.current = false }
  }, [phase, subPhase, currentTrial, onTrialComplete, timeoutMs])

  useEffect(() => {
    if (phase !== 'formal' || subPhase !== 'stimulus') return
    const remaining = Math.max(0, timeoutMs - (performance.now() - (onsetRef.current ?? performance.now())))
    const timer = window.setTimeout(() => { void submitFormal(null) }, remaining)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, timeoutMs, submitFormal])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const handlePracticeChoice = useCallback((choice: number) => {
    if (subPhase !== 'stimulus' || practiceChoice !== null) return
    setPracticeChoice(choice)
    setPracticeFeedback(choice === PRACTICE_ANSWER ? '正确：' + COGEST_PRACTICE_ITEM.explanation : '请重新阅读说明并再练习；本次练习未通过。')
    setSubPhase('feedback')
  }, [subPhase, practiceChoice])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || !/^[1-4]$/.test(event.key)) return
      const index = Number(event.key) - 1
      if (index >= 0 && index <= 3) {
        event.preventDefault()
        if (phase === 'practice') handlePracticeChoice(index)
        else if (subPhase === 'stimulus') void submitFormal(index)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, subPhase, handlePracticeChoice, submitFormal])

  const startPractice = useCallback(() => { setPracticeChoice(null); setPracticeFeedback(null); setSubPhase('fixation'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    setFormalFeedback(null); setSubPhase('fixation'); setPhase('formal')
  }, [])

  const item = phase === 'practice' ? COGEST_PRACTICE_ITEM : currentTrial

  if (trialIndex >= totalTrials) return <div role="status" className="card p-6 text-center">正式作答已保存，请使用页面上的“完成测评”按钮确认提交。</div>
  if (phase === 'instruction') return <CognitiveTaskIntro title="认知估计" description={<p>根据日常经验，判断现实物体的大小、质量、容量或时间的合理数量级，选择最合理的区间。不要求精确记忆或使用计算器；这是内部估算任务，不是标准临床测验。</p>} hint={<><p>按键 1–4 或点击选项作答；练习不计入成绩。本次正式{totalTrials}题，每题最多{timeoutMs / 1000}秒，超时计为漏答；尽量准确，不必追求抢答。完整时长受作答速度和说明练习用时影响。</p></>} onAction={startPractice} />
  if (phase === 'blocked') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700 mb-4">练习未完成，本次正式测评未开始。</p><button type="button" className="btn-secondary" onClick={() => window.history.back()}>返回</button></div>

  const OptionButtons: React.FC<{ show: boolean }> = ({ show }) => show ? (
    <div className="grid grid-cols-2 gap-3 max-w-xl mx-auto mt-5">
      {item!.options.map((option, index) => (
        <button key={option} type="button" onPointerDown={() => (phase === 'practice' ? handlePracticeChoice(index) : void submitFormal(index))} onClick={(event) => { if (event.detail === 0) { if (phase === 'practice') handlePracticeChoice(index); else void submitFormal(index) } }} className="btn-secondary min-h-12 text-left px-4">
          <span className="text-gray-400 mr-2">{index + 1} ·</span>{option}
        </button>
      ))}
    </div>
  ) : null

  if (phase === 'practice') {
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 · 不计入成绩</div>{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-24 pt-8">+</div>}{subPhase !== 'fixation' && <p className="text-xl font-semibold text-gray-800 pt-4">{item!.stem}</p>}<OptionButtons show={subPhase === 'stimulus'} />{subPhase === 'feedback' && <><div className="h-16 pt-4 text-gray-700">{practiceFeedback}</div><button type="button" className="btn-primary" onClick={practiceChoice === PRACTICE_ANSWER ? advancePractice : () => setPhase('instruction')}>{practiceChoice === PRACTICE_ANSWER ? '开始正式测评' : '重新阅读说明'}</button></>}</div>
  }

  if (!currentTrial) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return <CognitiveFocusStage ariaLabel="认知估计正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">第 {trialIndex + 1} / {totalTrials} 题</div>{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-28 pt-10">+</div>}{subPhase === 'stimulus' && <p className="text-xl font-semibold text-gray-800 pt-6">{currentTrial.stem}</p>}{(subPhase === 'feedback' || subPhase === 'retry') && <div className="h-28 pt-10 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{subPhase === 'stimulus' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}{subPhase === 'retry' && <button type="button" onClick={() => void submitFormal(null)}>重试保存本题</button>}<OptionButtons show={subPhase === 'stimulus'} /><p className="text-xs text-gray-400 mt-5">按键 1–4 或点击选项作答</p></div></CognitiveFocusStage>
}
