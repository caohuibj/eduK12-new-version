import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ManagementDialog from '../staff-ui/ManagementDialog'
import { ProductButton } from '../product-ui'

/** Capture the value when an editor opens; protect the same draft through retries. */
export function useEditorGuard({ open, value, onClose, externalBusy = false }: {
  open: boolean
  value: unknown
  onClose: () => void
  externalBusy?: boolean
}) {
  const serialized = JSON.stringify(value)
  const baseline = useRef(serialized)
  const wasOpen = useRef(false)
  const pending = useRef(false)
  const alive = useRef(true)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  useLayoutEffect(() => {
    if (open && !wasOpen.current) baseline.current = serialized
    wasOpen.current = open
    if (!open) { setConfirming(false); setErrorMessage('') }
  }, [open, serialized])
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  const dirty = open && wasOpen.current && baseline.current !== serialized
  useEffect(() => {
    if (!open || (!dirty && !busy && !externalBusy)) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [open, dirty, busy, externalBusy])
  const close = () => {
    if (pending.current || externalBusy) return
    if (baseline.current !== serialized) setConfirming(true)
    else onClose()
  }
  const begin = () => {
    if (pending.current || externalBusy || confirming) return false
    pending.current = true
    setBusy(true)
    setErrorMessage('')
    return true
  }
  const finish = () => {
    pending.current = false
    if (alive.current) setBusy(false)
  }
  const confirmation = <ManagementDialog open={open && confirming} title="放弃未保存的修改？" description="退出后，本次修改将不会保存。" onClose={() => setConfirming(false)} width="compact"
    actions={<><ProductButton onClick={() => setConfirming(false)}>继续编辑</ProductButton><ProductButton variant="danger" onClick={() => { setConfirming(false); onClose() }}>放弃修改</ProductButton></>}>
    <p>你可以继续编辑并保存，或放弃本次修改。</p>
  </ManagementDialog>
  const fail = (message: string) => { if (alive.current) setErrorMessage(message) }
  const error = errorMessage ? <div role="alert" className="mx-4 my-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div> : null
  return { busy: busy || externalBusy, close, begin, finish, fail, error, confirmation }
}
