import { useCallback, useState, type ReactNode } from 'react'
import { ProductButton, ProductStatus } from '../product-ui'
import ManagementDialog from './ManagementDialog'

type Notice = { kind: 'success' | 'error' | 'warning' | 'info'; title: string; body?: ReactNode }
type ConfirmOptions = { title: string; body?: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean }

export function useStaffFeedback({dialogClassName}:{dialogClassName?:string}={}) {
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null)
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => setPending({ ...options, resolve })), [])
  const finish = useCallback((value: boolean) => {
    setPending(current => {
      current?.resolve(value)
      return null
    })
  }, [])
  const success = useCallback((title: string, body?: ReactNode) => setNotice({ kind: 'success', title, body }), [])
  const error = useCallback((title: string, body?: ReactNode) => setNotice({ kind: 'error', title, body }), [])
  const warning = useCallback((title: string, body?: ReactNode) => setNotice({ kind: 'warning', title, body }), [])
  const info = useCallback((title: string, body?: ReactNode) => setNotice({ kind: 'info', title, body }), [])
  const clear = useCallback(() => setNotice(null), [])
  const feedback = <>
    {notice && <div className="staff-feedback"><ProductStatus kind={notice.kind} title={notice.title} announce={notice.kind === 'error' ? 'assertive' : 'polite'} actions={<button type="button" className="staff-text-button" onClick={clear}>关闭</button>}>{notice.body}</ProductStatus></div>}
    {/* The confirm message renders as visible body text: an sr-only-only body
        leaves a blank band between the header and the action row. */}
    <ManagementDialog className={dialogClassName} open={Boolean(pending)} title={pending?.title || '确认操作'} onClose={() => finish(false)} width="compact"
      actions={<><ProductButton onClick={() => finish(false)}>{pending?.cancelLabel || '取消'}</ProductButton><ProductButton variant={pending?.danger ? 'danger' : 'primary'} onClick={() => finish(true)}>{pending?.confirmLabel || '确认'}</ProductButton></>}>
      <div className="staff-dialog__description">{pending?.body ?? '请确认是否继续此操作。'}</div>
    </ManagementDialog>
  </>
  return { feedback, confirm, success, error, warning, info, clear }
}
