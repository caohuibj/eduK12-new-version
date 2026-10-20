import { useId, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Presentation only; the caller retains the original policy state and save actions. */
export function DeliveryOptionCard({ icon: Icon, title, description, enabled, badge, children }: {
  icon: LucideIcon
  title: string
  description: string
  enabled: boolean
  badge?: string
  children: ReactNode
}) {
  const id = useId()
  return <section className={'qt-delivery-option' + (enabled ? ' is-enabled' : '')} aria-labelledby={id}>
    <header className="qt-option-heading">
      <span className="qt-option-icon" aria-hidden="true"><Icon size={19} /></span>
      <div><h3 id={id}>{title}</h3><p>{description}</p></div>
      <span className={'qt-option-status' + (enabled ? ' is-on' : '')}>{badge ?? (enabled ? '已开启' : '未开启')}</span>
    </header>
    <div className="qt-option-content">{children}</div>
  </section>
}
