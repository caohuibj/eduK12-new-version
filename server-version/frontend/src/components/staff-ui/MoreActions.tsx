import { MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'

export default function MoreActions({ label = '更多操作', children, align = 'right' }: {
  label?: string
  children: ReactNode
  align?: 'left' | 'right'
}) {
  return <details className={`staff-more-actions staff-more-actions--${align}`}>
    <summary aria-label={label}><MoreHorizontal size={18} aria-hidden="true" /><span className="sr-only">{label}</span></summary>
    <div className="staff-more-actions__menu" role="group" aria-label={label}>{children}</div>
  </details>
}
