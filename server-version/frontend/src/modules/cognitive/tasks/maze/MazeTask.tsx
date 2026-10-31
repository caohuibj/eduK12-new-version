import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import type { MazeConfig, MazeTrialPayload } from '../../types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { generateMaze, isMoveLegal } from './generator'

type Phase = 'instruction' | 'practice' | 'formal' | 'completed'
type PhaseStep = 'brief' | 'navigating' | 'feedback'

const DIR_LABELS = ['↑', '→', '↓', '←']
const DIR_NAMES = ['上', '右', '下', '左']
const CELL_SIZE = 40

export const MazeTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as unknown as MazeConfig
  const totalTrials = config?.totalTrials ?? 4
  const mazeCols = config?.mazeCols ?? 7
  const mazeRows = config?.mazeRows ?? 7
  const timeLimitMs = config?.timeLimitMs ?? 120000
  const [phase, setPhase] = useState<Phase>('instruction')
  const [step, setStep] = useState<PhaseStep>('brief')
  const [currentRow, setCurrentRow] = useState(0)
  const [currentCol, setCurrentCol] = useState(0)
  const [moves, setMoves] = useState<number[]>([])
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [formalFeedback, setFormalFeedback] = useState<string | null>(null)
  const [completedCount, setCompletedCount] = useState(0)
  const [timeLeftMs, setTimeLeftMs] = useState(0)
  const [reachedGoal, setReachedGoal] = useState(false)
  const interruptedRef = useRef(false)
  const startTimeRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const stateRef = useRef({ row: 0, col: 0, moves: [] as number[] })
  const maze = useMemo(() => generateMaze(taskContext.randomSeed, trialIndex, mazeCols, mazeRows), [taskContext.randomSeed, trialIndex, mazeCols, mazeRows])

  useEffect(() => {
    if (phase !== 'formal') return
    setFormalFeedback(null); interruptedRef.current = false
  }, [trialIndex])

  useEffect(() => {
    if ((phase !== 'formal' && phase !== 'practice') || step !== 'brief') return
    setCurrentRow(0); setCurrentCol(0); setMoves([]); setReachedGoal(false)
    stateRef.current = { row: 0, col: 0, moves: [] }
    setPracticeFeedback(null); setFormalFeedback(null); interruptedRef.current = false
    startTimeRef.current = performance.now()
    setTimeLeftMs(timeLimitMs)
    const timer = window.setTimeout(() => setStep('navigating'), 500)
    return () => window.clearTimeout(timer)
  }, [phase, step, trialIndex, timeLimitMs])

  useEffect(() => {
    if (step !== 'navigating') return
    const startedAt = startTimeRef.current
    if (startedAt === null) return
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, timeLimitMs - (performance.now() - startedAt))
      setTimeLeftMs(remaining)
      if (remaining <= 0) window.clearInterval(interval)
    }, 500)
    return () => window.clearInterval(interval)
  }, [step, timeLimitMs])

  const tryMove = useCallback((direction: number) => {
    if (step !== 'navigating' || reachedGoal) return
    const state = stateRef.current
    if (!isMoveLegal(maze.walls, state.row, state.col, direction)) return
    const dir = { dr: [-1, 0, 1, 0][direction], dc: [0, 1, 0, -1][direction] }
    state.row += dir.dr
    state.col += dir.dc
    state.moves.push(direction)
    setCurrentRow(state.row)
    setCurrentCol(state.col)
    setMoves([...state.moves])
    if (state.row === mazeRows - 1 && state.col === mazeCols - 1) {
      setReachedGoal(true)
      if (phase === 'practice') {
        setPracticeFeedback('到达终点！正式测验不再提示。')
        setStep('feedback')
        return
      }
      if (submittingRef.current) return
      submittingRef.current = true
      const completionTimeMs = startTimeRef.current !== null ? Math.max(0, Math.round(performance.now() - startTimeRef.current)) : 0
      const payload: MazeTrialPayload = {
        mazeIndex: trialIndex,
        moves: [...state.moves],
        completionTimeMs,
        completed: true,
        interrupted: interruptedRef.current,
      }
      setFormalFeedback('到达终点！'); setStep('feedback')
      void (async () => {
        try {
          const accepted = await onTrialComplete(payload)
          if (accepted === false) { setFormalFeedback('提交失败，请重试当前迷宫'); setStep('navigating'); return }
          setCompletedCount((current) => current + 1)
          if (completedCount + 1 >= totalTrials) { setPhase('completed'); await onTaskComplete?.() }
        } finally { submittingRef.current = false }
      })()
    }
  }, [step, reachedGoal, maze, mazeRows, mazeCols, phase, trialIndex, onTrialComplete, completedCount, totalTrials, onTaskComplete])

  const submitIncomplete = useCallback(() => {
    if (phase !== 'formal' || reachedGoal || submittingRef.current) return
    submittingRef.current = true
    const payload: MazeTrialPayload = {
      mazeIndex: trialIndex,
      moves: [...stateRef.current.moves],
      completionTimeMs: null,
      completed: false,
      interrupted: interruptedRef.current,
    }
    setFormalFeedback('时间到，未完成'); setStep('feedback')
    void (async () => {
      try {
        const accepted = await onTrialComplete(payload)
        if (accepted === false) { setFormalFeedback('提交失败'); setStep('navigating'); return }
        setCompletedCount((current) => current + 1)
        if (completedCount + 1 >= totalTrials) { setPhase('completed'); await onTaskComplete?.() }
      } finally { submittingRef.current = false }
    })()
  }, [phase, reachedGoal, trialIndex, onTrialComplete, completedCount, totalTrials, onTaskComplete])

  useEffect(() => {
    if (phase !== 'formal' || step !== 'navigating') return
    const startedAt = startTimeRef.current
    if (startedAt === null) return
    const capTimer = window.setTimeout(() => submitIncomplete(), Math.max(0, timeLimitMs - (performance.now() - startedAt)))
    return () => window.clearTimeout(capTimer)
  }, [phase, step, timeLimitMs, submitIncomplete])

  useEffect(() => {
    if (phase !== 'formal') return
    const onVisibilityChange = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const map: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }
      if (map[event.key] !== undefined) {
        event.preventDefault()
        tryMove(map[event.key])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tryMove])

  const startPractice = useCallback(() => { setStep('brief'); setPhase('practice') }, [])
  const advancePractice = useCallback(() => {
    setFormalFeedback(null); setStep('brief'); setPhase('formal')
  }, [])

  const renderMaze = () => (
    <div className="inline-block mx-auto">
      {Array.from({ length: mazeRows }, (_, r) => (
        <div key={r} className="flex">
          {Array.from({ length: mazeCols }, (_, c) => {
            const isWallUp = (maze.walls[r][c] & 1) !== 0
            const isWallRight = (maze.walls[r][c] & 2) !== 0
            const isWallDown = (maze.walls[r][c] & 4) !== 0
            const isWallLeft = (maze.walls[r][c] & 8) !== 0
            const isCurrent = r === currentRow && c === currentCol
            const isGoal = r === mazeRows - 1 && c === mazeCols - 1
            const isStart = r === 0 && c === 0
            return (
              <div key={c} className="relative flex items-center justify-center" style={{
                width: CELL_SIZE, height: CELL_SIZE,
                borderTop: isWallUp ? '2px solid #334155' : 'none',
                borderRight: isWallRight ? '2px solid #334155' : 'none',
                borderBottom: isWallDown ? '2px solid #334155' : 'none',
                borderLeft: isWallLeft ? '2px solid #334155' : 'none',
                backgroundColor: isGoal ? '#d1fae5' : isStart ? '#dbeafe' : isCurrent ? '#bfdbfe' : 'transparent',
              }}>
                {isCurrent && <span className="h-3 w-3 rounded-full bg-blue-600" />}
                {isGoal && !isCurrent && <span className="text-xs font-bold text-green-700">★</span>}
                {isStart && !isCurrent && <span className="text-xs text-blue-400">S</span>}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )

  if (phase === 'instruction') return <CognitiveTaskIntro title="迷宫学习" description={<p>用方向键（或屏幕按钮）从左上角导航到右下角。墙会挡住你的去路——找到正确的路线到达终点。</p>} hint={<><p>限时 {Math.round(timeLimitMs / 1000)} 秒；练习不计入成绩。</p></>} onAction={startPractice} />
  if (phase === 'completed') return <div className="card p-8 max-w-2xl text-center"><p className="text-gray-700">已全部完成，正在生成结果…</p></div>

  if (phase === 'practice') {
    return <div className="card p-8 max-w-2xl text-center"><div className="text-sm text-gray-500 mb-4">练习 · 不计入成绩</div>{step === 'brief' && <div className="text-4xl text-gray-400 h-40 pt-16">准备…</div>}{step !== 'brief' && <>{renderMaze()}<p className="text-sm text-gray-500 mt-2">{reachedGoal ? '到达终点！' : `已走 ${moves.length} 步`}</p></>}{step === 'navigating' && <div className="grid grid-cols-3 gap-1 max-w-[140px] mx-auto mt-3"><span /><button type="button" onPointerDown={() => tryMove(0)} className="btn-secondary h-10">↑</button><span /><button type="button" onPointerDown={() => tryMove(3)} className="btn-secondary h-10">←</button><span /><button type="button" onPointerDown={() => tryMove(1)} className="btn-secondary h-10">→</button><span /><button type="button" onPointerDown={() => tryMove(2)} className="btn-secondary h-10">↓</button><span /></div>}{step === 'feedback' && <><div className="h-10 pt-3 text-gray-700">{practiceFeedback}</div><button type="button" className="btn-primary" onClick={advancePractice}>开始正式测评</button></>}</div>
  }

  return <CognitiveFocusStage ariaLabel="迷宫学习正式测验"><div className="card mx-auto max-w-2xl p-5 text-center sm:p-8"><div className="text-sm text-gray-500">第 {trialIndex + 1} / {totalTrials} 个迷宫</div>{step === 'brief' && <div className="text-4xl text-gray-400 h-56 pt-24">准备…</div>}{step !== 'brief' && <div className="pt-2">{renderMaze()}</div>}{step === 'navigating' && <><p className="text-sm text-gray-500 mt-2">剩余 {Math.ceil(timeLeftMs / 1000)} 秒 · 已走 {moves.length} 步</p><div className="grid grid-cols-3 gap-1 max-w-[140px] mx-auto mt-2"><span /><button type="button" onPointerDown={() => tryMove(0)} className="btn-secondary h-10">↑</button><span /><button type="button" onPointerDown={() => tryMove(3)} className="btn-secondary h-10">←</button><span /><button type="button" onPointerDown={() => tryMove(1)} className="btn-secondary h-10">→</button><span /><button type="button" onPointerDown={() => tryMove(2)} className="btn-secondary h-10">↓</button><span /></div></>}{step === 'feedback' && <div className="h-16 pt-6 text-xl font-semibold text-gray-700">{formalFeedback}</div>}{step === 'navigating' && formalFeedback && <p className="mt-2 text-sm text-amber-600">{formalFeedback}</p>}<p className="text-xs text-gray-400 mt-3">方向键或屏幕按钮导航 · 目标：右下角 ★</p></div></CognitiveFocusStage>
}
