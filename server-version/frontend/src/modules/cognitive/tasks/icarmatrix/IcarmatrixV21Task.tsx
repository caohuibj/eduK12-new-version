import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { IcarmatrixV21Config, IcarmatrixV2TrialPayload } from './types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { ICARMATRIX_V2_BANK, generateIcarmatrixV2Plan, icarmatrixV2OptionOrder, ICARMATRIX_V2_OPTION_COUNT } from './generator-v21'
import { PRACTICE_MATRIX_ITEMS } from './practice-items'

type Phase = 'instruction' | 'practice' | 'formal'
type SubPhase = 'fixation' | 'item' | 'feedback'

const SvgFigure: React.FC<{ svg: string; size: number }> = ({ svg, size }) => (
  <img alt="" draggable={false} width={size} height={size} className="shrink-0"
    style={{ width: size, height: size }} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'))}`} />
)

export const IcarmatrixV21Task: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as IcarmatrixV21Config
  const totalTrials = config.totalTrials
  const matrixType = config.matrixType
  const fixationMs = config?.fixationMs ?? 400
  const timeoutMs = config?.timeoutMs ?? 30000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('fixation')
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const interruptedRef = useRef(false)
  const onsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  // An older async acknowledgement must not reset a newer trial.
  const committedTrialIndexRef = useRef(trialIndex)
  useLayoutEffect(() => { committedTrialIndexRef.current = trialIndex }, [trialIndex])
  const pendingTrialRef = useRef<IcarmatrixV2TrialPayload | null>(null)
  const submittedTrialRef = useRef(false)
  const [retryPending, setRetryPending] = useState(false)
  const plan = useMemo(
    () => generateIcarmatrixV2Plan(taskContext.randomSeed, totalTrials, matrixType),
    [taskContext.randomSeed, totalTrials, matrixType],
  )
  const bankItem = ICARMATRIX_V2_BANK[plan[trialIndex]]
  const optionOrder = useMemo(
    () => (bankItem ? icarmatrixV2OptionOrder(taskContext.randomSeed, trialIndex, bankItem.responses.length) : []),
    [taskContext.randomSeed, trialIndex, bankItem],
  )

  useEffect(() => {
    if (phase !== 'formal' || !bankItem) return
    setFormalFeedback(null); setSelected(null); setRetryPending(false); pendingTrialRef.current = null; submittedTrialRef.current = false; interruptedRef.current = false; onsetRef.current = null; setSubPhase('fixation')
  }, [phase, trialIndex, bankItem])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || subPhase !== 'fixation') return
    const timer = window.setTimeout(() => {
      onsetRef.current = performance.now()
      setSubPhase('item')
    }, phase === 'practice' ? 300 : fixationMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, trialIndex, fixationMs])

  // Network failures retry the exact same observation; original reaction time is not re-measured.
  const submit = useCallback(async (responseIndex: number | null) => {
    if (phase !== 'formal' || !bankItem || submittingRef.current) return
    if (subPhase !== 'item' && !(subPhase === 'feedback' && retryPending)) return
    submittingRef.current = true
    if (!pendingTrialRef.current) {
      const rtMs = responseIndex === null || onsetRef.current === null
        ? null : Math.max(0, Math.round(performance.now() - onsetRef.current))
      pendingTrialRef.current = {
        trialIndex,
        bankItemId: bankItem.itemId,
        responseIndex: rtMs !== null && rtMs >= timeoutMs ? null : responseIndex,
        rtMs: rtMs !== null && rtMs >= timeoutMs ? null : rtMs,
        interrupted: interruptedRef.current,
      }
    }
    setSelected(pendingTrialRef.current.responseIndex)
    setFormalFeedback('正在保存本题…')
    setSubPhase('feedback')
    setRetryPending(false)
    try {
      if (!submittedTrialRef.current) {
        const accepted = await onTrialComplete(pendingTrialRef.current)
        if (committedTrialIndexRef.current !== trialIndex) return
        if (accepted === false) {
          setFormalFeedback('提交失败，请重试保存本题')
          setRetryPending(true)
          return
        }
        submittedTrialRef.current = true
      }
      if (trialIndex + 1 >= totalTrials) await onTaskComplete?.()
      if (committedTrialIndexRef.current !== trialIndex) return
      pendingTrialRef.current = null
      submittedTrialRef.current = false
      setFormalFeedback('已记录，下一题准备中')
    } catch {
      if (committedTrialIndexRef.current === trialIndex) {
        setFormalFeedback('网络或保存异常，请重试保存本题')
        setRetryPending(true)
      }
    } finally {
      submittingRef.current = false
    }
  }, [phase, subPhase, bankItem, onTrialComplete, trialIndex, totalTrials, onTaskComplete, retryPending, timeoutMs])

  useEffect(() => {
    if (phase !== 'formal' || subPhase !== 'item') return
    const timer = window.setTimeout(() => { void submit(null) }, timeoutMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, timeoutMs, submit])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const startPractice = useCallback(() => {
    setSubPhase('fixation'); setPhase('practice')
  }, [])

  const startFormal = useCallback(() => {
    setFormalFeedback(null); setSelected(null); setSubPhase('fixation'); setPhase('formal')
  }, [])

  if (phase === 'instruction') return <CognitiveTaskIntro title="图形矩阵推理 · 七题试测版" description={<p>每张图按行、按列都在按规律变化，右下角缺了一块。请找出规律，从选项中挑出缺失的图形。</p>} hint={<><p>本次共 {totalTrials} 题，每题限时 {Math.round(timeoutMs / 1000)} 秒。先仔细找规律，再点击选项；练习不计入成绩。此为本项目七题试测范围，不是原版 ICAR 全套测验。</p></>} onAction={startPractice} />

  const cellSize = 80
  const optionSize = 64
  const gridClass = 'grid-cols-3'

  if (!bankItem) return <div className="card p-8 text-center text-gray-500">正在生成结果…</div>

  if (phase === 'practice') {
    const practiceItem = PRACTICE_MATRIX_ITEMS[matrixType]
    const practiceOrder = practiceItem ? icarmatrixV2OptionOrder(`${taskContext.randomSeed}:practice`, 0, practiceItem.responses.length) : []
    const practiceCorrectDisplay = practiceOrder.indexOf(practiceItem.correctResponseIndex)
    return <CognitiveFocusStage ariaLabel="矩阵推理练习"><div className="card mx-auto max-w-3xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500 mb-3">练习 · 不计入成绩</div>{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-24 pt-6">+</div>}{subPhase !== 'fixation' && practiceItem && <div><div className={`grid ${gridClass} gap-1 w-fit mx-auto bg-white`}>{practiceItem.cells.map((svg, index) => <SvgFigure key={index} svg={svg} size={cellSize} />)}<div className="flex items-center justify-center text-3xl text-gray-300" style={{ width: cellSize, height: cellSize }}>?</div></div><div className={`grid grid-cols-3 sm:grid-cols-6 gap-2 mt-4 justify-center`}>{practiceOrder.map((bankResponseIndex, displayIndex) => <button key={displayIndex} type="button" aria-label={`练习选项 ${displayIndex + 1}`} disabled={subPhase === 'feedback'} className={`border rounded p-1 hover:bg-slate-50 disabled:cursor-default ${subPhase === 'feedback' && displayIndex === practiceCorrectDisplay ? 'ring-2 ring-emerald-600' : ''}`} onClick={() => { setSelected(displayIndex); setSubPhase('feedback') }}><SvgFigure svg={practiceItem.responses[bankResponseIndex].svg} size={optionSize} /></button>)}</div></div>}{subPhase === 'feedback' && selected !== null && practiceItem && <p className="mt-3 text-sm text-gray-700">{selected === practiceCorrectDisplay ? '正确：这就是按规律缺失的图形。' : '再看看行列规律——正确答案已高亮。'}</p>}{subPhase === 'feedback' && <button type="button" onClick={() => {
      if (selected === practiceCorrectDisplay) startFormal()
      else { setSelected(null); setSubPhase('fixation'); setPhase('instruction') }
    }} className="btn-primary mt-4">{selected === practiceCorrectDisplay ? '开始正式测评' : '重新阅读说明并练习'}</button>}</div></CognitiveFocusStage>
  }

  return <CognitiveFocusStage ariaLabel="矩阵推理正式测验"><div className="card mx-auto max-w-3xl p-5 text-center sm:p-8"><div className="text-sm text-gray-400">第 {trialIndex + 1} / {totalTrials} 题</div>{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-72 pt-24">+</div>}{subPhase === 'item' && <div className="mt-3"><div className={`grid ${gridClass} gap-1 w-fit mx-auto bg-white`}>{bankItem.cells.map((svg, index) => <SvgFigure key={index} svg={svg} size={cellSize} />)}<div className="flex items-center justify-center text-3xl text-gray-300" style={{ width: cellSize, height: cellSize }}>?</div></div><div className={`grid grid-cols-3 sm:grid-cols-6 gap-2 mt-4 place-items-center`}>{optionOrder.slice(0, ICARMATRIX_V2_OPTION_COUNT).map((bankResponseIndex, displayIndex) => <button key={displayIndex} type="button" aria-label={`选项 ${displayIndex + 1}`} className={`border rounded p-1 hover:bg-slate-50 ${selected === displayIndex ? 'ring-2 ring-slate-400' : ''}`} onClick={() => { void submit(displayIndex) }}><SvgFigure svg={bankItem.responses[bankResponseIndex].svg} size={optionSize} /></button>)}</div></div>}{subPhase === 'feedback' && <div className="h-72 pt-24 text-xl font-semibold text-gray-700">{formalFeedback}{retryPending && <div className="mt-4"><button type="button" className="btn-primary" onClick={() => { void submit(pendingTrialRef.current?.responseIndex ?? null) }}>重试提交</button></div>}</div>}</div></CognitiveFocusStage>
}
