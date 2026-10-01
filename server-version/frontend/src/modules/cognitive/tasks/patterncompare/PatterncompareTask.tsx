import { CognitiveTaskIntro } from '../shared/CognitiveTaskPresentation'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { CognitiveTaskProps } from '../../core/runner.types'
import { patterncompareTrial, type PatternStimulus } from '../shared/prng'
import { PRACTICE_PASS_CORRECT, PRACTICE_TRIAL_COUNT } from '../shared/practice'
import { CognitiveFocusStage } from '../shared/CognitiveFocusStage'

type Phase = 'instruction' | 'practice' | 'practice-result' | 'formal'

const PRACTICE = [
  { leftPattern: { shape: 'circle', fill: 'solid', marks: 1, rotation: 0 } as PatternStimulus, rightPattern: { shape: 'circle', fill: 'solid', marks: 1, rotation: 0 } as PatternStimulus, correctResponse: 'same' as const },
  { leftPattern: { shape: 'square', fill: 'outline', marks: 2, rotation: 0 } as PatternStimulus, rightPattern: { shape: 'square', fill: 'solid', marks: 2, rotation: 0 } as PatternStimulus, correctResponse: 'different' as const },
  { leftPattern: { shape: 'triangle', fill: 'outline', marks: 3, rotation: 90 } as PatternStimulus, rightPattern: { shape: 'triangle', fill: 'outline', marks: 3, rotation: 90 } as PatternStimulus, correctResponse: 'same' as const },
  { leftPattern: { shape: 'circle', fill: 'outline', marks: 1, rotation: 0 } as PatternStimulus, rightPattern: { shape: 'square', fill: 'outline', marks: 1, rotation: 0 } as PatternStimulus, correctResponse: 'different' as const },
]

const Pattern: React.FC<{ pattern: PatternStimulus }> = ({ pattern }) => {
  const solid = pattern.fill === 'solid'
  const markXs = Array.from(
    { length: pattern.marks },
    (_, index) => 56 + (index - (pattern.marks - 1) / 2) * 14,
  )
  const shapeProps = {
    fill: solid ? '#334155' : '#f8fafc',
    stroke: '#334155',
    strokeWidth: 5,
  }

  return (
    <svg
      role="img"
      aria-label="视觉图形刺激"
      viewBox="0 0 112 112"
      className="h-24 w-24 shrink-0 sm:h-28 sm:w-28"
      focusable="false"
    >
      <g transform={`rotate(${pattern.rotation} 56 56)`}>
        {pattern.shape === 'circle' ? (
          <circle cx="56" cy="56" r="44" {...shapeProps} />
        ) : pattern.shape === 'square' ? (
          <rect x="12" y="12" width="88" height="88" rx="8" {...shapeProps} />
        ) : (
          <polygon points="56,8 104,102 8,102" {...shapeProps} />
        )}
        <rect x="52" y="22" width="8" height="8" rx="1" fill={solid ? '#ffffff' : '#334155'} />
        {markXs.map((x) => (
          <circle key={x} cx={x} cy="62" r="4" fill={solid ? '#ffffff' : '#334155'} />
        ))}
      </g>
    </svg>
  )
}

export const PatterncompareTask: React.FC<CognitiveTaskProps> = ({ taskContext, trialIndex, onTrialComplete, onTaskComplete }) => {
  const config = taskContext.config as {
    durationSec: number
    trialTimeoutMs: number
    isiMs: number
    validRtFloorMs?: number
  }
  const durationSec = config.durationSec ?? 60
  const trialTimeoutMs = config.trialTimeoutMs ?? 2500
  const isiMs = config.isiMs ?? 250
  const validRtFloorMs = config.validRtFloorMs ?? 150
  const [phase, setPhase] = useState<Phase>('instruction')
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [practiceCorrect, setPracticeCorrect] = useState(0)
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [remainingSec, setRemainingSec] = useState(durationSec)
  const deadlineRef = useRef<number | null>(null)
  const onsetRef = useRef<number | null>(null)
  const submittingRef = useRef(false)
  const completingRef = useRef(false)
  const interruptedRef = useRef(false)

  const startPractice = () => {
    setPracticeIndex(0)
    setPracticeCorrect(0)
    setPracticeFeedback(null)
    setPhase('practice')
  }
  const startFormal = () => {
    deadlineRef.current = performance.now() + durationSec * 1000
    completingRef.current = false
    setRemainingSec(durationSec)
    setPhase('formal')
  }
  const completeOnce = useCallback(async () => {
    if (completingRef.current) return
    completingRef.current = true
    await onTaskComplete?.()
  }, [onTaskComplete])

  useEffect(() => {
    const onHidden = () => {
      if (document.hidden) interruptedRef.current = true
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  useEffect(() => {
    if (phase !== 'formal' || deadlineRef.current == null) return
    const update = () => setRemainingSec(Math.max(0, Math.ceil((deadlineRef.current as number - performance.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'formal' || deadlineRef.current == null) return
    submittingRef.current = false
    interruptedRef.current = false
    onsetRef.current = null
    setVisible(false)
    const remainingMs = deadlineRef.current - performance.now()

    // Never open a new formal trial unless the participant can receive the ISI
    // and at least the scorer's minimum valid response window before the task
    // deadline. Otherwise the deadline itself would create an artificial lapse.
    if (remainingMs <= isiMs + validRtFloorMs) {
      void completeOnce()
      return
    }

    const show = window.setTimeout(() => {
      setVisible(true)
      onsetRef.current = performance.now()
    }, isiMs)
    const timeout = window.setTimeout(async () => {
      if (submittingRef.current) return
      submittingRef.current = true
      const spec = patterncompareTrial(taskContext.randomSeed, trialIndex)
      await onTrialComplete({
        leftPattern: spec.leftPattern,
        rightPattern: spec.rightPattern,
        response: null,
        rtMs: null,
        interrupted: interruptedRef.current,
        timedOut: true,
      })
      if ((deadlineRef.current ?? 0) <= performance.now()) await completeOnce()
    }, Math.min(isiMs + trialTimeoutMs, remainingMs))
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(timeout)
    }
  }, [
    phase,
    trialIndex,
    taskContext.randomSeed,
    isiMs,
    trialTimeoutMs,
    validRtFloorMs,
    onTrialComplete,
    completeOnce,
  ])

  const respondPractice = (response: 'same' | 'different') => {
    const expected = PRACTICE[practiceIndex].correctResponse
    const correct = response === expected
    setPracticeFeedback(
      correct
        ? '上一题：正确'
        : `上一题：不正确，正确答案是「${expected === 'same' ? '相同' : '不同'}」`,
    )
    const nextCorrect = practiceCorrect + (correct ? 1 : 0)
    if (practiceIndex + 1 >= PRACTICE_TRIAL_COUNT) {
      setPracticeCorrect(nextCorrect)
      setPhase('practice-result')
    } else {
      setPracticeCorrect(nextCorrect)
      setPracticeIndex((value) => value + 1)
    }
  }

  const respondFormal = async (response: 'same' | 'different') => {
    if (!visible || submittingRef.current || onsetRef.current == null) return
    submittingRef.current = true
    const spec = patterncompareTrial(taskContext.randomSeed, trialIndex)
    await onTrialComplete({
      leftPattern: spec.leftPattern,
      rightPattern: spec.rightPattern,
      response,
      rtMs: Math.round(performance.now() - onsetRef.current),
      interrupted: interruptedRef.current,
      timedOut: false,
    })
    if ((deadlineRef.current ?? 0) <= performance.now()) await completeOnce()
  }

  const respond = (response: 'same' | 'different') => {
    if (phase === 'practice') respondPractice(response)
    else void respondFormal(response)
  }

  useEffect(() => {
    if (phase !== 'practice' && phase !== 'formal') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        respond('same')
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        respond('different')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const onPointerResponse = (
    event: ReactPointerEvent<HTMLButtonElement>,
    response: 'same' | 'different',
  ) => {
    if (!event.isPrimary || event.button !== 0) return
    event.preventDefault()
    respond(response)
  }

  if (phase === 'instruction') {
    return (
      <CognitiveTaskIntro title="图形模式比较" description={<p>判断左右两个图形是否完全相同。请比较形状、填充、标记和方向；只要有一项不同，就选择“不同”。</p>} hint={<><p>正式阶段约 {durationSec} 秒，请在保证准确的前提下尽快作答。键盘可使用 ← 表示相同、→ 表示不同，也可使用触控或鼠标。</p><p>先完成 4 题不计分练习，至少答对 3 题才能进入正式测验。本任务需要直接辨认图形细节；如果屏幕上的图形无法清楚辨认，请不要进入正式测验，并告知测验组织者。</p></>} onAction={startPractice} />
    )
  }

  if (phase === 'practice-result') {
    const passed = practiceCorrect >= PRACTICE_PASS_CORRECT
    return (
      <div className="mx-auto max-w-xl p-4 text-center sm:p-8">
        <p className="mb-2 text-lg font-medium">练习正确 {practiceCorrect} / {PRACTICE_TRIAL_COUNT}</p>
        <p className="mb-5 text-sm text-gray-600">
          {passed
            ? '已理解作答规则。正式阶段会连续呈现图形，请保持准确并尽快判断。'
            : '请再练习一次：四个特征都完全一致才选择“相同”，任一特征不同都选择“不同”。'}
        </p>
        <button
          className={`${passed ? 'btn-primary' : 'btn-secondary'} min-h-12 px-6`}
          onClick={passed ? startFormal : startPractice}
        >
          {passed ? '开始正式测验' : '重新练习'}
        </button>
      </div>
    )
  }

  const spec = phase === 'practice'
    ? PRACTICE[practiceIndex]
    : patterncompareTrial(taskContext.randomSeed, trialIndex)
  const content = (
    <div className="mx-auto w-full max-w-2xl p-4 text-center sm:p-8">
      <p className="mb-4 text-sm text-gray-500">
        {phase === 'practice'
          ? `练习 ${practiceIndex + 1} / ${PRACTICE_TRIAL_COUNT}`
          : `剩余约 ${remainingSec} 秒`}
      </p>
      {phase === 'practice' && practiceFeedback && (
        <p className="mb-3 min-h-5 text-sm font-medium text-gray-700" aria-live="polite">{practiceFeedback}</p>
      )}
      <div
        className={`mb-8 flex min-h-24 items-center justify-center gap-4 sm:min-h-28 sm:gap-12 ${phase === 'formal' && !visible ? 'invisible' : ''}`}
      >
        <Pattern pattern={spec.leftPattern} />
        <Pattern pattern={spec.rightPattern} />
      </div>
      <div className="mx-auto grid w-full max-w-sm grid-cols-2 gap-3">
        <button
          className="btn-secondary min-h-12 w-full px-4 sm:px-8"
          aria-keyshortcuts="ArrowLeft"
          onPointerDown={(event) => onPointerResponse(event, 'same')}
          onClick={(event) => {
            if (event.detail === 0) respond('same')
          }}
        >
          相同
        </button>
        <button
          className="btn-secondary min-h-12 w-full px-4 sm:px-8"
          aria-keyshortcuts="ArrowRight"
          onPointerDown={(event) => onPointerResponse(event, 'different')}
          onClick={(event) => {
            if (event.detail === 0) respond('different')
          }}
        >
          不同
        </button>
      </div>
    </div>
  )

  return phase === 'formal'
    ? <CognitiveFocusStage ariaLabel="图形模式比较正式作答">{content}</CognitiveFocusStage>
    : content
}
