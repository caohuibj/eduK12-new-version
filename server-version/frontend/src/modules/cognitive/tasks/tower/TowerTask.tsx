import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { applyTowerMove, towerSequence, type TowerMove, type TowerProblemSpec, type TowerState } from '../shared/prng'

type Phase = 'instruction' | 'practice' | 'practice-feedback' | 'practice-result' | 'formal'
const PRACTICE: TowerProblemSpec[] = [
  { problemId: 'tower-01', initialState: [0, 1, 2], targetState: [1, 1, 2], minimumMoves: 1, difficulty: 1, stimulusSetVersion: 'three-peg-tower-v1.0.0' },
  { problemId: 'tower-02', initialState: [1, 0, 2], targetState: [0, 0, 2], minimumMoves: 1, difficulty: 1, stimulusSetVersion: 'three-peg-tower-v1.0.0' },
  { problemId: 'tower-03', initialState: [2, 1, 0], targetState: [1, 1, 0], minimumMoves: 1, difficulty: 1, stimulusSetVersion: 'three-peg-tower-v1.0.0' },
  { problemId: 'tower-04', initialState: [0, 2, 1], targetState: [2, 2, 1], minimumMoves: 1, difficulty: 1, stimulusSetVersion: 'three-peg-tower-v1.0.0' },
]
const sameState = (left: TowerState, right: TowerState) => left.every((value, index) => value === right[index])

const Board: React.FC<{ state: TowerState; selectedPeg?: number | null; onPeg?: (peg: number) => void; label: string }> = ({ state, selectedPeg, onPeg, label }) => (
  <div><p className="mb-2 text-sm font-medium text-slate-600">{label}</p><div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-3">{[0, 1, 2].map((peg) => (
    <button key={peg} type="button" aria-label={`${label} 柱 ${peg + 1}`} disabled={!onPeg} onClick={() => onPeg?.(peg)} className={`relative flex h-36 flex-col-reverse items-center rounded-lg border-b-4 bg-white pb-2 ${selectedPeg === peg ? 'border-sky-500 ring-2 ring-sky-300' : 'border-slate-400'}`}>
      <span className="absolute bottom-2 top-4 w-1 bg-slate-300" />
      {[2, 1, 0].filter((disk) => state[disk] === peg).map((disk) => <span key={disk} className="relative z-10 mb-1 h-5 rounded bg-teal-600" style={{ width: `${45 + disk * 20}%` }} aria-label={`圆盘 ${disk + 1}`} />)}
    </button>
  ))}</div></div>
)

export const TowerTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as { problemCount: number; maxMovesFactor: number; inactivityGuardMs: number }
  const problemCount = config.problemCount ?? 10
  const maxMovesFactor = config.maxMovesFactor ?? 3
  const inactivityGuardMs = config.inactivityGuardMs ?? 90000
  const sequence = useMemo(() => towerSequence(taskContext.randomSeed, problemCount), [taskContext.randomSeed, problemCount])
  const [phase, setPhase] = useState<Phase>('instruction')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [state, setState] = useState<TowerState>(PRACTICE[0].initialState)
  const [selectedPeg, setSelectedPeg] = useState<number | null>(null)
  const [moves, setMoves] = useState<TowerMove[]>([])
  const [interrupted, setInterrupted] = useState(false)
  const startedRef = useRef(0)
  const submittingRef = useRef(false)
  const completingRef = useRef(false)
  const problem = phase.startsWith('practice') ? PRACTICE[practiceIndex] : sequence[trialIndex] ?? sequence[sequence.length - 1]
  const solved = sameState(state, problem.targetState)
  const maxMoves = Math.max(problem.minimumMoves + 2, Math.ceil(problem.minimumMoves * maxMovesFactor))
  const atMoveLimit = moves.length >= maxMoves
  const completeOnce = useCallback(async () => { if (completingRef.current) return; completingRef.current = true; await onTaskComplete?.() }, [onTaskComplete])
  const resetProblem = (next: TowerProblemSpec) => { setState([...next.initialState] as TowerState); setSelectedPeg(null); setMoves([]); setFeedback(''); startedRef.current = performance.now() }
  const startPractice = () => { setPracticeIndex(0); setPracticeCorrect(0); setFeedback(''); resetProblem(PRACTICE[0]); setPhase('practice') }
  const startFormal = () => { completingRef.current = false; setInterrupted(false); resetProblem(sequence[0]); setPhase('formal') }

  useEffect(() => { if (phase === 'formal') resetProblem(sequence[trialIndex] ?? sequence[sequence.length - 1]) }, [phase, trialIndex, sequence])
  useEffect(() => {
    if (phase !== 'formal') return
    const onHidden = () => { if (document.hidden) setInterrupted(true) }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [phase])

  const finishPractice = (correct: boolean) => { setPracticeCorrect((value) => value + (correct ? 1 : 0)); setFeedback(correct ? '正确完成' : '本题未完成'); setPhase('practice-feedback') }
  const nextPractice = () => {
    if (practiceIndex + 1 >= 4) { setPhase('practice-result'); return }
    const next = practiceIndex + 1; setPracticeIndex(next); resetProblem(PRACTICE[next]); setPhase('practice')
  }
  const move = (peg: number) => {
    if (solved || atMoveLimit) return
    if (selectedPeg == null) { if (state.some((candidate) => candidate === peg)) setSelectedPeg(peg); return }
    const disk = state.findIndex((candidate) => candidate === selectedPeg)
    if (disk < 0) { setSelectedPeg(null); return }
    const candidate: TowerMove = { disk, from: selectedPeg, to: peg, atMs: Math.max(0, Math.round(performance.now() - startedRef.current)) }
    const applied = applyTowerMove(state, candidate)
    const nextMoves = [...moves, candidate]
    setMoves(nextMoves); setSelectedPeg(null)
    if (applied.valid) {
      setState(applied.state)
      if (phase === 'practice' && sameState(applied.state, problem.targetState)) finishPractice(true)
    } else setFeedback('该移动违反“小盘必须在大盘上方”的规则')
  }

  const submitFormal = useCallback(async (gaveUp: boolean, timedOut = false) => {
    if (phase !== 'formal' || submittingRef.current) return
    submittingRef.current = true
    try {
      const accepted = await onTrialComplete({ problemId: problem.problemId, moves, gaveUp, interrupted, timedOut })
      if (accepted !== false) { setInterrupted(false); if (trialIndex + 1 >= problemCount) await completeOnce() }
    } finally { submittingRef.current = false }
  }, [phase, problem.problemId, moves, interrupted, onTrialComplete, trialIndex, problemCount, completeOnce])

  useEffect(() => {
    if (phase !== 'formal') return
    const timer = window.setTimeout(() => { void submitFormal(true, true) }, inactivityGuardMs)
    return () => window.clearTimeout(timer)
  }, [phase, trialIndex, moves, inactivityGuardMs, submitFormal])

  if (phase === 'instruction') return <CognitiveTaskIntro title="塔式规划" description={<p>把当前圆盘状态变成目标状态。每次只移动每根柱最上方的一个圆盘，大盘不能放在小盘上方。先选择圆盘所在的柱，再选择目标柱。</p>} hint={<><p>尽量规划后再操作；系统不会提示最优步数。练习至少完成 3 / 4，练习不计分。</p></>} onAction={startPractice} />
  if (phase === 'practice-result') { const passed = practiceCorrect >= 3; return <div className="p-8 text-center"><p className="mb-4">练习完成 {practiceCorrect} / 4</p><button className={passed ? 'btn-primary' : 'btn-secondary'} onClick={passed ? startFormal : startPractice}>{passed ? '开始正式测验' : '重新练习'}</button></div> }
  if (phase === 'practice-feedback') return <div className="p-8 text-center"><p className="mb-4">{feedback}</p><button className="btn-primary" onClick={nextPractice}>{practiceIndex + 1 >= 4 ? '查看练习结果' : '下一题'}</button></div>

  return <div className="p-5 text-center"><p className="mb-4 text-sm text-gray-500">{phase === 'practice' ? `练习 ${practiceIndex + 1} / 4` : `正式问题 ${trialIndex + 1} / ${problemCount}`} · 已移动 {moves.length} 步</p><div className="grid gap-5 md:grid-cols-2"><Board state={state} selectedPeg={selectedPeg} onPeg={move} label="当前状态" /><Board state={problem.targetState} label="目标状态" /></div>{feedback && <p className="mt-3 text-sm text-amber-700">{feedback}</p>}{phase === 'formal' && atMoveLimit && !solved && <p className="mt-3 text-sm text-amber-700">已达到本题移动上限，请结束本题。</p>}<div className="mt-5 flex justify-center gap-3">{phase === 'practice' ? <button className="btn-secondary" onClick={() => finishPractice(false)}>本题无法完成</button> : <><button className="btn-primary" disabled={!solved} onClick={() => void submitFormal(false)}>提交已解问题</button><button className="btn-secondary" onClick={() => void submitFormal(true)}>结束本题</button></>}</div></div>
}
