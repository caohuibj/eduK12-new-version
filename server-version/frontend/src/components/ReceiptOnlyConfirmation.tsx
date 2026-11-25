import { useEffect, useRef } from 'react'
import { ProductPage } from './product-ui'

export function ReceiptOnlyConfirmation({ acceptedAt, onExit }: { acceptedAt?: string | null; onExit: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    heading.current?.scrollIntoView?.({ block: 'start' })
  }, [])

  return <ProductPage width="assessment" className="hui-receipt space-y-4" role="status">
    <h2 ref={heading} tabIndex={-1} className="scroll-mt-16 text-xl font-semibold">交卷成功</h2>
    <p>答案已保存，本次问卷仅提供交卷回执。</p>
    {acceptedAt && <p>提交时间 <time dateTime={acceptedAt}>{new Date(acceptedAt).toLocaleString('zh-CN', { hourCycle: 'h23' })}</time></p>}
    <button type="button" className="btn-primary min-h-11" onClick={onExit}>返回</button>
  </ProductPage>
}
