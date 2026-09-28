import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export interface DiscoveryCardProps {
  to: string
  title: string
  ariaLabel?: string
  eyebrow?: ReactNode
  leading?: ReactNode
  status?: ReactNode
  description?: ReactNode
  meta?: ReactNode
  notice?: ReactNode
}

/**
 * Presentation-only navigation card for discovery surfaces.
 * Callers keep ownership of domain data, availability, attempt state and destination semantics.
 */
export function DiscoveryCard({
  to,
  title,
  ariaLabel,
  eyebrow,
  leading,
  status,
  description,
  meta,
  notice,
}: DiscoveryCardProps) {
  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      className="hui-discovery-card group block min-h-11 rounded-xl border border-slate-200 bg-white p-4 text-inherit no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-blue-700 hover:border-slate-300 sm:p-5"
    >
      <div className="flex items-start gap-4">
        {leading ? <div className="shrink-0" aria-hidden="true">{leading}</div> : null}
        <div className="min-w-0 flex-1">
          {eyebrow ? <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{eyebrow}</div> : null}
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold leading-snug text-slate-900">{title}</h2>
            {status}
          </div>
          {description ? <div className="mt-2 text-sm leading-relaxed text-slate-600">{description}</div> : null}
          {meta ? <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500">{meta}</div> : null}
          {notice ? <div className="mt-3 text-sm font-medium text-blue-800">{notice}</div> : null}
        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </div>
    </Link>
  )
}
