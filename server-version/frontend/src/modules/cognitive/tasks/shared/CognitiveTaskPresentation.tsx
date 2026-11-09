import { createContext, useCallback, useContext, type CSSProperties, type ReactNode } from 'react'
import { ProductButton } from '../../../../components/product-ui'
import { resolveTaskGuide } from './task-guides'
import './cognitive-design-tokens.css'
import './cognitive-task-presentation.css'
import './cognitive-workspace.css'

export type CognitiveTaskStartContextValue = {
  /** Starts the host-owned session before the task enters its local practice phase. */
  onInitialAction?: () => void
  disabled?: boolean
  hideIntroTitle?: boolean
  taskIdentity?: { testType: string; engineVersion: string }
}

export const CognitiveTaskStartContext = createContext<CognitiveTaskStartContextValue>({})

/**
 * Lets task-specific instruction screens combine the host READY transition
 * with their own first practice action. The task must remain mounted while the
 * host changes to RUNNING so local practice state is preserved.
 */
export function useCognitiveTaskInitialAction(action: () => void) {
  const { onInitialAction } = useContext(CognitiveTaskStartContext)
  return useCallback(() => {
    onInitialAction?.()
    action()
  }, [action, onInitialAction])
}

export type CognitiveTaskExampleStep = {
  label: string
  value: ReactNode
  note?: ReactNode
  state?: 'observe' | 'respond' | 'wait' | 'neutral'
}

/** A concise, accessible diagram for task-specific first-time examples. */
export function CognitiveTaskExample({
  title = '图示示例',
  steps,
  result,
  explanation,
}: {
  title?: string
  steps: CognitiveTaskExampleStep[]
  result: ReactNode
  explanation?: ReactNode
}) {
  return (
    <section className="cognitive-task-example" aria-label={title}>
      <h3 className="cognitive-task-example__title">{title}</h3>
      <ol className="cognitive-task-example__steps" role="list" style={{ '--cognitive-example-steps': steps.length } as CSSProperties}>
        {steps.map((step, index) => (
          <li className={`cognitive-task-example__step cognitive-task-example__step--${step.state ?? 'neutral'}`} key={`${step.label}-${index}`}>
            <span className="cognitive-task-example__label">{step.label}</span>
            <span className={`cognitive-task-example__value${typeof step.value === 'string' && /^[A-Za-z0-9\s→←↑↓·●○□◇▲△:=+−×?？]{1,12}$/.test(step.value) ? ' cognitive-task-example__value--symbol' : ''}`}>{step.value}</span>
            {step.note ? <span className="cognitive-task-example__note">{step.note}</span> : null}
          </li>
        ))}
      </ol>
      <p className="cognitive-task-example__result"><strong>应该这样做：</strong> {result}</p>
      {explanation ? <p className="cognitive-task-example__explanation">{explanation}</p> : null}
    </section>
  )
}

/** Equal space above and below the action keeps its centre fixed as copy changes. */
export function CognitiveCenteredTask({ header, children, footer }: { header?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return <div className="cognitive-centered-task">
    <div className="cognitive-centered-task__header">{header}</div>
    <div className="cognitive-centered-task__target">{children}</div>
    <div className="cognitive-centered-task__footer">{footer}</div>
  </div>
}

export function CognitiveHint({
  children,
  label = '提示',
  keyHint,
}: {
  children: ReactNode
  label?: ReactNode
  keyHint?: ReactNode
}) {
  return (
    <aside className="cognitive-task-cue" role="note" data-cognitive-presentation="hint">
      <span className="cognitive-task-cue__label">{label}</span>
      <span className="cognitive-task-cue__body">{children}</span>
      {keyHint ? <kbd className="cognitive-task-keyhint">{keyHint}</kbd> : null}
    </aside>
  )
}

export function CognitiveProgress({
  current,
  total,
  label = '任务进度',
}: {
  current: number
  total: number
  label?: ReactNode
}) {
  const safeTotal = Math.max(0, total)
  const safeCurrent = safeTotal > 0 ? Math.min(Math.max(0, current), safeTotal) : 0
  const percentage = safeTotal > 0 ? (safeCurrent / safeTotal) * 100 : 0

  return (
    <div className="cognitive-task-progress" data-cognitive-presentation="progress">
      <div className="cognitive-task-progress__meta">
        <span>{label}</span>
        <strong>{safeCurrent} / {safeTotal}</strong>
      </div>
      <div
        className="cognitive-task-progress__track"
        role="progressbar"
        aria-label={typeof label === 'string' ? label : '任务进度'}
        aria-valuemin={0}
        aria-valuemax={safeTotal}
        aria-valuenow={safeCurrent}
      >
        <span
          className="cognitive-task-progress__value"
          style={{ '--cognitive-progress-value': `${percentage}%` } as CSSProperties}
        />
      </div>
    </div>
  )
}

export function CognitiveResponseButton({
  children,
  onClick,
  selected,
  disabled = false,
  keyHint,
  ariaLabel,
}: {
  children: ReactNode
  onClick?: () => void
  selected?: boolean
  disabled?: boolean
  keyHint?: ReactNode
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      className="cognitive-response-button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={selected === undefined ? undefined : selected}
      data-selected={selected ? 'true' : undefined}
      data-cognitive-presentation="response"
    >
      <span>{children}</span>
      {keyHint ? <kbd className="cognitive-task-keyhint">{keyHint}</kbd> : null}
    </button>
  )
}

export function CognitiveTaskPanel({
  children,
  ariaLabel,
  className = '',
}: {
  children: ReactNode
  ariaLabel?: string
  className?: string
}) {
  return (
    <section
      className={`cognitive-task-panel ${className}`.trim()}
      aria-label={ariaLabel}
      data-cognitive-presentation="panel"
    >
      {children}
    </section>
  )
}

export function CognitiveTaskIntro({
  title,
  description,
  hint,
  example,
  actionLabel = '开始练习',
  onAction,
  disabled = false,
}: {
  title: string
  description: ReactNode
  hint?: ReactNode
  example?: ReactNode
  actionLabel?: string
  onAction: () => void
  disabled?: boolean
}) {
  const { disabled: hostDisabled, hideIntroTitle, taskIdentity } = useContext(CognitiveTaskStartContext)
  const guide = resolveTaskGuide(taskIdentity?.testType, taskIdentity?.engineVersion)
  const start = useCognitiveTaskInitialAction(onAction)
  return (
    <CognitiveTaskPanel ariaLabel={`${title}说明`} className="cognitive-task-panel--intro">
      <header className="cognitive-task-intro__header">
        <div><p className="cognitive-task-eyebrow">任务规则与示例</p>
        <h2 className="cognitive-task-title">{hideIntroTitle ? '先看规则，再开始练习' : title}</h2></div>
        <ol className="cognitive-task-journey" aria-label="测验流程">
          <li aria-current="step"><span>01</span>理解规则</li><li><span>02</span>完成练习</li><li><span>03</span>正式作答</li>
        </ol>
      </header>
      <section className="cognitive-task-intro__rule" aria-label="核心规则">
        <h3>核心规则</h3>
        <div className="cognitive-task-description">{description}</div>
      </section>
      {example || guide ? <div className="cognitive-task-intro__example">{example ?? <CognitiveTaskExample
        steps={guide!.steps.map((value, index) => ({ label: ['看到', '判断', '作答'][index], value, state: index === 2 ? 'respond' : 'observe' }))}
        result={guide!.result}
      />}</div> : null}
      {hint ? (
        <section className="cognitive-task-hint" aria-label="作答方式与注意事项">
          <h3>作答方式与注意事项</h3>
          <div className="cognitive-task-hint__content">{hint}</div>
        </section>
      ) : null}
      <div className="cognitive-task-actions cognitive-task-actions--center">
        <ProductButton variant="primary" onClick={start} disabled={disabled || hostDisabled}>{actionLabel}</ProductButton>
      </div>
    </CognitiveTaskPanel>
  )
}

/** Persistent feedback presentation. The task owns when it advances. */
export function CognitivePracticeFeedback({ children, outcome = 'neutral', title = '练习反馈', badge, ariaLabel, actions }: {
  children: ReactNode
  outcome?: 'neutral' | 'correct' | 'incorrect' | 'observation'
  title?: string
  badge?: ReactNode
  ariaLabel?: string
  actions?: ReactNode
}) {
  return <section className={`cognitive-practice-feedback cognitive-practice-feedback--${outcome}`}
    role={outcome === 'incorrect' ? 'alert' : 'status'} aria-live={outcome === 'incorrect' ? 'assertive' : 'polite'} aria-label={ariaLabel ?? title}>
    <div className="cognitive-practice-feedback__header">
      <h2>{title}</h2>
      {badge ? <span className={`cognitive-practice-feedback__badge cognitive-practice-feedback__badge--${outcome}`}>{badge}</span> : null}
    </div>
    <div className="cognitive-practice-feedback__content">{children}</div>
    {actions ? <div className="cognitive-practice-feedback__footer">{actions}</div> : null}
  </section>
}

/** Task-owned practice facts; presentation never decides whether an answer is correct. */
export type PracticeAnswerFeedback = {
  correct: boolean
  prompt?: string
  expected: string
  actual: string
  explanation: string
}

export function CognitivePracticeAnswer({ feedback }: { feedback: PracticeAnswerFeedback | null }) {
  if (!feedback) return null
  return <CognitivePracticeFeedback title="本题练习解析" outcome={feedback.correct ? 'correct' : 'incorrect'}
    badge={feedback.correct ? '答对了' : '再看一次'} ariaLabel={feedback.correct ? '练习解析：正确' : '练习解析：错误'}>
    {feedback.prompt ? <p className="cognitive-practice-answer__prompt">{feedback.prompt}</p> : null}
    <dl className="cognitive-practice-feedback__actions">
      <div><dt>正确做法</dt><dd>{feedback.expected}</dd></div>
      <div><dt>你的操作</dt><dd>{feedback.actual}</dd></div>
    </dl>
    <p>{feedback.explanation}</p>
  </CognitivePracticeFeedback>
}

export function CognitivePracticeResult({
  correct,
  total,
  passed,
  onContinue,
  onRetry,
  continueLabel = '开始正式测验',
  retryLabel = '重新练习',
  detail,
  title = '练习完成',
}: {
  correct: number
  total: number
  passed: boolean
  onContinue: () => void
  onRetry: () => void
  continueLabel?: string
  retryLabel?: string
  detail?: ReactNode
  title?: ReactNode
}) {
  return (
    <CognitiveTaskPanel ariaLabel="练习结果" className="cognitive-task-panel--result">
      <p className="cognitive-task-eyebrow">练习反馈</p>
      <h2 className="cognitive-task-title">{title}</h2>
      <p className="cognitive-task-result-score">练习正确 <strong>{correct}</strong> / {total}</p>
      {detail ? <div className="cognitive-task-result-detail">{detail}</div> : null}
      <p className="cognitive-task-result-note">
        {passed ? '已达到开始正式测验的练习要求。' : '尚未达到练习要求，可以重新练习后再开始正式测验。'}
      </p>
      <div className="cognitive-task-actions cognitive-task-actions--center">
        <ProductButton variant={passed ? 'primary' : 'secondary'} onClick={passed ? onContinue : onRetry}>
          {passed ? continueLabel : retryLabel}
        </ProductButton>
      </div>
    </CognitiveTaskPanel>
  )
}

export function CognitiveTaskTransition({
  title,
  description,
  meta,
  actionLabel,
  onAction,
}: {
  title: string
  description: ReactNode
  meta?: ReactNode
  actionLabel: string
  onAction: () => void
}) {
  return (
    <CognitiveTaskPanel ariaLabel={title} className="cognitive-task-panel--transition">
      <p className="cognitive-task-eyebrow">准备下一步</p>
      <h2 className="cognitive-task-title">{title}</h2>
      {meta ? <div className="cognitive-task-transition-meta">{meta}</div> : null}
      <div className="cognitive-task-description">{description}</div>
      <div className="cognitive-task-actions cognitive-task-actions--center">
        <ProductButton variant="primary" onClick={onAction}>{actionLabel}</ProductButton>
      </div>
    </CognitiveTaskPanel>
  )
}

export function CognitiveTaskCompletionNotice({ children }: { children?: ReactNode }) {
  return (
    <CognitiveTaskPanel ariaLabel="正式试次完成" className="cognitive-task-panel--completion">
      <p className="cognitive-task-eyebrow">作答完成</p>
      <h2 className="cognitive-task-title">正式试次已完成</h2>
      <div className="cognitive-task-description">{children || '请完成本次测评。'}</div>
    </CognitiveTaskPanel>
  )
}
