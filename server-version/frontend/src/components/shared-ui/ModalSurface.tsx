import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'

/** Native top-layer modality makes the background inert for pointer, keyboard,
 * and assistive technology. Keep this in the caller's tree to inherit its theme. */
export default function ModalSurface({ open, onClose, children, className, initialFocusRef, dismissOnBackdrop = false }: {
  open: boolean
  onClose: () => void
  children: ReactNode
  className: string
  initialFocusRef?: RefObject<HTMLElement>
  dismissOnBackdrop?: boolean
}) {
  const surfaceRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(onClose)
  useLayoutEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    const surface = surfaceRef.current
    if (!surface) return
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    surface.showModal()
    document.body.style.overflow = 'hidden'
    const panel = surface.querySelector<HTMLElement>('[role="dialog"]')
    ;(initialFocusRef?.current ?? panel)?.focus()
    return () => {
      surface.close()
      document.body.style.overflow = overflow
      if (before?.isConnected) before.focus()
    }
  }, [open, initialFocusRef])

  if (!open) return null
  return <dialog
    ref={surfaceRef}
    role="presentation"
    className={`hui-modal-surface ${className}`}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); closeRef.current() }}
    onMouseDown={event => {
      if (dismissOnBackdrop && event.target === event.currentTarget) closeRef.current()
    }}
    onKeyDown={event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      event.stopPropagation()
      const surface = event.currentTarget
      const controls = Array.from(surface.querySelectorAll<HTMLElement>(
        'a[href], button, input:not([type="hidden"]), select, textarea, summary, [contenteditable="true"], [tabindex]'
      )).filter(element => element.tabIndex >= 0 && !element.matches(':disabled') &&
        !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
        (typeof element.checkVisibility !== 'function' || element.checkVisibility({ checkVisibilityCSS: true })) &&
        getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden')
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!first) {
        event.preventDefault()
        surface.querySelector<HTMLElement>('[role="dialog"]')?.focus()
      } else if (!controls.includes(document.activeElement as HTMLElement) ||
        (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      }
    }}
  >{children}</dialog>
}
