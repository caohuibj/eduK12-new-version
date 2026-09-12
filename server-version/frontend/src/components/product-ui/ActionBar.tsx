import type { HTMLAttributes, ReactNode } from 'react'

export interface ActionBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label?: string
  children: ReactNode
}

/** DOM order stays unchanged across viewport sizes, including keyboard order. */
export function ActionBar({ label, className = '', children, ...props }: ActionBarProps) {
  return (
    <div {...props} role="group" aria-label={label} className={`hui-actions ${className}`.trim()}>
      {children}
    </div>
  )
}
