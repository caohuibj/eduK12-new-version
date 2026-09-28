import { useCallback, useState, type ReactNode } from 'react'
import { ProductButton, ProductStatus } from '../product-ui'
import ManagementDialog from './ManagementDialog'

type Notice = { kind: 'success' | 'error' | 'warning' | 'info'; title: string; body?: ReactNode }
type ConfirmOptions = { title: string; body?: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean }

export function useStaffFeedback() {
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
  const clear = useCallback(() => setNotice(null), [])
  const feedback = <>
    {notice && <div className="staff-feedback"><ProductStatus kind={notice.kind} title={notice.title} announce={notice.kind === 'error' ? 'assertive' : 'polite'} actions={<button type="button" className="staff-text-button" onClick={clear}>关闭</button>}>{notice.body}</ProductStatus></div>}
    <ManagementDialog open={Boolean(pending)} title={pending?.title || '确认操作'} description={pending?.body} onClose={() => finish(false)} width="compact"
      actions={<><ProductButton onClick={() => finish(false)}>{pending?.cancelLabel || '取消'}</ProductButton><ProductButton variant={pending?.danger ? 'danger' : 'primary'} onClick={() => finish(true)}>{pending?.confirmLabel || '确认'}</ProductButton></>}>
      <span className="sr-only">请确认是否继续此操作。</span>
    </ManagementDialog>
  </>
  return { feedback, confirm, success, error, warning, clear }
}
