import type { ReactNode } from 'react'

export type SectionNavItem = { id: string; label: string }
export default function SectionNav({ items, actions }: { items: SectionNavItem[]; actions?: ReactNode }) {
  return <div className="staff-section-nav">
    <nav aria-label="页面分区">{items.map(item => <a key={item.id} href={`#${item.id}`}>{item.label}</a>)}</nav>
    {actions && <div className="staff-section-nav__actions">{actions}</div>}
  </div>
}
