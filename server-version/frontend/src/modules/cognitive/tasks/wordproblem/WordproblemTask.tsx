import {WORDPROBLEM_PRACTICE_V2,WORDPROBLEM_STIMULUS_SET_VERSION_V2} from './bank-v2'
import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { WordproblemConfig, WordproblemTrialPayload } from './types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { buildWordproblemItems, WORDPROBLEM_PRACTICE_ITEM } from './prng'

type Phase = 'instruction' | 'practice' | 'formal' | 'blocked'
type SubPhase = 'fixation' | 'stimulus' | 'feedback'

const PRACTICE_ANSWER = 2

export const WordproblemTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as WordproblemConfig
  const revised=config.stimulusSetVersion===WORDPROBLEM_STIMULUS_SET_VERSION_V2
  const practiceItem=revised?WORDPROBLEM_PRACTICE_V2:WORDPROBLEM_PRACTICE_ITEM
  const totalTrials = config?.totalTrials ?? 30
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
  const firstSubmissionRef = useRef<WordproblemTrialPayload | null>(null)
  const [retrySave, setRetrySave] = useState(false)
  const items = useMemo(() => buildWordproblemItems(taskContext.randomSeed, totalTrials,config.stimulusSetVersion), [taskContext.randomSeed, totalTrials,config.stimulusSetVersion])
  const currentTrial = items[trialIndex]

  useEffect(() => {
    if (phase !== 'formal' || !currentTrial) return
    setFormalFeedback(null); interruptedRef.current = false; setSubPhase('fixation')
    if (revised) { firstSubmissionRef.current = null; setRetrySave(false) }
  }, [phase, trialIndex, currentTrial, revised])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || subPhase !== 'fixation') return
    const delay = phase === 'practice' ? 400 : fixationMs + (trialIndex > 0 ? 200 : 0)
    const timer = window.setTimeout(() => { onsetRef.current = performance.now(); setSubPhase('stimulus') }, delay)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, trialIndex, fixationMs])

  const submitFormal = useCallback(async (responseIndex: number | null, retry = false) => {
    if (phase !== 'formal' || (subPhase !== 'stimulus' && !(revised && retry && firstSubmissionRef.current)) || !currentTrial || submittingRef.current) return
    submittingRef.current = true
    const elapsed=onsetRef.current===null?null:Math.max(0,Math.round(performance.now()-onsetRef.current))
    if(revised&&elapsed!==null&&elapsed>=timeoutMs)responseIndex=null
    const payload: WordproblemTrialPayload = (revised && firstSubmissionRef.current) || {
      itemId: currentTrial.itemId,
      responseIndex,
      rtMs: responseIndex === null ? null : elapsed,
      interrupted: interruptedRef.current,
    }
    if (revised) { firstSubmissionRef.current = payload; setRetrySave(false) }
    setFormalFeedback(revised ? '正在保存作答…' : '已记录，下一题准备中'); setSubPhase('feedback')
    try {
      let accepted: boolean | void
      try { accepted = await onTrialComplete(payload) }
      catch (error) {
        if (!revised) throw error
        setFormalFeedback('提交未成功，请重试保存；将保留第一次选择和用时。'); setRetrySave(true); return
      }
      if (accepted === false) {
        if (revised) { setFormalFeedback('提交未成功，请重试保存；将保留第一次选择和用时。'); setRetrySave(true) }
        else { setFormalFeedback('提交失败，请重试当前试次'); setSubPhase('stimulus') }
        return
      }
      if (revised) { firstSubmissionRef.current = null; setFormalFeedback('作答已保存') }
      if (!revised && trialIndex + 1 >= totalTrials) await onTaskComplete?.()
    } finally { submittingRef.current = false }
  }, [phase, subPhase, currentTrial, onTrialComplete, trialIndex, totalTrials, onTaskComplete,revised,timeoutMs])

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

  const handlePracticeChoice = useCallback((choice: number) => {
    if (subPhase !== 'stimulus' || practiceChoice !== null) return
    setPracticeChoice(choice)
    if(revised){setPracticeFeedback(choice===WORDPROBLEM_PRACTICE_V2.answer?'正确：'+WORDPROBLEM_PRACTICE_V2.explanation:'再看一次条件。'+WORDPROBLEM_PRACTICE_V2.explanation)}
    else setPracticeFeedback(choice === PRACTICE_ANSWER ? '正确：24 ÷ 6 = 4。正式测验不再提示。' : '再算一次：24 个苹果平均分成 6 份，每份几个？')
    setSubPhase('feedback')
  }, [subPhase, practiceChoice,revised])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if(revised&&event.repeat)return
      const index = Number(event.key) - 1
      if (index >= 0 && index <= 3) {
        event.preventDefault()
        if (phase === 'practice') handlePracticeChoice(index)
        else void submitFormal(index)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, handlePracticeChoice, submitFormal,revised])

  const startPractice = useCallback(() => { setPracticeChoice(null); setPracticeFeedback(null); setSubPhase('fixation'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    setFormalFeedback(null); setSubPhase('fixation'); setPhase('formal')
  }, [])

  const item = phase === 'practice' ? practiceItem : currentTrial

  if (revised && trialIndex >= totalTrials) return <div role="status" className="card p-6 text-center">正式作答已保存，请使用页面上的“完成测评”按钮确认提交。</div>
  if (phase === 'instruction') return <CognitiveTaskIntro title="应用题推理" description={(taskContext.config.report as { reportVersion?: string } | undefined)?.reportVersion === '3.0.0' ? (<><p>每题是一道来自生活场景的数学应用题，请从四个选项中选出正确答案。</p><p>比较两种包装的单价时，先把数量与价格对应好，再检查单位是否一致。 这次任务只记录本次作答表现。</p></>) : (<p>每题是一道来自生活场景的数学应用题，请从四个选项中选出正确答案。</p>)} hint={<><p>按键 1–4 或点击选项作答；练习不计入成绩。</p>{revised&&<p>只依据题内条件选择唯一答案，先保证准确。正式共 {totalTrials} 题，每题最多 {timeoutMs/1000} 秒；超时进入下一题。正式题若全部用满时限约需 {(totalTrials*(timeoutMs+600)/60000).toFixed(1)} 分钟，另计自行阅读说明和练习的时间（非实测时长）。</p>}</>} onAction={startPractice} />
  if (phase === 'blocked') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700 mb-4">练习未完成，本次正式测评未开始。</p><button type="button" className="btn-secondary" onClick={() => window.history.back()}>返回</button></div>

  const OptionButtons: React.FC<{ show: boolean }> = ({ show }) => show ? (
    <div className="grid grid-cols-2 gap-3 max-w-xl mx-auto mt-5">
      {item!.options.map((option, index) => (
        <button key={option} type="button" onPointerDown={() => (phase === 'practice' ? handlePracticeChoice(index) : void submitFormal(index))} onClick={(event) => { if (revised && event.detail === 0) { if (phase === 'practice') handlePracticeChoice(index); else void submitFormal(index) } }} className="btn-secondary min-h-12 text-left px-4">
          <span className="text-gray-400 mr-2">{index + 1} ·</span>{option}
        </button>
      ))}
    </div>
  ) : null

  if (phase === 'practice') {
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 · 不计入成绩</div>{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-24 pt-8">+</div>}{subPhase !== 'fixation' && <p className="text-xl font-semibold text-gray-800 pt-4">{item!.stem}</p>}<OptionButtons show={subPhase === 'stimulus'} />{subPhase === 'feedback' && <><div className="h-16 pt-4 text-gray-700">{practiceFeedback}</div>{revised&&practiceChoice!==WORDPROBLEM_PRACTICE_V2.answer?<button type="button" className="btn-primary" onClick={()=>setPhase('instruction')}>重新查看说明并练习</button>:<button type="button" className="btn-primary" onClick={advancePractice}>开始正式测评</button>}</>}</div>
  }

  if (!currentTrial) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  return <CognitiveFocusStage ariaLabel="应用题推理正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">第 {trialIndex + 1} / {totalTrials} 题</div>{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-28 pt-10">+</div>}{subPhase === 'stimulus' && <p className="text-xl font-semibold text-gray-800 pt-6">{currentTrial.stem}</p>}{subPhase === 'feedback' && <div className="h-28 pt-10 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{subPhase === 'stimulus' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<OptionButtons show={subPhase === 'stimulus'} />{revised && retrySave && <button type="button" className="btn-primary" onClick={() => void submitFormal(null, true)}>重试保存</button>}<p className="text-xs text-gray-400 mt-5">按键 1–4 或点击选项作答</p></div></CognitiveFocusStage>
}
