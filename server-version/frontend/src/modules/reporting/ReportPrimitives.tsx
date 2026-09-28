import type { ReactNode } from 'react'
import './report-ui.css'

export function ReportCoreSummary({ children, label = '核心反馈' }: { children: ReactNode; label?: string }) {
  return (
    <section className="report-core" aria-label={label}>
      <p className="report-eyebrow">{label}</p>
      <div className="report-core__body">{children}</div>
    </section>
  )
}

export function ReportSection({
  title,
  eyebrow,
  description,
  children,
  className = '',
  testId,
  id,
  headingLevel = 2,
}: {
  title: ReactNode
  eyebrow?: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
  testId?: string
  id?: string
  headingLevel?: 2 | 3 | 4
}) {
  const Heading = headingLevel === 2 ? 'h2' : headingLevel === 3 ? 'h3' : 'h4'
  return (
    <section id={id} className={`report-section ${className}`.trim()} data-testid={testId}>
      <header className="report-section__header">
        <div className="min-w-0">
          {eyebrow && <p className="report-eyebrow">{eyebrow}</p>}
          <Heading className="report-section__title">{title}</Heading>
          {description && <div className="report-section__description">{description}</div>}
        </div>
      </header>
      <div className="report-section__body">{children}</div>
    </section>
  )
}

export function ReportMetricGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`report-metric-grid ${className}`.trim()}>{children}</div>
}

export function ReportMetric({
  label,
  value,
  description,
  meta,
  emphasis = false,
}: {
  label: ReactNode
  value: ReactNode
  description?: ReactNode
  meta?: ReactNode
  emphasis?: boolean
}) {
  return (
    <article className={`report-metric${emphasis ? ' report-metric--emphasis' : ''}`}>
      <div className="report-metric__label">{label}</div>
      <div className="report-metric__value">{value}</div>
      {description && <div className="report-metric__description">{description}</div>}
      {meta && <div className="report-metric__meta">{meta}</div>}
    </article>
  )
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value))
const positionOf = (value: number, range: { min: number; max: number }) => (
  clampPercent(((value - range.min) / (range.max - range.min)) * 100)
)

export interface ReportRangeReference {
  label?: string
  mean?: number | null
  band?: { label?: string; min: number | null; max: number | null } | null
}

export function ReportRangeTrack({
  label,
  value,
  formattedValue,
  range,
  reference,
  status,
}: {
  label: string
  value: number | null
  formattedValue: ReactNode
  range: { min: number; max: number } | null | undefined
  reference?: ReportRangeReference | null
  status?: ReactNode
}) {
  const validRange = Boolean(range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.max > range.min)
  const marker = validRange && value !== null && Number.isFinite(value) ? positionOf(value, range!) : null
  const referenceMean = validRange && reference?.mean !== null && reference?.mean !== undefined && Number.isFinite(reference.mean)
    ? positionOf(reference.mean, range!)
    : null
  const band = validRange && reference?.band && reference.band.min !== null && reference.band.max !== null
    && Number.isFinite(reference.band.min) && Number.isFinite(reference.band.max)
    ? {
        left: positionOf(Math.min(reference.band.min, reference.band.max), range!),
        right: positionOf(Math.max(reference.band.min, reference.band.max), range!),
      }
    : null

  return (
    <article className="report-range">
      <div className="report-range__heading">
        <div className="min-w-0">
          <h4>{label}</h4>
          {validRange && <p>原始范围 {range!.min}–{range!.max}</p>}
        </div>
        <strong>{formattedValue}</strong>
      </div>
      {validRange ? (
        <>
          <div
            className="report-range__track"
            role="img"
            aria-label={`${label}，范围 ${range!.min} 到 ${range!.max}${value !== null ? `，本次结果 ${value}` : ''}${referenceMean !== null ? `，参考均值 ${reference!.mean}` : ''}`}
          >
            {band && <span className="report-range__band" style={{ left: `${band.left}%`, width: `${Math.max(0, band.right - band.left)}%` }} />}
            {referenceMean !== null && <span className="report-range__reference" style={{ left: `${referenceMean}%` }} />}
            {marker !== null && <span className="report-range__marker" style={{ left: `${marker}%` }} />}
          </div>
          <div className="report-range__legend">
            <span>{range!.min}</span>
            <span>{referenceMean !== null ? (reference?.label || `参考均值 ${reference!.mean}`) : status || ''}</span>
            <span>{range!.max}</span>
          </div>
        </>
      ) : status ? <div className="report-range__status">{status}</div> : null}
    </article>
  )
}

export function ReportDetails({
  title,
  children,
  testId,
}: {
  title: ReactNode
  children: ReactNode
  testId?: string
}) {
  return (
    <details className="report-details" data-testid={testId}>
      <summary>{title}</summary>
      <div className="report-details__body">{children}</div>
    </details>
  )
}

export function ReportDisclaimer({ children, testId }: { children: ReactNode; testId?: string }) {
  return <p className="report-disclaimer" data-testid={testId}>{children}</p>
}
