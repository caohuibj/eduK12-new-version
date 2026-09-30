import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import ManagementDialog from '../staff-ui/ManagementDialog'
import { ProductButton } from '../product-ui'

/** A saved baseline and synchronous operation lock protect the whole route. */
export function usePageEditorGuard(value: unknown, extra: { dirty?: boolean; busy?: boolean } = {}) {
  const serialized = JSON.stringify(value)
  const [baseline, setBaseline] = useState(serialized)
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const protection = useRef({ dirty: false, busy: false })
  protection.current = { dirty: serialized !== baseline || Boolean(extra.dirty), busy: busy || Boolean(extra.busy) }
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    (pending.current || protection.current.dirty || protection.current.busy)
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search || currentLocation.hash !== nextLocation.hash))
  useEffect(() => {
    if (!protection.current.dirty && !protection.current.busy) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [serialized, baseline, busy, extra.dirty, extra.busy])
  const reset = (saved: unknown) => {
    setBaseline(JSON.stringify(saved))
    protection.current.dirty = Boolean(extra.dirty)
    if (blocker.state === 'blocked') blocker.reset()
  }
  const begin = () => {
    if (pending.current || protection.current.busy || blocker.state === 'blocked') return false
    pending.current = true
    protection.current.busy = true
    setBusy(true)
    return true
  }
  const finish = () => { pending.current = false; protection.current.busy = Boolean(extra.busy); setBusy(false) }
  const confirmation = <ManagementDialog open={blocker.state === 'blocked'} title={protection.current.busy ? '正在提交，请稍候' : '放弃未保存的修改？'}
    description={protection.current.busy ? '提交完成前请留在当前页面，避免丢失操作结果。' : '离开后，本次未保存的修改将不会保留。'}
    onClose={() => blocker.state === 'blocked' && blocker.reset()} width="compact"
    actions={<><ProductButton onClick={() => blocker.state === 'blocked' && blocker.reset()}>继续编辑</ProductButton>
      {!protection.current.busy && <ProductButton variant="danger" onClick={() => { if (!pending.current && !protection.current.busy && blocker.state === 'blocked') blocker.proceed() }}>放弃修改并离开</ProductButton>}</>}><span className="sr-only">请确认是否离开当前编辑页面。</span></ManagementDialog>
  return { dirty: serialized !== baseline, busy, begin, finish, reset, confirmation }
}
