import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { pictureSequenceItems, seededRandom, shuffleInPlace } from '../shared/prng'

type Phase = 'instruction' | 'practice-study' | 'practice-recall' | 'practice-feedback' | 'practice-result' | 'formal-study' | 'formal-recall' | 'delayed-wait'
const PRACTICE = [
  ['practice-a', 'practice-b', 'practice-c'],
  ['practice-b', 'practice-c', 'practice-a'],
  ['practice-c', 'practice-a', 'practice-b'],
  ['practice-a', 'practice-c', 'practice-b'],
]
const ACTIONS = ['整理书包', '走进教室', '打开课本', '听老师讲解', '记录重点', '完成练习', '收好文具', '走向操场', '准备午餐', '清理桌面', '阅读图书', '归还图书', '参加活动', '整理座位', '离开校园']
const PRACTICE_LABELS: Record<string, string> = { 'practice-a': '拿出水杯', 'practice-b': '倒入清水', 'practice-c': '喝水' }

const labelOf = (itemId: string) => {
  if (PRACTICE_LABELS[itemId]) return PRACTICE_LABELS[itemId]
  const number = Number(itemId.slice(-2))
  const story = Math.floor((number - 1) / 15) + 1
  return `故事 ${story} · ${ACTIONS[(number - 1) % 15]}`
}

const SceneIcon: React.FC<{ itemId: string }> = ({ itemId }) => {
  const number = itemId.startsWith('scene-') ? Number(itemId.slice(-2)) : itemId.charCodeAt(itemId.length - 1)
  const palette = ['#0ea5e9', '#8b5cf6', '#f97316']
  const color = palette[Math.floor(Math.max(0, number - 1) / 15) % palette.length]
  const step = Math.max(0, number - 1) % 15
  return <svg aria-hidden="true" viewBox="0 0 96 64" className="mx-auto mb-2 h-14 w-20">
    <rect x="2" y="2" width="92" height="60" rx="10" fill="#f8fafc" stroke={color} strokeWidth="3" />
    <circle cx={18 + (step % 5) * 14} cy={17 + (step % 3) * 10} r="8" fill={color} opacity="0.85" />
    <path d={`M12 ${50 - (step % 4) * 4} L34 ${34 + (step % 3) * 5} L52 ${48 - (step % 5) * 3} L82 18`} fill="none" stroke="#334155" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <rect x={66 - (step % 3) * 8} y="38" width="16" height="14" rx="3" fill={color} opacity="0.55" />
  </svg>
}

const Card: React.FC<{ itemId: string; onClick?: () => void; index?: number }> = ({ itemId, onClick, index }) => (
  <button type="button" onClick={onClick} disabled={!onClick} className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm disabled:text-slate-700">
    <SceneIcon itemId={itemId} />
    {index != null && <span className="mr-2 font-semibold text-sky-700">{index + 1}.</span>}{labelOf(itemId)}
  </button>
)

export const PicturesequenceTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as { itemCount: number; learningRounds: number; delayedEnabled: boolean; delayedDelayMs: number; studyMsPerItem: number; inactivityGuardMs: number }
  const itemCount = config.itemCount ?? 12
  const learningRounds = config.learningRounds ?? 3
  const delayedEnabled = config.delayedEnabled ?? false
  const delayedDelayMs = config.delayedDelayMs ?? 0
  const studyMs = (config.studyMsPerItem ?? 900) * itemCount
  const inactivityGuardMs = config.inactivityGuardMs ?? 60000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [response, setResponse] = useState<string[]>([])
  const [interrupted, setInterrupted] = useState(false)
  const startedRef = useRef(0)
  const completingRef = useRef(false)
  const submittingRef = useRef(false)
  const items = useMemo(() => pictureSequenceItems(taskContext.randomSeed, itemCount), [taskContext.randomSeed, itemCount])
  const isDelayed = trialIndex >= learningRounds
  const choices = useMemo(() => shuffleInPlace(
    [...(phase.startsWith('practice') ? PRACTICE[practiceIndex] : items)],
    seededRandom(taskContext.randomSeed, `picturesequence-choices:${phase}:${practiceIndex}:${trialIndex}`),
  ), [phase, practiceIndex, items, taskContext.randomSeed, trialIndex])

  const completeOnce = useCallback(async () => {
    if (completingRef.current) return
    completingRef.current = true
    await onTaskComplete?.()
  }, [onTaskComplete])
  const startPractice = () => { setPracticeIndex(0); setPracticeCorrect(0); setResponse([]); setPhase('practice-study') }
  const startFormal = () => { completingRef.current = false; setResponse([]); setInterrupted(false); setPhase('formal-study') }
  const beginRecall = useCallback(() => { setResponse([]); startedRef.current = performance.now(); setPhase(phase === 'practice-study' ? 'practice-recall' : 'formal-recall') }, [phase])

  const advanceAfterFormal = useCallback(async () => {
    setResponse([])
    setInterrupted(false)
    if (isDelayed || (!delayedEnabled && trialIndex + 1 >= learningRounds)) await completeOnce()
    else if (delayedEnabled && trialIndex + 1 >= learningRounds) setPhase('delayed-wait')
    else setPhase('formal-study')
  }, [isDelayed, delayedEnabled, trialIndex, learningRounds, completeOnce])

  useEffect(() => {
    if (phase !== 'formal-study') return
    const timer = window.setTimeout(beginRecall, studyMs)
    return () => window.clearTimeout(timer)
  }, [phase, studyMs, beginRecall])

  useEffect(() => {
    if (phase !== 'delayed-wait') return
    const timer = window.setTimeout(() => { startedRef.current = performance.now(); setPhase('formal-recall') }, delayedDelayMs)
    return () => window.clearTimeout(timer)
  }, [phase, delayedDelayMs])

  useEffect(() => {
    if (phase !== 'formal-recall') return
    const timer = window.setTimeout(async () => {
      if (submittingRef.current) return
      submittingRef.current = true
      try {
        const accepted = await onTrialComplete({ phase: isDelayed ? 'delayed' : 'learning', roundIndex: isDelayed ? 1 : trialIndex + 1, itemIds: items, responseOrder: response, responseDurationMs: inactivityGuardMs, interrupted: true })
        if (accepted !== false) await advanceAfterFormal()
      } finally {
        submittingRef.current = false
      }
    }, inactivityGuardMs)
    return () => window.clearTimeout(timer)
  }, [phase, trialIndex, isDelayed, items, response, inactivityGuardMs, onTrialComplete, advanceAfterFormal])

  useEffect(() => {
    if (!phase.startsWith('formal') && phase !== 'delayed-wait') return
    const onHidden = () => { if (document.hidden) setInterrupted(true) }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [phase])

  const choose = (item: string) => { if (!response.includes(item)) setResponse((value) => [...value, item]) }
  const submitPractice = () => {
    const expected = PRACTICE[practiceIndex]
    const correct = response.length === expected.length && response.every((item, index) => item === expected[index])
    setPracticeCorrect((value) => value + (correct ? 1 : 0))
    setFeedback(correct ? '正确' : '顺序不正确')
    setPhase('practice-feedback')
  }
  const nextPractice = () => {
    if (practiceIndex + 1 >= PRACTICE.length) { setPhase('practice-result'); return }
    setPracticeIndex((value) => value + 1); setResponse([]); setPhase('practice-study')
  }
  const submitFormal = async () => {
    if (submittingRef.current || response.length !== items.length) return
    submittingRef.current = true
    try {
      const accepted = await onTrialComplete({ phase: isDelayed ? 'delayed' : 'learning', roundIndex: isDelayed ? 1 : trialIndex + 1, itemIds: items, responseOrder: response, responseDurationMs: Math.max(0, Math.round(performance.now() - startedRef.current)), interrupted })
      if (accepted === false) return
      await advanceAfterFormal()
    } finally { submittingRef.current = false }
  }

  if (phase === 'instruction') return <div className="text-center p-8"><h2 className="text-xl font-semibold mb-3">图片序列学习</h2><p className="mb-2 text-gray-600">记住日常场景出现的顺序，再按顺序点击还原。</p><p className="mb-6 text-xs text-gray-400">刺激为内部自制；练习至少答对 3 / 4。</p><button className="btn-primary" onClick={startPractice}>开始练习</button></div>
  if (phase === 'practice-result') { const passed = practiceCorrect >= 3; return <div className="text-center p-8"><p className="mb-4">练习正确 {practiceCorrect} / 4</p><button className={passed ? 'btn-primary' : 'btn-secondary'} onClick={passed ? startFormal : startPractice}>{passed ? '开始正式测验' : '重新练习'}</button></div> }
  if (phase === 'practice-feedback') return <div className="text-center p-8"><p className="mb-4">上一题：{feedback}</p><button className="btn-primary" onClick={nextPractice}>{practiceIndex + 1 >= 4 ? '查看练习结果' : '下一题'}</button></div>
  if (phase === 'delayed-wait') return <div className="text-center p-8"><h3 className="text-lg font-semibold mb-3">延迟保持阶段</h3><p className="text-gray-600">请稍候，之后将在不重复呈现图片的情况下再次排序。</p></div>

  const studying = phase === 'practice-study' || phase === 'formal-study'
  const active = phase.startsWith('practice') ? PRACTICE[practiceIndex] : items
  return <div className="p-6 text-center"><p className="mb-4 text-sm text-gray-500">{phase.startsWith('practice') ? `练习 ${practiceIndex + 1} / 4` : isDelayed ? '延迟排序' : `学习轮次 ${trialIndex + 1} / ${learningRounds}`}</p>
    {studying ? <><div className="grid grid-cols-2 gap-2 md:grid-cols-3">{active.map((item, index) => <Card key={item} itemId={item} index={index} />)}</div><button className="btn-primary mt-6" onClick={beginRecall}>我记好了，开始排序</button></> : <><p className="mb-3">已选择：{response.length} / {active.length}</p><div className="mb-4 flex min-h-16 flex-wrap justify-center gap-2">{response.map((item, index) => <Card key={item} itemId={item} index={index} onClick={() => setResponse((value) => value.filter((candidate) => candidate !== item))} />)}</div><div className="grid grid-cols-2 gap-2 md:grid-cols-3">{choices.filter((item) => !response.includes(item)).map((item) => <Card key={item} itemId={item} onClick={() => choose(item)} />)}</div><button className="btn-primary mt-6" disabled={response.length !== active.length} onClick={() => phase === 'practice-recall' ? submitPractice() : void submitFormal()}>提交排序</button></>}
  </div>
}
