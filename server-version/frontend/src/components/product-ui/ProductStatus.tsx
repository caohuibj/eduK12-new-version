import type { ReactNode } from 'react'

export interface ProductStatusProps {
  kind: 'info' | 'success' | 'warning' | 'error' | 'pending'
  title: string
  children?: ReactNode
  actions?: ReactNode
  announce?: 'off' | 'polite' | 'assertive'
}

const symbols = { info: 'i', success: '✓', warning: '!', error: '×', pending: '…' } as const

/** Static by default: only actual state transitions should create live announcements. */
export function ProductStatus({ kind, title, children, actions, announce = 'off' }: ProductStatusProps) {
  return (
    <div className={`hui-status hui-status--${kind}`} role={announce === 'assertive' ? 'alert' : announce === 'polite' ? 'status' : undefined} aria-atomic={announce !== 'off' ? true : undefined}>
      <span className="hui-status__symbol" aria-hidden="true">{symbols[kind]}</span>
      <div className="hui-status__body">
        <strong className="hui-status__title">{title}</strong>
        {children && <div className="hui-status__description">{children}</div>}
        {actions && <div className="hui-status__actions">{actions}</div>}
      </div>
    </div>
  )
}
