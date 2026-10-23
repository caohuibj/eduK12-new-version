import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { captureFrameTimingOnset, resolveEventResponseTimestamp, type CognitiveTimingOnset } from '../../core/response-timing'
import { simonSequence, mappingForSeed, type SimonSide } from './sequence'

type Phase = 'instruction' | 'practice' | 'ready' | 'test'
/** All onset/response values are software measurements, not physical calibration. */
export const SimonTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete }) => {
  const [phase, setPhase] = useState<Phase>('instruction')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [visible, setVisible] = useState(false)
  const [feedback, setFeedback] = useState('')
  const stimulusRef = useRef<HTMLDivElement>(null)
  const active = useRef(false)
  const onset = useRef<CognitiveTimingOnset | null>(null)
  const response = useRef<{ responseSide: SimonSide; rtMs: number } | null>(null)
  const interrupted = useRef(false)
  const sequence = useMemo(() => simonSequence(taskContext.randomSeed, 100), [taskContext.randomSeed])
  const practice = useMemo(() => simonSequence(taskContext.randomSeed, 20, true), [taskContext.randomSeed])
  const mapping = mappingForSeed(taskContext.randomSeed)
  const current = phase === 'practice' ? practice[practiceIndex] : sequence[trialIndex]
  const submitRef = useRef(onTrialComplete)
  submitRef.current = onTrialComplete
  const validConfig = taskContext.config.totalTrials === 100 && taskContext.config.practiceTrials === 20 && taskContext.config.responseWindowMs === 2000 && taskContext.config.feedbackMs === 1000 && taskContext.config.isiMinMs === 500 && taskContext.config.isiMaxMs === 999

  useEffect(() => {
    if (!validConfig || (phase !== 'practice' && phase !== 'test') || !current) return
    let disposed = false
    const timers: number[] = [], frames: number[] = []
    active.current = false; onset.current = null; response.current = null; interrupted.current = document.hidden || !document.hasFocus()
    setVisible(false); setFeedback('')
    const schedule = (fn: () => void, delay: number) => { timers.push(window.setTimeout(() => { if (!disposed) fn() }, delay)) }
    const hide = () => { if (stimulusRef.current) stimulusRef.current.style.visibility = 'hidden'; setVisible(false) }
    const finish = () => {
      const remaining = onset.current ? 2000 - (performance.now() - onset.current.perfMs) : 0
      if (remaining > 0) { schedule(finish, remaining); return }
      interrupted.current = interrupted.current || document.hidden || !document.hasFocus()
      active.current = false; hide()
      const result = { timing: { strategy: 'double-raf-performance-v1', onsetPerfMs: onset.current?.perfMs ?? null, windowEndPerfMs: performance.now(), isiMs: current.isiMs }, color: current.color, stimulusSide: current.stimulusSide, requiredSide: current.requiredSide, mapping: current.mapping, responseSide: response.current?.responseSide ?? null, rtMs: response.current?.rtMs ?? null, timeout: response.current === null, interrupted: interrupted.current }
      if (phase === 'practice') {
        setFeedback(result.interrupted ? '本次被中断' : result.timeout ? '未及时作答' : result.responseSide === current.requiredSide ? '正确' : '错误')
        schedule(() => { setFeedback(''); if (practiceIndex === 19) setPhase('ready'); else setPracticeIndex(i => i + 1) }, 1000 + current.isiMs)
      } else schedule(() => { void submitRef.current(result).catch(() => { if (!disposed) setFeedback('提交未完成，请按页面提示重试。') }) }, current.isiMs)
    }
    // Double rAF: second callback reveals the rectangle and records software onset.
    frames.push(window.requestAnimationFrame(() => {
      if (disposed) return
      frames.push(window.requestAnimationFrame(() => {
        if (disposed) return
        interrupted.current = interrupted.current || document.hidden || !document.hasFocus()
        if (stimulusRef.current) stimulusRef.current.style.visibility = 'visible'
        setVisible(true)
        const captured = captureFrameTimingOnset(performance.now())
        if (captured.ok) onset.current = captured.onset
        else interrupted.current = true
        active.current = true
        schedule(finish, 2000)
      }))
    }))
    const onBlur = () => { interrupted.current = true }
    const onVisibility = () => { if (document.hidden) interrupted.current = true }
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') || !active.current || response.current || !onset.current) return
      event.preventDefault()
      const time = resolveEventResponseTimestamp(event.timeStamp, onset.current)
      if (!time.ok) { interrupted.current = true; return }
      if (time.rtMs < 0 || time.rtMs >= 2000) return
      response.current = { responseSide: event.code === 'ArrowLeft' ? 'left' : 'right', rtMs: time.rtMs }
      hide()
    }
    window.addEventListener('keydown', onKey); window.addEventListener('blur', onBlur); document.addEventListener('visibilitychange', onVisibility)
    return () => { disposed = true; active.current = false; timers.forEach(window.clearTimeout); frames.forEach(window.cancelAnimationFrame); window.removeEventListener('keydown', onKey); window.removeEventListener('blur', onBlur); document.removeEventListener('visibilitychange', onVisibility) }
  }, [phase, practiceIndex, trialIndex, current, validConfig])
  if (!validConfig) return <p role="alert">冻结的 Simon 配置不受支持，无法开始。</p>
  const instruction = `看到红色按${mapping === 'red-left' ? '左' : '右'}方向键，看到蓝色按${mapping === 'red-left' ? '右' : '左'}方向键。忽略矩形出现的位置。`
  if (phase === 'instruction') return <section><h2>Simon 空间干扰任务</h2><p>{instruction}</p><p>仅限桌面物理方向键，不支持鼠标或触屏作答。先完成20次练习，再进行100次正式任务。中文研究工作译稿（PILOT），无常模或诊断用途。</p><button onClick={() => setPhase('practice')}>开始练习</button></section>
  if (phase === 'ready') return <section><p>练习结束。{instruction}</p><p>正式任务不显示正误反馈。</p><button onClick={() => setPhase('test')}>开始正式任务</button><button onClick={() => { setPracticeIndex(0); setPhase('practice') }}>重新练习</button></section>
  if (!current) return <p>任务已完成。</p>
  return <section aria-label="Simon 任务"><p>{phase === 'practice' ? `练习 ${practiceIndex + 1}/20` : '正式任务'}</p><div style={{ position: 'relative', height: 320, width: '100%', maxWidth: 800, margin: 'auto' }}><span style={{ position: 'absolute', left: '50%', top: '50%' }}>+</span><div ref={stimulusRef} data-testid="simon-stimulus" data-color={current.color} data-side={current.stimulusSide} data-visible={visible} style={{ position: 'absolute', top: 60, left: current.stimulusSide === 'left' ? '10%' : '65%', width: '25%', height: 180, backgroundColor: current.color === 'red' ? '#FF0000' : '#0000FF', visibility: visible ? 'visible' : 'hidden' }} /></div><p role="status">{feedback}</p></section>
}
