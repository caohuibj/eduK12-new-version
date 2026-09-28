import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export default function ManagementDialog({ open, title, description, children, actions, onClose, width = 'standard' }: {
  open: boolean
  title: string
  description?: ReactNode
  children: ReactNode
  actions?: ReactNode
  onClose: () => void
  width?: 'compact' | 'standard' | 'wide'
}) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      before?.focus()
    }
  }, [open, onClose])
  if (!open) return null
  return <div className="staff-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className={`staff-dialog staff-dialog--${width}`}>
      <header className="staff-dialog__header">
        <div><h2 id={titleId}>{title}</h2>{description && <div id={descriptionId} className="staff-dialog__description">{description}</div>}</div>
        <button type="button" className="staff-icon-button" aria-label="关闭" onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="staff-dialog__body">{children}</div>
      {actions && <footer className="staff-dialog__actions">{actions}</footer>}
    </div>
  </div>
}
