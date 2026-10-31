import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { IcarmatrixConfig, IcarmatrixTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { icarmatrixItem, type CellSpec } from './generator'

type Phase = 'instruction' | 'practice' | 'formal' | 'completed'
type SubPhase = 'fixation' | 'stimulus' | 'feedback'

const SHAPE_PATHS = ['circle', 'square', 'triangle', 'diamond', 'hexagon', 'cross'] as const

const Shape: React.FC<{ spec: CellSpec; size: number }> = ({ spec, size }) => {
  const half = size / 2
  const r = size * 0.38
  const stroke = '#334155'
  const fillValues = ['#334155', 'rgba(51,65,85,0.45)', 'none']
  const fill = fillValues[spec.fill]
  const shapes: React.ReactNode[] = []
  for (let index = 0; index < spec.count; index += 1) {
    const cx = half + (index - (spec.count - 1) / 2) * size * 0.42
    if (SHAPE_PATHS[spec.shape] === 'circle') shapes.push(<circle key={index} cx={cx} cy={half} r={r / 2} fill={fill} stroke={stroke} strokeWidth={3} />)
    if (SHAPE_PATHS[spec.shape] === 'square') shapes.push(<rect key={index} x={cx - r / 2} y={half - r / 2} width={r} height={r} fill={fill} stroke={stroke} strokeWidth={3} />)
    if (SHAPE_PATHS[spec.shape] === 'triangle') shapes.push(<polygon key={index} points={`${cx},${half - r / 2} ${cx - r / 2},${half + r / 2} ${cx + r / 2},${half + r / 2}`} fill={fill} stroke={stroke} strokeWidth={3} />)
    if (SHAPE_PATHS[spec.shape] === 'diamond') shapes.push(<polygon key={index} points={`${cx},${half - r / 2} ${cx + r / 2},${half} ${cx},${half + r / 2} ${cx - r / 2},${half}`} fill={fill} stroke={stroke} strokeWidth={3} />)
    if (SHAPE_PATHS[spec.shape] === 'hexagon') shapes.push(<polygon key={index} points={`${cx - r / 2},${half} ${cx - r / 4},${half - r / 2} ${cx + r / 4},${half - r / 2} ${cx + r / 2},${half} ${cx + r / 4},${half + r / 2} ${cx - r / 4},${half + r / 2}`} fill={fill} stroke={stroke} strokeWidth={3} />)
    if (SHAPE_PATHS[spec.shape] === 'cross') shapes.push(<path key={index} d={`M${cx - r / 2} ${half - r / 2} h${r / 2} v${-r / 2} h${r / 2} v${r / 2} h${r / 2} v${r / 2} h${-r / 2} v${r / 2} h${-r / 2} v${r / 2} h${-r / 2} v${-r / 2} h${-r / 2} z`} fill={fill} stroke={stroke} strokeWidth={3} />)
  }
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">{shapes}</svg>
}

const Matrix: React.FC<{ cells: CellSpec[]; size: number; cellSize: number }> = ({ cells, size, cellSize }) => (
  <div className="grid grid-cols-3 gap-1 mx-auto" style={{ width: size * 3 + 8 }}>
    {Array.from({ length: 9 }, (_, index) => (
      <div key={index} className="flex items-center justify-center rounded border border-gray-200 bg-gray-50" style={{ width: cellSize, height: cellSize }}>
        {index < 8 ? <Shape spec={cells[index]} size={cellSize * 0.8} /> : <span className="text-3xl font-bold text-gray-400">?</span>}
      </div>
    ))}
  </div>
)

export const IcarmatrixTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as IcarmatrixConfig
  const totalTrials = config?.totalTrials ?? 16
  const fixationMs = config?.fixationMs ?? 400
  const timeoutMs = config?.timeoutMs ?? 30000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('fixation')
  const [practiceChoice, setPracticeChoice] = useState<number | null>(null)
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const interruptedRef = useRef(false)
  const onsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const item = useMemo(() => icarmatrixItem(taskContext.randomSeed, trialIndex), [taskContext.randomSeed, trialIndex])

  useEffect(() => {
    if (phase !== 'formal') return
    setFormalFeedback(null); interruptedRef.current = false; setSubPhase('fixation')
  }, [phase, trialIndex])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || subPhase !== 'fixation') return
    const delay = phase === 'practice' ? 400 : fixationMs + (trialIndex > 0 ? 200 : 0)
    const timer = window.setTimeout(() => { onsetRef.current = performance.now(); setSubPhase('stimulus') }, delay)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, trialIndex, fixationMs])

  const submitFormal = useCallback(async (responseIndex: number | null) => {
    if (phase !== 'formal' || subPhase !== 'stimulus' || submittingRef.current) return
    submittingRef.current = true
    const payload: IcarmatrixTrialPayload = {
      itemIndex: trialIndex,
      responseIndex,
      rtMs: responseIndex === null || onsetRef.current === null ? null : Math.max(0, Math.round(performance.now() - onsetRef.current)),
      interrupted: interruptedRef.current,
    }
    setFormalFeedback('已记录，下一题准备中'); setSubPhase('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前试次'); setSubPhase('stimulus'); return }
      if (trialIndex + 1 >= totalTrials) await onTaskComplete?.()
    } finally { submittingRef.current = false }
  }, [phase, subPhase, onTrialComplete, trialIndex, totalTrials, onTaskComplete])

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
    setPracticeFeedback(choice === 1 ? '正确：每行的形状按顺序轮换。正式测验不再提示。' : '再看一行：形状按 圆→方→三角 依次变化。')
    setSubPhase('feedback')
  }, [subPhase, practiceChoice])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const index = Number(event.key) - 1
      if (index >= 0 && index <= 5) {
        event.preventDefault()
        if (phase === 'practice') handlePracticeChoice(index)
        else void submitFormal(index)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, handlePracticeChoice, submitFormal])

  const startPractice = useCallback(() => { setPracticeChoice(null); setPracticeFeedback(null); setSubPhase('fixation'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    setFormalFeedback(null); setSubPhase('fixation'); setPhase('formal')
  }, [])

  const OptionButtons: React.FC<{ show: boolean }> = ({ show }) => show ? (
    <div className="grid grid-cols-3 gap-3 max-w-xl mx-auto mt-5">
      {item.options.map((option, index) => (
        <button key={index} type="button" onPointerDown={() => (phase === 'practice' ? handlePracticeChoice(index) : void submitFormal(index))} className="btn-secondary flex items-center justify-center p-2">
          <Shape spec={option} size={56} />
          <span className="text-xs text-gray-400 ml-2">{index + 1}</span>
        </button>
      ))}
    </div>
  ) : null

  if (phase === 'instruction') return <CognitiveTaskIntro title="图形矩阵推理" description={<p>每题是一个 3×3 的图形方格，右下角空缺。请找出形状、填充、数量的行列规律，从六个选项中选出属于空格的图形。</p>} hint={<><p>按键 1–6 或点击选项作答；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'completed') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700">已全部完成，正在生成结果…</p></div>

  if (phase === 'practice') {
    const practiceItem = icarmatrixItem(taskContext.randomSeed, 0)
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 · 不计入成绩</div>{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-28 pt-8">+</div>}{subPhase !== 'fixation' && <Matrix cells={practiceItem.cells} size={72} cellSize={64} />}  <OptionButtons show={subPhase === 'stimulus'} />{subPhase === 'feedback' && <><div className="h-16 pt-3 text-gray-700">{practiceFeedback}</div><button type="button" className="btn-primary" onClick={advancePractice}>开始正式测评</button></>}</div>
  }

  return <CognitiveFocusStage ariaLabel="图形矩阵推理正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">第 {trialIndex + 1} / {totalTrials} 题</div>{subPhase === 'fixation' && <div className="text-4xl text-gray-400 h-40 pt-12">+</div>}{subPhase === 'stimulus' && <div className="pt-4"><Matrix cells={item.cells} size={72} cellSize={64} /></div>}{subPhase === 'feedback' && <div className="h-40 pt-12 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{subPhase === 'stimulus' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<OptionButtons show={subPhase === 'stimulus'} /><p className="text-xs text-gray-400 mt-4">按键 1–6 或点击选项作答</p></div></CognitiveFocusStage>
}
