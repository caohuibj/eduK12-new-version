import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { UfovConfig, UfovTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { ufovStimulus } from './generator'

type Phase = 'instruction' | 'practice' | 'formal' | 'completed'
type PhaseStep = 'fixation' | 'display' | 'central-response' | 'peripheral-response' | 'feedback'

const PERIPHERAL_LABELS = ['上', '右上', '右', '右下', '下', '左下', '左', '左上']

/** 8 位置按钮在 4×3 网格中的排列（模拟环形布局）。 */
const POSITION_GRID: Array<{ position: number; label: string }[]> = [
  [{ position: 7, label: '↖' }, { position: 0, label: '↑' }, { position: 1, label: '↗' }],
  [{ position: 6, label: '←' }, { position: -1, label: '' }, { position: 2, label: '→' }],
  [{ position: 5, label: '↙' }, { position: 4, label: '↓' }, { position: 3, label: '↘' }],
]

export const UfovTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as UfovConfig
  const totalTrials = config?.totalTrials ?? 16
  const stimulusMs = config?.stimulusMs ?? 400
  const fixationMs = config?.fixationMs ?? 500
  const [phase, setPhase] = useState<Phase>('instruction')
  const [step, setStep] = useState<PhaseStep>('fixation')
  const [centralChoice, setCentralChoice] = useState<number | null>(null)
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const [completedCount, setCompletedCount] = useState(0)
  const interruptedRef = useRef(false)
  const displayOnsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const stimulus = useMemo(() => ufovStimulus(taskContext.randomSeed, trialIndex), [taskContext.randomSeed, trialIndex])

  useEffect(() => {
    if (phase !== 'formal') return
    setFormalFeedback(null); interruptedRef.current = false
  }, [trialIndex])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || step !== 'fixation') return
    const timer = window.setTimeout(() => {
      displayOnsetRef.current = performance.now()
      setStep('display')
    }, fixationMs)
    return () => window.clearTimeout(timer)
  }, [phase, step, trialIndex, fixationMs])

  useEffect(() => {
    if (step !== 'display') return
    const timer = window.setTimeout(() => {
      setStep('central-response')
    }, stimulusMs)
    return () => window.clearTimeout(timer)
  }, [step, stimulusMs])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const submitFormal = useCallback(async (centralResponse: number | null, peripheralResponse: number | null) => {
    if (phase !== 'formal' || submittingRef.current) return
    submittingRef.current = true
    const payload: UfovTrialPayload = {
      centralTarget: stimulus.centralTarget,
      peripheralPosition: stimulus.peripheralPosition,
      centralResponse,
      peripheralResponse,
      rtMs: displayOnsetRef.current === null ? null : Math.max(0, Math.round(performance.now() - displayOnsetRef.current)),
      interrupted: interruptedRef.current,
    }
    setFormalFeedback('已记录，下一题准备中'); setStep('feedback')
    try {
      const accepted = await onTrialComplete(payload)
      if (accepted === false) { setFormalFeedback('提交失败，请重试当前试次'); setStep('central-response'); return }
      setCompletedCount((current) => current + 1)
      if (completedCount + 1 >= totalTrials) { setPhase('completed'); await onTaskComplete?.() }
    } finally { submittingRef.current = false }
  }, [phase, stimulus, onTrialComplete, completedCount, totalTrials, onTaskComplete])

  const handleCentralChoice = useCallback((choice: number) => {
    if (step !== 'central-response') return
    setCentralChoice(choice)
    setStep('peripheral-response')
  }, [step])

  const handlePeripheralChoice = useCallback((position: number) => {
    if (step !== 'peripheral-response') return
    if (phase === 'practice') {
      const cOk = centralChoice !== null && centralChoice === (stimulus.centralTarget === 'circle' ? 0 : 1)
      const pOk = position === stimulus.peripheralPosition
      setPracticeFeedback(`正确答案：中心是${stimulus.centralTarget === 'circle' ? '圆形' : '三角形'}，周边在${PERIPHERAL_LABELS[stimulus.peripheralPosition]}。正式测验不再提示。`)
      setStep('feedback')
      void cOk; void pOk
      return
    }
    void submitFormal(centralChoice, position)
  }, [step, phase, centralChoice, stimulus, submitFormal])

  const startPractice = useCallback(() => { setCentralChoice(null); setPracticeFeedback(null); setStep('fixation'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    setFormalFeedback(null); setCentralChoice(null); setStep('fixation'); setPhase('formal')
  }, [])

  if (phase === 'instruction') return <CognitiveTaskIntro title="有用视野" description={<p>每题屏幕中心会出现一个图形（圆形或三角形），同时周边某个方向会闪过一个亮点。图形消失后，请回答：① 中心是什么形状？② 亮点在哪个方向？</p>} hint={<><p>眼睛盯住中心，余光注意周边；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'completed') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700">已全部完成，正在生成结果…</p></div>

  if (phase === 'practice') {
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 · 不计入成绩</div>{step === 'fixation' && <div className="text-4xl text-gray-400 h-28 pt-8">+</div>}{step === 'display' && <div className="relative mx-auto" style={{ width: 280, height: 280 }}><div className="absolute inset-0 flex items-center justify-center">{stimulus.centralTarget === 'circle' ? <span className="h-10 w-10 rounded-full bg-gray-800 inline-block" /> : <span className="inline-block" style={{ width: 0, height: 0, borderLeft: '20px solid transparent', borderRight: '20px solid transparent', borderBottom: '36px solid #1e293b' }} />}</div><div className="absolute rounded-full bg-sky-500" style={{ width: 14, height: 14, top: 140 + 100 * -Math.cos(stimulus.peripheralPosition * Math.PI / 4) - 7, left: 140 + 100 * Math.sin(stimulus.peripheralPosition * Math.PI / 4) - 7 }} /></div>}{step === 'central-response' && <><p className="text-gray-700 pt-4">中心是什么形状？</p><div className="grid grid-cols-2 gap-3 max-w-md mx-auto mt-3"><button type="button" onPointerDown={() => handleCentralChoice(0)} className="btn-secondary min-h-12">1 · ○ 圆形</button><button type="button" onPointerDown={() => handleCentralChoice(1)} className="btn-secondary min-h-12">2 · △ 三角形</button></div></>}{step === 'peripheral-response' && <><p className="text-gray-700 pt-2">亮点在哪个方向？</p><div className="max-w-xs mx-auto mt-3 space-y-1">{POSITION_GRID.map((row, rowIndex) => <div key={rowIndex} className="flex justify-center gap-1">{row.map((cell) => cell.position === -1 ? <span key="empty" className="h-10 w-14" /> : <button key={cell.position} type="button" onPointerDown={() => handlePeripheralChoice(cell.position)} className="btn-secondary h-10 w-14 text-lg">{cell.label}</button>)}</div>)}</div></>}{step === 'feedback' && <><div className="h-16 pt-3 text-gray-700">{practiceFeedback}</div><button type="button" className="btn-primary" onClick={advancePractice}>开始正式测评</button></>}</div>
  }

  return <CognitiveFocusStage ariaLabel="有用视野正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">第 {trialIndex + 1} / {totalTrials} 题</div>{step === 'fixation' && <div className="text-4xl text-gray-400 h-40 pt-16">+</div>}{step === 'display' && <div className="relative mx-auto" style={{ width: 280, height: 280 }}><div className="absolute inset-0 flex items-center justify-center">{stimulus.centralTarget === 'circle' ? <span className="h-10 w-10 rounded-full bg-gray-800 inline-block" /> : <span className="inline-block" style={{ width: 0, height: 0, borderLeft: '20px solid transparent', borderRight: '20px solid transparent', borderBottom: '36px solid #1e293b' }} />}</div><div className="absolute rounded-full bg-sky-500" style={{ width: 14, height: 14, top: 140 + 100 * -Math.cos(stimulus.peripheralPosition * Math.PI / 4) - 7, left: 140 + 100 * Math.sin(stimulus.peripheralPosition * Math.PI / 4) - 7 }} /></div>}{step === 'central-response' && <><p className="text-gray-700 pt-4">中心是什么形状？</p><div className="grid grid-cols-2 gap-3 max-w-md mx-auto mt-3"><button type="button" onPointerDown={() => handleCentralChoice(0)} className="btn-secondary min-h-12">1 · ○ 圆形</button><button type="button" onPointerDown={() => handleCentralChoice(1)} className="btn-secondary min-h-12">2 · △ 三角形</button></div></>}{step === 'peripheral-response' && <><p className="text-gray-700 pt-2">亮点在哪个方向？</p><div className="max-w-xs mx-auto mt-3 space-y-1">{POSITION_GRID.map((row, rowIndex) => <div key={rowIndex} className="flex justify-center gap-1">{row.map((cell) => cell.position === -1 ? <span key="empty" className="h-10 w-14" /> : <button key={cell.position} type="button" onPointerDown={() => handlePeripheralChoice(cell.position)} className="btn-secondary h-10 w-14 text-lg">{cell.label}</button>)}</div>)}</div></>}{step === 'feedback' && <div className="h-24 pt-10 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{step === 'central-response' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<p className="text-xs text-gray-400 mt-4">先答中心形状 · 再点周边方向</p></div></CognitiveFocusStage>
}
