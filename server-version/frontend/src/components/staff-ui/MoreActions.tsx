import { MoreHorizontal } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export default function MoreActions({ label = '更多操作', children, align = 'right' }: {
  label?: string
  children: ReactNode
  align?: 'left' | 'right'
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' })
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return
    const anchor = trigger.current.getBoundingClientRect()
    const width = Math.min(240, window.innerWidth - 24)
    const height = Math.min(menu.current.scrollHeight, window.innerHeight - 24)
    const left = Math.max(12, Math.min(align === 'right' ? anchor.right - width : anchor.left, window.innerWidth - width - 12))
    const top = anchor.bottom + height + 6 <= window.innerHeight - 12 ? anchor.bottom + 6 : Math.max(12, anchor.top - height - 6)
    setPosition(window.innerWidth < 640
      ? { position: 'fixed', inset: 'auto 12px 12px', maxHeight: 'calc(100dvh - 24px)' }
      : { position: 'fixed', inset: 'auto', top, left, width, maxHeight: 'calc(100dvh - 24px)' })
    menu.current.querySelector<HTMLElement>('button:not(:disabled), a[href]')?.focus()
  }, [open, align])
  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() }
    }
    const resize = () => setOpen(false)
    const scroll = (event: Event) => { if (!(event.target instanceof Node && menu.current?.contains(event.target))) setOpen(false) }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', scroll, true)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [open])
  return <div className={`staff-more-actions staff-more-actions--${align}`}>
    <button ref={trigger} className="staff-more-actions__trigger" type="button" aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}><MoreHorizontal size={18} aria-hidden="true" /></button>
    {open && createPortal(<div ref={menu} id={id} className="staff-more-actions__menu" role="group" aria-label={`${label}菜单`} style={position} onClick={event => { if ((event.target as Element).closest('button:not(:disabled), a[href]')) setOpen(false) }}>{children}</div>, document.body)}
  </div>
}
