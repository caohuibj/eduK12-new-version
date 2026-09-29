import { useId, type ReactNode } from 'react'
import { X } from 'lucide-react'
import ModalSurface from '../shared-ui/ModalSurface'

export default function ManagementDialog({ open, title, description, children, actions, onClose, closeDisabled = false, width = 'standard' }: {
  open: boolean
  title: string
  description?: ReactNode
  children: ReactNode
  actions?: ReactNode
  onClose: () => void
  closeDisabled?: boolean
  width?: 'compact' | 'standard' | 'wide'
}) {
  const titleId = useId()
  const descriptionId = useId()
  return <ModalSurface open={open} onClose={() => { if (!closeDisabled) onClose() }} className="staff-modal-backdrop" dismissOnBackdrop>
    <div tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className={`staff-dialog staff-dialog--${width}`}>
      <header className="staff-dialog__header">
        <div><h2 id={titleId}>{title}</h2>{description && <div id={descriptionId} className="staff-dialog__description">{description}</div>}</div>
        <button type="button" className="staff-icon-button" aria-label="关闭" disabled={closeDisabled} onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="staff-dialog__body">{children}</div>
      {actions && <footer className="staff-dialog__actions">{actions}</footer>}
    </div>
  </ModalSurface>
}
