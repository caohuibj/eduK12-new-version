import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'

const scrollLocks = new Set<HTMLDialogElement>()
const originalInert = new Map<HTMLDialogElement, boolean>()
let unlockedOverflow = ''
function isolateDialogStack() {
  const stack = [...scrollLocks]
  const top = stack[stack.length - 1]
  for (const surface of scrollLocks) surface.toggleAttribute('inert', surface !== top || Boolean(originalInert.get(surface)))
}
let pointerTrigger: HTMLElement | null = null
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', event => {
    // Safari does not focus a button when it is clicked. Remember that trigger
    // so closing a dialog still returns users to the control that opened it.
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button, a[href], input, select, textarea, [role="button"]') : null
    pointerTrigger = target
  }, true)
  document.addEventListener('keydown', () => { pointerTrigger = null }, true)
}

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
    const before = pointerTrigger?.isConnected
      ? pointerTrigger : document.activeElement instanceof HTMLElement ? document.activeElement : null
    pointerTrigger = null
    surface.showModal()
    if (scrollLocks.size === 0) unlockedOverflow = document.body.style.overflow
    originalInert.set(surface, surface.hasAttribute('inert'))
    scrollLocks.add(surface)
    isolateDialogStack()
    document.body.style.overflow = 'hidden'
    const panel = surface.querySelector<HTMLElement>('[role="dialog"]')
    ;(initialFocusRef?.current ?? panel)?.focus()
    return () => {
      surface.close()
      scrollLocks.delete(surface)
      surface.toggleAttribute('inert', Boolean(originalInert.get(surface)))
      originalInert.delete(surface)
      isolateDialogStack()
      if (scrollLocks.size === 0) document.body.style.overflow = unlockedOverflow
      if (before?.isConnected) before.focus()
    }
  }, [open, initialFocusRef])

  if (!open) return null
  return <dialog
    ref={surfaceRef}
    role="presentation"
    className={`hui-modal-surface ${className}`}
    onCancel={event => {
      // A file input also emits a bubbling cancel event when its picker closes.
      if (event.target !== event.currentTarget) return
      event.preventDefault()
      event.stopPropagation()
      closeRef.current()
    }}
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
      const candidates = Array.from(surface.querySelectorAll<HTMLElement>(
        'a[href], button, input:not([type="hidden"]), select, textarea, summary, [contenteditable="true"], [tabindex]'
      )).filter(element => element.tabIndex >= 0 && !element.matches(':disabled') &&
        !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
        (typeof element.checkVisibility !== 'function' || element.checkVisibility({ checkVisibilityCSS: true })) &&
        getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden')
      const controls = candidates.filter(element => {
        if (!(element instanceof HTMLInputElement) || element.type !== 'radio' || !element.name) return true
        const group = candidates.filter((candidate): candidate is HTMLInputElement => candidate instanceof HTMLInputElement && candidate.type === 'radio' && candidate.name === element.name && candidate.form === element.form)
        return element === (group.find(candidate => candidate.checked) ?? group[0])
      })
      // Native Tab can skip buttons according to the browser/OS keyboard
      // preference and land on browser chrome. Keep traversal deterministic.
      event.preventDefault()
      if (!controls.length) {
        surface.querySelector<HTMLElement>('[role="dialog"]')?.focus()
      } else {
        const current = controls.indexOf(document.activeElement as HTMLElement)
        const next = current < 0 ? (event.shiftKey ? controls.length - 1 : 0)
          : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
        controls[next].focus()
      }
    }}
  >{children}</dialog>
}
