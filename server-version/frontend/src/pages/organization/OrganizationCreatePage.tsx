import { usePageSignal } from '../../hooks/usePageSignal'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { normalizeApiError } from '../../utils/normalizeApiError'
import { organizationApi } from '../../api/organizations'
import { useOrganization } from '../../contexts/OrganizationContext'
import {
  PageHeader,
  ProductButton,
  ProductPage,
  ProductStatus,
} from '../../components/product-ui'

export default function OrganizationCreatePage() {
  const pageSignal = usePageSignal()
  const [name, setName] = useState('')
  const [firstAdminUserId, setFirstAdminUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    refresh,
    allowedActions,
    isLoading,
    error: accessError,
  } = useOrganization()
  const allowed =
    !isLoading && !accessError && allowedActions.includes('CREATE_ORGANIZATION')
  const navigate = useNavigate()
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !allowed) return
    setBusy(true)
    setError(null)
    const signal = pageSignal()
    try {
      const result = await organizationApi.create(
        name.trim(),
        firstAdminUserId.trim(),
        signal,
      )
      if (signal.aborted) return
      await refresh()
      if (signal.aborted) return
      navigate(`/organizations/${encodeURIComponent(result.organization.id)}`)
    } catch (err) {
      if (!signal.aborted) setError(normalizeApiError(err).message)
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  return (
    <ProductPage>
      <PageHeader
        title="创建组织"
        description="平台管理员创建组织，同时指定首位组织管理员。用户 ID 可在用户管理中查看和复制。"
      />
      {error && (
        <ProductStatus kind="error" title="无法创建组织">
          {error}
        </ProductStatus>
      )}
      {isLoading ? (
        <ProductStatus kind="pending" title="正在确认组织创建权限" />
      ) : accessError ? (
        <ProductStatus
          kind="error"
          title="无法确认组织创建权限"
          actions={
            <ProductButton onClick={() => void refresh()}>
              重新加载
            </ProductButton>
          }
        >
          {accessError}
        </ProductStatus>
      ) : allowed ? (
        <form onSubmit={submit} className="grid max-w-xl gap-4">
          <label>
            组织名称
            <input
              className="ml-3 min-h-11 rounded border px-3"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            首位管理员用户 ID
            <input
              className="ml-3 min-h-11 rounded border px-3"
              required
              value={firstAdminUserId}
              onChange={(event) => setFirstAdminUserId(event.target.value)}
            />
          </label>
          <ProductButton type="submit" disabled={busy}>
            创建组织
          </ProductButton>
        </form>
      ) : (
        <p>当前服务器未授予组织创建权限。</p>
      )}
    </ProductPage>
  )
}
