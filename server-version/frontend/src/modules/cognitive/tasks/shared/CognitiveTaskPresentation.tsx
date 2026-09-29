import type { CSSProperties, ReactNode } from 'react'
import { ProductButton } from '../../../../components/product-ui'
import './cognitive-task-presentation.css'

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
  actionLabel = '开始练习',
  onAction,
  disabled = false,
}: {
  title: string
  description: ReactNode
  hint?: ReactNode
  actionLabel?: string
  onAction: () => void
  disabled?: boolean
}) {
  return (
    <CognitiveTaskPanel ariaLabel={`${title}说明`} className="cognitive-task-panel--intro">
      <p className="cognitive-task-eyebrow">Practice first</p>
      <h2 className="cognitive-task-title">{title}</h2>
      <div className="cognitive-task-description">{description}</div>
      {hint ? <div className="cognitive-task-hint">{hint}</div> : null}
      <div className="cognitive-task-actions cognitive-task-actions--center">
        <ProductButton variant="primary" onClick={onAction} disabled={disabled}>{actionLabel}</ProductButton>
      </div>
    </CognitiveTaskPanel>
  )
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
      <p className="cognitive-task-eyebrow">Practice result</p>
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
      <p className="cognitive-task-eyebrow">Task transition</p>
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
      <p className="cognitive-task-eyebrow">Task complete</p>
      <h2 className="cognitive-task-title">正式试次已完成</h2>
      <div className="cognitive-task-description">{children || '请完成本次测评。'}</div>
    </CognitiveTaskPanel>
  )
}
