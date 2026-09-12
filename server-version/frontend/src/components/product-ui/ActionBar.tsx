import type { ReactNode } from 'react'

export interface ActionBarProps {
  label: string
  children: ReactNode
}

/** DOM order stays unchanged across viewport sizes, including keyboard order. */
export function ActionBar({ label, children }: ActionBarProps) {
  return <div role="group" aria-label={label} className="hui-actions">{children}</div>
}
