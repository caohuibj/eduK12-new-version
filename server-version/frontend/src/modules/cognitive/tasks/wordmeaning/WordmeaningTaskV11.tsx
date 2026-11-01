import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import type { WordmeaningConfig, WordmeaningTrialPayload } from './types'
import { buildWordmeaningItemsV11, WORDMEANING_PRACTICE_ITEM_V11 as practice } from './prng-v1.1'

type Phase = 'instruction' | 'practice' | 'formal'
type Stage = 'fixation' | 'stimulus' | 'feedback'

/** v1.1.0: independent practice and immutable first-response retry. */
export function WordmeaningTaskV11({ taskContext, trialIndex, onTrialComplete }: CognitiveTaskProps) {
  const config = taskContext.config as unknown as WordmeaningConfig
  const [phase, setPhase] = useState<Phase>('instruction')
  const [stage, setStage] = useState<Stage>('fixation')
  const [practiceChoice, setPracticeChoice] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [retry, setRetry] = useState(false)
  const onset = useRef<number | null>(null)
  const interrupted = useRef(false)
  const busy = useRef(false)
  const firstResponse = useRef<WordmeaningTrialPayload | null>(null)
  const sequence = useMemo(() => {
    if (config.stimulusSetVersion !== 'wordmeaning-zh-v1.1.0') return null
    try { return buildWordmeaningItemsV11(taskContext.randomSeed, config.totalTrials) } catch { return null }
  }, [config.stimulusSetVersion, config.totalTrials, taskContext.randomSeed])
  const current = sequence?.[trialIndex]

  useEffect(() => {
    if (phase !== 'formal') return
    firstResponse.current = null; busy.current = false; onset.current = null; interrupted.current = false
    setStage('fixation'); setMessage(''); setRetry(false)
  }, [phase, trialIndex])

  useEffect(() => {
    if (phase === 'instruction' || stage !== 'fixation') return
    const timer = window.setTimeout(() => { onset.current = performance.now(); setStage('stimulus') }, phase === 'practice' ? 400 : config.fixationMs + (trialIndex > 0 ? 200 : 0))
    return () => window.clearTimeout(timer)
  }, [phase, stage, trialIndex, config.fixationMs])

  useEffect(() => {
    if (phase !== 'formal') return
    const mark = () => { if (document.hidden) interrupted.current = true }
    document.addEventListener('visibilitychange', mark)
    return () => document.removeEventListener('visibilitychange', mark)
  }, [phase])

  const saveFirstResponse = useCallback(async () => {
    if (busy.current || !firstResponse.current) return
    busy.current = true; setRetry(false); setMessage('已记录，下一题准备中'); setStage('feedback')
    let accepted = false
    try { accepted = (await onTrialComplete({ ...firstResponse.current })) !== false }
    catch { accepted = false }
    finally { busy.current = false }
    if (!accepted) { setRetry(true); setMessage('提交未成功，请重试保存；将保留第一次选择和用时。'); return }
    firstResponse.current = null
  }, [onTrialComplete])

  const choose = useCallback((index: number | null) => {
    if (stage !== 'stimulus') return
    if (phase === 'practice') {
      if (practiceChoice !== null || index === null) return
      setPracticeChoice(index); setStage('feedback'); return
    }
    if (phase !== 'formal' || !current || firstResponse.current || busy.current) return
    const elapsed = onset.current === null ? null : Math.max(0, Math.round(performance.now() - onset.current))
    const timedOut = index === null || elapsed === null || elapsed > config.timeoutMs
    firstResponse.current = { itemId: current.itemId, responseIndex: timedOut ? null : index, rtMs: timedOut ? null : elapsed, interrupted: interrupted.current }
    void saveFirstResponse()
  }, [stage, phase, practiceChoice, current, config.timeoutMs, saveFirstResponse])

  useEffect(() => {
    if (phase !== 'formal' || stage !== 'stimulus') return
    const timer = window.setTimeout(() => choose(null), config.timeoutMs)
    return () => window.clearTimeout(timer)
  }, [phase, stage, config.timeoutMs, choose])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.repeat || !/^[1-4]$/.test(event.key)) return
      event.preventDefault(); choose(Number(event.key) - 1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [choose])

  if (!sequence) return <div role="alert" className="card p-6">题目版本或题量与当前题库不匹配，测验尚未开始。请返回并联系管理员。</div>
  if (trialIndex >= config.totalTrials) return <div role="status" className="card p-6 text-center">正式作答已保存，请使用页面上的“完成测评”按钮确认提交。</div>
  if (phase === 'instruction') return <CognitiveTaskIntro title="词汇理解" description={<><p>每题给出一个词语或词语语境，请选择意思最接近的解释。</p><p>读活动通知时，弄清“暂缓”和“取消”的区别，才不容易把安排理解错。 这次任务只记录本次作答表现。</p></>} hint={<p>按数字键 1–4 或点击选项。先准确理解，再在每题 {config.timeoutMs / 1000} 秒内作答；超时会记为未作答。练习使用独立题目，不计分。正式共 {config.totalTrials} 题。</p>} onAction={() => { setPracticeChoice(null); setStage('fixation'); setPhase('practice') }} />
  const item = phase === 'practice' ? practice : current
  if (!item) return <div className="card p-6" role="status">本次题目已作答完毕，正在结束测验。</div>
  return <CognitiveFocusStage ariaLabel="词汇理解"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8">
    <p className="mb-4 text-sm text-gray-500">{phase === 'practice' ? '练习 · 独立题目 · 不计分' : `第 ${trialIndex + 1} / ${config.totalTrials} 题`}</p>
    {stage === 'fixation' && <div className="h-28 pt-10 text-4xl text-gray-400">+</div>}
    {stage !== 'fixation' && (stage === 'stimulus' || phase === 'practice') && <p className="pt-4 text-xl font-semibold text-gray-800">{item.word}</p>}
    {stage === 'stimulus' && <div className="mx-auto mt-5 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">{item.options.map((option, index) => <button key={option} type="button" className="btn-secondary min-h-12 px-4 text-left" onClick={() => choose(index)}><span className="mr-2 text-gray-400">{index + 1} ·</span>{option}</button>)}</div>}
    {phase === 'practice' && stage === 'feedback' && <><p role="status" className="py-5">{practiceChoice === practice.answer ? '正确。' : '这次没有选对。'}{practice.explanation}</p>{practiceChoice === practice.answer ? <button type="button" className="btn-primary" onClick={() => { setStage('fixation'); setPhase('formal') }}>开始正式测评</button> : <button type="button" className="btn-secondary" onClick={() => { setPhase('instruction'); setPracticeChoice(null) }}>重新阅读说明并练习</button>}</>}
    {phase === 'formal' && stage === 'feedback' && <p role="status" className="py-6">{message}</p>}
    {retry && <button type="button" className="btn-primary" onClick={() => void saveFirstResponse()}>重试保存</button>}
    {stage === 'stimulus' && <p className="mt-5 text-xs text-gray-500">按数字键 1–4 或点击选项</p>}
  </div></CognitiveFocusStage>
}
