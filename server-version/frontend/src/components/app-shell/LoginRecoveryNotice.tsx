import { useSearchParams } from 'react-router-dom'
import { ProductStatus } from '../product-ui'
import { internalReturnTo, readReauthReturn } from './access'
export default function LoginRecoveryNotice() {
  const [params] = useSearchParams()
  const target = internalReturnTo(params.get('returnTo'))
  if (!target) return null
  const pending = readReauthReturn()
  return <div className="hui-product mb-4"><ProductStatus kind="info" title={pending?.target === target ? '请使用原账户重新登录' : '登录后继续'}>登录成功后将返回原页面。本次登录不会清除本机草稿。</ProductStatus></div>
}
