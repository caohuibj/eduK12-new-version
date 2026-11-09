import { CognitivePracticeFeedback, CognitiveTaskExample, CognitiveTaskIntro, CognitiveTaskPanel } from '../shared/CognitiveTaskPresentation'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'
import { nbackSequence, type NbackTrialSpec } from '../shared/prng'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'
type NLevel = 1 | 2 | 3
type PracticeTrial = { nLevel: NLevel; stimulus: string; target: boolean }
type PracticeFeedback = {
  kind: 'observation' | 'correct' | 'incorrect'
  currentLetter: string
  comparisonLetter?: string
  isMatch?: boolean
  expectedAction: 'observe' | 'press' | 'wait'
  actualAction: 'not-applicable' | 'press' | 'wait'
  explanation: string
}

const isNbackFormalTrial = (
  trial: PracticeTrial | NbackTrialSpec | undefined,
): trial is NbackTrialSpec => Boolean(
  trial && 'blockIndex' in trial && typeof trial.blockIndex === 'number',
)

const PRACTICE_BY_N: Record<NLevel, PracticeTrial[]> = {
  1: [
    { nLevel: 1, stimulus: 'B', target: false },
    { nLevel: 1, stimulus: 'B', target: true },
    { nLevel: 1, stimulus: 'C', target: false },
    { nLevel: 1, stimulus: 'C', target: true },
  ],
  2: [
    { nLevel: 2, stimulus: 'B', target: false },
    { nLevel: 2, stimulus: 'C', target: false },
    { nLevel: 2, stimulus: 'B', target: true },
    { nLevel: 2, stimulus: 'D', target: false },
    { nLevel: 2, stimulus: 'C', target: false },
    { nLevel: 2, stimulus: 'D', target: true },
  ],
  3: [
    { nLevel: 3, stimulus: 'B', target: false },
    { nLevel: 3, stimulus: 'C', target: false },
    { nLevel: 3, stimulus: 'D', target: false },
    { nLevel: 3, stimulus: 'B', target: true },
    { nLevel: 3, stimulus: 'E', target: false },
    { nLevel: 3, stimulus: 'D', target: true },
  ],
}

export const NbackTask: React.FC<CognitiveTaskProps> = ({
  taskContext,
  trialIndex,
  onTrialComplete,
  onTaskComplete,
}) => {
  const config = taskContext.config as {
    nLevels: NLevel[]
    trialCountByN: number[]
    blockCountByN: number[]
    targetRatio: number
    stimulusMs: number
    isiMs: number
    validRtFloorMs: number
  }
  const isiMs = config.isiMs ?? 2000
  const stimulusMs = config.stimulusMs ?? 500
  const sequence = useMemo(
    () => nbackSequence(
      taskContext.randomSeed,
      config.nLevels ?? [1],
      config.trialCountByN ?? [30],
      config.blockCountByN ?? [1],
      config.targetRatio ?? 0.3,
    ),
    [taskContext.randomSeed, config.nLevels, config.trialCountByN, config.blockCountByN, config.targetRatio],
  )
  const total = sequence.length
  const firstNLevel = config.nLevels?.[0] ?? 1
  const [phase, setPhase] = useState<Phase>('instruction')
  const [visible, setVisible] = useState(false)
  const [practiceNLevel, setPracticeNLevel] = useState<NLevel>(firstNLevel)
  const [practiceReturnToFormal, setPracticeReturnToFormal] = useState(false)
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [practiceNonce, setPracticeNonce] = useState(0)
  const [practicedLevels, setPracticedLevels] = useState<NLevel[]>([])
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null)
  const [acknowledgedBlockIndex, setAcknowledgedBlockIndex] = useState<number | null>(null)
  const onsetRef = useRef<number | null>(null)
  const respondedRef = useRef(false)
  const interruptedRef = useRef(false)
  const practiceCorrectRef = useRef(0)
  const submittingRef = useRef(false)

  const practiceTrials = PRACTICE_BY_N[practiceNLevel]
  const scoredPracticeTrialCount = Math.max(0, practiceTrials.length - practiceNLevel)
  const practicePassCorrect = Math.ceil(scoredPracticeTrialCount * 0.75)
  const nbackExampleSteps = firstNLevel === 1
    ? [
        { label: '第 1 个', value: 'A', note: '先记住，不作答', state: 'observe' as const },
        { label: '第 2 个', value: 'B', note: '和前 1 个不同，不按', state: 'wait' as const },
        { label: '第 3 个', value: 'B', note: '和前 1 个相同，按一次', state: 'respond' as const },
      ]
    : firstNLevel === 2
      ? [
          { label: '第 1 个', value: 'A', note: '只记忆', state: 'observe' as const },
          { label: '第 2 个', value: 'C', note: '前 2 个都先记住', state: 'observe' as const },
          { label: '第 3 个', value: 'A', note: '和前 2 个相同，按一次', state: 'respond' as const },
        ]
      : [
          { label: '第 1 个', value: 'A', note: '只记忆', state: 'observe' as const },
          { label: '第 2–3 个', value: 'C · B', note: '前 3 个都先记住', state: 'observe' as const },
          { label: '第 4 个', value: 'A', note: '和前 3 个相同，按一次', state: 'respond' as const },
        ]

  const startPractice = (nLevel: NLevel = firstNLevel, returnToFormal = false) => {
    setPracticeNLevel(nLevel)
    setPracticeReturnToFormal(returnToFormal)
    setPracticeIndex(0)
    setPracticeCorrect(0)
    practiceCorrectRef.current = 0
    setFeedback(null)
    setVisible(false)
    respondedRef.current = false
    interruptedRef.current = false
    onsetRef.current = null
    setPracticeNonce((value) => value + 1)
    setPhase('practice')
  }

  const startFormal = () => {
    setFeedback(null)
    setVisible(false)
    respondedRef.current = false
    interruptedRef.current = false
    onsetRef.current = null
    setAcknowledgedBlockIndex(null)
    setPhase('formal')
  }

  const completePassedPractice = () => {
    setPracticedLevels((current) => current.includes(practiceNLevel) ? current : [...current, practiceNLevel])
    if (practiceReturnToFormal) {
      setFeedback(null)
      setVisible(false)
      setPhase('formal')
      return
    }
    startFormal()
  }

  const continuePractice = () => {
    if (phase !== 'practice' || !feedback) return
    const nextIndex = practiceIndex + 1
    setFeedback(null)
    if (nextIndex >= practiceTrials.length) {
      setPracticeCorrect(practiceCorrectRef.current)
      setPhase('practice-result')
      return
    }
    setPracticeIndex(nextIndex)
  }

  const current: PracticeTrial | NbackTrialSpec | undefined = phase === 'formal'
    ? sequence[trialIndex]
    : practiceTrials[practiceIndex]

  useEffect(() => {
    const onHidden = () => { if (document.hidden) interruptedRef.current = true }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  useEffect(() => {
    if (phase !== 'practice' && phase !== 'formal') return
    if (phase === 'formal') {
      if (trialIndex >= total || !isNbackFormalTrial(current)) return
      if (!practicedLevels.includes(current.nLevel)) return
      if (acknowledgedBlockIndex !== current.blockIndex) return
    }
    if (!current) return
    respondedRef.current = false
    interruptedRef.current = false
    onsetRef.current = null
    submittingRef.current = false
    setVisible(false)
    setFeedback(null)
    const show = window.setTimeout(() => {
      setVisible(true)
      onsetRef.current = performance.now()
    }, isiMs)
    const hide = window.setTimeout(async () => {
      setVisible(false)
      const responded = respondedRef.current
      const correct = current.target ? responded : !responded
      if (phase === 'practice') {
        const isWarmup = practiceIndex < practiceNLevel
        const comparisonLetter = isWarmup ? undefined : practiceTrials[practiceIndex - practiceNLevel]?.stimulus
        const expectedAction = isWarmup ? 'observe' : current.target ? 'press' : 'wait'
        const actualAction = isWarmup ? 'not-applicable' : responded ? 'press' : 'wait'
        const explanation = isWarmup
          ? `这是观察阶段第 ${practiceIndex + 1} / ${practiceNLevel} 个字母。当前只有“${current.stimulus}”，还没有第 ${practiceNLevel} 个历史字母可比较；正确做法是记住它，不按键。本题不计分。`
          : `当前字母“${current.stimulus}”与往前第 ${practiceNLevel} 个位置的“${comparisonLetter ?? '—'}”${current.target ? '相同' : '不同'}；${current.target ? '应按一次' : '应保持不动'}。你${responded ? '按了一次' : '没有按'}，所以本题${correct ? '正确' : '错误'}。`
        setFeedback({
          kind: isWarmup ? 'observation' : correct ? 'correct' : 'incorrect',
          currentLetter: current.stimulus,
          comparisonLetter,
          isMatch: isWarmup ? undefined : current.target,
          expectedAction,
          actualAction,
          explanation,
        })
        if (!isWarmup && correct) practiceCorrectRef.current += 1
        return
      }
      if (!responded && !submittingRef.current && isNbackFormalTrial(current)) {
        submittingRef.current = true
        await onTrialComplete({
          blockIndex: current.blockIndex,
          nLevel: current.nLevel,
          stimulus: current.stimulus,
          target: current.target,
          responded: false,
          rtMs: null,
          interrupted: interruptedRef.current,
        })
        if (trialIndex + 1 >= total) await onTaskComplete?.()
      }
    }, isiMs + stimulusMs)
    return () => { window.clearTimeout(show); window.clearTimeout(hide) }
  }, [
    phase,
    trialIndex,
    practiceIndex,
    practiceNonce,
    practiceNLevel,
    practiceTrials.length,
    practicedLevels,
    current,
    total,
    isiMs,
    stimulusMs,
    acknowledgedBlockIndex,
    onTrialComplete,
    onTaskComplete,
  ])

  const respond = async () => {
    if (!visible || respondedRef.current || onsetRef.current == null || submittingRef.current) return
    if (phase === 'practice' && practiceIndex < practiceNLevel) return
    respondedRef.current = true
    const rtMs = Math.round(performance.now() - onsetRef.current)
    if (phase !== 'formal' || !isNbackFormalTrial(current)) return
    submittingRef.current = true
    await onTrialComplete({
      blockIndex: current.blockIndex,
      nLevel: current.nLevel,
      stimulus: current.stimulus,
      target: current.target,
      responded: true,
      rtMs,
      interrupted: interruptedRef.current,
    })
    if (trialIndex + 1 >= total) await onTaskComplete?.()
  }

  useEffect(() => {
    if (phase !== 'practice' && phase !== 'formal') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return
      if (phase === 'practice' && feedback) {
        if (event.target instanceof HTMLButtonElement) return
        event.preventDefault()
        continuePractice()
        return
      }
      event.preventDefault()
      void respond()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase, feedback, continuePractice, respond])

  if (phase === 'instruction') {
    return (
      <CognitiveTaskIntro
        title="N-Back"
        description={<p>每个字母只出现片刻。请记住最近 {firstNLevel} 个字母；从出现第 {firstNLevel + 1} 个字母开始，把当前字母和往前第 {firstNLevel} 个位置比较：相同就按一次，不同就不要按。</p>}
        example={(
          <CognitiveTaskExample
            title={`${firstNLevel}-back 图示：前 ${firstNLevel} 个先记忆，之后再比较`}
            steps={nbackExampleSteps}
            result={firstNLevel === 1 ? '第三个 B 与它前一个 B 相同，所以按一次。' : `当前字母 A 与往前第 ${firstNLevel} 个位置的 A 相同，所以按一次。`}
          />
        )}
        hint={(
          <>
            <p><strong>怎么作答：</strong>字母出现时作答；电脑按空格或 Enter，触屏点击中央作答区。一个字母只按一次，不要长按。</p>
            <p><strong>练习安排：</strong>前 {firstNLevel} 个字母只观察；之后每题结束会停留显示反馈，确认后再点“继续下一题”。练习不计入正式成绩。</p>
          </>
        )}
        onAction={() => startPractice(firstNLevel, false)}
      />
    )
  }

  if (phase === 'practice-result') {
    const passed = practiceCorrect >= practicePassCorrect
    return (
      <CognitiveTaskPanel
        ariaLabel={`${practiceNLevel}-back 练习总结`}
        className="cognitive-task-panel--practice-result"
      >
        <p className="cognitive-task-eyebrow">练习已完成 · 不计入正式成绩</p>
        <h2 className="cognitive-task-title">{practiceNLevel}-back 练习结果</h2>
        <div className={`nback-practice-summary ${passed ? 'nback-practice-summary--passed' : 'nback-practice-summary--retry'}`} role="status">
          <div className="nback-practice-summary__score">
            <strong>{practiceCorrect}</strong>
            <span>/ {scoredPracticeTrialCount}</span>
          </div>
          <div className="nback-practice-summary__message">
            <strong>{passed ? '已达到继续标准' : '还需要再练习一次'}</strong>
            <p>{passed
              ? `计分题中至少答对 ${practicePassCorrect} 题（${Math.round(practicePassCorrect / scoredPracticeTrialCount * 100)}%）即可继续；你的结果达到标准。`
              : `需要至少答对 ${practicePassCorrect} 题（${Math.round(practicePassCorrect / scoredPracticeTrialCount * 100)}%）才能继续。`}</p>
          </div>
        </div>
        <div className="nback-practice-summary__rules">
          <section>
            <h3>哪些题计分？</h3>
            <p>本组共出现 {practiceTrials.length} 个字母。前 {practiceNLevel} 个字母只用于建立记忆，没有足够的历史字母可供比较，所以只观察、不作答、不计分。</p>
          </section>
          <section>
            <h3>怎样判断通过？</h3>
            <p>之后的 {scoredPracticeTrialCount} 题才计入结果；至少答对 {practicePassCorrect} 题（按 75% 向上取整）即可继续。练习答案不会计入正式测验成绩。</p>
          </section>
        </div>
        {passed ? (
          <div className="cognitive-task-actions cognitive-task-actions--center">
            <button className="btn-primary" onClick={completePassedPractice}>
              {practiceReturnToFormal ? `继续 ${practiceNLevel}-back 正式测验` : '开始正式测验'}
            </button>
          </div>
        ) : (
          <div className="cognitive-task-actions cognitive-task-actions--center">
            <button className="btn-secondary" onClick={() => startPractice(practiceNLevel, practiceReturnToFormal)}>重新练习</button>
          </div>
        )}
      </CognitiveTaskPanel>
    )
  }

  if (phase === 'formal' && isNbackFormalTrial(current) && !practicedLevels.includes(current.nLevel)) {
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-3">准备进入 {current.nLevel}-back</h2>
        <p className="text-gray-600 mb-2">难度即将变化。先完成一组 {current.nLevel}-back 不计分练习，确认规则后再继续正式测验。</p>
        <p className="text-xs text-gray-400 mb-6">练习结果不会计入最终得分。</p>
        <button className="btn-primary" onClick={() => startPractice(current.nLevel, true)}>开始 {current.nLevel}-back 练习</button>
      </div>
    )
  }

  if (phase === 'formal' && isNbackFormalTrial(current) && acknowledgedBlockIndex !== current.blockIndex) {
    const totalBlocks = sequence.length === 0 ? 0 : Math.max(...sequence.map((trial) => trial.blockIndex)) + 1
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-3">{current.nLevel}-back</h2>
        <p className="text-gray-600 mb-2">区块 {current.blockIndex + 1} / {totalBlocks}</p>
        <p className="text-xs text-gray-400 mb-6">每个区块会重新开始；前 {current.nLevel} 个字母不会是目标。</p>
        <button className="btn-primary" onClick={() => setAcknowledgedBlockIndex(current.blockIndex)}>开始本区块</button>
      </div>
    )
  }

  const taskBody = (
    <div
      className={`nback-task-body mx-auto max-w-2xl text-center p-8 ${phase === 'practice' ? 'nback-task-body--practice' : ''} ${feedback ? 'nback-task-body--feedback' : ''}`}
    >
      <p className="nback-task-progress mb-2" aria-live="polite">
        {phase === 'practice'
          ? practiceIndex < practiceNLevel
            ? `${practiceNLevel}-back 练习 · 观察 ${practiceIndex + 1} / ${practiceNLevel}（不作答）`
            : `${practiceNLevel}-back 计分练习 ${practiceIndex - practiceNLevel + 1} / ${scoredPracticeTrialCount}`
          : `${current?.nLevel ?? firstNLevel}-back`}
      </p>
      {feedback && (
        <CognitivePracticeFeedback outcome={feedback.kind} title="本题解析"
          ariaLabel={`本题反馈：${feedback.kind === 'observation' ? '观察题' : feedback.kind === 'correct' ? '答对' : feedback.expectedAction === 'press' ? '漏按' : '误按'}`}
          badge={feedback.kind === 'observation' ? '只观察' : feedback.kind === 'correct' ? '正确' : feedback.expectedAction === 'press' ? '漏按' : '误按'}>
          <div className="cognitive-practice-feedback__comparison" aria-label="字母比较">
            <span><small>当前字母</small><strong>{feedback.currentLetter}</strong></span>
            {feedback.comparisonLetter ? <span className={`cognitive-practice-feedback__relation ${feedback.isMatch ? 'is-match' : 'is-different'}`}>{feedback.isMatch ? '相同' : '不同'}</span> : null}
            {feedback.comparisonLetter ? <span><small>前 {practiceNLevel} 个位置</small><strong>{feedback.comparisonLetter}</strong></span> : null}
          </div>
          <p>{feedback.explanation}</p>
          <dl className="cognitive-practice-feedback__actions">
            <div><dt>正确做法</dt><dd>{feedback.expectedAction === 'observe' ? '记住当前字母，不按' : feedback.expectedAction === 'press' ? '按一次' : '保持不动'}</dd></div>
            <div><dt>你的操作</dt><dd>{feedback.actualAction === 'not-applicable' ? '本题不需要作答' : feedback.actualAction === 'press' ? '按了一次' : '没有按'}</dd></div>
          </dl>
          <button type="button" className="btn-primary cognitive-practice-feedback__continue" onClick={continuePractice}>
            {practiceIndex + 1 >= practiceTrials.length ? '查看练习结果' : '继续下一题'} <span aria-hidden="true">→</span>
          </button>
        </CognitivePracticeFeedback>
      )}
      {visible ? (
        <button
          type="button"
          className="nback-task-stimulus nback-task-stimulus--visible"
          onClick={() => { void respond() }}
          aria-label={phase === 'practice' ? `${practiceNLevel}-back 练习作答区` : 'N-back 正式作答区'}
        >{current?.stimulus}</button>
      ) : !feedback ? (
        <div className="nback-task-stimulus nback-task-stimulus--waiting" aria-live="polite">
          请留意下一个字母
        </div>
      ) : null}
      {!feedback ? <p className="nback-task-hint">{phase === 'practice' && practiceIndex < practiceNLevel
          ? `观察阶段：前 ${practiceNLevel} 个字母只记忆，不按键`
          : '判断相同则按一次；不同则不按（空格 / Enter 或点击字母）'}</p> : null}
    </div>
  )

  return phase === 'formal'
    ? <CognitiveFocusStage ariaLabel="N-back 正式测验" progress={{ completed: trialIndex, total: total }}>{taskBody}</CognitiveFocusStage>
    : taskBody
}
