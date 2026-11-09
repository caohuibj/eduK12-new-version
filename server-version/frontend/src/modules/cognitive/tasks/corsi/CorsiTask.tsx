import { CognitiveTaskPanel } from '../shared/CognitiveTaskPresentation'
import { CognitivePracticeReview, type PracticeReview } from '../shared/CognitivePracticeReview'
import { CognitiveTaskExample, CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { corsiSequence } from '../shared/prng'

const PRACTICE_SEQUENCES = [[0, 4, 8], [2, 6, 1]]
const PRACTICE_PASS = 1

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'
type SubPhase = 'ready' | 'display' | 'response'

const sameSequence = (left: number[], right: number[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

// Keep the published v1 spatial layout unchanged. A more irregular layout
// requires an explicit stimulusSet/config version rather than a silent UI edit.
const BOARD = [
  { left: '8%', top: '10%' },
  { left: '42%', top: '8%' },
  { left: '76%', top: '14%' },
  { left: '12%', top: '42%' },
  { left: '42%', top: '40%' },
  { left: '72%', top: '46%' },
  { left: '10%', top: '74%' },
  { left: '44%', top: '72%' },
  { left: '76%', top: '70%' },
]

export const CorsiTask: React.FC<CognitiveTaskProps> = ({
  taskContext,
  trialIndex,
  onTrialComplete,
  onTaskComplete,
}) => {
  const config = taskContext.config as {
    startSpan: number
    maxSpan: number
    highlightMs: number
    intervalMs: number
    readyDurationMs: number
    inactivityGuardMs: number
  }
  const startSpan = config.startSpan ?? 3
  const maxSpan = config.maxSpan ?? 8
  const highlightMs = config.highlightMs ?? 500
  const intervalMs = config.intervalMs ?? 250
  const readyDurationMs = config.readyDurationMs ?? 800
  const inactivityGuardMs = config.inactivityGuardMs ?? 30000

  const [phase, setPhase] = useState<Phase>('instruction')
  const [subPhase, setSubPhase] = useState<SubPhase>('ready')
  const [span, setSpan] = useState(startSpan)
  const [trialWithinLevel, setTrialWithinLevel] = useState<1 | 2>(1)
  const [levelCorrectCount, setLevelCorrectCount] = useState(0)
  const [response, setResponse] = useState<number[]>([])
  const [lit, setLit] = useState<number | null>(null)
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceReview, setPracticeReview] = useState<PracticeReview | null>(null)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [practiceNonce, setPracticeNonce] = useState(0)
  const [inactivityExpired, setInactivityExpired] = useState(false)
  const [interrupted, setInterrupted] = useState(false)
  const responseStartedAtRef = useRef<number | null>(null)
  const responseRef = useRef<number[]>([])
  const submittingRef = useRef(false)

  const sequence = useMemo(
    () => corsiSequence(taskContext.randomSeed, trialIndex, span),
    [taskContext.randomSeed, trialIndex, span],
  )
  const practiceSequence = PRACTICE_SEQUENCES[practiceIndex] ?? PRACTICE_SEQUENCES[0]
  const activeSequence = phase === 'practice' ? practiceSequence : sequence

  const startPractice = () => {
    setPracticeReview(null); setPracticeIndex(0)
    setPracticeCorrect(0)
    setResponse([])
    responseRef.current = []
    setLit(null)
    setPracticeNonce((value) => value + 1)
    setSubPhase('ready')
    setPhase('practice')
  }

  const startFormal = () => {
    setSpan(startSpan)
    setTrialWithinLevel(1)
    setLevelCorrectCount(0)
    setResponse([])
    responseRef.current = []
    setInterrupted(false)
    setLit(null)
    setSubPhase('ready')
    setPhase('formal')
  }

  useEffect(() => {
    if (phase !== 'practice' && phase !== 'formal') return
    if (subPhase !== 'ready') return
    const timer = window.setTimeout(() => setSubPhase('display'), readyDurationMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, readyDurationMs, practiceNonce, trialIndex, trialWithinLevel])

  useEffect(() => {
    if ((phase !== 'practice' && phase !== 'formal') || subPhase !== 'display') return
    const timers: number[] = []
    const step = highlightMs + intervalMs
    activeSequence.forEach((block, index) => {
      const showAt = index * step
      timers.push(window.setTimeout(() => setLit(block), showAt))
      timers.push(window.setTimeout(() => setLit(null), showAt + highlightMs))
    })
    const doneAt = (activeSequence.length - 1) * step + highlightMs
    timers.push(window.setTimeout(() => {
      responseStartedAtRef.current = performance.now()
      setSubPhase('response')
    }, doneAt))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [phase, subPhase, activeSequence, highlightMs, intervalMs, practiceNonce])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => {
      if (document.hidden) setInterrupted(true)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  const tap = (block: number) => {
    if (subPhase !== 'response') return
    if (phase === 'practice') {
      setResponse((current) => (current.length < practiceSequence.length ? [...current, block] : current))
      return
    }
    if (!inactivityExpired) {
      setResponse((current) => {
        const next = current.length < sequence.length ? [...current, block] : current
        responseRef.current = next
        return next
      })
    }
  }

  const submitPractice = () => {
    if (subPhase !== 'response' || response.length !== practiceSequence.length) return
    const correct = sameSequence(response, practiceSequence)
    setPracticeCorrect(practiceCorrect + (correct ? 1 : 0))
    setPracticeReview({ correct, expected: practiceSequence.map(block => '位置 ' + (block + 1)).join(' → '), actual: response.map(block => '位置 ' + (block + 1)).join(' → '), explanation: '把棋盘的九个方块按从左到右、从上到下记为位置 1–9；必须按亮起的先后顺序点回，点错位置或顺序都不算正确。' })
  }

  const submitFormal = useCallback(async (answer: number[] = response, timedOut = false) => {
    if (
      phase !== 'formal'
      || subPhase !== 'response'
      || (!timedOut && (inactivityExpired || answer.length !== sequence.length))
      || submittingRef.current
    ) return
    submittingRef.current = true
    const correct = sameSequence(sequence, answer)
    try {
      const accepted = await onTrialComplete({
        spanLength: span,
        trialWithinLevel,
        sequence,
        response: answer,
        responseDurationMs: Math.max(0, Math.round(performance.now() - (responseStartedAtRef.current ?? performance.now()))),
        interrupted: interrupted || timedOut,
      })
      if (accepted === false) {
        setInactivityExpired(false)
        return
      }
      if (trialWithinLevel === 1) {
        setLevelCorrectCount(correct ? 1 : 0)
        setTrialWithinLevel(2)
        setResponse([])
        responseRef.current = []
        setInterrupted(false)
        setInactivityExpired(false)
        setSubPhase('ready')
      } else {
        const levelPassed = levelCorrectCount + (correct ? 1 : 0) > 0
        if (!levelPassed || span >= maxSpan) {
          await onTaskComplete?.()
          return
        }
        setSpan((current) => current + 1)
        setTrialWithinLevel(1)
        setLevelCorrectCount(0)
        setResponse([])
        responseRef.current = []
        setInterrupted(false)
        setInactivityExpired(false)
        setSubPhase('ready')
      }
    } finally {
      submittingRef.current = false
    }
  }, [phase, subPhase, inactivityExpired, response, sequence, span, trialWithinLevel, interrupted, levelCorrectCount, maxSpan, onTrialComplete, onTaskComplete])

  useEffect(() => {
    if (phase !== 'formal' || subPhase !== 'response' || inactivityExpired) return
    setInactivityExpired(false)
    const timer = window.setTimeout(() => {
      setInactivityExpired(true)
      void submitFormal(responseRef.current, true)
    }, inactivityGuardMs)
    return () => window.clearTimeout(timer)
  }, [phase, subPhase, inactivityGuardMs, inactivityExpired, trialIndex, submitFormal])

  if (phase === 'practice' && practiceReview) return <CognitivePracticeReview visual={<div className="relative aspect-square w-60" aria-label="位置编号示意图">{BOARD.map((position, index) => <span key={index} className="absolute grid h-[19.5%] w-[19.5%] place-items-center rounded border" style={{ left: position.left, top: position.top }}>{index + 1}</span>)}</div>} feedback={practiceReview} completed={practiceIndex + 1} total={PRACTICE_SEQUENCES.length} onContinue={() => {
    setPracticeReview(null)
    if (practiceIndex + 1 >= PRACTICE_SEQUENCES.length) setPhase('practice-result')
    else { setPracticeIndex(value => value + 1); setResponse([]); setLit(null); setSubPhase('ready'); }
  }} />

  if (phase === 'instruction') {
    return (
      <CognitiveTaskIntro
        title="Corsi 方块广度"
        description={<p>棋盘上的方块会按顺序逐个亮起。请观察亮起的位置和顺序；灯光结束后，在棋盘上按相同顺序逐个点击。</p>}
        example={<CognitiveTaskExample title="图示：记住位置，再按原顺序点回去" steps={[
          { label: '第 1 个亮起', value: '左上', note: '记住这个位置', state: 'observe' },
          { label: '第 2 个亮起', value: '中间', note: '继续记住顺序', state: 'observe' },
          { label: '第 3 个亮起', value: '右下', note: '现在依次点回', state: 'respond' },
        ]} result={<>等亮光结束后，依次点击 <strong>左上 → 中间 → 右下</strong>。</>} explanation="只按方块位置，不需要数格子或记颜色；点错位置或顺序都算这题不正确。" />}
        hint={<><p><strong>操作：</strong>灯光消失后再点击；不要在亮起过程中抢点。</p><p><strong>练习：</strong>练习不计入正式成绩；未通过可以重新练习。</p></>}
        onAction={startPractice}
      />
    )
  }

  if (phase === 'practice-result') {
    const passed = practiceCorrect >= PRACTICE_PASS
    return (
      <CognitiveTaskPanel ariaLabel="练习结果" className="cognitive-task-panel--result"><h2 className="cognitive-task-title">练习结果</h2>
        <p className="mb-4">练习正确 {practiceCorrect} / {PRACTICE_SEQUENCES.length}</p>
        {passed ? (
          <button className="btn-primary" onClick={startFormal}>开始正式测验</button>
        ) : (
          <button className="btn-secondary" onClick={startPractice}>重新练习</button>
        )}
      </CognitiveTaskPanel>
    )
  }

  const taskBody = (
    <div className="text-center p-4 sm:p-8">
      <p className="text-sm text-gray-500 mb-4">
        {phase === 'practice'
          ? `练习 ${practiceIndex + 1} / ${PRACTICE_SEQUENCES.length}`
          : `广度 ${span} · 第 ${trialWithinLevel} 题 / 2`}
      </p>
      {subPhase === 'ready' && <p className="text-gray-500 mb-4">准备记忆…</p>}
      <div className="relative mx-auto mb-4 aspect-square w-full max-w-72 rounded-xl bg-slate-100">
        {BOARD.map((position, index) => (
          <button
            key={index}
            type="button"
            aria-label={`block-${index}`}
            className={`absolute h-[19.5%] w-[19.5%] min-h-12 min-w-12 rounded-lg border ${lit === index ? 'bg-sky-500 border-sky-600' : 'bg-white border-gray-300'}`}
            style={{ left: position.left, top: position.top }}
            onClick={() => tap(index)}
          />
        ))}
      </div>
      {subPhase === 'response' && (
        <>
          <p className="text-sm text-gray-500 mb-3">已点 {response.length} / {activeSequence.length}</p>
          {inactivityExpired && <p className="text-sm text-amber-700 mb-3">响应超时，正在记录并进入下一题…</p>}
          <button
            type="button"
            className="btn-primary min-h-12"
            disabled={inactivityExpired || response.length !== activeSequence.length}
            onClick={() => {
              if (phase === 'practice') submitPractice()
              else void submitFormal()
            }}
          >
            提交
          </button>
        </>
      )}
    </div>
  )

  return phase === 'formal'
    ? <CognitiveFocusStage ariaLabel="Corsi 正式测验" progress={{ completed: trialWithinLevel - 1, total: 2, label: `当前广度 ${span} · 本级已完成 / 总量` }}>{taskBody}</CognitiveFocusStage>
    : taskBody
}
